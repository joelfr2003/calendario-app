import { CSSProperties, useEffect, useMemo, useRef } from 'react';
import { addDays, dayKey, fmtTime, monthGrid, sameDay, startOfDay, startOfWeek } from '../lib/dates';
import type { DisplayEvent } from '../lib/types';

const HOUR_H = 48;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Props {
  view: 'month' | 'week';
  cursor: Date;
  events: DisplayEvent[];
  onOpen: (e: DisplayEvent) => void;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
}

/** Reparte cada evento en los días que ocupa (una sola pasada, O(eventos × días que ocupan)) */
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

function MonthView({ cursor, events, onOpen, onCreate }: Omit<Props, 'view'>) {
  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const byDay = useMemo(() => bucketByDay(events, days), [events, days]);
  const today = new Date();
  return (
    <div className="month">
      {WEEKDAYS.map((w) => (
        <div key={w} className="dow">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const list = byDay.get(dayKey(d)) ?? [];
        const other = d.getMonth() !== cursor.getMonth();
        return (
          <div
            key={d.getTime()}
            className={'cell' + (other ? ' other' : '')}
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

function WeekView({ cursor, events, onOpen, onCreate }: Omit<Props, 'view'>) {
  const days = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);
  const byDay = useMemo(() => bucketByDay(events, days), [events, days]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR_H * 7.5;
  }, []);
  const now = new Date();

  return (
    <div className="week">
      <div className="week-head">
        <div />
        {days.map((d, i) => (
          <div key={d.getTime()} className={'wh' + (sameDay(d, now) ? ' today' : '')}>
            {WEEKDAYS[i]} <span>{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="week-head allday">
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
      <div className="week-body" ref={scroller}>
        <div className="hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ height: HOUR_H }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
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
              {placed.map((p) => (
                <button
                  key={p.ev.id}
                  className="block"
                  style={
                    {
                      '--c': p.ev.displayColor,
                      top: (p.s / 60) * HOUR_H,
                      height: ((p.e - p.s) / 60) * HOUR_H - 2,
                      left: `${(p.lane / p.lanes) * 100}%`,
                      width: `calc(${100 / p.lanes}% - 2px)`,
                    } as CSSProperties
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(p.ev);
                  }}
                >
                  <b>{p.ev.ownerName ? `${p.ev.ownerName}: ` : ''}{p.ev.title}</b>
                  <span>{fmtTime(new Date(p.ev.start_at))}</span>
                </button>
              ))}
              {sameDay(d, now) && (
                <div className="now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarView({ view, ...rest }: Props) {
  return view === 'month' ? <MonthView {...rest} /> : <WeekView {...rest} />;
}
