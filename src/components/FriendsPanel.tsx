import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { addDays, fmtDay, fmtTime } from '../lib/dates';
import { findFreeSlots, Slot } from '../lib/free';
import type { CalEvent } from '../lib/types';
import type { FriendRow } from '../hooks/useFriends';
import { inviteLink } from '../lib/invite';

interface Props {
  userId: string;
  rows: FriendRow[];
  hidden: Set<string>;
  colorOf: (id: string) => string;
  onToggle: (id: string) => void;
  onAdd: (query: string) => Promise<string | null>;
  onAccept: (friendshipId: string) => Promise<void>;
  onRemove: (friendshipId: string) => Promise<void>;
  onPickSlot: (start: Date, end: Date) => void;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function FriendsPanel({ userId, rows, hidden, colorOf, onToggle, onAdd, onAccept, onRemove, onPickSlot }: Props) {
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [days, setDays] = useState(14);
  const [h1, setH1] = useState(9);
  const [h2, setH2] = useState(21);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareLink = async () => {
    const link = inviteLink(userId);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Calendario', text: 'Agrégame en Calendario para compartir agendas:', url: link });
      } catch {
        /* cancelado */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copia este enlace y envíaselo a tu amigo:', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const accepted = rows.filter((r) => r.friendship.status === 'accepted');
  const incoming = rows.filter((r) => r.friendship.status === 'pending' && r.incoming);
  const outgoing = rows.filter((r) => r.friendship.status === 'pending' && !r.incoming);
  const name = (r: FriendRow) => r.profile.display_name || r.profile.username || r.profile.email;
  const included = accepted.filter((r) => !hidden.has(r.profile.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = await onAdd(query);
    setMsg(err ?? 'Solicitud enviada.');
    if (!err) setQuery('');
  };

  const search = async () => {
    if (h2 <= h1) {
      setSlots([]);
      return;
    }
    setSearching(true);
    const from = new Date();
    const to = addDays(from, days);
    const ids = included.map((r) => r.profile.id);
    const [mine, theirs] = await Promise.all([
      supabase.from('events').select('start_at,end_at,all_day').eq('owner', userId).lt('start_at', to.toISOString()).gt('end_at', from.toISOString()),
      ids.length
        ? supabase.rpc('get_friend_events', { friend_ids: ids, range_start: from.toISOString(), range_end: to.toISOString() })
        : Promise.resolve({ data: [] }),
    ]);
    const busy = [...((mine.data ?? []) as CalEvent[]), ...((theirs.data ?? []) as CalEvent[])]
      .filter((e) => !e.all_day)
      .map((e) => ({ start: new Date(e.start_at), end: new Date(e.end_at) }));
    setSlots(findFreeSlots(busy, from, days, minutes, h1, h2).slice(0, 15));
    setSearching(false);
  };

  return (
    <div className="friends">
      <h3>Amigos</h3>
      {accepted.length === 0 && <p className="muted small">Aún no tienes amigos añadidos.</p>}
      {accepted.map((r) => (
        <div key={r.friendship.id} className="friend">
          <label title={r.profile.username ? '@' + r.profile.username : ''}>
            <input type="checkbox" checked={!hidden.has(r.profile.id)} onChange={() => onToggle(r.profile.id)} />
            <i className="dot" style={{ background: colorOf(r.profile.id) }} />
            {name(r)}
          </label>
          <button
            className="icon"
            title="Eliminar amigo"
            onClick={() => confirm(`¿Dejar de ser amigo de ${name(r)}?`) && void onRemove(r.friendship.id)}
          >
            ×
          </button>
        </div>
      ))}

      {incoming.length > 0 && <h4>Solicitudes recibidas</h4>}
      {incoming.map((r) => (
        <div key={r.friendship.id} className="friend">
          <span>{name(r)}</span>
          <span className="row">
            <button className="btn small primary" onClick={() => void onAccept(r.friendship.id)}>
              Aceptar
            </button>
            <button className="icon" title="Rechazar" onClick={() => void onRemove(r.friendship.id)}>
              ×
            </button>
          </span>
        </div>
      ))}
      {outgoing.map((r) => (
        <div key={r.friendship.id} className="friend muted small">
          <span>{name(r)} · pendiente</span>
          <button className="icon" title="Cancelar solicitud" onClick={() => void onRemove(r.friendship.id)}>
            ×
          </button>
        </div>
      ))}

      <h4>Añadir amigo</h4>
      <form onSubmit={(e) => void submit(e)} className="add-friend">
        <input required placeholder="@usuario o email" value={query} onChange={(e) => setQuery(e.target.value)} autoCapitalize="none" />
        <button className="btn small" type="submit">
          Enviar solicitud
        </button>
      </form>
      {msg && <p className="muted small">{msg}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => void shareLink()}>
          Copiar mi enlace de invitación
        </button>
        {copied && <span className="small muted">Enlace copiado</span>}
      </div>

      <h4>Buscar hueco libre</h4>
      <div className="grid2">
        <label className="field small">
          Duración
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={180}>3 horas</option>
          </select>
        </label>
        <label className="field small">
          Próximos
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
          </select>
        </label>
        <label className="field small">
          Desde
          <select value={h1} onChange={(e) => setH1(Number(e.target.value))}>
            {HOURS.slice(0, -1).map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="field small">
          Hasta
          <select value={h2} onChange={(e) => setH2(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn primary full" style={{ marginTop: 8 }} onClick={() => void search()} disabled={searching}>
        {searching ? 'Buscando…' : `Buscar entre ${included.length + 1} ${included.length === 0 ? 'persona' : 'personas'}`}
      </button>
      <p className="muted small">
        Cuenta tu agenda y la de los amigos marcados. De ellos solo se ven los eventos que comparten como «Ocupado» o con detalles.
      </p>
      {slots && slots.length === 0 && <p className="small">No hay huecos que cumplan esas condiciones.</p>}
      {slots?.map((s) => (
        <button
          key={s.start.getTime()}
          className="slot"
          title="Crear un evento en este hueco"
          onClick={() => onPickSlot(s.start, new Date(Math.min(s.end.getTime(), s.start.getTime() + minutes * 60000)))}
        >
          <span>{fmtDay(s.start)}</span>
          <span className="tnum">
            {fmtTime(s.start)}–{fmtTime(s.end)}
          </span>
        </button>
      ))}
    </div>
  );
}
