---
description: Planifica una tarea sin escribir código (ej. /planificar 03)
argument-hint: "[tarea, ej. 03]"
disable-model-invocation: true
---

Quiero planificar la tarea $0 de Cartos. No edites ningún archivo ni escribas código todavía.

Lee `docs/ESTADO.md` y `docs/tareas/tarea-$0.md`. Del resto de `docs/` lee solo las secciones que necesites (ver "Dónde mirar" en AGENTS.md). Entrégame:

1. Un resumen de lo que hay que construir, en tres líneas.
2. Una lista numerada de pasos pequeños, en el orden en que los harías. Para cada paso: archivos que se crean o modifican y cómo se comprueba (qué test, o qué prueba manual).
3. Dudas o decisiones que necesiten mi respuesta antes de empezar, incluidas las "decisiones previas" que figuren en el archivo de la tarea. Si no hay ninguna, escribe "ninguna".
