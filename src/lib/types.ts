export type Visibility = 'private' | 'busy' | 'friends';
export type Scope = 'one' | 'all';

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  days?: number[]; // semanal: 0 = domingo … 6 = sábado
  until?: string | null; // YYYY-MM-DD
}

export interface CalEvent {
  id: string;
  owner: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string; // ISO
  end_at: string; // ISO
  all_day: boolean;
  color: string;
  visibility: Visibility;
  recurrence: Recurrence | null;
  exdates: string[];
  reminder_min: number | null;
  google_event_id?: string | null;
}

/** Una ocurrencia concreta (los eventos repetidos se expanden en el cliente) */
export interface Instance extends CalEvent {
  seriesId: string;
  occStart: string;
}

export interface DisplayEvent extends Instance {
  mine: boolean;
  displayColor: string;
  ownerName?: string;
}

export type NewEvent = Partial<CalEvent> & Pick<CalEvent, 'start_at' | 'end_at'> & { seriesId?: string; occStart?: string };

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
}

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}

export const EVENT_COLORS = ['#0b6e63', '#2f5fb3', '#a8590f', '#a3224b', '#6a45b8', '#56606b', '#3d7a1f', '#0f7490'];
export const FRIEND_COLORS = ['#c2410c', '#7c4dcc', '#0369a1', '#be185d', '#4d7c0f', '#b7791f', '#0d9488', '#64748b'];
