import type { CalEvent } from './types';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
};
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Genera un archivo .ics con todos los eventos (repeticiones, avisos y excepciones incluidos) */
export function buildIcs(events: CalEvent[]): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendario//ES', 'CALSCALE:GREGORIAN'];
  const stamp = utc(new Date().toISOString());
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@calendario`, `DTSTAMP:${stamp}`);
    if (e.all_day) L.push(`DTSTART;VALUE=DATE:${ymd(e.start_at)}`, `DTEND;VALUE=DATE:${ymd(e.end_at)}`);
    else L.push(`DTSTART:${utc(e.start_at)}`, `DTEND:${utc(e.end_at)}`);
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) L.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    const r = e.recurrence;
    if (r) {
      let rule = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
      if (r.freq === 'weekly' && r.days?.length) rule += `;BYDAY=${r.days.map((d) => DAYS[d]).join(',')}`;
      if (r.until) rule += `;UNTIL=${r.until.replace(/-/g, '')}${e.all_day ? '' : 'T235959Z'}`;
      L.push(rule);
      for (const x of e.exdates) L.push(e.all_day ? `EXDATE;VALUE=DATE:${ymd(x)}` : `EXDATE:${utc(x)}`);
    }
    if (e.reminder_min != null) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.reminder_min}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
