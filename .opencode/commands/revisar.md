---
description: Revisa los cambios actuales contra la tarea y la arquitectura (ej. /revisar 03)
agent: reviewer
subtask: true
---

Revisa los cambios pendientes de la tarea $1.

Criterios de la tarea:
@docs/tareas/tarea-$1.md

Archivos modificados o nuevos:
!`git status --short`

Diff de los archivos que ya existían:
!`git diff`

Los archivos nuevos (marcados con `??` arriba) no salen en el diff: léelos tú. Ejecuta `npm test` y revisa según tus criterios.
