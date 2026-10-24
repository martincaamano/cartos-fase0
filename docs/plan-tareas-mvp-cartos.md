# Plan de tareas — MVP Cartos

Cada tarea, al cerrarse, deja algo 100% operativo y usable en el iPhone — nunca código a medias esperando a la siguiente pieza. Sigue la estructura de carpetas de `estructura-repositorio-cartos.md` y las decisiones de `arquitectura-app-finanzas.md`.

---

## Tarea 1 — Esqueleto de la PWA instalable

**Funcional**: la app se puede instalar en el iPhone desde Safari (icono en pantalla de inicio, abre en modo standalone, sin barra de navegador). Al abrirla se ve una pantalla en blanco con el nombre "Cartos", nada más.

**Técnico**:
- `index.html`: carga el manifest, registra el Service Worker, carga `js/app.js` como módulo.
- `manifest.json`: nombre, icono, colores, `display: standalone`.
- `sw.js`: estrategia network-first con fallback a caché (ver punto 1 de arquitectura).
- `styles/main.css`: variables de tema (claro/oscuro, siguiendo `prefers-color-scheme` del sistema) y tipografía monoespaciada base.
- `js/app.js`: punto de entrada, de momento solo pinta el nombre de la app.
- Deploy a GitHub Pages y verificación de instalación real en iPhone.

**Cierra cuando**: la app está instalada en el iPhone, abre en standalone, y respeta el modo claro/oscuro del sistema.

---

## Tarea 2 — Login y acceso a Drive

**Funcional**: pantalla de Login con botón "Continuar con Google" y texto explicativo corto. Tras iniciar sesión, pantalla de "Conceder acceso a Drive" con su propio botón y texto explicativo. Si ya había sesión y acceso previos, se saltan ambas pantallas.

**Técnico**:
- `js/data/auth.js`: login con Google Identity Services (ID token), token client aparte para el scope `drive.file`, función única `getAccessToken()`.
- `js/screens/login.js` y `js/screens/connect.js`.
- `js/storage/logs.js`: creación temprana del sistema de logs (aunque la pantalla de Diagnóstico se construya en la tarea 9), para empezar a registrar eventos de auth desde ya.
- `js/ui/router.js`: primera versión, decide entre login/connect/resto según estado de sesión.
- Publicar la app en Google Cloud Console de Testing a Production (tarea transversal, se hace en cuanto el login funcione, para evitar el límite de expiración de 7 días).

**Cierra cuando**: puedes iniciar sesión con Google, conceder acceso a Drive, cerrar la app y volver a abrirla sin que te lo vuelva a pedir.

---

## Tarea 3 — Capa de datos y dominio del libro

**Funcional**: sin pantalla nueva visible. Es la base sobre la que se apoyan todas las tareas siguientes.

**Técnico**:
- `js/data/drive.js`: crear archivo en Drive con `appProperties`, listar libros existentes vía `appProperties has {...}`.
- `js/data/sheets.js`: llamadas `fetch` a Sheets API — leer/escribir valores, `batchUpdate`, gestión de `valueInputOption=RAW`.
- `js/data/book.js`: operaciones de alto nivel — crear libro con pestañas Accounts/Categories/Movements, leer libro completo, añadir cuenta, añadir movimiento (con `id` UUID y columnas `createdBy`/`personId`/`deleted`).
- `js/domain/account.js`, `js/domain/movement.js`, `js/domain/category.js`, `js/domain/balance.js`: funciones puras — calcular saldo de una cuenta, validar un movimiento, aplicar borrado lógico.
- Pruebas manuales de estas funciones antes de conectarlas a ninguna pantalla (se puede probar desde la propia consola/logs, creando un libro de prueba y verificando en Google Sheets directamente que los datos aparecen bien).

**Cierra cuando**: existe una función capaz de crear un libro real en tu Drive con sus tres pestañas, y otra capaz de leer sus cuentas y movimientos correctamente, verificado abriendo el Sheet a mano.

---

## Tarea 4 — Onboarding + Dashboard

**Funcional**: si no existe libro personal, se muestra el onboarding (nombre, emoji y saldo inicial de la primera cuenta). Al confirmar, se crea el libro y se pasa directo al Dashboard, que muestra el saldo total y la cuenta recién creada como tarjeta.

**Técnico**:
- `js/screens/onboarding.js`: formulario, usa `book.js` de la tarea 3 para crear el libro.
- `js/screens/dashboard.js`: lee cuentas del libro vía `book.js`, calcula saldo total vía `domain/balance.js`, pinta tarjetas de cuenta y bloque de últimos movimientos (vacío por ahora, sin movimientos todavía).
- `js/ui/navbar.js`: primera versión de la barra inferior (aunque solo Dashboard esté activo, ya se pinta la estructura completa con las cinco secciones).
- Categorías por defecto (incluida `Transferencia`) se crean automáticamente al crear el libro, como parte de esta tarea.

**Cierra cuando**: completas el onboarding en tu iPhone y ves tu cuenta real, con su saldo inicial, en el Dashboard.

---

## Tarea 5 — Categorías + Añadir (Gasto e Ingreso)

**Funcional**: pantalla de Categorías (dentro de Ajustes) para ver las categorías por defecto y crear/borrar las propias. Pantalla de Añadir con pestañas Gasto e Ingreso (Transferencia se deja para la tarea 6), con selector de cuenta, importe (numérico nativo, dos decimales), categoría (rejilla + "Ver todas"), fecha (Hoy/Ayer/Anteayer + calendario) y nota opcional.

**Técnico**:
- `js/screens/categories.js`: CRUD de categorías propias sobre la pestaña Categories del libro.
- `js/screens/addMovement.js`: formulario con las pestañas, usa `domain/movement.js` para validar antes de guardar y `book.js` para persistir.
- `js/ui/components.js`: rejilla de categorías reutilizable, input de importe con validación de dos decimales, selector rápido de fecha.
- `js/storage/outbox.js`: primera versión de la cola local — guardar el movimiento en IndexedDB inmediatamente, sincronizar a Sheets en segundo plano (ver protocolo de sync de arquitectura).
- Actualización del Dashboard para reflejar el nuevo movimiento en "Últimos movimientos" y en el saldo.

**Cierra cuando**: puedes crear una categoría propia, registrar un gasto y un ingreso reales desde el formulario, y verlos reflejados en el Dashboard y en tu Google Sheet.

---

## Tarea 6 — Añadir (Transferencia)

**Funcional**: pestaña Transferencia en Añadir, con cuenta origen, cuenta destino, importe y fecha. Al guardar, se crean las dos filas (salida en origen, entrada en destino) con categoría `Transferencia`.

**Técnico**:
- `js/domain/transfer.js`: construye las dos mitades del movimiento a partir de los datos del formulario.
- Extensión de `addMovement.js` para la tercera pestaña.
- Uso de `batchUpdate` para escribir ambas filas en una sola llamada, al ser siempre cuentas del mismo libro personal en el MVP (ver punto 6 de arquitectura).

**Cierra cuando**: puedes transferir dinero entre dos de tus cuentas propias desde la app, y ambos saldos se actualizan correctamente.

---

## Tarea 7 — Historial

**Funcional**: listado completo de movimientos con estética de recibo, filtrable por cuenta, categoría y rango de fechas. Cada movimiento se puede tocar para editar o borrar (borrado lógico).

**Técnico**:
- `js/screens/history.js`: lista todos los movimientos del libro vía `book.js`, aplica filtros en cliente.
- Reutiliza `addMovement.js` en modo edición (mismo formulario, precargado).
- Borrado: marca `deleted = true` en la fila correspondiente, nunca elimina físicamente.

**Cierra cuando**: puedes ver, filtrar, editar y borrar cualquier movimiento pasado desde el Historial.

---

## Tarea 8 — Análisis

**Funcional**: pantalla con el bloque de categorías ordenadas por gasto (barras horizontales en escala de grises) y el bloque de evolución mensual (ingresos, gastos y ahorro por mes, con selector de mes hacia atrás).

**Técnico**:
- `js/screens/analysis.js`.
- Cálculos en `js/domain/balance.js` (o un nuevo `js/domain/stats.js` si crece mucho): agregación de movimientos por categoría y por mes, a partir de los datos ya leídos por `book.js`.

**Cierra cuando**: ves de un vistazo qué categoría te cuesta más y cómo ha evolucionado tu ahorro mes a mes, con datos reales acumulados de las tareas anteriores.

---

## Tarea 9 — Ajustes y Diagnóstico

**Funcional**: pantalla de Ajustes con selector de tema (Sistema/Claro/Oscuro), acceso a Categorías (ya construida en tarea 5) y acceso a Diagnóstico. Diagnóstico muestra las últimas ~500 entradas de log con botón de copiar.

**Técnico**:
- `js/screens/settings.js`.
- Pantalla de Diagnóstico que lee de `js/storage/logs.js` (ya en funcionamiento desde la tarea 2).
- Selector de tema: guarda preferencia en `localStorage`/IndexedDB y sobreescribe la variable de `prefers-color-scheme`.

**Cierra cuando**: puedes cambiar el tema manualmente, y puedes copiar el registro de logs para pegarlo y depurar cualquier problema encontrado durante las pruebas.

---

## Transversal — Publicación de la app

No es una tarea con pantalla propia, sino algo a resolver en cuanto el login de la tarea 2 funcione: cambiar el estado de la app en Google Cloud Console de "Testing" a "Production", para evitar el límite de expiración de 7 días de la autorización (ver punto 8 de arquitectura). Verificar empíricamente si esto pide algún paso adicional de Google al tratarse de un scope no sensible (`drive.file`).

---

## Fuera de este plan (fases posteriores al MVP)

Cuentas compartidas, Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis — según lo ya definido en `arquitectura-app-finanzas.md` y `diseno-flujo-pantallas-cartos.md`.
