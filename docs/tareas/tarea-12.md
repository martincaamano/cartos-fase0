# Tarea 12 — Revisión técnica: estilos y paletas

Estado: pendiente.
Depende de: 11 cerrada.

## Objetivo
Estilos bien estructurados y definidos por tokens, de forma que en el futuro se puedan ofrecer varias paletas a elegir en la app añadiendo un solo bloque de CSS. En esta tarea no se añade ninguna paleta nueva ni ningún selector: la app se ve igual.

## Situación actual
- Un solo `styles/main.css` de unas 650 líneas, con secciones por pantalla.
- Los colores claros y oscuros están escritos dos veces cada uno (por `prefers-color-scheme` y por `data-theme`); con varias paletas se multiplicarían.
- 21 tamaños de letra escritos a mano (9 valores distintos) y algún espaciado sin variable.
- `--color-accent` no se usa.
- `js/ui/theme.js`, `index.html` y `manifest.json` repiten a mano el color de fondo para la barra de estado.

## Alcance técnico
- Dividir los estilos en pocos archivos con un papel claro, enlazados desde `index.html` y listados en `sw.js`:
  - `styles/tokens.css`: escalas (espaciado, tipografía, bordes, tamaños táctiles) y la paleta por defecto.
  - `styles/base.css`: elementos HTML, tipografía y utilidades (`[hidden]`, `.text-muted`...).
  - `styles/components.css`: piezas compartidas (recibo, botones, campos, chips, pestañas, barra inferior, selector de categoría y de mes).
  - `styles/screens.css`: solo lo propio de cada pantalla, que debería quedar corto.
- Dos niveles de tokens:
  - **Paleta** (valores): `--palette-*`, uno por color, cada uno con su valor claro y oscuro.
  - **Semánticos** (uso): `--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-line`, `--color-expense`, `--color-income`, más los que hagan falta (por ejemplo `--color-bar` para las barras de Análisis). Los componentes solo usan semánticos.
- Una paleta es un bloque `html[data-palette="nombre"] { ... }` que redefine los `--palette-*`. La paleta por defecto es la actual. El tema (Sistema / Claro / Oscuro) sigue funcionando igual con cualquier paleta.
- Cada valor claro/oscuro se escribe una sola vez (ver decisiones previas).
- Escala tipográfica (`--text-xs` … `--text-xl`) que sustituye a los tamaños escritos a mano, sin cambiar los tamaños actuales.
- La barra de estado de iOS lee el color de fondo de los tokens (`getComputedStyle`) en lugar de tenerlo repetido en `theme.js`.
- Se quita `--color-accent` si sigue sin uso.
- `docs/diseno-flujo-pantallas-cartos.md` y `docs/estructura-repositorio-cartos.md` explican los archivos de estilos, los dos niveles de tokens y cómo se añade una paleta.

## Decisiones previas
1. **Cómo escribir cada color una sola vez.** Propuesta: la función CSS `light-dark()`, que elige el valor según `color-scheme` (ya lo fijan el sistema y `data-theme`). Necesita iOS 17.5 o posterior. La alternativa compatible con iOS más antiguos es duplicar solo la asignación de semánticos (no los valores) para el modo oscuro.
2. **Se mantiene un único CSS por archivo enlazado** (sin `@import`), para que el navegador los pida en paralelo y el Service Worker los guarde todos.

## Fuera de alcance
Elegir paleta desde Ajustes, paletas nuevas, cambiar tipografía o el aspecto actual, el estilo de puntos (decisión abierta 2).

## Pruebas automáticas
- `tests/pwa.test.js`: todos los archivos de estilos están en `APP_SHELL` y existen.
- Test nuevo de estilos: fuera de `styles/tokens.css` no hay colores escritos a mano (`#...`, `rgb(...)`), y cada `var(--...)` usado en los estilos está definido.

## Pruebas manuales en iPhone
- [ ] Todas las pantallas se ven igual que antes, en claro y en oscuro, con «Sistema», «Claro» y «Oscuro».
- [ ] La barra de estado sigue el tema.

## Criterio de cierre
- [ ] Añadir una paleta sería escribir un bloque en `styles/tokens.css` y nada más (se comprueba con una paleta de prueba en local que no se publica).
- [ ] Nada visible cambia y las pruebas en iPhone pasan.
- [ ] `npm test` en verde.
