# Cartos — instrucciones para agentes

Cartos es una PWA de finanzas personales para iPhone: registrar gastos, ingresos y transferencias entre cuentas propias, ver saldos y estadísticas simples. Los datos viven en el Google Drive de cada usuario (un Google Sheet por "libro"). No hay backend propio. Funciona offline y se publica en GitHub Pages.

Habla con el usuario en español. Código, comentarios, nombres de archivo y mensajes de commit, en inglés.

## Dónde mirar antes de actuar

- Estado y siguiente tarea: `docs/ESTADO.md`
- Tarea concreta (objetivo, alcance, pruebas, criterio de cierre): `docs/tareas/tarea-NN.md`
- Datos, autenticación, sincronización, transferencias: `docs/arquitectura-app-finanzas.md`
- Pantallas y estética: `docs/diseno-flujo-pantallas-cartos.md`
- Árbol de carpetas: `docs/estructura-repositorio-cartos.md`
- Código de referencia que ya funcionó en iPhone (login, token `drive.file`, Picker): `docs/referencia/fase0-spike.html`
- `docs/vision-producto-escala-cartos.md` es una visión a futuro. No implementes nada de ahí.

Lee solo las secciones que necesites para la tarea en curso, no todos los documentos enteros.

## Stack y límites

- JavaScript nativo con módulos ES (`<script type="module">`). Sin framework, sin bundler, sin transpilado. Los imports locales llevan siempre la extensión `.js`.
- Cero dependencias en tiempo de ejecución. Node se usa solo para tests y servidor local. No añadas paquetes npm sin permiso del usuario.
- DOM vanilla, IndexedDB nativo, Service Worker propio (network-first con fallback a caché).
- El único script externo permitido es Google Identity Services. Nada de CDNs, analítica ni trackers.
- Google se consulta con `fetch` directo a las APIs REST de Drive y Sheets, con `Authorization: Bearer`.

## Arquitectura en capas (la regla más importante)

- `js/domain/`: funciones puras de negocio. No importan nada de `data/`, `storage/`, `screens/` ni `ui/`, y no usan `document`, `window`, `fetch` ni `indexedDB`. Toda función nueva lleva tests.
- `js/data/`: el único sitio que habla con Google. Las pantallas nunca llaman a `fetch`. Todo token sale de `getAccessToken()` en `js/data/auth.js`.
- `js/storage/`: lo que vive en el dispositivo (cola de salida, logs en IndexedDB). Separa la lógica pura (testeable en Node) del acceso a IndexedDB.
- `js/screens/`: una pantalla por archivo. Solo pinta y reacciona a eventos; los cálculos y validaciones se delegan a `domain/`.
- `js/ui/`: router, barra de navegación y componentes compartidos. Ningún módulo debe tocar `document` al importarse, para poder importarlo desde los tests.
- `i18n/es.js`: todos los textos visibles en español. Ninguna cadena de interfaz suelta en `screens/`.

## Reglas de datos

- Los ids se generan en el cliente con `crypto.randomUUID()`. Nunca se usa el número de fila del Sheet como id.
- Los borrados son lógicos (columna `deleted`). Nunca se elimina una fila.
- Se escribe en Sheets siempre con `valueInputOption=RAW`.
- Fechas como texto `YYYY-MM-DD`, sin zona horaria.
- Los importes son números, nunca texto formateado. El formato europeo (1.250,50 €) se aplica solo al pintar.
- Para sumar o restar importes, trabaja en céntimos enteros (`Math.round(x * 100)`) y vuelve a euros al final, para evitar errores de coma flotante (0,1 + 0,2).
- El saldo se calcula siempre (saldo inicial + movimientos). Nunca se guarda como dato.

## Privacidad y secretos

- Los logs registran solo ids, tipo de operación y código de resultado. Nunca importes, notas ni nombres de categorías.
- No escribas tokens, claves ni secretos en el repo. El Client ID de Google es público y va en `js/config.js`.
- Nada de lo que escribe la app sale del dispositivo salvo hacia el Drive del propio usuario.

## Diseño

- Estética de recibo con aire Nothing OS: tipografía monoespaciada, blanco y negro casi puro, separadores discontinuos, importes alineados a la derecha.
- Color solo para gastos (terracota apagado) e ingresos (verde apagado). Usa siempre las variables CSS de `styles/main.css` (`--color-bg`, `--color-ink`, `--color-expense`, `--color-income`, `--space-*`...), nunca colores escritos a mano.
- Mobile-first para iPhone: zonas táctiles de al menos 44 px, respeta las áreas seguras de iOS, modo claro/oscuro.
- No introduzcas el estilo de puntos (dot-matrix) ni nuevas tipografías sin que el usuario lo pida.

## Flujo de trabajo por tarea

1. Lee `docs/ESTADO.md` y el archivo de la tarea. Si algo es ambiguo o contradice la arquitectura, pregunta; no inventes.
2. Trabaja en pasos pequeños. Después de cada paso ejecuta `npm test`.
3. Toda lógica nueva de negocio lleva su test en `tests/` (con `node:test`). Para probar `data/` se simula `fetch`; nunca se llama a Google de verdad desde los tests.
4. No des una tarea por cerrada. Las pruebas en iPhone las hace el usuario: déjale la lista de comprobaciones lista.
5. Al terminar, resume en pocas líneas qué cambió y qué debe probar a mano.

## Prohibido sin permiso explícito

- `git push`, y `git commit` salvo que el usuario lo pida.
- Borrar archivos, cambiar la arquitectura o añadir dependencias.
- Implementar funciones de fases futuras: cuentas compartidas, Apple Shortcuts, pagos programados, backend de tokens.
- Refactorizar código ajeno a la tarea en curso.

## Comandos

- `npm test`: ejecuta todos los tests.
- `npm run dev`: servidor local en http://localhost:5173
