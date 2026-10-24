# Estado de Cartos

Fuente de verdad del progreso. Los agentes lo leen al empezar una tarea y lo actualizan con `/cerrar`.

## Tareas del MVP

| Tarea | Título | Estado | Notas |
|---|---|---|---|
| 01 | Esqueleto PWA instalable | Código hecho, falta cerrar | Falta comprobarla en el iPhone (ver checklist) |
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
3. **Iconos.** Los PNG del repo son la primera versión (texto plano). La versión de puntos que gustó no está en el repo y hay que regenerarla; los SVG maestros (`icons/icon-dark.svg`, `icons/icon-light.svg`) también están desactualizados.

## Notas

- Fuera del MVP, ya decidido: cuentas compartidas, Apple Shortcuts, pagos programados, backend mínimo de refresco de tokens, interruptor "incluir transferencias" en Análisis.
- Visión a largo plazo (backend propio, cuentas propias, IA para categorizar): `docs/vision-producto-escala-cartos.md`. No forma parte del MVP.
