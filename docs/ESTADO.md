# Estado de Cartos

Fuente de verdad del progreso. Los agentes lo leen al empezar una tarea y lo actualizan con `/cerrar`.

## Entorno

- Repositorio: `cartos-fase0` (se queda con ese nombre).
- GitHub Pages publica `main` (carpeta raíz) en https://martincaamano.github.io/cartos-fase0/. El repo es público: con el plan gratuito, Pages no funciona en repos privados (estuvo sin publicar del 2026-09-27 al 2026-10-24 por eso).
- Se desarrolla desde un Mac (`npm test`, `npm run dev` en http://localhost:5173). Las pruebas reales se hacen en el iPhone.
- Siguiente paso: la tarea 03, cuando el usuario lo diga. Antes hay que resolver la decisión 1.

## Tareas del MVP

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 01 | Esqueleto PWA instalable | Hecha (2026-10-24) | Probada en iPhone. El icono definitivo queda aparte (decisión 3) |
| 02 | Login y acceso a Drive | Hecha (2026-10-25) | Probada en iPhone. Sin verificar en uso real: «Reconectar» con el token caducado y los logs (tarea 09) |
| 03 | Capa de datos y dominio del libro | Pendiente | Hay una decisión previa (ver abajo) |
| 04 | Onboarding + Dashboard | Pendiente | |
| 05 | Categorías + Añadir (gasto e ingreso) | Pendiente | |
| 06 | Añadir (transferencia) | Pendiente | La pieza más grande |
| 07 | Historial | Pendiente | |
| 08 | Análisis | Pendiente | |
| 09 | Ajustes y Diagnóstico | Pendiente | |

Transversal: ~~publicar la app de Google Cloud de "Testing" a "Production"~~ Hecho (2026-10-25). Sin verificación de Google para `drive.file`; exigió la página de marca y una política de privacidad (`privacy.html`).

### Decisiones tomadas en la tarea 02
- La sesión se guarda en `localStorage` (`js/storage/session.js`): solo `sub`, email y nombre, la marca de acceso a Drive y el access token con su caducidad. Nunca el ID token entero.
- Sin backend no hay renovación silenciosa: pasada una hora, la app muestra «Reconectar» (un toque, sin pantalla de permisos). Se acepta como «no vuelve a pedirlo».
- El botón de login es el oficial de Google (negro en claro, contorno en oscuro): GIS no permite uno propio.
- Tras el login se ve una pantalla provisional (`js/screens/home.js`) hasta que exista el Dashboard (tarea 04).
- Sin conexión y con sesión guardada, la app abre igualmente; sin sesión, el login avisa de que no hay conexión.
- La clave de API del Picker del spike se eliminó en Google Cloud (era visible en el repo público). Cuando haga falta el Picker (cuentas compartidas, fuera del MVP), se crea una nueva restringida al dominio y a la Picker API.
- Borrar la app de la pantalla de inicio borra su sesión (iOS borra sus datos): al reinstalarla hay que volver a iniciar sesión.

Regla del plan: cada tarea, al cerrarse, deja algo 100% usable en el iPhone. Ninguna queda a medias esperando a la siguiente.

## Decisiones abiertas

1. **Cómo se guarda la dirección de un movimiento** (antes de la tarea 03). Propuesta: campo `type` con valor `income` o `expense` e importe siempre positivo, como en la especificación original del proyecto. La arquitectura actual no lo fija todavía. Hay que confirmarlo y anotarlo en `docs/arquitectura-app-finanzas.md`.
2. **Refinamientos de diseño inspirados en Nothing OS.** Propuestos y sin decidir: estilo de puntos solo en el logo y en el saldo total del Dashboard, tipografía Geist Mono alojada en el repo, tarjetas con contorno en vez de bloques rellenos. Hasta que se decida, los agentes no los aplican.
3. ~~**Iconos.**~~ Decidido (2026-10-25): «CARTOS» en mayúsculas con la fuente Cutive Mono (SIL OFL 1.1), con su peso original, y un cursor de bloque al final del mismo color que el texto. Sin color de acento. Los SVG maestros (`icons/icon-dark.svg`, `icons/icon-light.svg`) llevan el texto convertido a contornos, así que no dependen de la fuente instalada; los PNG salen de ellos con `sips`. Se descartaron la versión de puntos, el píxel cuadrado y las serif (NType 82 y la serif de Claude son tipografías privativas).

## Notas

- Fuera del MVP, ya decidido: cuentas compartidas, Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis.
- Visión a largo plazo (backend propio, cuentas propias, IA para categorizar): `docs/vision-producto-escala-cartos.md`. No forma parte del MVP.
