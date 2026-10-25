# Arquitectura técnica — Cartos (PWA de finanzas personales)

*v4 — actualizado tras la sesión de revisión de arquitectura, funcionalidad y diseño. Cada usuario guarda sus propios datos en su propio Google Drive: nadie ajeno al usuario, ni el desarrollador, ve su información financiera. Sin backend propio en el MVP.*

## 1. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | JS nativo con módulos ES (`<script type="module">`), sin build | Desarrollo 100% desde iPhone, sin npm/terminal; se edita y despliega directo desde GitHub |
| UI | DOM vanilla, sin framework | Pocas pantallas, no justifican un framework ni un bundler |
| Almacenamiento local | IndexedDB nativo | Sin npm no se puede instalar `idb`; la API nativa es autocontenida |
| Offline / cache assets | Service Worker escrito a mano, estrategia *network-first* con fallback a caché | Evita servir versiones antiguas de la app; ya validado en Fase 0 |
| Identidad + acceso a datos | Google Identity Services: ID token (identidad) + OAuth token con scope `drive.file` | Scope "no sensible / recomendado", ver punto 3 |
| Selector de archivos | Google Picker API (versión web) | Necesario para aceptar un Sheet compartido (fase posterior al MVP). Requiere `setAppId(numeroDeProyecto)` — confirmado en Fase 0: sin esto el Picker concede la selección pero no el acceso real, y falla con 404 después |
| Backend propio | Ninguno en el MVP | Ver punto 8 sobre por qué se aplaza, no se descarta |
| Base de datos | 1 Google Sheet por **libro** (no por cuenta, no por usuario del desarrollador) | Ver punto 3 |
| Hosting frontend | GitHub Pages | Gratis, 100% configurable desde Safari sin ordenador ni terminal |

## 2. El modelo de datos: libros, cuentas y movimientos

**Libro** = un único Google Sheet, la unidad real de aislamiento por *quién tiene acceso*.

- **Libro personal**: uno por usuario, creado en su propio Drive en el onboarding. Contiene todas sus cuentas propias (Banco, Efectivo, etc.) en un mismo archivo.
- **Libro compartido**: uno por cada cuenta compartida (pareja, grupo de amigos). Vive en el Drive de quien lo crea y se comparte con los demás miembros. Fuera del MVP, se añade justo después.

Dentro de un libro, las pestañas son:

- **Accounts**: las cuentas que viven en ese libro. Columnas: `id`, `name`, `emoji`, `initialBalance`, `createdAt`, `updatedAt`, `deleted`.
- **Categories**: categorías disponibles en ese libro, con las por defecto (incluida `Transferencia`, con id fijo `transfer`) más las que cree el usuario. Columnas: `id`, `name`, `emoji`, `kind` (`expense`, `income` o `both`), `isDefault`, `updatedAt`, `deleted`.
- **Movements**: todos los movimientos de todas las cuentas del libro, con columna `accountId` para saber a cuál pertenece cada uno. Columnas: `id`, `accountId`, `type`, `amount`, `date`, `categoryId`, `note`, `transferId`, `personId`, `createdBy`, `createdAt`, `updatedAt`, `deleted`. Se guarda el id de la categoría, no su nombre, para que renombrarla no rompa nada.
- **Members** (solo libros compartidos, fase posterior): email, nombre y rol de cada persona con acceso.

La primera fila de cada pestaña es la cabecera, y su orden es un contrato con el código (`js/data/rows.js`): si alguien reordena las columnas a mano, la app se niega a leer el libro en vez de mezclar datos. `createdAt` y `updatedAt` van en ISO 8601; `deleted` e `isDefault` son booleanos; los importes, números.

Motivo del cambio frente al modelo anterior ("un Sheet por cuenta"): dentro de un mismo libro, una transferencia entre dos cuentas propias es un único `batchUpdate` atómico de verdad, y calcular el total entre tus cuentas personales no exige abrir varios archivos. Entre libros distintos (personal ↔ compartido) el cruce de archivos es inevitable en cualquier modelo, porque cambia quién tiene acceso — ver punto 6.

### Identidad de filas y borrados

- Cada movimiento lleva un `id` tipo UUID, generado en el cliente con `crypto.randomUUID()`. Sincronizar es: si ese id no existe todavía en el Sheet, insertarlo. No hace falta ninguna pestaña `_sync` aparte para controlar qué ya se envió.
- Los borrados son **lógicos**: una columna `deleted` (booleano), nunca se elimina la fila físicamente. Motivo: si dos dispositivos leen el Sheet a la vez y uno borra una fila física, las filas de abajo se desplazan, y el otro dispositivo puede acabar leyendo o editando la fila equivocada por coincidencia de posición.
- Escritura siempre con `valueInputOption=RAW`, para que una nota que empiece por `=` no se interprete como fórmula.
- Fechas siempre en texto plano `YYYY-MM-DD`, sin información de zona horaria.
- Esto no sustituye el control de conflictos por `updatedAt` (last-write-wins con aviso) ya previsto para cuando dos dispositivos editan la misma fila casi a la vez estando ambos offline — son mecanismos complementarios, no el mismo.

### Personas en un movimiento

Cada movimiento distingue dos datos independientes:

- `createdBy`: quién registró el movimiento (el usuario logueado que guarda). Lo rellena la app sola, sirve para depuración.
- `personId`: quién efectuó el gasto o ingreso. Es un campo de negocio, editable en el formulario, y **opcional**: puede quedar vacío para un movimiento común de la cuenta (por ejemplo, una factura que no es de nadie en particular). En cuentas personales este selector no se muestra, porque solo hay una persona posible. En cuentas compartidas (fase posterior) se muestra con las personas del libro más la opción "Común".

Ambas columnas se incluyen en `Movements` desde el MVP, aunque de momento el MVP sea solo personal, para no tener que migrar datos cuando se añadan cuentas compartidas.

### Dirección e importe de un movimiento

Decidido el 2026-10-25:

- `type`: `income` o `expense`. Es lo que decide si el movimiento suma o resta al saldo de su cuenta.
- `amount`: siempre positivo, guardado como número (nunca texto formateado). El signo se aplica al calcular, a partir de `type`: un gasto de 12,50 € se guarda como `type=expense`, `amount=12.5`.
- Una transferencia son dos movimientos normales (ver punto 6): un `expense` en la cuenta origen y un `income` en la cuenta destino, por el mismo importe.
- `transferId`: opcional. Vacío en un gasto o ingreso normal. En una transferencia dentro del mismo libro, las dos filas llevan el mismo UUID (generado con `crypto.randomUUID()`, distinto del `id` de cada fila), para que el Historial pueda editar o borrar las dos mitades juntas. Entre libros distintos queda vacío: allí las dos mitades son independientes (punto 6).

Motivo: el formulario de Añadir ya separa Gasto e Ingreso, y en el Sheet es más difícil equivocarse al editar a mano un `type` que un signo.

## 3. Por qué `drive.file` y no un scope más amplio

Confirmado contra la documentación oficial de Google: `https://www.googleapis.com/auth/drive.file` está clasificado como "Recomendado / No sensible", da acceso solo a los archivos que la app crea o que el usuario le entrega explícitamente, y funciona directo con la API de Sheets — no hace falta el scope amplio `spreadsheets` ("sensible", acceso a todos los Sheets del usuario).

Efecto colateral bueno: no hacen falta las hojas `Users` ni `AccountUsers` de la versión original del prompt maestro — los permisos de Drive del archivo (owner / editor) cumplen esa función.

## 4. Cómo la app encuentra los libros de un usuario

Al crear un libro se le ponen `appProperties` privadas (invisibles en la interfaz de Drive, solo la app las lee), por ejemplo `{ app: "cartos", bookId: "<uuid>", bookType: "personal" | "shared", name: "Personal" }`.

En cada login, una sola llamada resuelve qué libros tiene el usuario:

```
GET https://www.googleapis.com/drive/v3/files
  ?q=appProperties has { key='app' and value='cartos' } and trashed=false
  &fields=files(id,name,appProperties,owners,capabilities)
```

Bajo `drive.file`, esta consulta solo devuelve archivos a los que la app ya tiene acceso concedido — nunca archivos ajenos aunque coincidan las propiedades. No hace falta ningún índice ni base de datos central.

**Cuál es el libro personal** (decidido el 2026-10-25): el archivo más antiguo (`createdTime`) con `bookType=personal`, así un duplicado creado por error nunca sustituye al real. Un libro personal sin cuentas activas cuenta como «sin libro»: el onboarding le añade la primera cuenta en vez de crear otro archivo.

## 5. Invitación a un libro compartido (fase posterior al MVP)

1. El propietario crea el libro compartido → la app llama a `permissions.create` de Drive para compartirlo como Editor con el email del invitado, y desactiva que los editores puedan volver a compartirlo.
2. Se envía un enlace de invitación por el canal que sea (WhatsApp, iMessage). No hay backend que mande avisos push — es "pásale el enlace".
3. El invitado abre el enlace, ve una pantalla de aceptación, y pulsa Aceptar.
4. Se abre el Picker (confirmado funcionando en modo standalone en la Fase 0, con `setAppId` correctamente configurado); al seleccionar el archivo compartido, `drive.file` concede acceso permanente a ese Sheet — no hace falta repetir el Picker en logins futuros.
5. Cada persona se registra sola en la pestaña `Members` la primera vez que abre el libro.

Límite conocido y aceptado para el MVP de esta fase: el propietario del libro es un punto único de fallo (si borra el archivo o su cuenta, los demás miembros lo pierden). Drive tampoco distingue roles propios de Cartos más allá de owner/editor — cualquier editor podría, en teoría, modificar el Sheet directamente desde la interfaz de Drive. Se acepta por ahora, pensado para grupos de confianza.

## 6. Transferencias

La transferencia es un atajo del formulario, no una operación coordinada ni transaccional entre archivos:

- **Entre dos cuentas del mismo libro** (caso típico: cuentas personales propias): una sola llamada `batchUpdate` que escribe las dos filas (salida en origen como `expense`, entrada en destino como `income`, ambas con el mismo `transferId`), atómica de verdad. Editar o borrar una transferencia afecta siempre a las dos filas a la vez.
- **Entre libro personal y libro compartido**: dos movimientos independientes, un gasto en un archivo y un ingreso en el otro, sin enlace, sin estado "pendiente" ni reintentos coordinados. Si una mitad falla al sincronizar, se trata como cualquier otro fallo de sincronización normal — queda en la cola local hasta que se reintente. Editar o borrar una mitad no afecta a la otra; es responsabilidad de quien lo hace.

Ambas filas usan la categoría `Transferencia`, que es una categoría normal a todos los efectos de cálculo (no se excluye de los totales de ingresos/gastos por cuenta: si transfieres a una cuenta, ese dinero sí es un ingreso real para *esa* cuenta). El neto (ingresos menos gastos) siempre sale correcto en cualquier resumen, porque cada transferencia se compensa sola en la resta; lo único que se infla son los totales brutos si se suman varias cuentas de un mismo libro a la vez, y es un efecto conocido y aceptado. Se deja como mejora futura (no en el MVP) un interruptor tipo "incluir transferencias" en el Historial, que simplemente filtre por esa categoría antes de sumar.

No se contempla revertir una mitad si la otra falla: revertir también puede fallar (sin conexión, acceso revocado), así que se prefiere dejarlo en cola y reintentar, nunca deshacer en silencio.

## 7. Autenticación

1. Google Identity Services, botón "Continuar con Google" → ID token (identidad: email, nombre, `sub`).
2. Botón separado "Conceder acceso a Drive" (evita el bloqueo de pop-ups de Safari al encadenarlo automáticamente tras el login) → token client aparte pide el scope `drive.file` → access token de en torno a 1 hora, adjuntado a cada llamada a Sheets/Drive API.
3. Toda obtención de token pasa por una única función (`getAccessToken()`), para poder cambiar la implementación (por ejemplo, añadir un backend de refresco) sin tocar el resto de la app.
4. La sesión se guarda en el dispositivo (`localStorage`, en `js/storage/session.js`): solo `sub`, email y nombre, si se concedió el acceso a Drive, y el access token con su caducidad. El ID token completo no se guarda. Así, cerrar y reabrir la app no vuelve a pedir nada mientras el token siga vigente. Borrar la app de la pantalla de inicio de iOS borra también esta sesión.
5. El botón de login es el oficial de Google: Google Identity Services no permite uno con diseño propio.

## 8. Sincronización, tokens, y por qué no hay backend en el MVP

Sin un servidor propio no existe *refresh token*: el access token dura en torno a una hora, y renovarlo puede requerir un toque de confirmación del usuario, no siempre es silencioso. Consecuencia aceptada para el MVP: **la sincronización solo ocurre con la app abierta**, nunca en segundo plano con la app cerrada. Los momentos de sync son: al abrir la app, al volver a primer plano, al recuperar conexión, o al pulsar "Sincronizar ahora". Si el token caducó, se muestra un botón "Reconectar" en vez de fallar en silencio.

Además, mientras la app de Google Cloud esté en estado "Testing" (no publicada), la propia autorización expira a los 7 días para cualquier scope no básico, incluido `drive.file` — no solo el token de una hora. Publicar la app a "Production" resuelve esto. Confirmado el 2026-10-25: al ser `drive.file` un scope no sensible, Google no pidió verificación manual, pero sí exigió completar la página de marca (nombre, correos de contacto, dominio autorizado `martincaamano.github.io`, página principal y política de privacidad, publicada en `privacy.html`). No se subió logotipo, porque eso activa la verificación de marca.

**Copia local del libro** (decidido el 2026-10-25): tras cada lectura de Drive, la app guarda en el dispositivo una copia del libro personal (id del archivo, cuentas, categorías y movimientos), en `localStorage` (`js/storage/book-cache.js`). Va ligada al `sub` del usuario: otra cuenta en el mismo dispositivo nunca la ve. Sirve para pintar el Dashboard al instante y para abrir la app sin conexión, con un aviso de que son datos guardados. Es solo lectura y nunca sale del dispositivo. Los cambios hechos sin conexión irán a la cola de salida (`outbox`, en IndexedDB), que es otra pieza. Con conexión y el token caducado se pide «Reconectar» antes de enseñar la copia.

**Backend mínimo de solo-tokens, evaluado y aplazado (no descartado):** se consideró un servicio pequeño cuya única función sería guardar el refresh token de cada usuario (cifrado) y cambiarlo por access tokens nuevos, sin tocar nunca los datos financieros. Esto permitiría sincronización real en segundo plano y eliminaría el límite de 7 días sin depender de publicar la app. Se descarta para el MVP por varias razones: cambia el flujo de login (pasa a requerir código + servidor, sin validar aún en PWA instalada en iOS), exige que el backend identifique usuarios sin depender de cookies entre dominios (Safari las bloquea), convierte al desarrollador en custodio de una llave de acceso ajena (relaja la garantía de privacidad estructural de "nadie más puede ver tus datos"), y añade una pieza a desplegar y mantener. Se pospone porque:

- Es barato de añadir después: al estar la obtención de token aislada en `getAccessToken()`, el cambio sería local.
- No hay datos reales todavía de cuánta fricción supone de verdad la renovación horaria en uso diario en iPhone.
- El límite de 7 días, que es el más grave, se resuelve solo con publicar la app, sin necesidad de backend.

Si Cartos se abre a más gente que el entorno de confianza cercano (pareja, grupo reducido de conocidos), este backend pasa a ser más recomendable, porque publicar la app deja de ser opcional (el modo Testing limita a 100 usuarios de prueba añadidos a mano) y porque la app dejaría de depender de que cada usuario tolere la fricción de reconectar.

## 9. Diagnóstico y logs

Dado que el desarrollo y la depuración ocurren desde el propio iPhone sin consola disponible, la app incluye una pantalla de Diagnóstico (dentro de Ajustes) con las últimas aproximadamente 500 entradas, guardadas en IndexedDB, con un botón para copiarlas.

- **Se registra**: fecha y hora, tipo de evento (login, token, sync, llamada a API, error), resultado y duración.
- **No se registra**: importes, notas ni nombres de categorías — solo ids, tipo de operación y código de resultado.
- Los logs nunca salen del dispositivo salvo que el usuario los copie manualmente. No se escriben en los Sheets (ensuciarían los datos, gastarían llamadas a la API, y en libros compartidos los vería otra persona).
- Al ser IndexedDB, iOS puede vaciarlos bajo presión de almacenamiento — se asumen como "mejor esfuerzo", suficientes para depurar, no como un registro permanente.

## 10. Comunicación con Google

Al no haber Apps Script propio, no hay problema de CORS: `sheets.googleapis.com` y `www.googleapis.com/drive/v3` son APIs REST estándar con soporte CORS normal, `fetch()` con cabecera `Authorization: Bearer <token>` funciona directo desde el navegador.

## 11. Arquitectura de código: tres capas, dominio aislado

Se evaluó y se descartó arquitectura hexagonal/DDD completa por sobreingeniería para el tamaño real de Cartos (un único adaptador de salida, Google Sheets, y uno de entrada, el navegador — no hay variedad de adaptadores que justifique puertos y entidades de dominio formales). Se conservan dos ideas centrales de DDD sin todo el aparato:

- **Capa de datos**: funciones que hablan con Sheets/Drive API (crear movimiento, listar cuentas, leer libro), sin saber nada de pantallas ni de reglas de negocio.
- **Capa de dominio**: funciones puras de negocio (calcular saldo, validar un movimiento, decidir si algo está duplicado), sin tocar el DOM ni Google — se pueden probar solas.
- **Capa de pantallas**: cada pantalla solo pinta y responde a eventos, delegando todo cálculo a la capa de dominio.

Vocabulario del dominio, consistente en código, nombres de archivo y logs: `Account`, `Movement`, `Category`, `Book`, `Transfer`. Todo el código, comentarios y nombres van en inglés, con `cartos` como identificador de la app (por ejemplo `appProperties: { app: 'cartos' }`). Los textos visibles de la interfaz se mantienen en español, aislados en un único archivo de traducciones, para poder traducirlos sin tocar el resto del código si la app se abre a más gente.

## 12. Diseño visual

Estética minimalista tipo recibo o ticket de compra, con inspiración en el lenguaje visual de Nothing OS: tipografía monoespaciada de aire retro (calculadora / máquina de escribir), blanco y negro casi puro, con acentos de color mínimos y reservados (rojo o terracota apagado para gastos, verde apagado para ingresos). El listado de movimientos se plantea visualmente como un recibo: separadores con líneas discontinuas, importes alineados a la derecha, total al final. La tipografía monoespaciada tiene además una ventaja práctica: las cifras alinean perfecto en columna, ayudando a leer importes de un vistazo.

## 12.1. Navegación

Barra de navegación fija inferior (patrón estándar tipo Instagram/Twitter), con cinco secciones: Dashboard (por defecto al abrir), Historial, Añadir (acción central), Análisis, y Ajustes (incluye Categorías, selector de tema y Diagnóstico). No se usa un botón flotante independiente. Categorías no tiene hueco fijo propio porque se gestiona pocas veces, normalmente una sola vez al principio.

## 12.2. Pantallas del MVP

- **Login**: botón "Continuar con Google"; si ya existe sesión y libro personal, se salta directo al Dashboard.
- **Conceder acceso a Drive**: botón separado tras el login (ver punto 7).
- **Onboarding** (solo si no existe libro personal todavía): nombre, emoji y saldo inicial de la primera cuenta; la app crea el libro.
- **Dashboard**: saldo total arriba (suma de cuentas del libro personal), cada cuenta como tarjeta con su saldo y emoji, listado corto de últimos movimientos de todas las cuentas.
- **Añadir**: tres pestañas, Gasto / Ingreso / Transferencia, empezando en Gasto.
  - Campo importe: tipo numérico nativo de iOS (abre el teclado numérico del sistema), limitado a número entero más hasta dos decimales.
  - Campo fecha: tres opciones rápidas, Hoy (marcada por defecto), Ayer, Anteayer, más selector de calendario nativo para cualquier otra fecha.
  - Campo categoría: rejilla de iconos con las categorías más usadas, con un botón "Ver todas" para el resto vía lista con buscador.
  - Para Transferencia: cuenta origen, cuenta destino, importe y fecha; sin selector de categoría, la asigna la app.
- **Historial**: listado completo de movimientos, filtrable por cuenta, categoría y rango de fechas; cada movimiento se puede editar o borrar.
- **Análisis**: categorías ordenadas por gasto (barras horizontales en escala de grises) y evolución mensual de ingresos, gastos y ahorro neto.
- **Ajustes**: incluye gestión de Categorías, selector de tema (sistema / claro / oscuro) y la pantalla de Diagnóstico (punto 9).

## 12.3. Fuera del MVP (fases posteriores, no bloquean el modelo de datos)

- Cuentas compartidas: invitación, Picker, pestaña `Members` (punto 5).
- Apple Shortcuts: sin backend no pueden escribir en silencio; la vía realista es un enlace tipo `#/add?tipo=gasto&importe=12` que abre la app con el formulario relleno, y el usuario confirma con un toque.
- Pagos programados: sin servidor no hay notificaciones push; se generarían al abrir la app, comparando la fecha de vencimiento, con un id determinista (`scheduledId` + fecha) para evitar duplicados entre dispositivos.
- Backend mínimo de refresco de tokens (punto 8).
- Interruptor "incluir transferencias" en resúmenes agregados (punto 6).

## 13. Riesgos validados en la Fase 0 (completada)

| Riesgo | Resultado |
|---|---|
| Google Sign-In + `drive.file` en PWA instalada en iOS (modo standalone) | Confirmado funcionando |
| Persistencia del acceso tras cerrar sesión y volver a entrar | Confirmado funcionando |
| Picker en modo standalone de iOS | Confirmado funcionando, tras añadir `setAppId()` (ver punto 1) |
| Flujo completo de invitación entre dos cuentas Google reales | Confirmado funcionando de extremo a extremo, tras el fix de `setAppId()` |

## 14. Roadmap

- **Fase 0 (completada):** validación de los 4 riesgos técnicos de arriba.
- **MVP actual:** login, acceso a Drive, onboarding, libro personal con varias cuentas, Dashboard, Añadir (gasto/ingreso/transferencia), Historial, Categorías, Diagnóstico. Sin backend, sync solo con la app abierta.
- **Fase siguiente:** cuentas compartidas (invitación, Picker, permisos, `Members`).
- **Fases posteriores:** Apple Shortcuts vía deep link, pagos programados, backend mínimo de refresco de tokens si la fricción o el crecimiento de usuarios lo justifican, interruptor de transferencias en resúmenes.
