import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CalEvent, NewEvent } from '../lib/types';

/**
 * Carga SOLO el rango visible (índice events_owner_start) y los eventos de amigos
 * vía RPC (que aplica la privacidad en el servidor).
 */
export function useCalendar(userId: string, from: Date, to: Date, friendIds: string[]) {
  const [own, setOwn] = useState<CalEvent[]>([]);
  const [others, setOthers] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const friendKey = friendIds.join(',');

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const ids = friendKey ? friendKey.split(',') : [];
    const [mine, theirs] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('owner', userId)
        .lt('start_at', toIso)
        .gt('end_at', fromIso)
        .order('start_at'),
      ids.length
        ? supabase.rpc('get_friend_events', { friend_ids: ids, range_start: fromIso, range_end: toIso })
        : Promise.resolve({ data: [] as CalEvent[], error: null }),
    ]);
    if (id !== reqId.current) return; // llegó una petición más nueva
    setError(mine.error?.message ?? theirs.error?.message ?? null);
    setOwn((mine.data ?? []) as CalEvent[]);
    setOthers((theirs.data ?? []) as CalEvent[]);
    setLoading(false);
  }, [userId, fromIso, toIso, friendKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (ev: NewEvent & { title: string }) => {
      const payload = {
        title: ev.title,
        description: ev.description ?? null,
        start_at: ev.start_at,
        end_at: ev.end_at,
        all_day: ev.all_day ?? false,
        color: ev.color ?? '#2563eb',
        visibility: ev.visibility ?? 'private',
      };
      const res = ev.id
        ? await supabase.from('events').update(payload).eq('id', ev.id)
        : await supabase.from('events').insert({ ...payload, owner: userId });
      if (res.error) throw new Error(res.error.message);
      await reload();
    },
    [userId, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('events').delete().eq('id', id);
      if (e) throw new Error(e.message);
      await reload();
    },
    [reload],
  );

  return { own, others, error, loading, reload, save, remove };
}
