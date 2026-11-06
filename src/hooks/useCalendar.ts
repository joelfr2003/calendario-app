import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchFriends, fetchOwn, getRow } from '../lib/queries';
import { expand } from '../lib/recur';
import type { CalEvent, NewEvent, Scope } from '../lib/types';

interface Undo {
  restore: CalEvent[]; // filas a devolver a su estado anterior
  remove: string[]; // filas creadas que hay que borrar
}

/** Carga solo el rango visible, expande repeticiones y guarda un historial para deshacer */
export function useCalendar(userId: string, from: Date, to: Date, friendIds: string[]) {
  const [ownRaw, setOwnRaw] = useState<CalEvent[]>([]);
  const [othersRaw, setOthersRaw] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const reqId = useRef(0);
  const stack = useRef<Undo[]>([]);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const friendKey = friendIds.join(',');

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const a = new Date(fromIso);
    const b = new Date(toIso);
    const ids = friendKey ? friendKey.split(',') : [];
    const [mine, theirs] = await Promise.all([
      fetchOwn(userId, a, b),
      ids.length ? fetchFriends(ids, a, b) : Promise.resolve({ data: [] as CalEvent[], error: null }),
    ]);
    if (id !== reqId.current) return;
    setError(mine.error ?? theirs.error);
    setOwnRaw(mine.data);
    setOthersRaw(theirs.data);
    setLoading(false);
  }, [userId, fromIso, toIso, friendKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const own = useMemo(() => expand(ownRaw, new Date(fromIso), new Date(toIso)), [ownRaw, fromIso, toIso]);
  const others = useMemo(() => expand(othersRaw, new Date(fromIso), new Date(toIso)), [othersRaw, fromIso, toIso]);

  const push = (u: Undo) => {
    stack.current.push(u);
    if (stack.current.length > 20) stack.current.shift();
    setCanUndo(true);
  };
  const fail = (m?: string): never => {
    throw new Error(m ?? 'Error al guardar');
  };

  const save = useCallback(
    async (ev: NewEvent & { title: string }, scope: Scope = 'all') => {
      const base = {
        title: ev.title,
        description: ev.description ?? null,
        location: ev.location ?? null,
        start_at: ev.start_at,
        end_at: ev.end_at,
        all_day: ev.all_day ?? false,
        color: ev.color ?? '#0b6e63',
        visibility: ev.visibility ?? 'busy',
        recurrence: ev.recurrence ?? null,
        reminder_min: ev.reminder_min ?? null,
      };
      if (!ev.id) {
        const { data, error: e } = await supabase.from('events').insert({ ...base, owner: userId }).select('id').single();
        if (e || !data) return fail(e?.message);
        push({ restore: [], remove: [data.id as string] });
      } else {
        const row = await getRow(ev.id);
        if (!row) return fail('No se encontró el evento.');
        if (row.recurrence && ev.occStart && scope === 'one') {
          // Solo esta ocurrencia: se excluye de la serie y se crea un evento suelto
          const { error: e1 } = await supabase.from('events').update({ exdates: [...row.exdates, ev.occStart] }).eq('id', row.id);
          if (e1) return fail(e1.message);
          const { data, error: e2 } = await supabase
            .from('events')
            .insert({ ...base, recurrence: null, owner: userId })
            .select('id')
            .single();
          if (e2 || !data) return fail(e2?.message);
          push({ restore: [row], remove: [data.id as string] });
        } else {
          let patch = base;
          if (row.recurrence && ev.occStart) {
            // Toda la serie: se aplica el desplazamiento a la fecha de inicio de la serie
            const delta = new Date(ev.start_at).getTime() - new Date(ev.occStart).getTime();
            const s = new Date(new Date(row.start_at).getTime() + delta);
            const len = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
            patch = { ...base, start_at: s.toISOString(), end_at: new Date(s.getTime() + len).toISOString() };
          }
          const { error: e3 } = await supabase.from('events').update(patch).eq('id', row.id);
          if (e3) return fail(e3.message);
          push({ restore: [row], remove: [] });
        }
      }
      await reload();
    },
    [userId, reload],
  );

  const remove = useCallback(
    async (id: string, scope: Scope = 'all', occStart?: string) => {
      const row = await getRow(id);
      if (!row) return;
      if (row.recurrence && scope === 'one' && occStart) {
        const { error: e } = await supabase.from('events').update({ exdates: [...row.exdates, occStart] }).eq('id', id);
        if (e) return fail(e.message);
      } else {
        const { error: e } = await supabase.from('events').delete().eq('id', id);
        if (e) return fail(e.message);
      }
      push({ restore: [row], remove: [] });
      await reload();
    },
    [reload],
  );

  const undo = useCallback(async () => {
    const u = stack.current.pop();
    setCanUndo(stack.current.length > 0);
    if (!u) return false;
    if (u.remove.length) await supabase.from('events').delete().in('id', u.remove);
    if (u.restore.length) await supabase.from('events').upsert(u.restore);
    await reload();
    return true;
  }, [reload]);

  return { own, others, error, loading, reload, save, remove, undo, canUndo };
}
