import { supabase } from './supabase';
import type { CalEvent } from './types';

type Row = Record<string, unknown>;

export const norm = (e: Row): CalEvent =>
  ({ location: null, calendar_id: null, recurrence: null, exdates: [], reminder_min: null, ...e }) as unknown as CalEvent;

/** Mis eventos del rango, más las series repetidas que empezaron antes */
export async function fetchOwn(userId: string, from: Date, to: Date) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('owner', userId)
    .lt('start_at', to.toISOString())
    .or(`end_at.gt.${from.toISOString()},recurrence.not.is.null`)
    .order('start_at');
  return { data: ((data ?? []) as Row[]).map(norm), error: error?.message ?? null };
}

export async function fetchFriends(ids: string[], from: Date, to: Date) {
  const { data, error } = await supabase.rpc('get_friend_events', {
    friend_ids: ids,
    range_start: from.toISOString(),
    range_end: to.toISOString(),
  });
  return { data: ((data ?? []) as Row[]).map(norm), error: error?.message ?? null };
}

export async function getRow(id: string): Promise<CalEvent | null> {
  const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  return data ? norm(data as Row) : null;
}
