// Lector de archivos .ics (iCalendar) sin dependencias.
// Soporta: eventos simples, todo el día, zonas horarias (TZID), repeticiones habituales
// (RRULE diaria/semanal/mensual/anual con INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY),
// EXDATE y ocurrencias modificadas (RECURRENCE-ID). Reglas muy raras (BYSETPOS, HOURLY…)
// se importan como un único evento.

export interface IcsEvent {
  uid: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** naive = milisegundos que "leen" la hora de pared como si fuera UTC; tz = zona del evento */
interface DT {
  naive: number;
  tz: string | null; // 'UTC' | nombre IANA | null (hora local del navegador)
  allDay: boolean;
}

interface Rule {
  freq: string;
  interval: number;
  count?: number;
  until?: number;
  byday: { n: number; d: number }[];
  bymonthday: number[];
}

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseLine(line: string): Prop | null {
  let inQuotes = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) {
      idx = i;
      break;
    }
  }
  if (idx < 1) return null;
  const parts = line.slice(0, idx).split(';');
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value: line.slice(idx + 1) };
}

const unescapeText = (s: string) => s.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

function parseDT(p: Prop): DT | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const allDay = m[4] === undefined;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const tz = allDay ? null : m[7] ? 'UTC' : (p.params['TZID'] ?? null);
  return { naive, tz, allDay };
}

function tzOffset(ms: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convierte "hora de pared + zona" en el instante real */
function toInstant(naive: number, tz: string | null): Date {
  if (tz === 'UTC') return new Date(naive);
  const d = new Date(naive);
  const local = () =>
    new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  if (!tz) return local();
  try {
    const off = tzOffset(naive, tz);
    let t = naive - off;
    const off2 = tzOffset(t, tz);
    if (off2 !== off) t = naive - off2;
    return new Date(t);
  } catch {
    return local(); // zona desconocida (por ejemplo nombres de Windows)
  }
}

function parseRule(value: string): Rule | null {
  const o: Record<string, string> = {};
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) o[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  if (!o.FREQ) return null;
  const rule: Rule = {
    freq: o.FREQ.toUpperCase(),
    interval: Math.max(1, Number(o.INTERVAL ?? 1) || 1),
    byday: [],
    bymonthday: [],
  };
  if (o.COUNT) rule.count = Number(o.COUNT);
  if (o.UNTIL) {
    const dt = parseDT({ name: 'UNTIL', params: {}, value: o.UNTIL });
    if (dt) rule.until = dt.allDay ? toInstant(dt.naive + DAY - 1000, null).getTime() : toInstant(dt.naive, dt.tz).getTime();
  }
  if (o.BYDAY) {
    for (const item of o.BYDAY.split(',')) {
      const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(item.trim().toUpperCase());
      if (m) rule.byday.push({ n: m[1] ? Number(m[1]) : 0, d: WEEKDAYS.indexOf(m[2]) });
    }
  }
  if (o.BYMONTHDAY) rule.bymonthday = o.BYMONTHDAY.split(',').map(Number).filter((n) => Number.isFinite(n) && n !== 0);
  return rule;
}

const SUPPORTED = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** Genera ocurrencias (en hora de pared) a partir del inicio. Es infinito: quien lo use debe cortar. */
function* occurrences(start: number, rule: Rule): Generator<number> {
  const s = new Date(start);
  const day0 = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const timeOfDay = start - day0;

  if (rule.freq === 'DAILY') {
    for (let i = 0; ; i++) yield day0 + i * rule.interval * DAY + timeOfDay;
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length ? rule.byday.map((b) => b.d) : [s.getUTCDay()];
    const monday = day0 - ((s.getUTCDay() + 6) % 7) * DAY;
    for (let w = 0; ; w++) {
      const weekStart = monday + w * rule.interval * 7 * DAY;
      const list = days.map((d) => weekStart + ((d + 6) % 7) * DAY).sort((a, b) => a - b);
      for (const t of list) if (t >= day0) yield t + timeOfDay;
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let m = 0; ; m++) {
      const base = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m * rule.interval, 1));
      const y = base.getUTCFullYear();
      const mo = base.getUTCMonth();
      const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      let days: number[] = [];
      if (rule.byday.length) {
        for (const b of rule.byday) {
          const matches: number[] = [];
          for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === b.d) matches.push(d);
          if (b.n === 0) days.push(...matches);
          else {
            const found = matches[b.n > 0 ? b.n - 1 : matches.length + b.n];
            if (found) days.push(found);
          }
        }
      } else if (rule.bymonthday.length) {
        days = rule.bymonthday.map((d) => (d > 0 ? d : dim + 1 + d)).filter((d) => d >= 1 && d <= dim);
      } else if (s.getUTCDate() <= dim) {
        days = [s.getUTCDate()];
      }
      days.sort((a, b) => a - b);
      for (const d of days) {
        const t = Date.UTC(y, mo, d);
        if (t >= day0) yield t + timeOfDay;
      }
    }
  } else if (rule.freq === 'YEARLY') {
    for (let y = 0; ; y++) {
      const t = Date.UTC(s.getUTCFullYear() + y * rule.interval, s.getUTCMonth(), s.getUTCDate());
      if (new Date(t).getUTCMonth() === s.getUTCMonth()) yield t + timeOfDay; // salta 29 feb en años no bisiestos
    }
  }
}

function parseDuration(v: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  return (+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * DAY + +(m[3] ?? 0) * 3600000 + +(m[4] ?? 0) * 60000 + +(m[5] ?? 0) * 1000;
}

export function parseIcs(text: string, windowStart: Date, windowEnd: Date): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // junta las líneas "plegadas"

  const vevents: Prop[][] = [];
  let cur: Prop[] | null = null;
  let inAlarm = false;
  for (const l of lines) {
    if (/^BEGIN:VEVENT/i.test(l)) cur = [];
    else if (/^END:VEVENT/i.test(l)) {
      if (cur) vevents.push(cur);
      cur = null;
    } else if (/^BEGIN:VALARM/i.test(l)) inAlarm = true;
    else if (/^END:VALARM/i.test(l)) inAlarm = false;
    else if (cur && !inAlarm) {
      const p = parseLine(l);
      if (p) cur.push(p);
    }
  }

  const find = (props: Prop[], name: string) => props.find((p) => p.name === name);

  // Ocurrencias de series que han sido modificadas o canceladas individualmente
  const replaced = new Map<string, Set<number>>();
  for (const props of vevents) {
    const rid = find(props, 'RECURRENCE-ID');
    const uid = find(props, 'UID')?.value;
    const dt = rid ? parseDT(rid) : null;
    if (!uid || !dt) continue;
    let set = replaced.get(uid);
    if (!set) {
      set = new Set();
      replaced.set(uid, set);
    }
    set.add(toInstant(dt.naive, dt.tz).getTime());
  }

  const out: IcsEvent[] = [];

  for (const props of vevents) {
    if (find(props, 'STATUS')?.value.toUpperCase() === 'CANCELLED') continue;
    const dtstartProp = find(props, 'DTSTART');
    const dtstart = dtstartProp ? parseDT(dtstartProp) : null;
    if (!dtstart) continue;

    const title = unescapeText(find(props, 'SUMMARY')?.value ?? '').trim() || '(Sin título)';
    const descRaw = find(props, 'DESCRIPTION')?.value;
    const description = descRaw ? unescapeText(descRaw) : null;
    const isOverride = !!find(props, 'RECURRENCE-ID');
    const uid = find(props, 'UID')?.value ?? `${title}-${dtstart.naive}`;
    const tz = dtstart.tz;

    // Duración: en "hora de pared" si es posible (respeta cambios de hora de verano)
    let naiveDur: number | null = null;
    let instDur = 0;
    const dtendProp = find(props, 'DTEND');
    const dtend = dtendProp ? parseDT(dtendProp) : null;
    const durProp = find(props, 'DURATION');
    if (dtend) {
      if (dtend.tz === tz) naiveDur = dtend.naive - dtstart.naive;
      else instDur = toInstant(dtend.naive, dtend.tz).getTime() - toInstant(dtstart.naive, tz).getTime();
    } else if (durProp) {
      naiveDur = parseDuration(durProp.value) ?? 0;
    } else {
      naiveDur = dtstart.allDay ? DAY : 0;
    }

    const build = (occNaive: number) => {
      const s = toInstant(occNaive, tz);
      let e = naiveDur !== null ? toInstant(occNaive + naiveDur, tz) : new Date(s.getTime() + instDur);
      if (e <= s) e = new Date(s.getTime() + (dtstart.allDay ? DAY : 30 * 60000));
      return { s, e };
    };
    const push = (s: Date, e: Date) =>
      out.push({ uid, title, description, start: s, end: e, allDay: dtstart.allDay });

    const ruleProp = find(props, 'RRULE');
    const rule = ruleProp && !isOverride ? parseRule(ruleProp.value) : null;

    if (!rule || !SUPPORTED.includes(rule.freq)) {
      const { s, e } = build(dtstart.naive);
      if (e > windowStart && s < windowEnd) push(s, e);
      continue;
    }

    const skip = new Set<number>(replaced.get(uid) ?? []);
    for (const p of props) {
      if (p.name !== 'EXDATE') continue;
      for (const v of p.value.split(',')) {
        const dt = parseDT({ name: 'EXDATE', params: p.params, value: v });
        if (dt) skip.add(toInstant(dt.naive, dt.tz ?? tz).getTime());
      }
    }

    let count = 0;
    let iterations = 0;
    for (const occ of occurrences(dtstart.naive, rule)) {
      if (++iterations > 20000) break;
      count++;
      if (rule.count !== undefined && count > rule.count) break;
      const { s, e } = build(occ);
      if (rule.until !== undefined && s.getTime() > rule.until) break;
      if (s >= windowEnd) break;
      if (skip.has(s.getTime())) continue; // EXDATE y modificadas siguen contando para COUNT
      if (e > windowStart) push(s, e);
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
