// Improved service worker: cache app-shell and static assets while avoiding caching API calls.
const CACHE_NAME = 'shadow-app-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.webmanifest',
  '/assets/logo_MC_nieuw_trans_300.gif',
  '/assets/jaarhanger-photo.jpg'
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

// Utility: simple check for same-origin static asset by extension
function isStaticAsset(url) {
  return /\.(js|css|png|jpg|jpeg|webp|gif|svg|woff2?|ttf)(\?.*)?$/i.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navigation requests -> App Shell (network-first with cache fallback)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        // Update cached index.html for offline use
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Avoid caching 3rd-party API calls (e.g., Firebase/Google endpoints)
  if (!url.origin || url.origin !== self.location.origin) {
    // for CDN/static resources on other origins, allow network with fallback to cache
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // For same-origin static assets (js/css/images), use cache-first then network update (stale-while-revalidate)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          try { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); } catch (_) {}
          return res;
        }).catch(() => null);
        // Serve cached if available, otherwise wait for network
        return cached || networkFetch;
      })
    );
    return;
  }

  // Default: network-first, fallback to cache
  event.respondWith(
    fetch(req).then((res) => res).catch(() => caches.match(req))
  );
});
