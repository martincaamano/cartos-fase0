# Tarea 01 — Esqueleto de la PWA instalable

Estado: hecha (2026-10-24).
Depende de: nada.

## Objetivo
La app se instala en el iPhone desde Safari, abre en modo standalone (sin barra del navegador) y muestra el nombre "Cartos" y nada más.

## Alcance (ya implementado)
`index.html`, `manifest.json`, `sw.js` (network-first con caché de respaldo), `styles/main.css` (variables de tema claro/oscuro, tipografía monoespaciada), `js/app.js` (pinta el nombre), iconos en `icons/`.

## Fuera de alcance
Login, datos, navegación.

## Pruebas automáticas
`tests/pwa.test.js` ya existe y comprueba: manifest válido con iconos existentes, `index.html` enlazado a manifest/módulo/Service Worker, todos los archivos de `APP_SHELL` existen, tokens de tema, y que cada import relativo de `js/` e `i18n/` apunta a un archivo real. Hay que ampliar `APP_SHELL` en `sw.js` cada vez que se añade un archivo esencial para arrancar la app.

## Pruebas manuales en iPhone
- [x] Safari → Compartir → Añadir a pantalla de inicio. El icono aparece.
- [x] Se abre sin barra de Safari (standalone).
- [x] Sigue el modo claro/oscuro del iPhone al cambiarlo en Ajustes.
- [x] Tras publicar un cambio visible (por ejemplo, el texto bajo el nombre), al cerrar y reabrir la app se ve la versión nueva (network-first).
- [x] En modo avión, la app abre igualmente.

## Criterio de cierre
- [x] Todas las pruebas manuales de arriba.
- [x] `npm test` en verde.

## Pendiente aparte
Icono definitivo (ver "Decisiones abiertas" en `docs/ESTADO.md`).
