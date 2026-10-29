# Tarea 16 — Importar y descargar los datos

Estado: pendiente.
Depende de: 15 (fusionada).

## Objetivo
Empezar un libro con datos reales en vez de a mano: desde el onboarding, cuando aún no hay libro, Cartos lee un archivo con su propio formato (cuentas con saldo inicial, categorías y movimientos, transferencias incluidas), enseña un resumen y, al confirmar, crea el libro con todo. Además, en Ajustes → DATOS: importar movimientos a un libro que ya tiene datos, descargar una plantilla CSV para rellenarla en una hoja de cálculo y descargar todos los datos en ese mismo CSV. Los archivos se leen y se crean en el iPhone; solo se escribe en el Drive del usuario.

## Decisiones tomadas (2026-10-29)
- Solo desde el onboarding, con el libro vacío. Importar sobre un libro con datos (mezclar o duplicar) queda fuera.
- Formato JSON propio de Cartos (`format: "cartos-import"`, `version: 1`) para la importación inicial completa (con emojis). No está pensado para editarse a mano: lo genera una conversión aparte.
- Los datos reales del usuario nunca entran en el repositorio: las pruebas usan datos inventados.

## Ampliación (2026-10-29): Ajustes → DATOS
- Importar en Ajustes **añade** movimientos al libro. Las cuentas y categorías del archivo con el mismo nombre que una del libro (sin distinguir mayúsculas) se reutilizan; las demás se crean. Si parece que hay movimientos repetidos (mismo día, cuenta, tipo e importe) se avisa en la vista previa, sin bloquear.
- La plantilla es un **CSV** (se abre en Numbers, Excel o Google Sheets). El importador acepta CSV y JSON, tanto en el onboarding como en Ajustes.
- «Descargar mis datos» genera el **mismo CSV**, así que sirve de copia que se puede volver a importar en un libro vacío con los mismos saldos.
- En el iPhone, las descargas abren la hoja de compartir (Guardar en Archivos); en un ordenador, se descargan.
- Aceptado tras revisar el plan (2026-10-29):
  - La descarga CSV no es una copia exacta: pierde emojis y categorías sin movimientos. Basta con que reimportada dé los mismos saldos y movimientos.
  - Importar en Ajustes son tres escrituras. Reintentar tras un fallo a medias puede repetir movimientos (no cuentas ni categorías): lo cubre el aviso de repetidos.
  - Las notas que empiezan por `=` se descargan tal cual. Protegerlas rompería la ida y vuelta, y los datos son solo del usuario.
  - Arquitectura §9.1 documenta importar y descargar.

## Formato CSV
```
fecha;tipo;importe;cuenta;cuenta destino;categoría;nota
;saldo inicial;1000,00;Banco;;;
2026-01-02;ingreso;1500,00;Banco;;Nómina;Enero
2026-01-03;gasto;45,20;Banco;;Supermercado;
2026-01-05;transferencia;200,00;Banco;Efectivo;;
```
- `tipo`: gasto, ingreso, transferencia (de `cuenta` a `cuenta destino`, sin categoría) o saldo inicial (solo `cuenta` e `importe`, que puede ser negativo; una por cuenta).
- Separador `;` o `,` (se detecta en la primera línea); celdas entre comillas si llevan el separador.
- Fechas `2026-10-25` o `25/10/2026`. Importes en formato español (`1.250,50`, `12,5`) o con punto (`12.50`).
- Una cuenta sin línea de saldo inicial empieza en 0. Si ya existe en el libro, su saldo inicial debe coincidir o no aparecer.
- Las cuentas y categorías nuevas se crean sin emoji; una categoría nueva toma el tipo de su primer movimiento. Transferencia no se usa como categoría.
- Los errores se señalan por línea del archivo («Línea 4: importe no válido»).
- La descarga no incluye categorías sin movimientos ni emojis.

## Formato
```json
{
  "format": "cartos-import",
  "version": 1,
  "accounts": [{ "key": "bank", "name": "Abanca", "emoji": "🏦", "initialBalance": 1000 }],
  "categories": [{ "key": "food", "name": "Supermercado", "emoji": "🛒", "kind": "expense" }],
  "movements": [
    { "date": "2026-10-01", "account": "bank", "type": "expense", "amount": 12.5, "category": "food", "note": "" },
    { "date": "2026-10-02", "transfer": { "from": "bank", "to": "cash" }, "amount": 50, "note": "" }
  ]
}
```
`key` solo sirve para enlazar dentro del archivo; en el libro cada cuenta, categoría y movimiento recibe un id nuevo (`crypto.randomUUID()`). Transferencia (`transfer`) la añade siempre la app.

## Alcance técnico
- `js/domain/import.js`: leer y validar el archivo (versión, importes con dos decimales, fechas válidas, referencias a cuentas y categorías del propio archivo, nombres repetidos, transferencias con cuentas distintas, tipo de categoría compatible), construir cuentas, categorías y movimientos (las transferencias con `buildTransfer`), y resumir (saldo actual de cada cuenta, total, número de movimientos y fechas).
- `js/data/`: `createBook` acepta categorías ya construidas; importar escribe las tres pestañas con `values:batchUpdate` y `RAW` en una sola petición, tras vaciar las filas de datos, así que repetir la importación tras un fallo no duplica nada.
- `js/screens/import.js` y enlace «Importar desde un archivo» en el onboarding: elegir el archivo, vista previa, Importar.
- Ampliación: `js/domain/csv.js` (leer y escribir CSV), `js/domain/import-csv.js` (CSV ↔ formato de importación, descarga del libro, plantilla); `validateImport` y `buildImport` reciben el libro existente y emparejan por nombre; `countDuplicates`. `js/data/`: `appendBookRows` (añade al final de cada pestaña, `RAW`) e `importIntoPersonalBook` (relee el libro, valida y añade). Ajustes con la sección DATOS, ruta `#/settings/import` y `js/ui/download.js` (hoja de compartir o descarga).
- Textos en `i18n/es.js`; `sw.js` con los módulos nuevos.

## Fuera de alcance
Reemplazar el libro desde Ajustes, saltarse los repetidos automáticamente, exportar a otros formatos, convertir formatos de otras apps dentro de la app.

## Pruebas automáticas
- Archivos válidos e inválidos (cada error con su movimiento), saldos del resumen en céntimos, transferencias en dos mitades con el mismo `transferId`.
- Una sola petición de escritura con `RAW`; reintentar no duplica.
- Aceptación: importar desde el onboarding con un archivo inventado, vista previa con los saldos, Dashboard cuadrado, filas en el Sheet simulado; un archivo erróneo no escribe nada.
- CSV: lectura (comillas, separadores, líneas), conversión y errores por línea, descarga del libro y vuelta a importar con los mismos saldos; la plantilla se importa sin errores.
- Aceptación en Ajustes: un CSV añade movimientos reutilizando cuentas y categorías y crea las nuevas (aviso de repetidos); un CSV con errores los señala por línea y no escribe; la plantilla y «Descargar mis datos» se descargan con el contenido esperado.

## Pruebas manuales en iPhone
- [ ] Con el libro de pruebas en la papelera, el onboarding ofrece «Importar desde un archivo» y abre el selector de Archivos.
- [ ] Importar el archivo real: la vista previa y después INICIO muestran los saldos de hoy de cada cuenta y el total.
- [ ] Ajustes → Descargar plantilla y Descargar mis datos abren la hoja de compartir; «Guardar en Archivos» deja un CSV que se abre bien en Numbers (acentos y euros correctos).
- [ ] Ajustes → Importar movimientos con un CSV pequeño editado en el iPhone: vista previa, importación y saldos correctos.

## Criterio de cierre
- [ ] El libro personal real está importado y sus saldos coinciden con los del banco.
- [ ] `npm test` y `npm run acceptance` en verde.
