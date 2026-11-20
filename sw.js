// Service worker: tiene in memoria i file dell'app per usarla offline.
// IMPORTANTE: aumenta VERSION ad ogni pubblicazione, così l'iPhone scarica i file nuovi.
const VERSION = 'v7';
const CACHE = 'diario-pesi-' + VERSION;
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/db.js',
  './js/seed.js',
  './js/ui.js',
  './js/router.js',
  './js/data.js',
  './js/timer.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/history.js',
  './js/views/summary.js',
  './js/views/more.js',
  './js/views/templates.js',
  './js/views/exercises.js',
  './js/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/forge.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('diario-pesi-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
