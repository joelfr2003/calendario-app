import type { CalEvent, Instance, Recurrence } from './types';

function* occurrences(s0: Date, r: Recurrence): Generator<Date> {
  const step = Math.max(1, r.interval || 1);
  const h = s0.getHours();
  const mi = s0.getMinutes();
  const y0 = s0.getFullYear();
  const m0 = s0.getMonth();
  const d0 = s0.getDate();
  if (r.freq === 'daily') {
    for (let i = 0; ; i++) yield new Date(y0, m0, d0 + i * step, h, mi);
  } else if (r.freq === 'weekly') {
    const days = (r.days?.length ? [...r.days] : [s0.getDay()]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const monday = d0 - ((s0.getDay() + 6) % 7);
    for (let w = 0; ; w++) {
      for (const d of days) {
        const o = new Date(y0, m0, monday + w * step * 7 + ((d + 6) % 7), h, mi);
        if (o.getTime() >= s0.getTime()) yield o;
      }
    }
  } else if (r.freq === 'monthly') {
    for (let m = 0; ; m++) {
      const o = new Date(y0, m0 + m * step, d0, h, mi);
      if (o.getDate() === d0) yield o; // salta meses sin ese día (p. ej. 31)
    }
  } else {
    for (let y = 0; ; y++) {
      const o = new Date(y0 + y * step, m0, d0, h, mi);
      if (o.getMonth() === m0) yield o;
    }
  }
}

/** Convierte eventos (con o sin repetición) en ocurrencias dentro de [from, to) */
export function expand(events: CalEvent[], from: Date, to: Date): Instance[] {
  const out: Instance[] = [];
  const f = from.getTime();
  const t = to.getTime();
  for (const ev of events) {
    const s0 = new Date(ev.start_at);
    const dur = new Date(ev.end_at).getTime() - s0.getTime();
    const r = ev.recurrence;
    if (!r) {
      if (s0.getTime() < t && s0.getTime() + dur > f) out.push({ ...ev, seriesId: ev.id, occStart: ev.start_at });
      continue;
    }
    const ex = new Set(ev.exdates.map((x) => new Date(x).getTime()));
    const until = r.until ? new Date(`${r.until}T23:59:59`).getTime() : Infinity;
    let guard = 0;
    for (const o of occurrences(s0, r)) {
      if (++guard > 6000) break;
      const os = o.getTime();
      if (os > until || os >= t) break;
      if (os + dur <= f || ex.has(os)) continue;
      out.push({
        ...ev,
        id: `${ev.id}@${os}`,
        seriesId: ev.id,
        occStart: o.toISOString(),
        start_at: o.toISOString(),
        end_at: new Date(os + dur).toISOString(),
      });
    }
  }
  return out;
}
