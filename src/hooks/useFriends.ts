import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Friendship, Profile } from '../lib/types';

export interface FriendRow {
  friendship: Friendship;
  profile: Profile;
  incoming: boolean; // true = te la han enviado a ti
}

export function useFriends(userId: string) {
  const [rows, setRows] = useState<FriendRow[]>([]);

  const load = useCallback(async () => {
    const { data: fs } = await supabase.from('friendships').select('*');
    const list = (fs ?? []) as Friendship[];
    const otherOf = (f: Friendship) => (f.requester === userId ? f.addressee : f.requester);
    const ids = [...new Set(list.map(otherOf))];
    if (!ids.length) {
      setRows([]);
      return;
    }
    const { data: ps } = await supabase.from('profiles').select('id,email,display_name').in('id', ids);
    const map = new Map(((ps ?? []) as Profile[]).map((p) => [p.id, p]));
    setRows(
      list
        .filter((f) => map.has(otherOf(f)))
        .map((f) => ({ friendship: f, profile: map.get(otherOf(f))!, incoming: f.addressee === userId })),
    );
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Devuelve un mensaje de error, o null si todo fue bien */
  const add = async (email: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('find_profile_by_email', { p_email: email });
    if (error) return error.message;
    const target = ((data ?? []) as Profile[])[0];
    if (!target) return 'No hay ningún usuario con ese email. Pídele que entre primero en la app.';
    if (rows.some((r) => r.profile.id === target.id)) return 'Ya existe una solicitud o amistad con esa persona.';
    const { error: e2 } = await supabase.from('friendships').insert({ requester: userId, addressee: target.id });
    if (e2) return e2.message;
    await load();
    return null;
  };

  const accept = async (id: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
    await load();
  };

  const remove = async (id: string) => {
    await supabase.from('friendships').delete().eq('id', id);
    await load();
  };

  return { rows, add, accept, remove, reload: load };
}
