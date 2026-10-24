# Tarea 05 — Categorías + Añadir (gasto e ingreso)

Estado: pendiente.
Depende de: 04 cerrada.

## Objetivo
Pantalla de Categorías (dentro de Ajustes) para ver las categorías por defecto y crear o quitar las propias. Pantalla Añadir con pestañas Gasto e Ingreso: cuenta, importe (teclado numérico nativo, dos decimales), categoría (rejilla + "Ver todas"), fecha (Hoy / Ayer / Anteayer + calendario) y nota opcional. La pestaña Transferencia queda para la tarea 06.

## Alcance técnico
- `js/screens/categories.js`: alta y borrado de categorías propias sobre la pestaña `Categories`. `Transferencia` no es editable ni borrable.
- `js/screens/addMovement.js`: formulario con pestañas; valida con `domain/movement.js` y guarda con `book.js`.
- `js/ui/components.js`: rejilla de categorías, input de importe con validación de dos decimales, selector rápido de fecha.
- `js/storage/outbox.js`: guarda el movimiento en IndexedDB al instante y lo sincroniza a Sheets en segundo plano (arquitectura §8). Separa la lógica pura de la cola (qué está pendiente, reintentos) del acceso a IndexedDB.
- El Dashboard refleja el movimiento en "Últimos movimientos" y en el saldo.

## Fuera de alcance
Transferencias, edición y borrado de movimientos (tarea 07).

## Pruebas automáticas
- Conversión del texto del importe a número: `12`, `12.5`, `12,50`, `0`, `-3`, `1.234,56`, `12.345`, vacío.
- Fechas rápidas: Hoy, Ayer y Anteayer calculadas bien, incluso a final de mes y de año (se pasa la fecha actual como parámetro, no se lee dentro de la función).
- Lógica pura de la cola: un movimiento pendiente no se duplica al reintentar (mismo id); un movimiento con un id que ya existe en el Sheet no se inserta de nuevo.
- Validación de categoría propia: nombre vacío o repetido.

## Pruebas manuales en iPhone
- [ ] Creas una categoría propia y aparece en la rejilla.
- [ ] Registras un gasto y un ingreso reales; el saldo del Dashboard cambia al instante.
- [ ] Los dos aparecen como filas nuevas en tu Google Sheet.
- [ ] En modo avión registras un gasto: se guarda, y al recuperar la conexión aparece en el Sheet una sola vez.
- [ ] La fecha "Ayer" guarda ayer, no hoy.

## Criterio de cierre
- [ ] Puedes crear una categoría propia, registrar un gasto y un ingreso reales, y verlos en el Dashboard y en tu Google Sheet.
- [ ] `npm test` en verde.
