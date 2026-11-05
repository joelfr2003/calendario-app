import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { addDays, fmtDay, fmtTime } from '../lib/dates';
import { findFreeSlots, Slot } from '../lib/free';
import type { CalEvent } from '../lib/types';
import type { FriendRow } from '../hooks/useFriends';

interface Props {
  userId: string;
  rows: FriendRow[];
  hidden: Set<string>;
  colorOf: (id: string) => string;
  onToggle: (id: string) => void;
  onAdd: (email: string) => Promise<string | null>;
  onAccept: (friendshipId: string) => Promise<void>;
  onRemove: (friendshipId: string) => Promise<void>;
}

export default function FriendsPanel({ userId, rows, hidden, colorOf, onToggle, onAdd, onAccept, onRemove }: Props) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [searching, setSearching] = useState(false);

  const accepted = rows.filter((r) => r.friendship.status === 'accepted');
  const incoming = rows.filter((r) => r.friendship.status === 'pending' && r.incoming);
  const outgoing = rows.filter((r) => r.friendship.status === 'pending' && !r.incoming);
  const name = (r: FriendRow) => r.profile.display_name || r.profile.email;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = await onAdd(email);
    setMsg(err ?? 'Solicitud enviada.');
    if (!err) setEmail('');
  };

  // Huecos libres comunes entre tú y los amigos que tienes visibles, próximos 14 días
  const search = async () => {
    setSearching(true);
    const from = new Date();
    const to = addDays(from, 14);
    const ids = accepted.map((r) => r.profile.id).filter((id) => !hidden.has(id));
    const [mine, theirs] = await Promise.all([
      supabase.from('events').select('start_at,end_at,all_day').eq('owner', userId).lt('start_at', to.toISOString()).gt('end_at', from.toISOString()),
      ids.length
        ? supabase.rpc('get_friend_events', { friend_ids: ids, range_start: from.toISOString(), range_end: to.toISOString() })
        : Promise.resolve({ data: [] }),
    ]);
    const busy = [...((mine.data ?? []) as CalEvent[]), ...((theirs.data ?? []) as CalEvent[])]
      .filter((e) => !e.all_day)
      .map((e) => ({ start: new Date(e.start_at), end: new Date(e.end_at) }));
    setSlots(findFreeSlots(busy, from, 14, minutes).slice(0, 12));
    setSearching(false);
  };

  return (
    <div className="friends">
      <h3>Amigos</h3>
      {accepted.length === 0 && <p className="muted small">Aún no tienes amigos añadidos.</p>}
      {accepted.map((r) => (
        <div key={r.friendship.id} className="friend">
          <label>
            <input type="checkbox" checked={!hidden.has(r.profile.id)} onChange={() => onToggle(r.profile.id)} />
            <i className="dot" style={{ background: colorOf(r.profile.id) }} />
            {name(r)}
          </label>
          <button className="icon" title="Eliminar amigo" onClick={() => confirm(`¿Dejar de ser amigo de ${name(r)}?`) && void onRemove(r.friendship.id)}>
            ×
          </button>
        </div>
      ))}

      {incoming.length > 0 && <h4>Solicitudes</h4>}
      {incoming.map((r) => (
        <div key={r.friendship.id} className="friend">
          <span>{name(r)}</span>
          <span>
            <button className="btn small primary" onClick={() => void onAccept(r.friendship.id)}>
              Aceptar
            </button>
            <button className="icon" onClick={() => void onRemove(r.friendship.id)}>
              ×
            </button>
          </span>
        </div>
      ))}
      {outgoing.map((r) => (
        <div key={r.friendship.id} className="friend muted small">
          <span>{name(r)} · pendiente</span>
          <button className="icon" onClick={() => void onRemove(r.friendship.id)}>
            ×
          </button>
        </div>
      ))}

      <form onSubmit={submit} className="add-friend">
        <input type="email" required placeholder="email del amigo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn small" type="submit">
          Añadir
        </button>
      </form>
      {msg && <p className="muted small">{msg}</p>}

      <h4>Encontrar hueco libre</h4>
      <div className="row">
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          <option value={30}>30 min</option>
          <option value={60}>1 hora</option>
          <option value={120}>2 horas</option>
          <option value={180}>3 horas</option>
        </select>
        <button className="btn small" onClick={() => void search()} disabled={searching}>
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      <p className="muted small">Entre tú y los amigos marcados (9:00–21:00, próximos 14 días).</p>
      {slots && slots.length === 0 && <p className="small">No hay huecos comunes.</p>}
      {slots?.map((s) => (
        <div key={s.start.getTime()} className="slot small">
          {fmtDay(s.start)} · {fmtTime(s.start)}–{fmtTime(s.end)}
        </div>
      ))}
    </div>
  );
}
