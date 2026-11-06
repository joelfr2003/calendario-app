// Service worker mínimo: red primero (siempre la versión nueva) y copia local si no hay conexión.
const C = 'calendario-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => c.addAll(['./', 'manifest.webmanifest'])).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return; // Supabase y fuentes: sin tocar
  e.respondWith(
    fetch(r)
      .then((res) => {
        const copy = res.clone();
        caches.open(C).then((c) => c.put(r, copy));
        return res;
      })
      .catch(() => caches.match(r).then((m) => m || caches.match('./'))),
  );
});
