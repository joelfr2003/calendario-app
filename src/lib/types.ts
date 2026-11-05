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
