# Tarea 21 — Robustez

Estado: en curso (2026-10-31).
Depende de: 18a (fusionada).

## Objetivo
Arreglar los fallos que encontró una revisión completa del código (2026-10-31) antes de usar el libro compartido entre dos personas. Ningún fallo perdía datos ya guardados en Drive.

## Alcance
**A. Fallos que afectan al uso normal**
1. Un cambio guardado mientras otro se sube esperaba a la siguiente apertura: la subida se encadena.
2. La pestaña Members creada sin cabecera (corte entre los dos pasos) dejaba el libro ilegible: una pestaña vacía cuenta como sin personas y la cabecera se escribe al unirse.
3. «Hoy» se quedaba en el día anterior con la app abierta de un día para otro: Añadir y Análisis se repintan al volver si cambió el día.
4. Saldos iniciales negativos con decimales se mostraban mal al editar (−10,50 → «-11,-50»).
5. «12 meses» dividía siempre entre 12 aunque el libro tuviera menos historia; lo mismo «un mes normal».
6. Borrar y Guardar a la vez podían deshacer un borrado.

**B. Dos personas, varios libros**
7. La cola de salida se liga a quien inicia sesión: otra cuenta en el mismo iPhone no sube ni ve cambios ajenos.
8. Una lectura de Drive que termina tras cerrar sesión se descarta.
9. Las dos mitades de una transferencia entre libros se guardan en la cola en una sola transacción.
10. Un libro sin acceso (403/404) no bloquea el arranque: se abre el personal. Sus cambios pendientes se avisan en INICIO.

**C. Detalles**
- «Ver todo» de INICIO con zona táctil de 44 px; con las cifras ocultas, sin color de saldo negativo.
- Doble toque en «Abrir un libro compartido conmigo» abre el selector una vez.
- Tocar HISTORIAL en la barra quita el filtro con el que se llegó.
- El importe acepta «12,» y «,5».
- El Service Worker no guarda respuestas de error y sin conexión responde siempre.
- Textos sueltos a `i18n/es.js`; código sin uso eliminado.

**D. Documentación al día**: AGENTS.md (cuentas compartidas ya no es fase futura), ESTADO, arquitectura y diseño (Añadir al abrir, sin persona por movimiento), ficha de la 19.

## Fuera de alcance
Mejoras de experiencia propuestas en la revisión (quedarse en Añadir tras guardar con «Deshacer», desarmar los botones de dos toques, marcar lo pendiente de subir): se deciden aparte.

## Pruebas automáticas
Un test por cada fallo de A y B (dominio, datos con `fetch` simulado, estado del libro con dependencias falsas) y aceptación donde toque la pantalla.

## Pruebas manuales en iPhone
- [ ] Guardar dos gastos seguidos rápido: los dos llegan al Sheet sin cerrar la app.
- [ ] Dejar la app abierta en Añadir de un día para otro: «Hoy» es el día nuevo.
- [ ] Una cuenta con saldo inicial negativo con decimales se edita sin error.

## Criterio de cierre
- [ ] Fusionada y probada en el iPhone.
- [ ] `npm test` y `npm run acceptance` en verde.
