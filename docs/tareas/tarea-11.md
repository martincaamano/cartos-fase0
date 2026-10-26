# Tarea 11 — Revisión técnica: componentes de interfaz

Estado: pendiente.
Depende de: 10 cerrada.

## Objetivo
Que cada pieza de interfaz que se repite exista una sola vez, para que cambiar cómo se ve una línea de recibo o un formulario sea tocar un solo archivo.

## Alcance técnico
- `js/ui/receipt.js` (nuevo):
  - `receiptLine(label, amount, { tone })`: la línea etiqueta–importe con separador discontinuo que hoy está escrita a mano en Dashboard, Historial, Análisis, Cuentas y Categorías. `tone`: `expense`, `income` o ninguno.
  - `movementLine(entry, lookups)`: cómo se pinta un movimiento o una transferencia (fecha, «A → B», signo y color), hoy duplicado entre Dashboard e Historial.
- Formulario de cuenta (nombre, emoji y saldo inicial) como componente en `js/ui/components.js`, usado por Onboarding y Ajustes → Cuentas, con el mismo paso de códigos de error a textos.
- Un ayudante para rellenar los textos de una plantilla (`data-text`), usado de la misma forma en todas las pantallas.
- Ningún módulo de `ui/` toca `document` al importarse.

## Fuera de alcance
Cambiar el aspecto (eso es la tarea 12), rutas y `app.js` (tarea 13).

## Pruebas automáticas
- `npm test` en verde. Las partes puras nuevas (por ejemplo, decidir el texto y el tono de una línea a partir de un movimiento) llevan su test.

## Pruebas manuales en iPhone
- [ ] Prueba rápida: Dashboard, Historial (con una transferencia), Análisis, Ajustes → Cuentas (crear una) y el Onboarding con una cuenta nueva de prueba si es posible. Se ven igual que antes.

## Criterio de cierre
- [ ] Ninguna pantalla construye a mano una línea de recibo ni el formulario de cuenta.
- [ ] Nada visible cambia y la prueba rápida pasa.
- [ ] `npm test` en verde.
