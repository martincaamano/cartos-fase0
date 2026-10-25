# Tarea 07 — Historial

Estado: hecha (2026-10-25).
Depende de: 06 cerrada.

## Objetivo
Listado completo de movimientos con estética de recibo, filtrable por cuenta, categoría y rango de fechas. Cada movimiento se puede tocar para editar o borrar (borrado lógico).

## Alcance técnico
- `js/screens/history.js`: lista los movimientos del libro y aplica los filtros en cliente.
- Función pura de filtrado y orden en `domain/movement.js` (o un `domain/history.js` si crece).
- Reutilizar `addMovement.js` en modo edición (mismo formulario, precargado).
- Borrado: pone `deleted = true` en la fila; nunca se elimina físicamente.
- ~~Si un movimiento editado o borrado es una mitad de una transferencia, mostrar un aviso claro de que la otra mitad no cambia.~~ Cambiado al planificar: una transferencia del mismo libro se edita y se borra entera (arquitectura §6); el aviso queda solo para una mitad sin pareja.

## Fuera de alcance
Interruptor "incluir transferencias", búsqueda por texto.

## Pruebas automáticas
- Filtrado por cuenta, por categoría y por rango de fechas (inclusivo en ambos extremos), y combinados.
- Los movimientos con `deleted = true` no aparecen ni cuentan en el saldo.
- Orden: más reciente primero; a igual fecha, un orden estable.
- Editar un movimiento conserva su id.

## Pruebas manuales en iPhone
- [x] Filtras por cada criterio y por varios a la vez.
- [x] Editas un gasto: el saldo y el Sheet se actualizan.
- [x] Borras un movimiento: desaparece de la lista y su fila sigue en el Sheet con `deleted` activado.
- [x] La lista se lee bien con muchos movimientos (desplazamiento fluido).

## Criterio de cierre
- [x] Puedes ver, filtrar, editar y borrar cualquier movimiento pasado desde el Historial.
- [x] `npm test` en verde.
