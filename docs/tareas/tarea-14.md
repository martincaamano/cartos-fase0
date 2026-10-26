# Tarea 14 — Revisión técnica: sincronización

Estado: pendiente.
Depende de: 13 cerrada.

## Objetivo
Menos llamadas a Google tras cada guardado y cada módulo de datos con un solo trabajo.

## Situación actual
- Tras cada sincronización con cambios, la app recarga el libro buscándolo de nuevo en Drive (`drive.list`) aunque ya conoce su archivo. El registro de Diagnóstico muestra un `drive.list` en cada guardado (alguno de más de 15 s con mala cobertura).
- `js/data/sync.js` hace dos trabajos: guardar cambios en la cola (`queueMovement`, `queueTransfer`, `queueEdit`, `queueTransferEdit`, `queueDelete`) y subirlos al Sheet.

## Alcance técnico
- Recargar tras sincronizar con `readBook(fileId)` del archivo conocido; `drive.list` solo al abrir la app, al volver a primer plano y tras iniciar sesión.
- Separar `js/data/sync.js`:
  - `js/data/movements.js`: validar y guardar en la cola (crear, editar, borrar, transferencias).
  - `js/data/sync.js`: solo subir la cola al Sheet.
- Revisar que el resultado de la sincronización (`appended`, `updated`) se usa igual en la app.

## Fuera de alcance
Que cuentas y categorías funcionen sin conexión (sería una función nueva, no una limpieza), sincronización en segundo plano.

## Pruebas automáticas
- Los tests de la cola y de la sincronización pasan, repartidos entre los dos módulos.
- Test nuevo: una recarga tras sincronizar no llama a `drive.list` (doble de Google).

## Pruebas manuales en iPhone
- [ ] Añades un gasto y en Diagnóstico la sincronización ya no va seguida de un `drive.list`.
- [ ] Con y sin conexión, añadir, editar y borrar siguen funcionando y no duplican filas.

## Criterio de cierre
- [ ] Una llamada menos por guardado, visible en Diagnóstico.
- [ ] Nada visible cambia y las pruebas en iPhone pasan.
- [ ] `npm test` en verde.
