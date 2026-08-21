const CACHE = 'lifev1-v4';
const ASSETS = ['/', '/index.html', '/site.webmanifest', '/favicon.ico', '/favicon-32x32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
