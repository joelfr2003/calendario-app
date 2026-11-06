import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { importIcsFile } from './lib/importer';
import { buildIcs } from './lib/export';
import { norm } from './lib/queries';
import { clearPendingInvite, getPendingInvite } from './lib/invite';
import { addDays, monthGrid, startOfDay, startOfWeek } from './lib/dates';
import { DisplayEvent, EVENT_COLORS, FRIEND_COLORS, NewEvent, Scope, Visibility } from './lib/types';
import { useCalendar } from './hooks/useCalendar';
import { useFriends } from './hooks/useFriends';
import { useCalendars } from './hooks/useCalendars';
import CalendarsModal from './components/CalendarsModal';
import ProfileModal from './components/ProfileModal';
import { useInstall } from './hooks/useInstall';
import { askNotifications, useReminders } from './hooks/useReminders';
import CalendarView from './components/CalendarView';
import EventModal from './components/EventModal';
import FriendsPanel from './components/FriendsPanel';
import MiniCalendar from './components/MiniCalendar';

type View = 'month' | 'week' | 'day' | 'agenda';
const VIEWS: { id: View; label: string }[] = [
  { id: 'month', label: 'Mes' },
  { id: 'week', label: 'Semana' },
  { id: 'day', label: 'Día' },
  { id: 'agenda', label: 'Agenda' },
];
interface ModalState {
  ev: NewEvent;
  mine: boolean;
  ownerName?: string;
  k: number;
}
interface Hit {
  id: string;
  title: string;
  start_at: string;
  color: string;
}
const loadHidden = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem('hiddenCals') ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('es-ES', o);

export default function Calendar({ session }: { session: Session }) {
  const me = session.user;
  const [view, setView] = useState<View>(() => {
    const v = localStorage.getItem('view') as View | null;
    const pick: View = v && VIEWS.some((x) => x.id === v) ? v : 'month';
    return pick === 'week' && window.matchMedia('(max-width: 800px)').matches ? 'day' : pick;
  });
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: boolean } | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [invite, setInvite] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();

  const friends = useFriends(me.id);
  const calsApi = useCalendars(me.id);
  const install = useInstall();
  const [showProfile, setShowProfile] = useState(false);
  const calMap = useMemo(() => new Map(calsApi.cals.map((c) => [c.id, c])), [calsApi.cals]);
  const [hiddenCals, setHiddenCals] = useState<Set<string>>(loadHidden);
  const [showCals, setShowCals] = useState(false);
  const toggleCal = (id: string) =>
    setHiddenCals((h) => {
      const n = new Set(h);
      n.has(id) ? n.delete(id) : n.add(id);
      localStorage.setItem('hiddenCals', JSON.stringify([...n]));
      return n;
    });
  const shareLabel = (c: { id: string; share: string }) =>
    c.share === 'all' ? 'Todos' : c.share === 'some' ? `${(calsApi.shares[c.id] ?? []).length} amigos` : 'Privado';
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
    if (view === 'week') {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7) };
    }
    const s = startOfDay(cursor);
    return { from: s, to: addDays(s, view === 'day' ? 1 : 30) };
  }, [view, cursor]);

  const cal = useCalendar(me.id, from, to, visibleIds);

  const events: DisplayEvent[] = useMemo(
    () => [
      ...cal.own
        .filter((e) => !e.calendar_id || !hiddenCals.has(e.calendar_id))
        .map((e) => ({ ...e, mine: true, displayColor: calMap.get(e.calendar_id ?? '')?.color ?? e.color })),
      ...cal.others.map((e) => ({ ...e, mine: false, displayColor: colorOf(e.owner), ownerName: nameOf(e.owner) })),
    ],
    [cal.own, cal.others, colorOf, nameOf, hiddenCals, calMap],
  );

  const flash = useCallback((msg: string, undo = false) => {
    setToast({ msg, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 7000 : 4500);
  }, []);

  useReminders(me.id, flash);

  const doUndo = useCallback(async () => {
    const ok = await cal.undo();
    flash(ok ? 'Cambio deshecho.' : 'No hay nada que deshacer.');
  }, [cal.undo, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Enlace de invitación ---
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

  // --- Búsqueda ---
  useEffect(() => {
    const t = q.trim().replace(/[,()%*]/g, ' ');
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const h = window.setTimeout(async () => {
      const { data } = await supabase
        .from('events')
        .select('id,title,start_at,color')
        .eq('owner', me.id)
        .or(`title.ilike.%${t}%,location.ilike.%${t}%`)
        .order('start_at', { ascending: false })
        .limit(8);
      setHits((data ?? []) as Hit[]);
    }, 250);
    return () => window.clearTimeout(h);
  }, [q, me.id]);

  // --- Navegación ---
  const shift = useCallback(
    (dir: number) =>
      setCursor((c) => {
        if (view === 'month') return new Date(c.getFullYear(), c.getMonth() + dir, 1);
        return addDays(c, dir * (view === 'week' ? 7 : view === 'day' ? 1 : 30));
      }),
    [view],
  );
  const changeView = useCallback((v: View) => {
    setView(v);
    localStorage.setItem('view', v);
  }, []);
  const openModal = useCallback((s: Omit<ModalState, 'k'>) => setModal({ ...s, k: Date.now() }), []);
  const openNew = useCallback(
    (start: Date, end: Date, allDay = false) =>
      openModal({
        mine: true,
        ev: { title: '', start_at: start.toISOString(), end_at: end.toISOString(), all_day: allDay, color: EVENT_COLORS[0], visibility: 'busy', calendar_id: calsApi.cals[0]?.id },
      }),
    [openModal, calsApi.cals],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing && !modal) {
        e.preventDefault();
        void doUndo();
        return;
      }
      if (modal || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 't') setCursor(new Date());
      else if (e.key === 'm') changeView('month');
      else if (e.key === 'w') changeView('week');
      else if (e.key === 'd') changeView('day');
      else if (e.key === 'a') changeView('agenda');
      else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'ArrowLeft') shift(-1);
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
  }, [modal, shift, openNew, changeView, doUndo]);

  // --- Acciones sobre eventos ---
  const onSave = async (ev: NewEvent & { title: string }, scope: Scope) => {
    await cal.save(ev, scope);
    if (ev.reminder_min != null) askNotifications();
    flash('Evento guardado.', true);
  };
  const onDelete = async (id: string, scope: Scope, occ?: string) => {
    await cal.remove(id, scope, occ);
    flash('Evento eliminado.', true);
  };
  const onMove = async (ev: DisplayEvent, s: Date, e: Date) => {
    if (!ev.mine) return;
    const scope: Scope = ev.recurrence
      ? confirm('Este evento se repite.\n\nAceptar: mover solo este evento.\nCancelar: mover toda la serie.')
        ? 'one'
        : 'all'
      : 'all';
    try {
      await cal.save({ ...ev, id: ev.seriesId, start_at: s.toISOString(), end_at: e.toISOString() }, scope);
      flash('Evento actualizado.', true);
    } catch (err) {
      flash((err as Error).message);
    }
  };

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

  const importInto = async (calId: string, file: File) => {
    const n = await importIcsFile(me.id, file, calId);
    await cal.reload();
    flash(`${n} eventos importados en “${calMap.get(calId)?.name ?? 'el calendario'}”.`);
  };

  const exportIcs = async () => {
    let all: Record<string, unknown>[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabase.from('events').select('*').eq('owner', me.id).range(i, i + 999);
      if (error) return flash(error.message);
      all = all.concat((data ?? []) as Record<string, unknown>[]);
      if ((data ?? []).length < 1000) break;
    }
    const url = URL.createObjectURL(new Blob([buildIcs(all.map(norm))], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calendario.ics';
    a.click();
    URL.revokeObjectURL(url);
    flash(`${all.length} eventos exportados.`);
  };

  const title =
    view === 'month'
      ? fmt(cursor, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : view === 'day'
          ? fmt(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Próximos 30 días';

  return (
    <div className="app">
      <header>
        <button className="icon menu-btn" onClick={() => setSidebar((s) => !s)} aria-label="Menú">
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
        <div className="search hide-sm">
          <input
            ref={searchRef}
            type="search"
            placeholder="Buscar eventos  ( / )"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQ(''), searchRef.current?.blur())}
          />
          {q.trim().length >= 2 && (
            <div className="search-results">
              {hits.length === 0 && <div className="sr-empty">Sin resultados</div>}
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setCursor(new Date(h.start_at));
                    setQ('');
                  }}
                >
                  <i className="dot" style={{ background: h.color }} />
                  <span className="sr-t">{h.title}</span>
                  <span className="muted small">{fmt(new Date(h.start_at), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="seg">
          {VIEWS.map((v) => (
            <button key={v.id} className={(view === v.id ? 'on' : '') + ' v-' + v.id} onClick={() => changeView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <button className="btn primary fab" onClick={() => openNew(new Date(Date.now() + 3600000), new Date(Date.now() + 7200000))} aria-label="Nuevo evento">
          <span className="fab-t">Nuevo evento</span>
          <span className="fab-i">+</span>
        </button>
        <button className="avatar" onClick={() => setShowProfile(true)} title={me.email ?? 'Mi perfil'} aria-label="Mi perfil">
          {(me.email ?? '?')[0].toUpperCase()}
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
        {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}
        <aside className={'sidebar' + (sidebar ? ' open' : '')}>
          <MiniCalendar
            cursor={cursor}
            view={view}
            onPick={(d) => {
              setCursor(d);
              setSidebar(false);
            }}
          />
          <h4 style={{ marginTop: 0 }}>Mis calendarios</h4>
          {calsApi.cals.map((c) => (
            <label key={c.id} className="calrow">
              <input type="checkbox" checked={!hiddenCals.has(c.id)} onChange={() => toggleCal(c.id)} style={{ accentColor: c.color }} />
              <span className="calname">{c.name}</span>
              <span className="muted small">{shareLabel(c)}</span>
            </label>
          ))}
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => setShowCals(true)}>
            Gestionar y compartir
          </button>
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
          <h4>Datos</h4>
          <button className="btn small" onClick={() => void exportIcs()}>
            Exportar todo (.ics)
          </button>
          <p className="muted small">Para importar un .ics, abre “Gestionar y compartir” y elige el calendario de destino.</p>
          {install.canInstall && (
            <>
              <h4>Aplicación</h4>
              <button className="btn small primary" onClick={() => void install.prompt()}>
                Instalar en este dispositivo
              </button>
            </>
          )}
          {install.ios && !install.standalone && (
            <p className="muted small">En iPhone o iPad: pulsa Compartir y elige “Añadir a pantalla de inicio”.</p>
          )}
          <p className="muted small">
            Atajos: <kbd>t</kbd> hoy · <kbd>m</kbd> <kbd>w</kbd> <kbd>d</kbd> <kbd>a</kbd> vistas · <kbd>n</kbd> nuevo · <kbd>/</kbd> buscar · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer
          </p>
        </aside>

        <main>
          {cal.error && <div className="error">{cal.error}</div>}
          <CalendarView
            view={view}
            cursor={cursor}
            events={events}
            onCreate={(s, e, all) => {
              if (view === 'month' && window.matchMedia('(max-width: 800px)').matches) {
                setCursor(s);
                changeView('day');
              } else openNew(s, e, all);
            }}
            onMove={(ev, s, e) => void onMove(ev, s, e)}
            onOpen={(ev) => openModal({ mine: ev.mine, ownerName: ev.ownerName, ev })}
          />
        </main>
      </div>

      {modal && (
        <EventModal
          key={modal.k}
          initial={modal.ev}
          readOnly={!modal.mine}
          calendars={calsApi.cals}
          ownerName={modal.ownerName}
          onSave={onSave}
          onDelete={onDelete}
          onDuplicate={(ev) => openModal({ mine: true, ev })}
          onClose={() => setModal(null)}
        />
      )}
      {showProfile && <ProfileModal user={me} onClose={() => setShowProfile(false)} />}
      {showCals && (
        <CalendarsModal
          api={calsApi}
          friends={accepted.map((r) => ({ id: r.profile.id, name: r.profile.display_name || r.profile.username || r.profile.email }))}
          onError={flash}
          onImport={importInto}
          onClose={() => {
            setShowCals(false);
            void cal.reload();
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.undo && cal.canUndo && (
            <button onClick={() => void doUndo()}>Deshacer</button>
          )}
        </div>
      )}
    </div>
  );
}
