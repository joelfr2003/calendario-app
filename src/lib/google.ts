import { supabase } from './supabase';
import { addDays } from './dates';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_KEY = 'gcal_token';
const SYNC_KEY = 'gcal_last_sync';
const TOKEN_TTL = 55 * 60 * 1000; // los tokens de Google duran 1 hora

/** El botón de Calendar solo aparece si VITE_GOOGLE_CALENDAR=true (ver README, apartado avanzado) */
export const GOOGLE_ENABLED = import.meta.env.VITE_GOOGLE_CALENDAR === 'true';
const CONNECT_KEY = 'gcal_connecting';
const redirectTo = () => window.location.origin + import.meta.env.BASE_URL;

/** Login normal: solo nombre y email. No pide Calendar, así que cualquiera puede entrar. */
export function signInGoogle() {
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
}

/** Opcional: pide además permiso de lectura de Calendar (sujeto a los límites de Google) */
export function connectGoogleCalendar() {
  try {
    localStorage.setItem(CONNECT_KEY, '1');
  } catch {
    /* nada */
  }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo(), scopes: GOOGLE_SCOPE },
  });
}

export function saveToken(token: string) {
  try {
    // Solo guardamos el token si el usuario pidió conectar Calendar (un login normal trae un token sin ese permiso)
    if (localStorage.getItem(CONNECT_KEY) !== '1') return;
    localStorage.removeItem(CONNECT_KEY);
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* modo privado */
  }
}

export function getToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw) as { token: string; at: number };
    return Date.now() - at < TOKEN_TTL ? token : null;
  } catch {
    return null;
  }
}

export const lastSync = () => Number(localStorage.getItem(SYNC_KEY) ?? 0);

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function fetchGoogleEvents(token: string, from: Date, to: Date): Promise<GEvent[]> {
  const all: GEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', from.toISOString());
    url.searchParams.set('timeMax', to.toISOString());
    url.searchParams.set('singleEvents', 'true'); // expande eventos recurrentes
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Google Calendar API: ${res.status}`);
    const json = (await res.json()) as { items?: GEvent[]; nextPageToken?: string };
    all.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return all;
}

/** Importa Google Calendar (-30 días … +1 año) a Supabase. Devuelve nº de eventos. */
export async function syncGoogle(userId: string, token: string): Promise<number> {
  const from = addDays(new Date(), -30);
  const to = addDays(new Date(), 365);
  const items = (await fetchGoogleEvents(token, from, to)).filter((e) => e.status !== 'cancelled' && e.start);

  // Sin color/visibility en el payload: en eventos ya importados se respetan tus ajustes.
  const rows = items.map((e) => {
    const allDay = !e.start!.dateTime;
    const start = allDay ? new Date(`${e.start!.date}T00:00:00`) : new Date(e.start!.dateTime!);
    const end = e.end?.dateTime
      ? new Date(e.end.dateTime)
      : e.end?.date
        ? new Date(`${e.end.date}T00:00:00`)
        : addDays(start, 1);
    return {
      owner: userId,
      google_event_id: e.id,
      title: e.summary || '(Sin título)',
      description: e.description ?? null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: allDay,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('events')
      .upsert(rows.slice(i, i + 500), { onConflict: 'owner,google_event_id' });
    if (error) throw new Error(error.message);
  }

  // Elimina los que ya no existen en Google (borrados allí)
  const keep = new Set(rows.map((r) => r.google_event_id));
  const { data: existing } = await supabase
    .from('events')
    .select('id,google_event_id')
    .eq('owner', userId)
    .not('google_event_id', 'is', null)
    .not('google_event_id', 'like', 'ics:%') // no borrar lo importado desde archivos .ics
    .gte('start_at', from.toISOString())
    .lt('start_at', to.toISOString());
  const stale = ((existing ?? []) as { id: string; google_event_id: string }[])
    .filter((r) => !keep.has(r.google_event_id))
    .map((r) => r.id);
  for (let i = 0; i < stale.length; i += 100) {
    await supabase.from('events').delete().in('id', stale.slice(i, i + 100));
  }

  localStorage.setItem(SYNC_KEY, String(Date.now()));
  return rows.length;
}
