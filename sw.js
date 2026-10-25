// Service worker : l'interface s'ouvre même hors connexion,
// et les données (data/*.json) sont toujours redemandées au réseau en priorité.
const VERSION = 'mai-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/scoring.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/data/')) {
    // Réseau d'abord, copie de secours en cache (clé sans paramètre anti-cache).
    const key = url.origin + url.pathname;
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(key, copy));
      return res;
    }).catch(() => caches.match(key)));
    return;
  }

  // Interface : cache d'abord, mise à jour en arrière-plan.
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
