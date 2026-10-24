# Tarea 03 — Capa de datos y dominio del libro

Estado: pendiente.
Depende de: 02 cerrada.

## Decisión previa (confirmar con el usuario antes de escribir código)
Cómo se guarda la dirección de un movimiento. Propuesta: `type` (`income` o `expense`) con importe siempre positivo. Una vez confirmado, anotarlo en `docs/arquitectura-app-finanzas.md` §2 y en `docs/ESTADO.md`.

## Objetivo
Sin pantalla nueva. Es la base de todas las tareas siguientes: crear un libro real en Drive y leerlo.

## Alcance técnico
- `js/data/drive.js`: crear archivo con `appProperties` (`app: 'cartos'`, `bookId`, `bookType`, `name`) y listar libros con `appProperties has { key='app' and value='cartos' }` (arquitectura §4).
- `js/data/sheets.js`: `fetch` a Sheets API: leer y escribir valores, `batchUpdate`, siempre `valueInputOption=RAW`.
- `js/data/book.js`: crear libro con pestañas `Accounts`, `Categories`, `Movements`; leer el libro completo; añadir cuenta; añadir movimiento (id UUID, columnas `createdBy`, `personId`, `deleted`).
- `js/domain/account.js`, `movement.js`, `category.js`, `balance.js`: funciones puras. Calcular saldo de una cuenta, validar un movimiento, aplicar borrado lógico.

## Fuera de alcance
Pantallas, cola de salida, transferencias.

## Pruebas automáticas (aquí está el grueso)
- `balance`: saldo inicial + ingresos − gastos con números concretos; caso `0,1 + 0,2` que debe dar `0,30` exacto (céntimos enteros); movimientos borrados no cuentan; cuenta sin movimientos.
- `movement`: válido; importe 0, negativo o con más de dos decimales; fecha inválida o con formato distinto de `YYYY-MM-DD`; categoría inexistente.
- `book` y `sheets` con `fetch` simulado: URL correcta, cabecera `Authorization: Bearer`, `valueInputOption=RAW` presente en cada escritura, ninguna llamada a Google real.

## Pruebas manuales
- [ ] Una función (llamada desde la consola o desde un botón temporal de depuración, que no se versiona) crea un libro real en tu Drive con sus tres pestañas.
- [ ] Otra función lo lee y devuelve las cuentas y los movimientos correctos.
- [ ] Abres el Sheet a mano en Drive y los datos coinciden.

## Criterio de cierre
- [ ] Existe una función que crea un libro en tu Drive con las tres pestañas, y otra que lee sus cuentas y movimientos, verificado abriendo el Sheet.
- [ ] La lógica de `domain/` tiene tests, incluidos casos límite y casos inválidos.
- [ ] `npm test` en verde.
