import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { importIcsFile } from './lib/importer';
import { clearPendingInvite, getPendingInvite } from './lib/invite';
import { addDays, monthGrid, startOfWeek } from './lib/dates';
import { DisplayEvent, EVENT_COLORS, FRIEND_COLORS, NewEvent, Visibility } from './lib/types';
import { useCalendar } from './hooks/useCalendar';
import { useFriends } from './hooks/useFriends';
import CalendarView from './components/CalendarView';
import EventModal from './components/EventModal';
import FriendsPanel from './components/FriendsPanel';

type View = 'month' | 'week';
interface ModalState {
  ev: NewEvent;
  mine: boolean;
  ownerName?: string;
}

export default function Calendar({ session }: { session: Session }) {
  const me = session.user;
  const [view, setView] = useState<View>(() => (localStorage.getItem('view') === 'week' ? 'week' : 'month'));
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [invite, setInvite] = useState<{ id: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const friends = useFriends(me.id);
  const accepted = useMemo(() => friends.rows.filter((r) => r.friendship.status === 'accepted'), [friends.rows]);
  const visibleIds = useMemo(
    () => accepted.map((r) => r.profile.id).filter((id) => !hidden.has(id)).sort(),
    [accepted, hidden],
  );
  const colorOf = useMemo(() => {
    const ids = accepted.map((r) => r.profile.id).sort();
    return (id: string) => FRIEND_COLORS[Math.max(0, ids.indexOf(id)) % FRIEND_COLORS.length];
  }, [accepted]);
  const nameOf = useCallback(
    (id: string) => {
      const p = accepted.find((r) => r.profile.id === id)?.profile;
      return (p?.display_name || p?.username || p?.email || 'Amigo').split(' ')[0];
    },
    [accepted],
  );

  const { from, to } = useMemo(() => {
    if (view === 'month') {
      const s = monthGrid(cursor)[0];
      return { from: s, to: addDays(s, 42) };
    }
    const s = startOfWeek(cursor);
    return { from: s, to: addDays(s, 7) };
  }, [view, cursor]);

  const cal = useCalendar(me.id, from, to, visibleIds);

  const events: DisplayEvent[] = useMemo(
    () => [
      ...cal.own.map((e) => ({ ...e, mine: true, displayColor: e.color })),
      ...cal.others.map((e) => ({ ...e, mine: false, displayColor: colorOf(e.owner), ownerName: nameOf(e.owner) })),
    ],
    [cal.own, cal.others, colorOf, nameOf],
  );

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 4000);
  };

  // --- Enlace de invitación (?add=ID, guardado por main.tsx antes del login) ---
  useEffect(() => {
    const id = getPendingInvite();
    if (!id) return;
    if (id === me.id) {
      clearPendingInvite();
      return;
    }
    void supabase.rpc('get_invite_info', { p_id: id }).then(({ data }) => {
      const row = ((data ?? []) as { id: string; display_name: string | null }[])[0];
      if (row) setInvite({ id: row.id, name: row.display_name || 'Alguien' });
      else clearPendingInvite();
    });
  }, [me.id]);

  const answerInvite = async (accept: boolean) => {
    if (!invite) return;
    if (accept) {
      const { error } = await supabase.from('friendships').insert({ requester: me.id, addressee: invite.id });
      if (error) flash(error.code === '23505' ? 'Ya hay una solicitud o amistad con esa persona.' : error.message);
      else {
        flash(`Solicitud enviada a ${invite.name}. Cuando la acepte, veréis vuestros calendarios.`);
        await friends.reload();
      }
    }
    clearPendingInvite();
    setInvite(null);
  };

  // --- Navegación ------------------------------------------------------
  const shift = useCallback(
    (dir: number) =>
      setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, 7 * dir))),
    [view],
  );
  const changeView = (v: View) => {
    setView(v);
    localStorage.setItem('view', v);
  };
  const openNew = useCallback((start: Date, end: Date, allDay = false) => {
    setModal({
      mine: true,
      ev: { title: '', start_at: start.toISOString(), end_at: end.toISOString(), all_day: allDay, color: EVENT_COLORS[0], visibility: 'busy' },
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (modal || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 't') setCursor(new Date());
      else if (e.key === 'm') changeView('month');
      else if (e.key === 'w') changeView('week');
      else if (e.key === 'ArrowLeft') shift(-1);
      else if (e.key === 'ArrowRight') shift(1);
      else if (e.key === 'n') {
        const s = new Date();
        s.setMinutes(0, 0, 0);
        s.setHours(s.getHours() + 1);
        openNew(s, new Date(s.getTime() + 3600000));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, shift, openNew]);

  const setAllVisibility = async (v: Visibility) => {
    const label = { private: 'privados', busy: 'visibles como “Ocupado”', friends: 'visibles con detalles' }[v];
    if (!confirm(`¿Marcar TODOS tus eventos como ${label} para tus amigos?`)) return;
    const { error } = await supabase.from('events').update({ visibility: v }).eq('owner', me.id);
    if (error) flash(error.message);
    else {
      flash('Visibilidad actualizada.');
      await cal.reload();
    }
  };

  const title =
    view === 'month'
      ? cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      : `${from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const onIcsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await importIcsFile(me.id, file);
      await cal.reload();
      flash(`${n} eventos importados. Se muestran a tus amigos como “Ocupado”; cámbialo en Privacidad rápida.`);
    } catch (err) {
      flash((err as Error).message);
    }
  };

  return (
    <div className="app">
      <header>
        <button className="icon menu-btn" onClick={() => setSidebar((s) => !s)} aria-label="Amigos">
          ☰
        </button>
        <span className="brand">Calendario</span>
        <button className="btn" onClick={() => setCursor(new Date())}>
          Hoy
        </button>
        <button className="icon" onClick={() => shift(-1)} aria-label="Anterior">
          ‹
        </button>
        <button className="icon" onClick={() => shift(1)} aria-label="Siguiente">
          ›
        </button>
        <h2>{title}</h2>
        {cal.loading && <span className="muted small">…</span>}
        <span className="grow" />
        <div className="seg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => changeView('month')}>
            Mes
          </button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => changeView('week')}>
            Semana
          </button>
        </div>
        <button className="btn hide-sm" onClick={() => fileRef.current?.click()} title="Importa un archivo .ics exportado de Google, Apple u Outlook">
          Importar .ics
        </button>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => void onIcsFile(e)} />
        <button className="btn primary" onClick={() => openNew(new Date(Date.now() + 3600000), new Date(Date.now() + 7200000))}>
          Nuevo evento
        </button>
        <button className="btn" onClick={() => void supabase.auth.signOut()} title={me.email ?? ''}>
          Salir
        </button>
      </header>

      {invite && (
        <div className="banner">
          <span>
            <b>{invite.name}</b> te ha invitado a compartir calendarios.
          </span>
          <span className="row">
            <button className="btn small primary" onClick={() => void answerInvite(true)}>
              Enviar solicitud
            </button>
            <button className="btn small" onClick={() => void answerInvite(false)}>
              Ahora no
            </button>
          </span>
        </div>
      )}

      <div className="body">
        <aside className={'sidebar' + (sidebar ? ' open' : '')}>
          <FriendsPanel
            userId={me.id}
            rows={friends.rows}
            hidden={hidden}
            colorOf={colorOf}
            onToggle={(id) =>
              setHidden((h) => {
                const n = new Set(h);
                n.has(id) ? n.delete(id) : n.add(id);
                return n;
              })
            }
            onAdd={friends.add}
            onAccept={friends.accept}
            onRemove={friends.remove}
            onPickSlot={(s, e) => {
              setSidebar(false);
              openNew(s, e);
            }}
          />
          <h4>Privacidad rápida</h4>
          <select value="" onChange={(e) => e.target.value && void setAllVisibility(e.target.value as Visibility)}>
            <option value="">Compartir todo mi calendario como…</option>
            <option value="busy">“Ocupado” (sin detalles)</option>
            <option value="friends">Con título y detalles</option>
            <option value="private">Privado (nadie lo ve)</option>
          </select>
          <p className="muted small">
            Atajos: <kbd>t</kbd> hoy · <kbd>m</kbd> mes · <kbd>w</kbd> semana · <kbd>n</kbd> nuevo · ← →
          </p>
        </aside>

        <main>
          {cal.error && <div className="error">{cal.error}</div>}
          <CalendarView
            view={view}
            cursor={cursor}
            events={events}
            onCreate={openNew}
            onOpen={(ev) => setModal({ mine: ev.mine, ownerName: ev.ownerName, ev })}
          />
        </main>
      </div>

      {modal && (
        <EventModal
          initial={modal.ev}
          readOnly={!modal.mine}
          ownerName={modal.ownerName}
          onSave={cal.save}
          onDelete={cal.remove}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
