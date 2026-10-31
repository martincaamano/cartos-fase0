# Tarea 22 — Mantenibilidad

Estado: en curso (2026-10-31).
Depende de: 21 (fusionada).

## Objetivo
Que el código sea fácil de cambiar: quitar lo repetido, partir lo largo y poner nombre a los números sueltos. Nada cambia para el usuario: los tests y las pruebas de aceptación son la red.

Sale de una revisión de mantenibilidad (2026-10-31). Se hace en cuatro partes, cada una en su PR:
- **22a**: piezas compartidas de pantalla (`ui/`): elementos, meses, filas de opciones, chips, botones de dos toques y «ocupado», textos de error, filas enlace, línea de sumas, plegado «+ N más».
- **22b**: dominio y datos: sumas en céntimos en un solo sitio, utilidades de meses, lista de categorías, constantes de Análisis, `assertValid`, `keepOpen`, columna final del Sheet, límites de longitud.
- **22c**: pantallas largas (Añadir, Historial, Análisis) en funciones pequeñas; gráficos con un marco común.
- **22d**: almacenamiento (IndexedDB y mapas JSON compartidos) y tests (`fakeStorage`, cabeceras del Sheet, textos sin usar).

## Fuera de alcance
Cambios de comportamiento o de diseño. Renombrar los callbacks de todas las pantallas o mover el tema a `storage/`: cambian nombres sin ganar claridad.

## Criterio de cierre
- [ ] 22a–22d fusionadas; la app se comporta igual en el iPhone (prueba rápida: añadir, editar, historial, análisis, ajustes).
- [ ] `npm test` y `npm run acceptance` en verde, sin cambiar lo que comprueban (solo dónde viven los ayudantes).
