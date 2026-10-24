# Tarea 07 — Historial

Estado: pendiente.
Depende de: 06 cerrada.

## Objetivo
Listado completo de movimientos con estética de recibo, filtrable por cuenta, categoría y rango de fechas. Cada movimiento se puede tocar para editar o borrar (borrado lógico).

## Alcance técnico
- `js/screens/history.js`: lista los movimientos del libro y aplica los filtros en cliente.
- Función pura de filtrado y orden en `domain/movement.js` (o un `domain/history.js` si crece).
- Reutilizar `addMovement.js` en modo edición (mismo formulario, precargado).
- Borrado: pone `deleted = true` en la fila; nunca se elimina físicamente.
- Si un movimiento editado o borrado es una mitad de una transferencia, mostrar un aviso claro de que la otra mitad no cambia (arquitectura §6: se asume como comportamiento conocido).

## Fuera de alcance
Interruptor "incluir transferencias", búsqueda por texto.

## Pruebas automáticas
- Filtrado por cuenta, por categoría y por rango de fechas (inclusivo en ambos extremos), y combinados.
- Los movimientos con `deleted = true` no aparecen ni cuentan en el saldo.
- Orden: más reciente primero; a igual fecha, un orden estable.
- Editar un movimiento conserva su id.

## Pruebas manuales en iPhone
- [ ] Filtras por cada criterio y por varios a la vez.
- [ ] Editas un gasto: el saldo y el Sheet se actualizan.
- [ ] Borras un movimiento: desaparece de la lista y su fila sigue en el Sheet con `deleted` activado.
- [ ] La lista se lee bien con muchos movimientos (desplazamiento fluido).

## Criterio de cierre
- [ ] Puedes ver, filtrar, editar y borrar cualquier movimiento pasado desde el Historial.
- [ ] `npm test` en verde.
