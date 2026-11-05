import { addDays, startOfDay } from './dates';

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * Huecos libres comunes: recibe los bloques ocupados de todos (tú + amigos elegidos)
 * y devuelve los huecos de al menos `minMinutes` entre dayStartH y dayEndH.
 */
export function findFreeSlots(
  busy: Slot[],
  from: Date,
  days: number,
  minMinutes: number,
  dayStartH = 9,
  dayEndH = 21,
): Slot[] {
  const out: Slot[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const day = addDays(startOfDay(from), i);
    const ws = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayStartH);
    const we = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayEndH);
    let cursor = ws < now ? new Date(Math.ceil(now.getTime() / 900000) * 900000) : ws;
    if (cursor >= we) continue;
    const dayBusy = busy
      .filter((b) => b.end > ws && b.start < we)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const b of dayBusy) {
      if (b.start > cursor && (b.start.getTime() - cursor.getTime()) / 60000 >= minMinutes) {
        out.push({ start: cursor, end: b.start });
      }
      if (b.end > cursor) cursor = b.end;
    }
    if (cursor < we && (we.getTime() - cursor.getTime()) / 60000 >= minMinutes) {
      out.push({ start: cursor, end: we });
    }
  }
  return out;
}
