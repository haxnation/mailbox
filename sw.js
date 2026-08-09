const CACHE_NAME = 'haxmail-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/theme.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/emailList.js',
  '/js/compose.js',
  '/js/settings.js',
  '/js/shortcuts.js',
  '/manifest.json',
  '/logo.png',
  '/favicons/android-chrome-192x192.png',
  '/favicons/android-chrome-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Only cache GET requests to our origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Don't cache API requests
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Update the cache with the new network response
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Ignore network errors (offline)
        });

        // Return the cached response immediately if there is one, otherwise wait for network
        return response || fetchPromise;
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
