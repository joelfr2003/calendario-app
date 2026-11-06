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

export const EVENT_COLORS = ['#1a73e8', '#188038', '#d93025', '#e37400', '#8430ce', '#129eaf', '#c2185b', '#5f6368'];
export const FRIEND_COLORS = ['#e37400', '#8430ce', '#129eaf', '#c2185b', '#188038', '#d93025', '#1a73e8', '#5f6368'];
