# Tarea 13 — Revisión técnica: rutas y `app.js`

Estado: pendiente.
Depende de: 12 cerrada.

## Objetivo
Que añadir o cambiar una pantalla sea tocar un solo sitio, y que `app.js` solo arranque y conecte las piezas.

## Situación actual
Añadir una pantalla toca cinco sitios: las tres tablas de `js/ui/router.js`, el `switch` de `app.js`, la lista `REPAINTABLE`, la lista `ENABLED` de `js/ui/navbar.js` y `sw.js`. `app.js` (unas 220 líneas) mezcla el estado del libro y de la cola, cargar, recargar y sincronizar, y el cableado de cada pantalla.

## Alcance técnico
- Una tabla de pantallas (`js/ui/routes.js` o dentro de `router.js`): cada entrada con su ruta, si se puede volver a pintar con datos nuevos y si aparece activa en la barra. Las tablas actuales de `router.js` y la lista de la barra se derivan de ella.
- `app.js` usa un mapa sección → función de pintado en vez del `switch`.
- El estado del libro y de la cola y el ciclo cargar/recargar/sincronizar pasan a un módulo propio (por ejemplo `js/book-state.js`), sin DOM, con una forma sencilla de avisar a la app de que hay datos nuevos. `app.js` queda en arranque, eventos del navegador y pantallas.
- Un test vigila que cada módulo de `js/` esté en `APP_SHELL` de `sw.js`, para que añadir uno y olvidarlo falle en `npm test`.

## Fuera de alcance
Cambiar la navegación o las URL existentes (todas siguen funcionando), sincronización (tarea 14).

## Pruebas automáticas
- `tests/router.test.js`: la tabla genera las mismas rutas que hoy; cada sección de la barra tiene ruta.
- Test del módulo de estado con dobles de `fetchPersonalBook` y de la cola: carga desde la copia local, refresco, sincronización que recarga y fallo de token.
- Test de `APP_SHELL` completo.

## Pruebas manuales en iPhone
- [ ] Prueba rápida completa (todas las secciones, editar, borrar, cerrar sesión y volver a entrar).
- [ ] Modo avión: abres, añades un gasto, quitas el modo avión y se sube.

## Criterio de cierre
- [ ] Añadir una pantalla toca la tabla de pantallas, su archivo y `sw.js` (este último vigilado por un test).
- [ ] Nada visible cambia y las pruebas en iPhone pasan.
- [ ] `npm test` en verde.
