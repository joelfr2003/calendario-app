export type Visibility = 'private' | 'busy' | 'friends';

export interface CalEvent {
  id: string;
  owner: string;
  title: string;
  description: string | null;
  start_at: string; // ISO
  end_at: string; // ISO
  all_day: boolean;
  color: string;
  visibility: Visibility;
  google_event_id?: string | null;
}

export interface DisplayEvent extends CalEvent {
  mine: boolean;
  displayColor: string;
  ownerName?: string;
}

export type NewEvent = Partial<CalEvent> & Pick<CalEvent, 'start_at' | 'end_at'>;

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
}

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}

export const EVENT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#9333ea', '#0891b2', '#db2777', '#475569'];
export const FRIEND_COLORS = ['#f97316', '#14b8a6', '#a855f7', '#ec4899', '#84cc16', '#06b6d4', '#eab308', '#ef4444'];
