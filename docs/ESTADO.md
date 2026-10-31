# Estado de Cartos

Fuente de verdad del progreso. Los agentes lo leen al empezar una tarea y lo actualizan con `/cerrar`.

## Entorno

- Repositorio: `cartos-fase0` (se queda con ese nombre).
- GitHub Pages publica `main` (carpeta raíz) en https://martincaamano.github.io/cartos-fase0/. El repo es público: con el plan gratuito, Pages no funciona en repos privados (estuvo sin publicar del 2026-09-27 al 2026-10-24 por eso).
- Se desarrolla desde un Mac (`npm test`, `npm run dev` en http://localhost:5173). Las pruebas reales se hacen en el iPhone.
- MVP completo (2026-10-25): las nueve tareas están hechas y probadas en iPhone. Después: sincronización, importar, varios libros, libro compartido y pantallas más simples (tareas 15–21).

## Tareas del MVP

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 01 | Esqueleto PWA instalable | Hecha (2026-10-24) | Probada en iPhone. El icono definitivo queda aparte (decisión 3) |
| 02 | Login y acceso a Drive | Hecha (2026-10-25) | Probada en iPhone, incluido «Reconectar». Los logs se verificaron en la tarea 09 |
| 03 | Capa de datos y dominio del libro | Hecha (2026-10-25) | Probada contra Drive real desde el Mac (localhost); sin pantalla, no aplica iPhone |
| 04 | Onboarding + Dashboard | Hecha (2026-10-25) | Probada en iPhone con la cuenta real |
| 05 | Categorías + Añadir (gasto e ingreso) | Hecha (2026-10-25) | Probada en iPhone, con y sin conexión |
| 06 | Añadir (transferencia) | Hecha (2026-10-25) | Probada en iPhone, con y sin conexión. Incluye Ajustes → Cuentas |
| 07 | Historial | Hecha (2026-10-25) | Probada en iPhone, con y sin conexión |
| 08 | Análisis | Hecha (2026-10-25) | Probada en iPhone con datos reales, en claro y oscuro |
| 09 | Ajustes y Diagnóstico | Hecha (2026-10-25) | Probada en iPhone: tema, Diagnóstico copiado y cerrar sesión |

Transversal: ~~publicar la app de Google Cloud de "Testing" a "Production"~~ Hecho (2026-10-25). Sin verificación de Google para `drive.file`; exigió la página de marca y una política de privacidad (`privacy.html`).

### Decisiones tomadas en la tarea 02
- La sesión se guarda en `localStorage` (`js/storage/session.js`): solo `sub`, email y nombre, la marca de acceso a Drive y el access token con su caducidad. Nunca el ID token entero.
- Sin backend no hay renovación silenciosa: pasada una hora, la app muestra «Reconectar» (un toque, sin pantalla de permisos). Se acepta como «no vuelve a pedirlo».
- El botón de login es el oficial de Google (negro en claro, contorno en oscuro): GIS no permite uno propio.
- Tras el login se ve una pantalla provisional (`js/screens/home.js`) hasta que exista el Dashboard (tarea 04).
- Sin conexión y con sesión guardada, la app abre igualmente; sin sesión, el login avisa de que no hay conexión.
- La clave de API del Picker del spike se eliminó en Google Cloud (era visible en el repo público). Para el Picker de la tarea 18 se crea una nueva, restringida al dominio y a la Picker API.
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

### Decisiones tomadas en la tarea 06
- Una transferencia son dos movimientos con el mismo `transferId` y la categoría `transfer`: un `expense` en la cuenta origen y un `income` en la destino (`js/domain/transfer.js`). Origen y destino deben ser cuentas distintas.
- Las dos mitades entran en la cola en una sola transacción de IndexedDB y llegan al Sheet en una única petición (`values:append` con las dos filas, igual de atómica que el `batchUpdate` que cita la arquitectura §6). Reintentar nunca crea cuatro filas.
- En «Últimos movimientos» una transferencia es una sola línea («Abanca → Efectivo»), en tinta normal. Si falta una mitad, se muestra como movimiento suelto.
- Desviación del plan: se añadió **Ajustes → Cuentas** (`#/settings/accounts`), con saldos y alta de cuentas, porque sin una segunda cuenta no se podía transferir. No se editan ni se borran cuentas. Un nombre repetido se rechaza sin distinguir mayúsculas. Necesita conexión.
- Con menos de dos cuentas, la pestaña Transferencia explica por qué y enlaza a Cuentas.
- Corrección de estilos: `[hidden]` oculta siempre, aunque el elemento tenga su propio `display`.
- Caché del Service Worker: `cartos-v4`.

### Decisiones tomadas en la tarea 07
- Historial en `#/history`: líneas de recibo agrupadas por mes, de la más reciente a la más antigua (a igual fecha, por `createdAt` y después por id). Filtros en el dispositivo por cuenta, categoría y fechas Desde/Hasta (ambos extremos incluidos). Se pierden al salir de la pantalla. Se pintan 200 líneas y el resto con «Mostrar más». Sin totales encima de la lista.
- Una transferencia es una línea; aparece al filtrar por cualquiera de sus dos cuentas y por la categoría Transferencia.
- Tocar una línea abre el formulario de Añadir precargado (`#/history/edit?id=…`). El tipo no se cambia al editar. Borrar pide un segundo toque.
- Desviación de la ficha: una transferencia del mismo libro se edita y se borra entera (las dos filas), como dice la arquitectura §6. El aviso de «la otra mitad no cambia» queda solo para una mitad suelta, sin pareja.
- Editar y borrar funcionan sin conexión, a través de la cola de salida. La cola guarda la última versión de cada id; al sincronizar, los ids nuevos se añaden (`append`) y los que ya están en el Sheet se reescriben en su fila, buscada por id en ese momento (`values:batchUpdate`, RAW). Las dos mitades de una transferencia van en la misma petición. Una edición guardada mientras se sincroniza sigue en la cola.
- Conflictos entre dispositivos: gana la última escritura, sin aviso. El control por `updatedAt` queda para más adelante.
- Al editar, una categoría ya quitada sigue disponible para el movimiento que la usa.
- Caché del Service Worker: `cartos-v5`.

### Decisiones tomadas en la tarea 08
- Análisis en `#/analysis?month=YYYY-MM`, para el libro entero (sin filtro por cuenta). Un solo selector de mes para los dos bloques, desde el primer mes con movimientos hasta el actual. El mes vive en la URL, así que un repintado tras sincronizar no lo pierde.
- Gasto por categoría: de mayor a menor, importe en terracota y una barra gris proporcional a la categoría mayor. **Transferencia queda fuera del ranking** (mover dinero entre cuentas propias no es gasto); no es el interruptor «incluir transferencias», que sigue fuera del MVP.
- Resumen del mes: ingresos (verde), gastos (terracota) y ahorro = ingresos − gastos (tinta normal, «−» si es negativo). Las transferencias cuentan en ambos lados (arquitectura §6) y no cambian el ahorro. Debajo, el ahorro de hasta 6 meses anteriores; tocar uno salta a ese mes.
- Agregaciones puras en `js/domain/stats.js`, en céntimos. Los nombres de los meses están en `es.months`, compartidos con el Historial.
- Caché del Service Worker: `cartos-v6`.

### Decisiones tomadas en la tarea 09
- Tema (Sistema / Claro / Oscuro) en Ajustes. Es del dispositivo, no de la cuenta: se guarda en `localStorage` (`cartos.theme`) y nunca va a Drive. Se aplica con `data-theme` en `<html>` desde `app.js` (`js/ui/theme.js`); «Sistema» quita el atributo. La barra de estado de iOS (`theme-color`) y los controles nativos (`color-scheme`) siguen el tema. Sin parpadeo apreciable en el iPhone, así que no hizo falta script en `index.html`.
- Diagnóstico en `#/settings/diagnostics`: últimas entradas (máx. 500), de la más reciente a la más antigua, una por línea (`25/10 13:05:12  api  sheets.append:200  320 ms`), con botón «Copiar». Sin botón para borrar los logs.
- Los fallos de sincronización se registran con el tipo `error` (nombre del error y código HTTP, nunca datos). Comprobado en el iPhone que el registro copiado no lleva importes, notas ni nombres de categorías.
- Cerrar sesión borra la sesión y la copia local del libro y vuelve al Login. No revoca el permiso de Drive (volver a entrar no pide la pantalla de permisos). Los cambios sin subir se quedan en la cola, ligados al archivo del libro, y se suben al volver a entrar con la misma cuenta; si los hay, pide un segundo toque. Ajustes muestra el email de la cuenta.
- Caché del Service Worker: `cartos-v7`.

## Revisión técnica (después del MVP)

Mejoras de mantenibilidad, estructura y rendimiento sin cambiar lo que ve el usuario, más pruebas de aceptación automáticas. Principios SOLID donde aportan, sin sobreingeniería: ni framework, ni empaquetador, ni dependencias. Cada tarea se prueba en el iPhone con una prueba rápida (abrir, añadir, editar en Historial, Análisis y Ajustes).

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 10 | Limpieza | Hecha (2026-10-26) | Probada en iPhone (prueba rápida y arranque sin conexión) |
| 11 | Componentes de interfaz | Hecha (2026-10-26) | Probada en iPhone (prueba rápida) |
| 12 | Estilos y paletas | Hecha (2026-10-26) | Probada en iPhone (claro, oscuro, Sistema, barra de estado y sin conexión) |
| 13 | Rutas y `app.js` | Hecha (2026-10-27) | Probada en iPhone (prueba rápida completa y modo avión) |
| 14 | Pruebas de aceptación automáticas | Hecha (2026-10-27) | En verde en GitHub Actions (WebKit y Chromium); no toca la app |
| 15 | Sincronización | Hecha (2026-10-29) | Probada en iPhone con el libro real (con y sin conexión, sin duplicados) |

## Puesta en marcha con datos reales y libro compartido

Decidido el 2026-10-29: empezar el libro personal con el histórico real (importado) y separar la reforma de la vivienda en un libro compartido («Casa do medio») que la pareja del usuario también use. Esto levanta la restricción de «cuentas compartidas» fuera del MVP.

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 16 | Importar y descargar los datos | Hecha (2026-10-29) | Libro personal real importado y cuadrado; plantilla e importar en Ajustes sin probar en iPhone |
| 17 | Varios libros | Hecha (2026-10-30) | Probada en iPhone: Casa do Medio creado y transferencia desde Personal que aparece en los dos libros |
| 20 | Experiencia: pantallas más simples | Hecha (2026-10-31) | En cinco partes (20a Añadir, 20b Historial, 20c Libros/Cuentas/Categorías, 20d Ajustes/INICIO, 20e Análisis), PR #46–#50. Probada en iPhone |
| 18 | Libro compartido | En curso | 18a (compartir y abrir con el Picker) fusionada; falta la clave de API. 18b (persona en los gastos) descartada |
| 19 | Importar la reforma | Hecha (2026-10-31) | 87 movimientos importados en Casa do Medio; la descarga del libro coincide fila a fila con lo generado y el saldo cuadra con el banco |

### Decisiones tomadas en la tarea 19
- Hecha antes que la 18 y sin código: se usó el importador de la tarea 16 (JSON de Cartos desde Ajustes → Datos), que trae los emojis de las categorías nuevas.
- El JSON se generó y se revisó fuera del repo. Nada de los datos reales entró en GitHub.
- Categorías:
  - las del Excel se mantienen (Obra, Fontanería, Baño, Cocina, Electricidad);
  - «Otros» pasa a «Otros gastos» y los intereses a «Otros ingresos»;
  - las aportaciones siguen como «Aportación Martín» y «Aportación Ana».
- El ajuste del Excel para cuadrar con el banco va al saldo inicial de la cuenta, no como ingreso, para que no infle el Análisis.
- Los pagos hechos directamente por una persona se apuntan como su aportación más el gasto, así el saldo de la cuenta no cambia.
- Se cruzaron las aportaciones de Martín con su libro Personal y coinciden todas. Se borró en Personal un gasto de 2 € de prueba de la 17b.
- Quedan fuera las compras ajenas que salieron de la cuenta y sus devoluciones, las filas del Excel sin fecha (pendientes de confirmar) y el presupuesto.
- El saldo de Cartos supera al del banco en lo que aún falta por devolver de esas compras ajenas.
- Desde ahora los datos de la reforma se apuntan en Cartos; el Excel queda en Drive solo como copia.

### Decisiones tomadas en la tarea 20
- Se hizo en cinco partes, no en cuatro: Análisis (20e) se separó de Ajustes/INICIO (20d).
- INICIO oculta las cifras cada vez que se entra; pulsar INICIO otra vez las muestra.
  - Se descartó agitar el teléfono: iOS pide permiso de movimiento tras un toque.
- Datos y Tema tienen pantalla propia en Ajustes. Tema queda preparada para más paletas.
- Historial: los filtros se limpian al entrar y al salir. Solo se recuerda la vista (Resumen o Lista).
- Análisis:
  - Las categorías excluidas se guardan en el dispositivo, por libro. Las transferencias nunca cuentan.
  - La comparación con el periodo anterior solo se muestra si el libro tiene datos desde el principio de ese periodo.
  - Los gastos con fecha posterior a hoy no cuentan en la proyección del mes ni en el gasto destacado.
  - Gráficas SVG hechas a mano con los colores del tema, sin librerías.
  - El verde y el terracota se distinguen poco para el daltonismo rojo-verde, así que las líneas llevan además su nombre al final, una leyenda, y la del neto es más gruesa.

### Decisiones tomadas en la tarea 17
- Partida en 17a (PR #42) y 17b (PR #43); arreglo posterior en el PR #44.
- La transferencia a otro libro se hace desde Añadir → Transferencia. En el iPhone se confundió con un gasto «Casa do medio» hecho desde Gasto, que solo se apunta en Personal.
  - Por eso las cuentas de otro libro se muestran como «Abanca · Casa do Medio» (PR #44).
- Arquitectura §6 ya recoge la transferencia entre libros: dos movimientos sin `transferId`, cada uno con la categoría que elige el usuario.
- Casa do Medio se creó con la cuenta Abanca y saldo inicial 841,28 €. El saldo correcto, 1.200,28 €, se recalcula en la tarea 19, porque el banco aún no refleja 359 € de entradas pendientes de devolver.

### Decisiones tomadas en la tarea 16
- Ampliada durante la tarea, a petición del usuario: además del onboarding, Ajustes → DATOS con importar movimientos, plantilla CSV y descarga.
  - Importar en Ajustes solo añade: empareja cuentas y categorías por nombre y avisa de repetidos.
  - La plantilla y la descarga usan el mismo CSV.
- Formatos: el importador acepta CSV y JSON (`cartos-import` v1). El JSON queda para importaciones completas generadas fuera de la app, porque conserva emojis. Añadir una columna de emoji al CSV queda aparcado.
- Aceptado:
  - la descarga CSV no es una copia exacta (sin emojis ni categorías sin uso);
  - reintentar una importación a medias en Ajustes puede repetir movimientos (lo cubre el aviso);
  - las notas que empiezan por `=` se descargan tal cual.
- Libro personal real importado el 2026-10-29: 1.318 movimientos (01/01/2024–28/10/2026), total 35.159,92 €. El CSV descargado desde la app coincide fila a fila con el archivo importado. Los datos reales nunca entraron en el repo.
- Sin probar en el iPhone, para no tocar el libro real: «Descargar plantilla» e importar un CSV desde Ajustes. Lo cubren las pruebas de aceptación.
- Arquitectura §9.1 (importar y descargar) añadida en la propia tarea, con permiso.

### Decisiones tomadas en la tarea 10
- Borrado el código sin uso: `addMovement` de `data/book.js` (Añadir pasa por la cola desde la tarea 05) y `latestMovements` de `domain/movement.js`.
- Errores de la capa de datos en `js/data/errors.js` (`ValidationError`, `ApiError`).
- Funciones comunes: `domain/active.js` (`isActive`, `activeOnly`, `activeIds`) para la regla del borrado lógico; `labelOf` en `ui/format.js` para «emoji + nombre»; `currentUserSub` en `data/auth.js`; `ACCOUNT_EMOJIS` en `ui/components.js`.
- La búsqueda de fila por id vive solo en `data/rows.js` (`rowsById`, `findRowById`): la usan quitar categoría y la sincronización. `planSync` (`storage/`) recibe el mapa id → fila ya hecho, así `storage/` no conoce la forma del Sheet.
- Caché del Service Worker: `cartos-v8`. Un módulo nuevo que no esté en `APP_SHELL` rompe el arranque sin conexión; la tarea 13 añade un test que lo vigila.

### Decisiones tomadas en la tarea 11
- `js/ui/receipt.js`: `receiptLine(label, right, { tone, href, className })` es la única forma de pintar una línea de recibo; `right` es el importe o un elemento (el «Quitar» de Categorías). `movementLine` pinta un movimiento o una transferencia a partir de `movementLineModel`, que es puro y tiene tests. `lookupsOf(book)` construye los mapas de cuentas y categorías.
- `renderAccountForm` (`ui/components.js`) es el formulario de cuenta de Onboarding y de Ajustes → Cuentas, con la validación, los textos de error (`accountErrorText`), «Creando…» y el aviso sin conexión. Cada pantalla solo decide qué hace al guardar.
- `fillTexts(root, texts)` rellena los `[data-text]`; títulos y enlaces de vuelta también van por `data-text`.
- Se comprobó que el HTML de todas las pantallas es el mismo que antes (salvo `data-text` y dos clases internas sin estilo).
- Caché del Service Worker: `cartos-v9`.

### Decisiones tomadas en la tarea 12
- Estilos en `styles/tokens.css`, `base.css`, `components.css` y `screens.css`, enlazados en ese orden (sin `@import`). `main.css` desaparece.
- Colores en dos niveles: paleta (`--palette-paper`, `-ink`, `-ink-soft`, `-rule`, `-terracotta`, `-green`) con cada color escrito una vez como `light-dark(claro, oscuro)`, y semánticos (`--color-*`), que son lo único que usan componentes y pantallas. Requiere iOS 17.5 o posterior (confirmado en el iPhone del usuario).
- Una paleta nueva es un bloque `html[data-palette="…"]` en `tokens.css` (diseño §1.2). Elegirla desde Ajustes queda para el futuro.
- Escalas como tokens: `--text-2xs` … `--text-2xl`, `--touch`, `--radius`, `--tracking-*`, `--opacity-*`, `--rule`, `--navbar-room`.
- La barra de estado de iOS lee el color de fondo de los tokens. `index.html` y `manifest.json` mantienen el valor inicial claro; un test vigila que coincida con la paleta.
- `tests/styles.test.js` impide colores escritos a mano fuera de `tokens.css`, variables sin definir, uso directo de `--palette-*` y tamaños de letra fuera de la escala.
- Se comprobó que los estilos calculados de todas las pantallas no cambian (claro, oscuro y temas forzados).
- Caché del Service Worker: `cartos-v10`.

### Decisiones tomadas en la tarea 13
- Una tabla de pantallas, `SCREENS` en `js/ui/router.js` (sección, ruta, si se repinta), de la que salen las rutas, `parseHash`, qué pantallas se repintan y qué botones de la barra están activos.
- `js/book-state.js`: libro y cola en memoria y el ciclo cargar → sincronizar → recargar, sin DOM, con eventos (`route`, `data`, `loadFailed`) y dependencias inyectadas; tiene tests en Node.
- `js/views.js`: una función de pintado por sección. `app.js` queda en arranque, eventos del navegador y elección de ruta.
- Desviación de la ficha, aceptada al planificar: añadir una pantalla toca cuatro sitios, no tres (fila en `SCREENS`, entrada en `VIEWS`, el archivo de la pantalla y `sw.js`), porque juntar rutas y pintado en una tabla crearía un ciclo de imports entre `ui/router.js` y las pantallas. Dos de los cuatro los vigila un test. Explicado en `docs/estructura-repositorio-cartos.md`, «Cómo se añade una pantalla».
- Un test falla si un archivo de `js/`, `i18n/` o `styles/` no está en `APP_SHELL`.
- Se verificó con un recorrido de extremo a extremo de la app real (Chromium, Google simulado) que pantallas, llamadas a Google y Sheet final son los mismos que antes.
- Caché del Service Worker: `cartos-v11`.
- Tras cerrarla se decidió añadir pruebas de aceptación automáticas (tarea 14) antes de la de sincronización, que pasa a ser la 15.

### Decisiones tomadas en la tarea 14
- `@playwright/test` 1.63.0 como única dependencia de desarrollo (autorizada). Comandos `npm run acceptance` y `npm run acceptance:update`. `npm test` sigue sin navegador.
- `acceptance/`: la app real servida por un servidor propio en `127.0.0.1` (así el Service Worker se registra como en producción), Google simulado con un libro en memoria que registra cada llamada, sesión sembrada y fecha fija (20/10/2026). 22 escenarios que cubren las listas de comprobación de las tareas 04 a 13.
- «Se ve igual» se comprueba con fotos de los **estilos calculados** de 8 pantallas en claro y oscuro (`acceptance/__snapshots__`), no con capturas de imagen: no dependen de las fuentes de cada máquina. Se guardan solo para Chromium.
- WebKit (perfil iPhone 15) corre **sin Service Worker**: en WebKit, Playwright no puede interceptar las llamadas a Google de una página controlada por el Service Worker y acabarían en la red real. Arrancar sin conexión desde la caché se comprueba en Chromium.
- El Google simulado responde a las peticiones previas de CORS como las APIs reales.
- GitHub Actions (`.github/workflows/tests.yml`) corre dentro de la imagen oficial de Playwright de la misma versión (WebKit, Chromium y sus librerías ya instalados): instalarlos desde Ubuntu hizo que la primera ejecución superase los 15 minutos. Tarda alrededor de un minuto y medio.
- Se comprobó que las pruebas fallan si se rompe lo que vigilan (cinco fallos provocados; uno no estaba cubierto y se añadió).
- `AGENTS.md`, `README.md` y los comandos `/tarea`, `/revisar` y `/cerrar` piden `npm run acceptance`; las listas para el iPhone se reducen a lo que no se puede automatizar (inicio de sesión real con Google, app instalada, cómo se ve en el iPhone).
- En este contenedor de la nube solo hay Chromium; WebKit se comprueba en GitHub Actions y en el Mac (`npx playwright install webkit` una vez).

### Decisiones tomadas en la tarea 15
- Tras subir la cola se relee solo el libro abierto (`sheets.batchGet`); ya no se busca en Drive (`drive.list`) después de cada guardado. Diagnóstico en el iPhone (2026-10-29): `append` o `batchUpdateValues`, y después solo `batchGet`.
- Preparar los cambios (`data/movements.js`) queda separado de subirlos (`data/sync.js`).
- Probada ya con el libro personal real (tarea 16 fusionada antes del cierre). Se usó un movimiento de prueba, que se borró al terminar.

Regla del plan: cada tarea, al cerrarse, deja algo 100% usable en el iPhone. Ninguna queda a medias esperando a la siguiente.

## Decisiones abiertas

1. ~~**Cómo se guarda la dirección de un movimiento.**~~ Decidido (2026-10-25): campo `type` con valor `income` o `expense` e importe siempre positivo. Una transferencia es un `expense` en origen y un `income` en destino. Anotado en `docs/arquitectura-app-finanzas.md` (punto 2, «Dirección e importe de un movimiento»). Además, columna opcional `transferId`: el mismo UUID en las dos filas de una transferencia dentro del mismo libro, para editarlas o borrarlas juntas; vacía entre libros distintos.
2. **Refinamientos de diseño inspirados en Nothing OS.** Propuestos y sin decidir: estilo de puntos solo en el logo y en el saldo total del Dashboard, tipografía Geist Mono alojada en el repo, tarjetas con contorno en vez de bloques rellenos. Hasta que se decida, los agentes no los aplican.
3. ~~**Iconos.**~~ Decidido (2026-10-25): «CARTOS» en mayúsculas con la fuente Cutive Mono (SIL OFL 1.1), con su peso original, y un cursor de bloque al final del mismo color que el texto. Sin color de acento. Los SVG maestros (`icons/icon-dark.svg`, `icons/icon-light.svg`) llevan el texto convertido a contornos, así que no dependen de la fuente instalada; los PNG salen de ellos con `sips`. Se descartaron la versión de puntos, el píxel cuadrado y las serif (NType 82 y la serif de Claude son tipografías privativas).

## Notas

- Fuera del MVP, ya decidido: Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis.
- Visión a largo plazo (backend propio, cuentas propias, IA para categorizar): `docs/vision-producto-escala-cartos.md`. No forma parte del MVP.
