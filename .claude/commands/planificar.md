---
description: Planifica una tarea sin escribir código (ej. /planificar 03)
argument-hint: "[tarea, ej. 03]"
disable-model-invocation: true
---

Quiero planificar la tarea $0 de Cartos. No edites ningún archivo ni escribas código todavía.

Busca la issue de GitHub titulada «Tarea $0 · …» y léela con sus comentarios (herramientas de GitHub, o `gh issue list --search "Tarea $0 in:title"` y `gh issue view <número> --comments`). Si es una parte (24a), lee también la issue de la tarea (24), donde están las decisiones. Para tareas hasta la 23, usa `docs/tareas/tarea-$0.md` y `docs/ESTADO.md`. Del resto de `docs/` lee solo las secciones que necesites (ver "Dónde mirar" en AGENTS.md). Entrégame:

1. Un resumen de lo que hay que construir, en tres líneas.
2. Una lista numerada de pasos pequeños, en el orden en que los harías. Para cada paso: archivos que se crean o modifican y cómo se comprueba (qué test, o qué prueba manual).
3. Dudas o decisiones que necesiten mi respuesta antes de empezar, incluidas las "decisiones previas" que figuren en el archivo de la tarea. Si no hay ninguna, escribe "ninguna".

Cuando te responda, anota mis decisiones en la issue (sección "Decisiones tomadas" del cuerpo) sin PR.
