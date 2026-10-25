# Tarea 06 — Añadir (transferencia)

Estado: hecha (2026-10-25).
Depende de: 05 cerrada. Es la pieza más grande del MVP.

## Objetivo
Pestaña Transferencia en Añadir, con cuenta origen, cuenta destino, importe y fecha. Al guardar se crean las dos filas (salida en origen, entrada en destino) con la categoría `Transferencia`.

## Alcance técnico
- `js/domain/transfer.js`: construye las dos mitades del movimiento a partir de los datos del formulario.
- Ampliar `js/screens/addMovement.js` con la tercera pestaña (sin selector de categoría).
- Escribir las dos filas en una sola llamada `batchUpdate`, al ser siempre cuentas del mismo libro en el MVP (arquitectura §6).
- Pasar la transferencia por la cola de salida de la tarea 05.

## Fuera de alcance
Transferencias entre libro personal y libro compartido, revertir una mitad si la otra falla.

## Pruebas automáticas
- `buildTransfer`: devuelve dos movimientos con ids distintos, misma fecha, mismo importe, categoría `Transferencia`, uno que sale del origen y otro que entra en el destino.
- El efecto neto sobre la suma de los saldos de las dos cuentas es cero.
- Rechaza: origen igual a destino, importe 0 o negativo, importe con más de dos decimales, cuenta inexistente.
- Con `fetch` simulado: las dos filas viajan en una única petición `batchUpdate`.
- Reintentar la misma transferencia no crea cuatro filas.

## Pruebas manuales en iPhone
- [x] Transfieres dinero entre dos cuentas tuyas; ambos saldos cambian y el total se mantiene.
- [x] En el Sheet aparecen las dos filas.
- [x] La transferencia no te deja elegir categoría.
- [x] En modo avión, la transferencia queda pendiente y al volver la red se sincroniza una sola vez.

## Criterio de cierre
- [x] Puedes transferir entre dos cuentas propias y ambos saldos se actualizan correctamente.
- [x] `npm test` en verde.
