import { CSSProperties, DragEvent, PointerEvent as PE, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayKey, fmtTime, monthGrid, sameDay, startOfDay, startOfWeek } from '../lib/dates';
import type { DisplayEvent } from '../lib/types';

const HOUR_H = 52;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

interface Props {
  view: 'month' | 'week' | 'day' | 'agenda';
  cursor: Date;
  events: DisplayEvent[];
  onOpen: (e: DisplayEvent) => void;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onMove: (e: DisplayEvent, start: Date, end: Date) => void;
}
type Common = Omit<Props, 'view'>;

/** Reparte cada evento en los días que ocupa */
function bucketByDay(events: DisplayEvent[], days: Date[]) {
  const map = new Map<string, DisplayEvent[]>();
  const first = days[0].getTime();
  const last = addDays(days[days.length - 1], 1).getTime();
  for (const ev of events) {
    const s = new Date(ev.start_at).getTime();
    const e = Math.max(new Date(ev.end_at).getTime(), s + 1);
    let d = startOfDay(new Date(s));
    if (d.getTime() < first) d = new Date(first);
    while (d.getTime() < last && d.getTime() < e) {
      const k = dayKey(d);
      const arr = map.get(k);
      if (arr) arr.push(ev);
      else map.set(k, [ev]);
      d = addDays(d, 1);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start_at.localeCompare(b.start_at));
  }
  return map;
}

function Chip({ ev, onOpen, showTime }: { ev: DisplayEvent; onOpen: Props['onOpen']; showTime?: boolean }) {
  return (
    <button
      className="chip"
      draggable={ev.mine}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/plain', ev.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{ '--c': ev.displayColor } as CSSProperties}
      title={`${ev.ownerName ? ev.ownerName + ': ' : ''}${ev.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(ev);
      }}
    >
      {showTime && !ev.all_day && <span className="t">{fmtTime(new Date(ev.start_at))}</span>}
      {ev.ownerName && <b>{ev.ownerName}: </b>}
      {ev.title}
    </button>
  );
}

function MonthView({ cursor, events, onOpen, onCreate, onMove }: Common) {
  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const byDay = useMemo(() => bucketByDay(events, days), [events, days]);
  const today = new Date();
  const drop = (e: DragEvent, d: Date) => {
    e.preventDefault();
    const ev = events.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (!ev) return;
    const s = new Date(ev.start_at);
    const delta = Math.round((startOfDay(d).getTime() - startOfDay(s).getTime()) / 86400000);
    if (delta) onMove(ev, addDays(s, delta), addDays(new Date(ev.end_at), delta));
  };
  return (
    <div className="month">
      {WEEKDAYS.map((w) => (
        <div key={w} className="dow">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const list = byDay.get(dayKey(d)) ?? [];
        const cls = 'cell' + (d.getMonth() !== cursor.getMonth() ? ' other' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' we' : '');
        return (
          <div
            key={d.getTime()}
            className={cls}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, d)}
            onClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10), false)}
          >
            <span className={'num' + (sameDay(d, today) ? ' today' : '')}>{d.getDate()}</span>
            {list.slice(0, 3).map((ev) => (
              <Chip key={ev.id} ev={ev} onOpen={onOpen} showTime />
            ))}
            {list.length > 3 && <div className="more">+{list.length - 3} más</div>}
          </div>
        );
      })}
    </div>
  );
}

interface Placed {
  ev: DisplayEvent;
  s: number;
  e: number;
  lane: number;
  lanes: number;
}

/** Coloca eventos solapados en carriles lado a lado */
function layout(items: { ev: DisplayEvent; s: number; e: number }[]): Placed[] {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((le) => le <= it.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.e);
    } else laneEnds[lane] = it.e;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return out;
}

interface Drag {
  ev: DisplayEvent;
  mode: 'move' | 'resize';
  x0: number;
  y0: number;
  s0: number;
  e0: number;
  di: number;
  moved: boolean;
}
interface Preview {
  id: string;
  s: number;
  e: number;
  shift: number;
  cw: number;
}

const singleDay = (ev: DisplayEvent) =>
  !ev.all_day && sameDay(new Date(ev.start_at), new Date(new Date(ev.end_at).getTime() - 1));

function TimeGrid({ days, events, onOpen, onCreate, onMove }: Common & { days: Date[] }) {
  const byDay = useMemo(() => bucketByDay(events, days), [events, days]);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pvRef = useRef<Preview | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const now = new Date();
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;

  useEffect(() => {
    if (!body.current) return;
    const today = days.some((d) => sameDay(d, new Date()));
    body.current.scrollTop = HOUR_H * (today ? Math.max(0, new Date().getHours() - 1.5) : 7.5);
  }, [days]);

  const begin = (e: PE<HTMLElement>, p: Placed, di: number, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const dur = (new Date(p.ev.end_at).getTime() - new Date(p.ev.start_at).getTime()) / 60000;
    drag.current = { ev: p.ev, mode, x0: e.clientX, y0: e.clientY, s0: p.s, e0: p.s + Math.max(15, dur), di, moved: false };
  };
  const onPtrMove = (e: PE) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const dm = Math.round((dy / HOUR_H) * 4) * 15;
    const cw = body.current?.querySelector('.col')?.clientWidth ?? 100;
    let s = d.s0;
    let en = d.e0;
    let shift = 0;
    if (d.mode === 'move') {
      const len = d.e0 - d.s0;
      s = Math.min(Math.max(d.s0 + dm, 0), 1440 - len);
      en = s + len;
      shift = Math.min(Math.max(Math.round(dx / cw), -d.di), days.length - 1 - d.di);
    } else {
      en = Math.min(Math.max(d.e0 + dm, d.s0 + 15), 1440);
    }
    const next = { id: d.ev.id, s, e: en, shift, cw };
    pvRef.current = next;
    setPv(next);
  };
  const onPtrUp = () => {
    const d = drag.current;
    const p = pvRef.current;
    drag.current = null;
    pvRef.current = null;
    setPv(null);
    if (!d) return;
    if (!d.moved || !p) {
      onOpen(d.ev);
      return;
    }
    const day = days[d.di + p.shift];
    const mk = (m: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
    onMove(d.ev, mk(p.s), mk(p.e));
  };
  const onPtrCancel = () => {
    drag.current = null;
    pvRef.current = null;
    setPv(null);
  };

  return (
    <div className="week">
      <div className="week-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <div key={d.getTime()} className={'wh' + (sameDay(d, now) ? ' today' : '')}>
            {WEEKDAYS[(d.getDay() + 6) % 7]} <span>{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="week-head allday" style={{ gridTemplateColumns: cols }}>
        <div className="gutter small muted">todo el día</div>
        {days.map((d) => (
          <div key={d.getTime()} className="ad-cell">
            {(byDay.get(dayKey(d)) ?? [])
              .filter((e) => e.all_day)
              .map((ev) => (
                <Chip key={ev.id} ev={ev} onOpen={onOpen} />
              ))}
          </div>
        ))}
      </div>
      <div className="week-body" ref={body} style={{ gridTemplateColumns: cols }}>
        <div className="hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: HOUR_H }}>
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        {days.map((d, di) => {
          const dayStart = startOfDay(d).getTime();
          const dayEnd = dayStart + 86400000;
          const timed = (byDay.get(dayKey(d)) ?? [])
            .filter((e) => !e.all_day)
            .map((ev) => {
              const s = Math.max(new Date(ev.start_at).getTime(), dayStart);
              const e = Math.min(new Date(ev.end_at).getTime(), dayEnd);
              const sm = (s - dayStart) / 60000;
              return { ev, s: sm, e: Math.max((e - dayStart) / 60000, sm + 20) };
            });
          const placed = layout(timed);
          return (
            <div
              key={d.getTime()}
              className="col"
              style={{ height: HOUR_H * 24 }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const mins = Math.floor(((e.clientY - r.top) / HOUR_H) * 2) * 30;
                const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins);
                onCreate(s, new Date(s.getTime() + 3600000), false);
              }}
            >
              {placed.map((p) => {
                const drg = p.ev.mine && singleDay(p.ev);
                const on = pv?.id === p.ev.id ? pv : null;
                const top = ((on ? on.s : p.s) / 60) * HOUR_H;
                const h = (((on ? on.e : p.e) - (on ? on.s : p.s)) / 60) * HOUR_H - 2;
                const style = {
                  '--c': p.ev.displayColor,
                  top,
                  height: h,
                  left: on ? 0 : `${(p.lane / p.lanes) * 100}%`,
                  width: on ? 'calc(100% - 2px)' : `calc(${100 / p.lanes}% - 2px)`,
                  transform: on ? `translateX(${on.shift * on.cw}px)` : undefined,
                } as CSSProperties;
                return (
                  <div
                    key={p.ev.id}
                    role="button"
                    tabIndex={0}
                    className={'block' + (drg ? ' mine' : '') + (on ? ' dragging' : '')}
                    style={style}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!drg) onOpen(p.ev);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(p.ev)}
                    onPointerDown={drg ? (e) => begin(e, p, di, 'move') : undefined}
                    onPointerMove={drg ? onPtrMove : undefined}
                    onPointerUp={drg ? onPtrUp : undefined}
                    onPointerCancel={drg ? onPtrCancel : undefined}
                  >
                    <b>
                      {p.ev.ownerName ? `${p.ev.ownerName}: ` : ''}
                      {p.ev.title}
                    </b>
                    <span className="tnum">
                      {on ? `${hm(on.s)}–${hm(on.e)}` : `${fmtTime(new Date(p.ev.start_at))}–${fmtTime(new Date(p.ev.end_at))}`}
                    </span>
                    {p.ev.location && h > 60 && <span>{p.ev.location}</span>}
                    {drg && <div className="rz" onPointerDown={(e) => begin(e, p, di, 'resize')} />}
                  </div>
                );
              })}
              {sameDay(d, now) && <div className="now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView(props: Common) {
  const days = useMemo(() => {
    const s = startOfWeek(props.cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [props.cursor]);
  return <TimeGrid {...props} days={days} />;
}

function DayView(props: Common) {
  const days = useMemo(() => [startOfDay(props.cursor)], [props.cursor]);
  return <TimeGrid {...props} days={days} />;
}

function Agenda({ cursor, events, onOpen }: Common) {
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(startOfDay(cursor), i)), [cursor]);
  const byDay = useMemo(() => bucketByDay(events, days), [events, days]);
  const rows = days.filter((d) => (byDay.get(dayKey(d))?.length ?? 0) > 0);
  const today = new Date();
  return (
    <div className="agenda">
      {rows.length === 0 && <div className="empty">No hay eventos en los próximos 30 días. Pulsa “Nuevo evento” para crear uno.</div>}
      {rows.map((d) => (
        <section key={d.getTime()}>
          <h3 className={sameDay(d, today) ? 'today' : ''}>{d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {(byDay.get(dayKey(d)) ?? []).map((ev) => (
            <button key={ev.id} className="ag-row" style={{ '--c': ev.displayColor } as CSSProperties} onClick={() => onOpen(ev)}>
              <i className="bar" />
              <span className="when tnum">{ev.all_day ? 'Todo el día' : `${fmtTime(new Date(ev.start_at))}–${fmtTime(new Date(ev.end_at))}`}</span>
              <span className="what">
                <b>
                  {ev.ownerName ? `${ev.ownerName}: ` : ''}
                  {ev.title}
                </b>
                {ev.location && <small>{ev.location}</small>}
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function CalendarView({ view, ...rest }: Props) {
  if (view === 'month') return <MonthView {...rest} />;
  if (view === 'week') return <WeekView {...rest} />;
  if (view === 'day') return <DayView {...rest} />;
  return <Agenda {...rest} />;
}
