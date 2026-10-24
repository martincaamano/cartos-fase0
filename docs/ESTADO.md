# Estado de Cartos

Fuente de verdad del progreso. Los agentes lo leen al empezar una tarea y lo actualizan con `/cerrar`.

## Entorno

- Repositorio: `cartos-fase0` (se queda con ese nombre).
- GitHub Pages publica `main` (carpeta raíz) en https://martincaamano.github.io/cartos-fase0/. El repo es público: con el plan gratuito, Pages no funciona en repos privados (estuvo sin publicar del 2026-09-27 al 2026-10-24 por eso).
- Se desarrolla desde un Mac (`npm test`, `npm run dev` en http://localhost:5173). Las pruebas reales se hacen en el iPhone.
- Siguiente paso: la tarea 02 no se empieza hasta que el usuario lo diga.

## Tareas del MVP

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 01 | Esqueleto PWA instalable | Hecha (2026-10-24) | Probada en iPhone. El icono definitivo queda aparte (decisión 3) |
| 02 | Login y acceso a Drive | Pendiente | |
| 03 | Capa de datos y dominio del libro | Pendiente | Hay una decisión previa (ver abajo) |
| 04 | Onboarding + Dashboard | Pendiente | |
| 05 | Categorías + Añadir (gasto e ingreso) | Pendiente | |
| 06 | Añadir (transferencia) | Pendiente | La pieza más grande |
| 07 | Historial | Pendiente | |
| 08 | Análisis | Pendiente | |
| 09 | Ajustes y Diagnóstico | Pendiente | |

Transversal: publicar la app de Google Cloud de "Testing" a "Production" en cuanto funcione el login (tarea 02).

Regla del plan: cada tarea, al cerrarse, deja algo 100% usable en el iPhone. Ninguna queda a medias esperando a la siguiente.

## Decisiones abiertas

1. **Cómo se guarda la dirección de un movimiento** (antes de la tarea 03). Propuesta: campo `type` con valor `income` o `expense` e importe siempre positivo, como en la especificación original del proyecto. La arquitectura actual no lo fija todavía. Hay que confirmarlo y anotarlo en `docs/arquitectura-app-finanzas.md`.
2. **Refinamientos de diseño inspirados en Nothing OS.** Propuestos y sin decidir: estilo de puntos solo en el logo y en el saldo total del Dashboard, tipografía Geist Mono alojada en el repo, tarjetas con contorno en vez de bloques rellenos. Hasta que se decida, los agentes no los aplican.
3. **Iconos.** Los PNG del repo son la primera versión (texto plano). La versión de puntos que gustó no está en el repo y hay que regenerarla; los SVG maestros (`icons/icon-dark.svg`, `icons/icon-light.svg`) también están desactualizados. Descripción de la versión que gustó: la palabra C-A-R-T-O-S con un alfabeto propio de 5×7 dibujado con círculos, en los colores del tema, y una barra de acento al final a modo de cursor. Nueva preferencia (2026-10-24): píxel cuadrado y macizo, como el logotipo de texto de OpenCode o una impresora térmica de tickets. Sin decidir entre ambas.

## Notas

- Fuera del MVP, ya decidido: cuentas compartidas, Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis.
- Visión a largo plazo (backend propio, cuentas propias, IA para categorizar): `docs/vision-producto-escala-cartos.md`. No forma parte del MVP.
