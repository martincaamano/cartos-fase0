# Estado de Cartos

Fuente de verdad del progreso. Los agentes lo leen al empezar una tarea y lo actualizan con `/cerrar`.

## Entorno

- Repositorio: `cartos-fase0` (se queda con ese nombre).
- GitHub Pages publica `main` (carpeta raíz) en https://martincaamano.github.io/cartos-fase0/. El repo es público: con el plan gratuito, Pages no funciona en repos privados (estuvo sin publicar del 2026-09-27 al 2026-10-24 por eso).
- Se desarrolla desde un Mac (`npm test`, `npm run dev` en http://localhost:5173). Las pruebas reales se hacen en el iPhone.
- Siguiente paso: la tarea 03, cuando el usuario lo diga.

## Tareas del MVP

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 01 | Esqueleto PWA instalable | Hecha (2026-10-24) | Probada en iPhone. El icono definitivo queda aparte (decisión 3) |
| 02 | Login y acceso a Drive | Hecha (2026-10-25) | Probada en iPhone, incluido «Reconectar». Sin verificar: los logs (tarea 09) |
| 03 | Capa de datos y dominio del libro | Hecha (2026-10-25) | Probada contra Drive real desde el Mac (localhost); sin pantalla, no aplica iPhone |
| 04 | Onboarding + Dashboard | Hecha (2026-10-25) | Probada en iPhone con la cuenta real |
| 05 | Categorías + Añadir (gasto e ingreso) | Hecha (2026-10-25) | Probada en iPhone, con y sin conexión |
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

### Decisiones tomadas en la tarea 03
- Columnas del libro:
  - `Accounts`: id, name, emoji, initialBalance, createdAt, updatedAt, deleted.
  - `Categories`: id, name, emoji, kind (`expense`, `income` o `both`), isDefault, updatedAt, deleted.
  - `Movements`: id, accountId, type, amount, date, categoryId, note, transferId, personId, createdBy, createdAt, updatedAt, deleted.

  El orden de las cabeceras es un contrato (`js/data/rows.js`): si alguien reordena las columnas a mano, la app se niega a leer el libro.
- Los movimientos guardan el id de la categoría, no su nombre. «Transferencia» tiene el id fijo `transfer`.
- 13 categorías por defecto (10 de gasto, 2 de ingreso y Transferencia). Sus nombres están en `i18n/es.js`.
- El archivo del libro se llama «Cartos · <nombre>» (por ejemplo «Cartos · Personal»).
- Todas las llamadas a Google pasan por `googleFetch` (`js/data/http.js`). El log guarda la operación y el código HTTP, por ejemplo `sheets.append:200`.
- `sw.js` no cambia todavía: estos módulos no se cargan al arrancar. Se añaden a `APP_SHELL` en la tarea 04.
- Para probar en local: `http://localhost:5173` está en los orígenes autorizados del Client ID. En el navegador integrado de Claude Code, el Service Worker no deja cargar los módulos nuevos; las pruebas desde consola se hacen sin él (por ejemplo, desde `privacy.html`). Desde la tarea 04, `index.html` no registra el Service Worker en `localhost`, así que ya no hace falta.

### Decisiones tomadas en la tarea 04
- El libro personal es el archivo más antiguo con `bookType=personal`. Un libro personal sin cuentas activas cuenta como «sin libro», y el onboarding le añade la primera cuenta en vez de crear otro.
- Copia local del libro (`js/storage/book-cache.js`, en `localStorage`, ligada al `sub` del usuario): el Dashboard se pinta al instante y abre sin conexión, con el aviso «Sin conexión · datos guardados». Nunca sale del dispositivo.
- Router: login, connect, reconnect, loading, offline (sin conexión y sin copia), onboarding y dashboard. Con conexión y el token caducado se pide «Reconectar» aunque haya copia.
- Si Google rechaza un token antes de que caduque (401), la app lo descarta y pide «Reconectar».
- Los importes tecleados se leen en formato español (`parseAmountInput`): un punto seguido de grupos de tres cifras es separador de miles («12.500» son 12.500 €).
- Formato al pintar: `1.250,50 €` y negativos con «−» (`js/ui/format.js`), hecho a mano porque `Intl` en es-ES no agrupa los números de cuatro cifras.
- Barra inferior de texto monoespaciado, sin iconos. Por ahora solo INICIO responde.
- Se borró la pantalla provisional `js/screens/home.js`. La caché del Service Worker pasó a `cartos-v2` e incluye todos los módulos del arranque.

### Decisiones tomadas en la tarea 05
- Ajustes mínimo, solo con «Categorías»; tema y Diagnóstico llegan en la tarea 09. La barra activa INICIO, [ + ] y AJUSTES.
- Navegación por hash: `#/`, `#/add` (admite `?type=income`), `#/settings` y `#/settings/categories`.
- Categoría propia: nombre, emoji y tipo (Gasto o Ingreso). El nombre no puede estar vacío ni repetirse entre las categorías activas, sin distinguir mayúsculas.
- «Quitar» es un borrado lógico de la fila, que se busca por id. Se pueden quitar también las categorías por defecto, salvo Transferencia. Crear o quitar categorías va directo al Sheet y necesita conexión.
- Rejilla de Añadir: las 8 categorías más usadas de ese tipo, más «Ver todas» con buscador. La pestaña Transferencia se ve, pero está desactivada hasta la tarea 06.
- Al guardar un movimiento se vuelve al Dashboard.
- Cola de salida en su propia base IndexedDB (`cartos-outbox`), con el id del movimiento como clave. La sincronización lee antes los ids que ya están en el Sheet y sube lo que falta en un único `append`; un fallo deja la cola intacta. Se lanza al guardar, al abrir, al volver a primer plano y al recuperar la conexión.
- Los movimientos pendientes cuentan ya en el saldo y en «Últimos movimientos», y el Dashboard avisa de cuántos faltan por sincronizar.
- Caché del Service Worker: `cartos-v3`.

Regla del plan: cada tarea, al cerrarse, deja algo 100% usable en el iPhone. Ninguna queda a medias esperando a la siguiente.

## Decisiones abiertas

1. ~~**Cómo se guarda la dirección de un movimiento.**~~ Decidido (2026-10-25): campo `type` con valor `income` o `expense` e importe siempre positivo. Una transferencia es un `expense` en origen y un `income` en destino. Anotado en `docs/arquitectura-app-finanzas.md` (punto 2, «Dirección e importe de un movimiento»). Además, columna opcional `transferId`: el mismo UUID en las dos filas de una transferencia dentro del mismo libro, para editarlas o borrarlas juntas; vacía entre libros distintos.
2. **Refinamientos de diseño inspirados en Nothing OS.** Propuestos y sin decidir: estilo de puntos solo en el logo y en el saldo total del Dashboard, tipografía Geist Mono alojada en el repo, tarjetas con contorno en vez de bloques rellenos. Hasta que se decida, los agentes no los aplican.
3. ~~**Iconos.**~~ Decidido (2026-10-25): «CARTOS» en mayúsculas con la fuente Cutive Mono (SIL OFL 1.1), con su peso original, y un cursor de bloque al final del mismo color que el texto. Sin color de acento. Los SVG maestros (`icons/icon-dark.svg`, `icons/icon-light.svg`) llevan el texto convertido a contornos, así que no dependen de la fuente instalada; los PNG salen de ellos con `sips`. Se descartaron la versión de puntos, el píxel cuadrado y las serif (NType 82 y la serif de Claude son tipografías privativas).

## Notas

- Fuera del MVP, ya decidido: cuentas compartidas, Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis.
- Visión a largo plazo (backend propio, cuentas propias, IA para categorizar): `docs/vision-producto-escala-cartos.md`. No forma parte del MVP.
