# Tarea 08 — Análisis

Estado: pendiente.
Depende de: 07 cerrada.

## Objetivo
Pantalla con dos bloques: categorías ordenadas por gasto (barras horizontales en escala de grises, con el importe al lado) y evolución mensual (ingresos, gastos y ahorro por mes, con selector de mes hacia atrás).

## Alcance técnico
- `js/screens/analysis.js`.
- Agregaciones puras en `js/domain/stats.js` (nuevo): gasto por categoría en un mes y resumen mensual (ingresos, gastos, ahorro = ingresos − gastos).
- Estética: sin gráficos de colores; ver `docs/diseno-flujo-pantallas-cartos.md` §3.7.

## Fuera de alcance
Granularidad semanal o diaria, interruptor "incluir transferencias".

## Pruebas automáticas
- Gasto por categoría: orden descendente, suma correcta en céntimos, mes sin gastos devuelve lista vacía.
- Resumen mensual: ahorro = ingresos − gastos; un movimiento del último día del mes y otro del primero del siguiente caen en meses distintos.
- Los movimientos borrados no cuentan.
- Una transferencia entre dos cuentas del mismo libro deja el neto (ingresos − gastos) sin cambios aunque infle los totales brutos (arquitectura §6).

## Pruebas manuales en iPhone
- [ ] Con datos reales acumulados, la categoría que más gasto tiene sale arriba.
- [ ] Cambias de mes hacia atrás y las cifras cambian.
- [ ] Las barras y las cifras se leen bien en modo claro y oscuro.

## Criterio de cierre
- [ ] Ves de un vistazo qué categoría cuesta más y cómo evoluciona el ahorro mes a mes, con datos reales.
- [ ] `npm test` en verde.
