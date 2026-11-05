const pad = (n: number) => String(n).padStart(2, '0');

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
/** Semana que empieza en lunes */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 42 días (6 semanas) que cubren el mes */
export const monthGrid = (d: Date) => {
  const s = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(s, i));
};

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDay = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const toDateInput = (d: Date) => toLocalInput(d).slice(0, 10);
