---
description: Revisa los cambios actuales contra la tarea y la arquitectura (ej. /revisar 03)
argument-hint: "[tarea, ej. 03]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(npm test)
disable-model-invocation: true
---

Revisa los cambios pendientes de la tarea $0 con el subagente `reviewer`.

Archivos modificados o nuevos:
!`git status --short`

Diff de los archivos que ya existían:
!`git diff`

Pasos:

1. Ejecuta `npm test` tú mismo y quédate con el resultado.
2. Lanza el subagente `reviewer` con: los criterios de `docs/tareas/tarea-$0.md`, la lista de archivos y el diff de arriba, y el resultado de los tests. Los archivos nuevos (marcados con `??`) no salen en el diff: dile que los lea.
3. Devuélveme sus hallazgos tal cual, ordenados por gravedad. No corrijas nada sin que yo te lo pida.
