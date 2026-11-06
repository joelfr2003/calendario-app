import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Cal } from '../lib/types';

const ok = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/** Mis calendarios y con quién comparto cada uno */
export function useCalendars(userId: string) {
  const [cals, setCals] = useState<Cal[]>([]);
  const [shares, setShares] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('calendars').select('*').eq('owner', userId).order('created_at'),
      supabase.from('calendar_shares').select('calendar_id,friend'),
    ]);
    setCals((c.data ?? []) as Cal[]);
    const m: Record<string, string[]> = {};
    for (const r of (s.data ?? []) as { calendar_id: string; friend: string }[]) {
      (m[r.calendar_id] = m[r.calendar_id] ?? []).push(r.friend);
    }
    setShares(m);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (name: string, color: string) => {
    ok((await supabase.from('calendars').insert({ owner: userId, name: name.trim() || 'Nuevo calendario', color })).error);
    await load();
  };
  const update = async (id: string, patch: Partial<Pick<Cal, 'name' | 'color'>>) => {
    ok((await supabase.from('calendars').update(patch).eq('id', id)).error);
    await load();
  };
  const setShare = async (id: string, share: Cal['share'], friendIds: string[]) => {
    ok((await supabase.from('calendars').update({ share }).eq('id', id)).error);
    ok((await supabase.from('calendar_shares').delete().eq('calendar_id', id)).error);
    if (share === 'some' && friendIds.length) {
      ok((await supabase.from('calendar_shares').insert(friendIds.map((f) => ({ calendar_id: id, friend: f })))).error);
    }
    await load();
  };
  const shareAll = async (share: 'all' | 'none') => {
    ok((await supabase.from('calendars').update({ share }).eq('owner', userId)).error);
    const ids = cals.map((c) => c.id);
    if (ids.length) ok((await supabase.from('calendar_shares').delete().in('calendar_id', ids)).error);
    await load();
  };
  const remove = async (id: string) => {
    ok((await supabase.from('calendars').delete().eq('id', id)).error);
    await load();
  };

  return { cals, shares, reload: load, create, update, setShare, shareAll, remove };
}
