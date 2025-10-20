// Simple service worker for Shadow App
const CACHE_NAME = 'shadow-app-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.webmanifest',
  'assets/logo_MC_nieuw_trans_300.gif',
  'assets/logo_MC_nieuw_trans_300.gif'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); return null; })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // navigation requests -> App Shell (cache-first)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For other requests, try cache first then network
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      // Optionally cache responses for same-origin assets
      try {
        if (req.method === 'GET' && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
      } catch (_) {}
      return res;
    }).catch(() => null))
  );
});
