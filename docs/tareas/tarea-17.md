# Tarea 17 — Varios libros

Estado: hecha (2026-10-30).
Depende de: 16 (fusionada).

## Objetivo
Tener más de un libro (el personal y, por ejemplo, «Casa do medio», que en la tarea 18 se compartirá con la pareja), cambiar entre ellos y transferir dinero de una cuenta de un libro a una de otro. Cada libro es independiente: su INICIO, su total, su Historial y su Análisis. Además, la app abre directamente en Añadir, que es para lo que se usa casi siempre.

Se hace en dos partes, cada una usable sola en el iPhone:
- **17a**: crear libros, cambiar de libro, renombrarlos y abrir en Añadir.
- **17b**: transferir a una cuenta de otro libro.

## Decisiones tomadas (2026-10-29)
- Los libros nunca se suman: cada uno muestra solo lo suyo.
- Un libro nuevo se crea ya como `bookType: shared` (se compartirá en la 18) y empieza con las categorías por defecto. Las de la reforma llegarán con la importación de la tarea 19, a partir del Excel actual.
- Se cambia de libro, se crea y se renombra en Ajustes → Libros. INICIO y Añadir muestran arriba el nombre del libro abierto cuando hay más de uno, para no apuntar un gasto en el libro equivocado.
- El libro abierto se recuerda en el dispositivo. Al abrir la app sin libro recordado (o si ya no existe), se abre el personal.
- Cada libro tiene su copia en el dispositivo, así que cambiar de libro y trabajar sin conexión funcionan con cualquiera. La cola de salida sube los cambios de todos los libros, no solo del abierto.
- Al abrir la app (sin ruta en la URL) se muestra Añadir. Inicio sigue en la barra. Al guardar se vuelve a INICIO, como hasta ahora.
- Transferencia a otro libro (17b): dos movimientos independientes, sin `transferId` común (arquitectura §6). El usuario elige la categoría de cada mitad: la del gasto en el libro de origen y la del ingreso en el de destino (por ejemplo, gasto «Casa do medio» en Personal e ingreso «Aportación Martín» en Casa do medio). Las transferencias dentro de un mismo libro siguen con la categoría Transferencia. Cambia §6 de la arquitectura solo para el caso entre libros.

## Alcance técnico (17a)
- `js/domain/books.js`: ordenar los libros (el personal primero), elegir el libro que se abre y validar el nombre de un libro.
- `js/storage/book-cache.js`: una copia por libro y el libro abierto; la copia de un solo libro de antes se convierte sola.
- `js/data/`: `drive.js` renombra un libro (`files.update`); `personal-book.js` pasa a `books.js`: encontrar todos los libros en una sola búsqueda, leer el abierto, cambiar de libro, crear uno nuevo con su primera cuenta y renombrarlo.
- `js/book-state.js`: el libro abierto en vez del personal, la lista de libros, cambiar de libro y subir la cola de cada libro.
- `js/screens/books.js` (Ajustes → Libros, ruta `#/settings/books`); nombre del libro en INICIO y Añadir; Añadir al abrir.
- Textos en `i18n/es.js`; `sw.js` con los módulos nuevos.

## Alcance técnico (17b)
- `js/domain/transfer.js`: `buildCrossBookTransfer`, un gasto en la cuenta de origen y un ingreso en la de destino, sin `transferId`, cada uno con su categoría.
- `js/data/movements.js`: `queueCrossBookTransfer` valida cada mitad contra su libro y la pone en la cola de ese libro.
- `js/storage/transfer-categories.js`: las dos últimas categorías usadas para cada cuenta destino, para que la siguiente aportación salga rellenada.
- Añadir → Transferencia: el destino ofrece también las cuentas de los otros libros (agrupadas por libro, con su copia en el dispositivo). Si se elige una, aparecen las dos categorías: la del gasto aquí y la del ingreso allí. Al editar, solo las cuentas del propio libro.

## Fuera de alcance
Compartir un libro y las personas por movimiento (tarea 18), importar la reforma (19), borrar un libro, ver varios libros sumados.

## Pruebas automáticas
- Lógica pura de libros, copia por libro con la conversión, datos con `fetch` simulado (un solo `drive.list` al abrir), estado con cambios en cola de un libro que no está abierto.
- Aceptación con un Google simulado de varios archivos: crear un libro, cambiar de libro (cada uno con su INICIO), renombrar, la app abre en Añadir, un cambio sin conexión en un libro se sube al volver aunque esté abierto el otro.
- 17b: la transferencia a otro libro escribe un gasto en uno y un ingreso en el otro, sin `transferId`, con sus categorías; la siguiente sale con las categorías elegidas; sin una de las dos no se guarda nada.

## Pruebas manuales en iPhone
- [x] Con la app instalada, abrirla la lleva a Añadir, con el nombre del libro arriba.
- [x] Ajustes → Libros: crear «Casa do medio» con su primera cuenta; aparece en Drive como «Cartos · Casa do medio».
- [x] Cambiar entre Personal y Casa do medio: cada uno con su INICIO, Historial y Análisis; los saldos de Personal no cambian.
- [x] Cerrar y volver a abrir la app: sigue en el último libro abierto.
- [x] 17b: desde Personal, transferencia de Abanca a la cuenta de Casa do medio con gasto «Casa do medio» e ingreso «Aportación Martín» (crearla antes en Ajustes → Categorías de Casa do medio). Aparece en los dos libros y la siguiente sale ya con las dos categorías.

## Criterio de cierre
- [x] 17a y 17b fusionadas y probadas en el iPhone.
- [x] `npm test` y `npm run acceptance` en verde.
