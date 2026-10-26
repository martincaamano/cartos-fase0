# Tarea 10 — Revisión técnica: limpieza

Estado: pendiente.
Depende de: MVP cerrado (tarea 09).

## Objetivo
Quitar código muerto y repeticiones pequeñas sin cambiar nada de lo que ve el usuario, para que las tareas de revisión siguientes partan de un código limpio.

## Alcance técnico
- Borrar el código muerto: `addMovement` de `js/data/book.js` (sin uso desde que Añadir pasa por la cola) y `latestMovements` de `js/domain/movement.js`, con sus tests.
- `ValidationError` sale de `js/data/book.js` a `js/data/errors.js`, junto a `ApiError` (que deja `js/data/http.js`). Quien las importa cambia el import, nada más.
- Funciones comunes en lugar de repetir el mismo código:
  - «Solo activos» (`filter((x) => !x.deleted)` y la lista de ids activos), en `js/domain/`.
  - «Emoji + nombre» de una cuenta o categoría (`labelOf`), en `js/ui/format.js`.
  - El `sub` del usuario actual (`getCurrentUser()?.sub ?? ''`), en `js/data/auth.js`.
- Una sola búsqueda de fila por id en el Sheet (`js/data/rows.js` o `sheets.js`), usada por `removeCategory` y por la sincronización.
- Los emojis sugeridos para cuentas viven en un solo sitio (hoy están copiados en Onboarding y Cuentas).

## Fuera de alcance
Componentes de interfaz (tarea 11), estilos (tarea 12), rutas y `app.js` (tarea 13), separar `sync.js` (tarea 14).

## Pruebas automáticas
- Las que ya hay siguen en verde, salvo las del código muerto, que se borran con él.
- Tests de las funciones comunes nuevas («solo activos», `labelOf`, búsqueda de fila por id: primera aparición, id ausente, cabecera ignorada).

## Pruebas manuales en iPhone
- [ ] Prueba rápida: abres la app, añades un gasto, lo editas en Historial, miras Análisis y creas una categoría en Ajustes. Todo igual que antes.

## Criterio de cierre
- [ ] Nada visible cambia y la prueba rápida pasa.
- [ ] `npm test` en verde.
