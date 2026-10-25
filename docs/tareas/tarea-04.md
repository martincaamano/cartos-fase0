# Tarea 04 — Onboarding + Dashboard

Estado: hecha (2026-10-25).
Depende de: 03 cerrada.

## Objetivo
Si no existe libro personal, se muestra el onboarding (nombre, emoji y saldo inicial de la primera cuenta). Al confirmar se crea el libro y se pasa al Dashboard, que muestra el saldo total y la cuenta recién creada como tarjeta.

## Alcance técnico
- `js/screens/onboarding.js`: formulario; crea el libro con `book.js`.
- `js/screens/dashboard.js`: lee las cuentas con `book.js`, calcula el saldo total con `domain/balance.js`, pinta tarjetas de cuenta y el bloque "Últimos movimientos" (vacío por ahora). Estética de recibo (ver `docs/diseno-flujo-pantallas-cartos.md` §3.4).
- `js/ui/navbar.js`: barra inferior con las cinco secciones; solo Dashboard está activo.
- Categorías por defecto (incluida `Transferencia`) se crean al crear el libro.
- Actualizar `decideRoute` para incluir el paso de onboarding.
- Textos en `i18n/es.js`; archivos nuevos en `APP_SHELL`.

## Fuera de alcance
Añadir movimientos, Historial, Análisis, Ajustes.

## Pruebas automáticas
- Validación del formulario de la primera cuenta (función pura en `domain/account.js`): nombre vacío, saldo no numérico, saldo con tres decimales, saldo 0.
- Saldo total con varias cuentas, incluida alguna sin movimientos.
- `decideRoute` con y sin libro personal.
- Las categorías por defecto incluyen `Transferencia` y no tienen ids repetidos.

## Pruebas manuales en iPhone
- [x] Con un Drive sin libro, aparece el onboarding.
- [x] Al confirmar se crea el libro (se ve en Drive) y se llega al Dashboard.
- [x] El Dashboard muestra el saldo inicial como total y la cuenta como tarjeta.
- [x] Cerrar y reabrir lleva directo al Dashboard, sin onboarding.
- [x] Modo claro y oscuro se ven bien; el teclado numérico se abre en el campo de saldo.

## Criterio de cierre
- [x] Completas el onboarding en tu iPhone y ves tu cuenta real, con su saldo inicial, en el Dashboard.
- [x] `npm test` en verde.
