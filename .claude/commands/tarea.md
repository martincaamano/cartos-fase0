---
description: Implementa una tarea del plan (ej. /tarea 03)
argument-hint: "[tarea, ej. 03]"
allowed-tools: Bash(git status *)
disable-model-invocation: true
---

Implementa la tarea $0 de Cartos.

Cambios sin commitear ahora mismo:
!`git status --short`

Antes de empezar, lee `docs/ESTADO.md` y `docs/tareas/tarea-$0.md`. Sigue el "Flujo de trabajo por tarea" de AGENTS.md:

- Si la tarea tiene "decisiones previas" sin resolver, para y pregúntame antes de escribir código.
- Trabaja en pasos pequeños y ejecuta `npm test` después de cada uno. Al final, ejecuta también `npm run acceptance`; si la tarea cambia lo que se ve a propósito, actualiza las fotos de estilos con `npm run acceptance:update` y explica el cambio.
- Delega en el subagente `tester` los tests de la lógica nueva de `domain/` y de `data/`.
- No hagas commit ni push. No marques la tarea como cerrada.
- Al terminar, dame: qué has cambiado (archivos), resultado de `npm test` y de `npm run acceptance`, y la lista de pruebas manuales en iPhone del archivo de la tarea (solo lo que las pruebas de aceptación no cubren).
