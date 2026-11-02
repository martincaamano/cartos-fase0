# Tarea 23 — Experiencia: fluidez

Estado: en curso (2026-11-01).
Depende de: 22 (fusionada).

## Objetivo
Que usar Cartos se sienta natural: guardar seguido sin saltar de pantalla, ver qué falta por subir, ocultar las cifras con un gesto claro y que los cambios de pantalla no ocurran de golpe.

## Decisiones tomadas (2026-11-01)
- **Borrar / Quitar**: el «¿Seguro? Toca otra vez» vuelve a su estado a los 5 s sin segundo toque.
- **Pendiente de subir**: un «·» gris junto al importe de cada movimiento que aún no está en el Sheet, en INICIO e Historial; desaparece al subirse.
- **Tras guardar** (un movimiento nuevo) se queda en Añadir con el formulario limpio y un aviso unos segundos: «✓ 12,50 € · 🛒 Supermercado · Deshacer». Deshacer lo borra (borrado lógico). Editar sigue volviendo a Historial.
- **Ocultar importes**: un icono de ojo junto al TOTAL de INICIO oculta o muestra todas las cifras. Se recuerda en el dispositivo; la primera vez, visibles. Tocar INICIO otra vez ya no hace nada.
- **Animaciones** (CSS y Web Animations, sin dependencias), cortas (120–220 ms), sin rebotes:
  - cambiar de sección: fundido y 6 px hacia arriba; la marca de la pestaña activa se desliza;
  - entrar más adentro (Ajustes → Cuentas → ficha) desde la derecha; volver, desde la izquierda;
  - desplegar y plegar (Historial, Filtrar, Excluir, «+ N más») con un desplegado suave;
  - botones y chips se hunden un poco al pulsarlos;
  - el aviso de guardado baja desde arriba y se va con un fundido;
  - el ojo funde las cifras al cambiar;
  - los gráficos de Análisis se dibujan la primera vez que se ven (unos 400 ms);
  - un importe que cambió cuenta desde el valor anterior hasta el nuevo (0,6 s, en céntimos exactos): TOTAL y saldos de INICIO cuando cambian desde la última vez que se vieron, y el total de Historial al filtrar. La primera vez, con las cifras ocultas o con «Reducir movimiento», sale directo.
  - Tras probarlas en el iPhone se hicieron más visibles (16 px y 48 px, 260–280 ms, curva más repartida; los desplegables crecen en altura): las primeras no se notaban.
  - Duraciones en `styles/tokens.css` (`--motion-*`). Con «Reducir movimiento» de iOS no hay animaciones.

## Pruebas automáticas
Dominio y almacenamiento con `node:test`; aceptación para el ojo (y que se recuerda), quedarse en Añadir con Deshacer, el «·» de pendiente sin conexión y el «¿Seguro?» que caduca. Las pruebas de aceptación corren con «Reducir movimiento» para que las fotos de estilos no dependan del instante de una animación.

## Pruebas manuales en iPhone
Solo cómo se siente (no se puede automatizar): las animaciones en el iPhone real.

## Criterio de cierre
- [ ] Fusionada; `npm test` y `npm run acceptance` en verde.
- [ ] Las animaciones se sienten bien en el iPhone.
