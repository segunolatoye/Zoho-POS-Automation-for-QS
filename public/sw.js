// Quality Superstores POS - Offline-First Service Worker
const CACHE_NAME = 'qs-pos-v3.3';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pos_icon.ico',
  '/pos_icon_192.png',
  '/pos_icon_512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('PWA Precache warning (some assets will cache on demand):', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Bypass Service Worker cache for all backend API endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigation & HTML requests: Network-First with cache fallback for offline
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Static assets: Cache-first with network background refresh
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});


