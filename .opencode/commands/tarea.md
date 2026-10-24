---
description: Implementa una tarea del plan (ej. /tarea 03)
agent: build
---

Implementa la tarea $1 de Cartos.

Estado del proyecto:
@docs/ESTADO.md

Especificación de la tarea:
@docs/tareas/tarea-$1.md

Cambios sin commitear ahora mismo:
!`git status --short`

Sigue el "Flujo de trabajo por tarea" de AGENTS.md:

- Si la tarea tiene "decisiones previas" sin resolver, para y pregúntame antes de escribir código.
- Trabaja en pasos pequeños y ejecuta `npm test` después de cada uno.
- Pide al agente @tester los tests de la lógica nueva de `domain/` y de `data/`.
- No hagas commit ni push. No marques la tarea como cerrada.
- Al terminar, dame: qué has cambiado (archivos), resultado de `npm test`, y la lista de pruebas manuales en iPhone del archivo de la tarea.
