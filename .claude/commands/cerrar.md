---
description: Cierra una tarea tras probarla en el iPhone (ej. /cerrar 03 todo bien)
argument-hint: "[tarea, ej. 03] [notas de mis pruebas en iPhone]"
allowed-tools: Bash(date *) Bash(npm test) Bash(npm run acceptance)
disable-model-invocation: true
---

Quiero cerrar la tarea $0. Mis notas de las pruebas en iPhone (pueden estar vacías): $ARGUMENTS

Fecha de hoy: !`date +%F`

Busca la issue de GitHub titulada «Tarea $0 · …» y léela con sus comentarios (herramientas de GitHub, o `gh issue list --search "Tarea $0 in:title"` y `gh issue view <número> --comments`). Si es una parte (24a), lee también la issue de la tarea (24), donde están las decisiones. Para tareas hasta la 23, usa `docs/tareas/tarea-$0.md` y `docs/ESTADO.md`. Después haz esto, en orden:

1. Ejecuta `npm test` y `npm run acceptance`. Si alguno falla, para y cuéntamelo.
2. Recorre el "Criterio de cierre" de la tarea. Para cada punto di si está cumplido, no cumplido, o pendiente de que yo lo pruebe en el iPhone (según mis notas). Si hay puntos no cumplidos o sin confirmar, no cierres: lista lo que falta y termina.
3. Si todo está cumplido (issue): marca las casillas en el cuerpo de la issue, añade un comentario con la fecha, mis notas y cualquier decisión o desviación respecto al plan, y cierra la issue como completada (y sus sub-issues que sigan abiertas). No hace falta commit ni PR.
   Tareas hasta la 23 (archivo): marca la tarea como hecha en `docs/ESTADO.md` (con la fecha), marca las casillas del archivo, anota decisiones o desviaciones en `docs/ESTADO.md` y propón el mensaje de commit (`feat(tarea-$0): ...`, en inglés) y los comandos `git add` / `git commit`. No hagas commit ni push.
4. Si el código se apartó de `docs/arquitectura-app-finanzas.md`, dime qué cambió en el documento pero no lo edites sin mi permiso.
