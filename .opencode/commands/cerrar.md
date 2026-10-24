---
description: Cierra una tarea tras probarla en el iPhone (ej. /cerrar 03 todo bien)
agent: build
---

Quiero cerrar la tarea $1. Mis notas de las pruebas en iPhone (pueden estar vacías): $ARGUMENTS

Fecha de hoy: !`date +%F`

Tarea:
@docs/tareas/tarea-$1.md

Estado:
@docs/ESTADO.md

Haz esto, en orden:

1. Ejecuta `npm test`. Si falla, para y cuéntamelo.
2. Recorre el "Criterio de cierre" de la tarea. Para cada punto di si está cumplido, no cumplido, o pendiente de que yo lo pruebe en el iPhone (según mis notas). Si hay puntos no cumplidos o sin confirmar, no cierres: lista lo que falta y termina.
3. Si todo está cumplido: marca la tarea como hecha en `docs/ESTADO.md` (con la fecha), marca las casillas de la tarea y anota en `docs/ESTADO.md` cualquier decisión o desviación respecto al plan. Si el código se apartó de `docs/arquitectura-app-finanzas.md`, dime qué cambió en el documento pero no lo edites sin mi permiso.
4. Propón un mensaje de commit (`feat(tarea-$1): ...`, en inglés) y los comandos `git add` / `git commit` para que yo los ejecute. No hagas commit ni push.
