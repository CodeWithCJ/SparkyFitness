const CACHE_NAME = 'sparky-fitness-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Bypass caching for Vite development server requests
  if (event.request.url.includes('localhost:8080') || event.request.url.includes('127.0.0.1:8080')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CRITICAL: Use network-first for navigation requests (HTML pages)
  // This ensures Authentik proxy can intercept and check authentication
  // If we used cache-first, the SW would serve cached HTML and bypass Authentik entirely
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails (offline), fall back to cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // For all other requests (JS, CSS, images, API), use cache-first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});