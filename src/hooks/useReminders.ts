import { useEffect, useRef } from 'react';
import { fetchOwn } from '../lib/queries';
import { expand } from '../lib/recur';
import type { Instance } from '../lib/types';

export const askNotifications = () => {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
};

/** Avisa de los eventos con recordatorio de las próximas 36 h. Solo funciona con la app abierta. */
export function useReminders(userId: string, onFire: (msg: string) => void) {
  const list = useRef<Instance[]>([]);
  const fired = useRef(new Set<string>());
  const cb = useRef(onFire);
  cb.current = onFire;

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const a = new Date();
      const b = new Date(a.getTime() + 36 * 3600000);
      const { data } = await fetchOwn(userId, a, b);
      if (!dead) list.current = expand(data, a, b).filter((e) => e.reminder_min != null);
    };
    const check = () => {
      const now = Date.now();
      for (const e of list.current) {
        const start = new Date(e.start_at).getTime();
        const at = start - (e.reminder_min ?? 0) * 60000;
        if (now >= at && now < start + 30000 && !fired.current.has(e.id)) {
          fired.current.add(e.id);
          const when = new Date(e.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const msg = `${e.title} · ${when}`;
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Recordatorio', { body: msg });
          cb.current(`Recordatorio: ${msg}`);
        }
      }
    };
    void load();
    const t1 = window.setInterval(() => void load(), 120000);
    const t2 = window.setInterval(check, 20000);
    return () => {
      dead = true;
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [userId]);
}
