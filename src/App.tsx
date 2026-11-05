import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { saveToken } from './lib/google';
import Auth from './components/Auth';
import Calendar from './Calendar';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // El token de Google (provider_token) solo viene justo tras el login: lo guardamos.
    const keep = (s: Session | null) => {
      setSession(s);
      if (s?.provider_token) saveToken(s.provider_token);
    };
    supabase.auth.getSession().then(({ data }) => {
      keep(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => keep(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="center">Cargando…</div>;
  if (!session) return <Auth />;
  return <Calendar session={session} />;
}
