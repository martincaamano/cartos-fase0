# Tarea 14 — Pruebas de aceptación automáticas

Estado: pendiente.
Depende de: 13 cerrada.

## Objetivo
Que las comprobaciones que hoy se hacen a mano en el iPhone tras cada tarea se hagan solas, en un navegador real con la app real, y que GitHub las ejecute (junto a `npm test`) en cada PR. La prueba manual en el iPhone queda en lo que no se puede automatizar.

## Decisiones tomadas (2026-10-27)
- Dependencia de desarrollo autorizada: `@playwright/test`. Solo para estas pruebas; la app publicada sigue sin dependencias.
- Navegador: WebKit (el motor de Safari), con el tamaño y el táctil de un iPhone.
- GitHub Actions ejecuta `npm test` y `npm run acceptance` en cada PR y en cada push a `main`.
- Va antes de la tarea de sincronización (ahora la 15), para que esta ya se compruebe sola.

## Alcance técnico
- `package.json`: `@playwright/test` en `devDependencies`, script `npm run acceptance`. `package-lock.json` en el repo. `npm test` no cambia (sigue sin navegador).
- `acceptance/` (nuevo):
  - `playwright.config.js`: WebKit con perfil de iPhone, servidor estático propio en Node (sin dependencias) sobre la raíz del repo.
  - Google simulado: intercepta Drive, Sheets y el script de Google Identity Services, con un libro de prueba en memoria que registra cada llamada. Nunca se llama a Google de verdad.
  - Sesión de prueba sembrada en `localStorage` antes de abrir la app.
  - Escenarios, uno por bloque de las listas de comprobación:
    1. Abrir: saldos, total y últimos movimientos.
    2. Navegación: cada sección desde la barra y los enlaces de vuelta.
    3. Añadir gasto e ingreso: fila en el Sheet (con `RAW`), saldo actualizado.
    4. Historial: filtros; editar reescribe la misma fila; borrar marca `deleted` sin quitar la fila.
    5. Transferencia: dos filas en una sola petición, una línea «A → B».
    6. Análisis: categoría mayor arriba, Transferencia fuera del ranking, mes anterior.
    7. Ajustes: crear cuenta (y nombre repetido), crear y quitar categoría.
    8. Sin conexión: pendiente visible, se sube al volver y no duplica filas.
    9. Tema: Sistema / Claro / Oscuro y color de la barra de estado.
    10. Cerrar sesión: vuelve al Login.
    11. Privacidad: el registro de Diagnóstico no contiene importes, notas ni nombres de categorías.
  - Comparación visual: capturas de cada pantalla en claro y oscuro guardadas en el repo; un cambio no buscado hace fallar la prueba (se actualizan a propósito con un comando).
- `.github/workflows/tests.yml`: Node, `npm ci`, instala WebKit, `npm test`, `npm run acceptance`. Si falla, sube el informe de Playwright como artefacto.
- `docs/`: cómo ejecutarlas en el Mac (incluida la instalación única de WebKit) y cómo actualizar las capturas; `AGENTS.md` y los comandos `/tarea` y `/cerrar` pasan a pedir `npm run acceptance`.

## Fuera de alcance
Inicio de sesión real con Google y permiso de Drive, la app instalada en la pantalla de inicio de iOS, pruebas contra el Drive real.

## Pruebas automáticas
- `npm test` y `npm run acceptance` en verde en local y en GitHub Actions.
- Cada escenario se comprueba que falla si se rompe lo que vigila (se prueba a romper algo a propósito y se deshace).

## Pruebas manuales en iPhone
- [ ] Nada cambia en la app (esta tarea no toca `js/` ni `styles/`).

## Criterio de cierre
- [ ] La PR de esta tarea muestra en GitHub las comprobaciones de `npm test` y `npm run acceptance` en verde.
- [ ] Las listas de comprobación de las tareas siguientes se reducen a lo que no cubren las pruebas automáticas.
- [ ] `npm test` en verde.
