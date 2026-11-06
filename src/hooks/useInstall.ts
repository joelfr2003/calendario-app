import { useEffect, useState } from 'react';

interface BIP extends Event {
  prompt: () => Promise<void>;
}

// Se captura al cargar el módulo: el navegador lanza el evento una sola vez, antes de entrar en la app.
let saved: BIP | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  saved = e as BIP;
  notify();
});
window.addEventListener('appinstalled', () => {
  saved = null;
  notify();
});

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return {
    canInstall: !!saved && !standalone,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
    standalone,
    prompt: async () => {
      const e = saved;
      if (!e) return;
      saved = null;
      notify();
      await e.prompt();
    },
  };
}
