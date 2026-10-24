@AGENTS.md

# Notas para Claude Code

- Las reglas del proyecto están en `AGENTS.md` (importado arriba). Este archivo solo existe para que Claude Code las cargue siempre, también en versiones que no leen `AGENTS.md` directamente.
- Flujo por tarea: `/planificar NN`, `/tarea NN`, `/revisar NN`, `/cerrar NN` (definidos en `.claude/commands/`). Subagentes: `reviewer` (solo lectura) y `tester` (tests).
- Para `/planificar`, activa antes el modo plan con Shift+Tab.
