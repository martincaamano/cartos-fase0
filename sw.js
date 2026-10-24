// Cartos — Service Worker
// Estrategia: network-first con fallback a cache, para evitar servir versiones
// antiguas de la app (aprendido en la Fase 0, donde cache-first daba problemas
// de staleness al actualizar código).

const CACHE_NAME = 'cartos-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptamos peticiones GET del propio origen (el shell de la app).
  // Las llamadas a Google (Sheets, Drive, auth) van siempre directas a la red,
  // nunca a través del cache.
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
