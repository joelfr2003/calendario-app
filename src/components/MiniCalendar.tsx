import { useEffect, useState } from 'react';
import { monthGrid, sameDay, startOfWeek } from '../lib/dates';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function MiniCalendar({ cursor, view, onPick }: { cursor: Date; view: string; onPick: (d: Date) => void }) {
  const [m, setM] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => {
    setM(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  }, [cursor]);
  const today = new Date();
  const weekOfCursor = startOfWeek(cursor);
  return (
    <div className="mini">
      <div className="mini-head">
        <span>{m.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
        <span>
          <button className="icon sm" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mes anterior">
            ‹
          </button>
          <button className="icon sm" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Mes siguiente">
            ›
          </button>
        </span>
      </div>
      <div className="mini-grid">
        {DOW.map((d) => (
          <span key={d} className="mini-dow">
            {d}
          </span>
        ))}
        {monthGrid(m).map((d) => {
          const cls = [
            'mini-d',
            d.getMonth() !== m.getMonth() ? 'other' : '',
            sameDay(d, today) ? 'today' : '',
            view === 'week' ? (sameDay(startOfWeek(d), weekOfCursor) ? 'wk' : '') : sameDay(d, cursor) ? 'sel' : '',
          ];
          return (
            <button key={d.getTime()} className={cls.join(' ')} onClick={() => onPick(d)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
