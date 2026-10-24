# Estructura de carpetas — Cartos

Árbol de archivos propuesto para el repositorio `cartos`, siguiendo las tres capas acordadas (datos, dominio, pantallas) con el dominio aislado de infraestructura y de UI.

```
cartos/
│
├── index.html
├── manifest.json
├── sw.js
│
├── styles/
│   └── main.css
│
├── i18n/
│   └── es.js
│
└── js/
    │
    ├── app.js
    │
    ├── domain/
    │   ├── account.js
    │   ├── movement.js
    │   ├── category.js
    │   ├── transfer.js
    │   └── balance.js
    │
    ├── data/
    │   ├── auth.js
    │   ├── drive.js
    │   ├── sheets.js
    │   └── book.js
    │
    ├── storage/
    │   ├── outbox.js
    │   └── logs.js
    │
    ├── screens/
    │   ├── login.js
    │   ├── connect.js
    │   ├── onboarding.js
    │   ├── dashboard.js
    │   ├── addMovement.js
    │   ├── history.js
    │   ├── categories.js
    │   └── settings.js
    │
    └── ui/
        ├── navbar.js
        ├── router.js
        └── components.js
```

## Por qué cada carpeta

**`domain/`** — Las reglas de negocio puras: calcular un saldo, decidir si un movimiento es válido, construir las dos mitades de una transferencia. No importan nada de Google ni tocan el DOM. Se pueden probar solas, sin abrir la app, y son el corazón de Cartos: lo que hace que sea una app de finanzas y no una app cualquiera que guarda filas en una hoja.

**`data/`** — Todo lo que habla con Google. `auth.js` gestiona el login y el token de Drive (incluida la función única `getAccessToken()` de la que hablamos, para poder cambiar la implementación sin tocar el resto). `sheets.js` y `drive.js` son los que hacen las llamadas `fetch` reales a las APIs. `book.js` combina esas llamadas en operaciones de más alto nivel, como "crear un libro nuevo" o "leer todos los movimientos de un libro". Ninguna pantalla llama directo a `fetch`, siempre pasa por aquí.

**`storage/`** — Lo que vive en el propio dispositivo: la cola de sincronización (`outbox.js`, movimientos pendientes de subir) y los logs de diagnóstico (`logs.js`). Es infraestructura local, igual que `data/` es infraestructura remota, por eso van separadas.

**`screens/`** — Una pantalla, un archivo. Cada una solo pinta su HTML y reacciona a los toques del usuario, llamando a `domain/` para calcular y a `data/` para guardar. Ninguna pantalla implementa lógica de negocio propia, eso siempre vive en `domain/`. Así, si mañana añades una pantalla de "Estadísticas", reutiliza las mismas funciones de `domain/` que ya están probadas, sin duplicar nada.

**`ui/`** — Piezas compartidas entre pantallas que no son una pantalla en sí: la barra de navegación fija de abajo, el router que decide qué pantalla mostrar, y pequeños componentes reutilizables (por ejemplo, la rejilla de categorías o el input de importe con dos decimales), para no repetir ese HTML en cada pantalla que lo necesite.

**`i18n/`** — Los textos visibles en español, en un único sitio. El código en sí va en inglés; esto es lo único pensado para poder traducirse el día de mañana sin tocar lógica.

**Raíz** — `index.html` carga el Service Worker, el manifest y `js/app.js` como módulo. `app.js` es el punto de entrada: decide si mostrar login, onboarding o dashboard según el estado, y monta el router y la barra de navegación.

## Cómo crece con el tiempo

Cuando llegue la fase de cuentas compartidas, se añade `domain/sharing.js` y `screens/invite.js`, sin tocar nada de lo ya construido. Cuando llegue el backend mínimo de tokens, solo cambia lo de dentro de `data/auth.js`, ninguna pantalla se entera. Esa es la ventaja real de mantener las capas separadas desde el primer archivo.
