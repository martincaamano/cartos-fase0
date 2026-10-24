# Cartos

PWA de finanzas personales para iPhone. Datos en el Google Drive de cada usuario, sin backend propio, funciona offline. Se publica en GitHub Pages.

## Requisitos en el Mac

- Git, Node.js (LTS o superior) y Python 3.
- **Claude Code** (herramienta principal, incluida en la suscripción Pro): `curl -fsSL https://claude.ai/install.sh | bash`. Abre una terminal nueva y comprueba con `claude --version`. La primera vez, `claude` abre el navegador para iniciar sesión.
- Opcional, alternativa: [OpenCode](https://opencode.ai) **versión 1** (`curl -fsSL https://opencode.ai/install | bash`). No lo instales con `brew install opencode`: instala la versión 2, que usa otro formato de configuración.

## Primeros pasos

```bash
npm test          # debe salir en verde
npm run dev       # sirve la app en http://localhost:5173
claude            # abre Claude Code en esta carpeta
```

Dentro de Claude Code:

1. Escribe `/` y comprueba que salen `planificar`, `tarea`, `revisar` y `cerrar`.
2. **No ejecutes `/init`**: `AGENTS.md` y `CLAUDE.md` ya están escritos.
3. Comprueba las protecciones: pídele "ejecuta `git push`". Debe negarse sin preguntar.
4. `/status` muestra qué archivos de configuración ha cargado y cuánto llevas gastado de tu límite.

## Flujo por tarea

```
Shift+Tab        →  activa el modo plan (solo lectura)
/planificar 02   →  propone pasos y dudas, no escribe código
Shift+Tab        →  vuelve al modo normal
/tarea 02        →  implementa en pasos pequeños, con tests
/revisar 02      →  el subagente reviewer (solo lectura) revisa los cambios
(tú)             →  git add / commit / push, y pruebas la app en el iPhone
/cerrar 02       →  comprueba el criterio de cierre y actualiza docs/ESTADO.md
```

Una rama por tarea (`git switch -c tarea-02`), y fusionar con `main` cuando `npm test` esté en verde. GitHub Pages publica `main`, que es lo que se prueba en el iPhone.

## VS Code

Instala la extensión **Claude Code** (`anthropic.claude-code`) desde el panel de extensiones (⇧⌘X) e inicia sesión con tu cuenta de Claude. Usa la misma configuración del repo (`CLAUDE.md`, `.claude/`). Con texto seleccionado en el editor, `⌥K` inserta una referencia al archivo y las líneas en tu mensaje.

## Límites de uso

En el plan Pro, los límites (ventana de cinco horas y límite semanal) se comparten entre Claude y Claude Code. Sesiones largas de código gastan también tu cupo del chat. Si Claude Code te ofrece seguir con créditos de API, rechaza la oferta salvo que quieras pagar por uso. Asegúrate de que la variable `ANTHROPIC_API_KEY` no esté definida: con ella, Claude Code factura por API en vez de usar tu suscripción.

## Mapa del repo

- `AGENTS.md`: reglas del proyecto. Las leen todos los agentes.
- `CLAUDE.md`: importa `AGENTS.md` para Claude Code.
- `.claude/settings.json`: permisos (los `git push` están bloqueados). `.claude/commands/`: `/planificar`, `/tarea`, `/revisar`, `/cerrar`. `.claude/agents/`: `reviewer` y `tester`.
- `.opencode/` y `opencode.json`: la misma configuración para OpenCode (alternativa).
- `docs/ESTADO.md`: progreso y decisiones abiertas. `docs/tareas/`: una ficha por tarea.
- `docs/`: arquitectura, diseño, plan y estructura del repo. `docs/referencia/fase0-spike.html`: la prueba de concepto que ya funcionó en iPhone.
- `tests/`: tests con `node:test`, sin dependencias.

## Desarrollo local con login de Google

Cuando llegue la tarea 02, añade `http://localhost:5173` a los "Orígenes de JavaScript autorizados" del ID de cliente en Google Cloud Console. El Service Worker y el login de Google se prueban en el iPhone contra la versión publicada en GitHub Pages (hace falta HTTPS).
