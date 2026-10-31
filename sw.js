// Cartos — Service Worker
// Estrategia: network-first con fallback a cache, para evitar servir versiones
// antiguas de la app (aprendido en la Fase 0, donde cache-first daba problemas
// de staleness al actualizar código).

const CACHE_NAME = 'cartos-v23';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/screens.css',
  './i18n/es.js',
  './js/app.js',
  './js/book-state.js',
  './js/views.js',
  './js/config.js',
  './js/data/auth.js',
  './js/data/book.js',
  './js/data/drive.js',
  './js/data/errors.js',
  './js/data/http.js',
  './js/data/members.js',
  './js/data/movements.js',
  './js/data/picker.js',
  './js/data/books.js',
  './js/data/rows.js',
  './js/data/sheets.js',
  './js/data/sync.js',
  './js/domain/account.js',
  './js/domain/analysis.js',
  './js/domain/active.js',
  './js/domain/balance.js',
  './js/domain/category.js',
  './js/domain/history.js',
  './js/domain/members.js',
  './js/domain/books.js',
  './js/domain/import.js',
  './js/domain/import-csv.js',
  './js/domain/csv.js',
  './js/domain/money.js',
  './js/domain/movement.js',
  './js/domain/stats.js',
  './js/domain/transfer.js',
  './js/screens/connect.js',
  './js/screens/account-card.js',
  './js/screens/accounts.js',
  './js/screens/addMovement.js',
  './js/screens/analysis.js',
  './js/screens/categories.js',
  './js/screens/category-card.js',
  './js/screens/dashboard.js',
  './js/screens/data.js',
  './js/screens/diagnostics.js',
  './js/screens/history.js',
  './js/screens/book-card.js',
  './js/screens/books.js',
  './js/screens/import.js',
  './js/screens/login.js',
  './js/screens/onboarding.js',
  './js/screens/settings.js',
  './js/screens/status.js',
  './js/screens/theme.js',
  './js/storage/analysis-exclude.js',
  './js/storage/book-cache.js',
  './js/storage/history-view.js',
  './js/storage/last-account.js',
  './js/storage/logs.js',
  './js/storage/outbox-logic.js',
  './js/storage/outbox.js',
  './js/storage/session.js',
  './js/storage/transfer-categories.js',
  './js/ui/charts.js',
  './js/ui/format.js',
  './js/ui/download.js',
  './js/ui/components.js',
  './js/ui/navbar.js',
  './js/ui/receipt.js',
  './js/ui/router.js',
  './js/ui/theme.js',
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
        // Only good answers replace the copy: a 404 or 500 never does.
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      // Offline: the copy; a page opened at any hash falls back to the app
      // itself; anything else not kept fails as a network error would.
      .catch(() => caches.match(request).then((cached) => cached
        ?? (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
