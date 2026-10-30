# Estructura de carpetas — Cartos

Árbol de archivos del repositorio, siguiendo las capas acordadas (datos, dominio, pantallas) con el dominio aislado de infraestructura y de UI. Al día con la tarea 14.

```
cartos-fase0/
│
├── index.html            (enlaza los estilos y carga js/app.js)
├── privacy.html          (política de privacidad, exigida por Google)
├── manifest.json
├── sw.js                 (Service Worker: APP_SHELL con todos los módulos)
│
├── styles/
│   ├── tokens.css        (paleta, colores semánticos y escalas)
│   ├── base.css          (elementos HTML y utilidades)
│   ├── components.css    (piezas compartidas)
│   └── screens.css       (lo propio de cada pantalla)
│
├── i18n/
│   └── es.js             (todos los textos visibles)
│
├── js/
│   ├── app.js            (arranque, eventos del navegador y qué pantalla se ve)
│   ├── book-state.js     (libro y cola en memoria; cargar, recargar, sincronizar)
│   ├── views.js          (cómo se pinta cada pantalla de la tabla de rutas)
│   ├── config.js         (Client ID público de Google)
│   │
│   ├── domain/           (reglas puras, con tests)
│   │   ├── account.js, category.js, movement.js, transfer.js
│   │   ├── balance.js, money.js, active.js
│   │   └── history.js, stats.js, import.js, import-csv.js, csv.js, books.js
│   │
│   ├── data/             (lo único que habla con Google)
│   │   ├── auth.js, http.js, errors.js
│   │   ├── drive.js, sheets.js, rows.js
│   │   ├── book.js, books.js
│   │   ├── movements.js      (guarda en la cola: crear, editar, borrar)
│   │   └── sync.js           (sube la cola al Sheet)
│   │
│   ├── storage/          (lo que vive en el dispositivo)
│   │   ├── session.js, book-cache.js, transfer-categories.js, last-account.js, history-view.js
│   │   ├── outbox.js, outbox-logic.js
│   │   └── logs.js
│   │
│   ├── screens/          (una pantalla por archivo)
│   │   ├── login.js, connect.js, status.js, onboarding.js, import.js, books.js
│   │   ├── dashboard.js, addMovement.js, history.js, analysis.js
│   │   └── settings.js, accounts.js, categories.js, diagnostics.js
│   │
│   └── ui/               (piezas compartidas; no tocan el DOM al importarse)
│       ├── router.js     (tabla de pantallas y decisión de ruta)
│       ├── navbar.js, receipt.js, components.js
│       └── format.js, theme.js, download.js
│
├── tests/                (node:test, uno por módulo; Google siempre simulado)
│
├── acceptance/           (Playwright: la app real con Google simulado; tarea 14)
│   ├── playwright.config.js, server.js, fixtures.js
│   ├── *.spec.js         (escenarios de las listas de comprobación)
│   └── __snapshots__/    (fotos de estilos de cada pantalla)
│
└── .github/workflows/tests.yml   (npm test y npm run acceptance en cada PR)
```

## Por qué cada carpeta

**`domain/`** — Las reglas de negocio puras: calcular un saldo, decidir si un movimiento es válido, construir las dos mitades de una transferencia. No importan nada de Google ni tocan el DOM. Se pueden probar solas, sin abrir la app, y son el corazón de Cartos: lo que hace que sea una app de finanzas y no una app cualquiera que guarda filas en una hoja.

**`data/`** — Todo lo que habla con Google. `auth.js` gestiona el login y el token de Drive (incluida la función única `getAccessToken()` de la que hablamos, para poder cambiar la implementación sin tocar el resto). `sheets.js` y `drive.js` son los que hacen las llamadas `fetch` reales a las APIs. `book.js` combina esas llamadas en operaciones de más alto nivel, como "crear un libro nuevo" o "leer todos los movimientos de un libro". Ninguna pantalla llama directo a `fetch`, siempre pasa por aquí.

**`storage/`** — Lo que vive en el propio dispositivo: la cola de sincronización (`outbox.js`, movimientos pendientes de subir) y los logs de diagnóstico (`logs.js`). Es infraestructura local, igual que `data/` es infraestructura remota, por eso van separadas.

**`screens/`** — Una pantalla, un archivo. Cada una solo pinta su HTML y reacciona a los toques del usuario, llamando a `domain/` para calcular y a `data/` para guardar. Ninguna pantalla implementa lógica de negocio propia, eso siempre vive en `domain/`. Así, si mañana añades una pantalla de "Estadísticas", reutiliza las mismas funciones de `domain/` que ya están probadas, sin duplicar nada.

**`ui/`** — Piezas compartidas entre pantallas que no son una pantalla en sí: la barra de navegación fija de abajo, el router que decide qué pantalla mostrar, y pequeños componentes reutilizables (por ejemplo, la rejilla de categorías o el input de importe con dos decimales), para no repetir ese HTML en cada pantalla que lo necesite.

**`i18n/`** — Los textos visibles en español, en un único sitio. El código en sí va en inglés; esto es lo único pensado para poder traducirse el día de mañana sin tocar lógica.

**Raíz de `js/`** — `app.js` es el punto de entrada: arranca el tema y el libro, escucha al navegador (cambio de URL, volver a primer plano, conexión) y decide si se ve el login, la conexión con Google, el onboarding o la app. `book-state.js` guarda el libro y la cola en memoria y lleva el ciclo cargar → sincronizar → recargar, sin tocar el DOM (tiene tests). `views.js` dice cómo se pinta cada pantalla de la app.

## Cómo se añade una pantalla

1. Una fila en `SCREENS` de `js/ui/router.js` (sección, ruta y si se puede repintar con datos nuevos).
2. Su función de pintado en `VIEWS` de `js/views.js`. Un test falla si la tabla y `VIEWS` no tienen las mismas secciones.
3. El archivo en `js/screens/`, con sus textos en `i18n/es.js`.
4. El archivo en `APP_SHELL` de `sw.js` (y subir `CACHE_NAME`). Un test falla si falta.

Si la pantalla va en la barra inferior, su botón ya existe en `js/ui/navbar.js` y se activa solo al tener ruta.

## Cómo crece con el tiempo

Cuando llegue la fase de cuentas compartidas, se añade `domain/sharing.js` y `screens/invite.js`, sin tocar nada de lo ya construido. Cuando llegue el backend mínimo de tokens, solo cambia lo de dentro de `data/auth.js`, ninguna pantalla se entera. Esa es la ventaja real de mantener las capas separadas desde el primer archivo.
