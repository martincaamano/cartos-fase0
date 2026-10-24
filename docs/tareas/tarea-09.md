# Tarea 09 — Ajustes y Diagnóstico

Estado: pendiente.
Depende de: 08 cerrada.

## Objetivo
Pantalla de Ajustes con selector de tema (Sistema / Claro / Oscuro), acceso a Categorías (tarea 05) y acceso a Diagnóstico. Diagnóstico muestra las últimas unas 500 entradas de log con un botón para copiarlas.

## Alcance técnico
- `js/screens/settings.js`.
- Pantalla de Diagnóstico que lee de `js/storage/logs.js` (en marcha desde la tarea 02), con botón de copiar al portapapeles.
- Selector de tema: guarda la preferencia (localStorage o IndexedDB) y la aplica con el atributo `data-theme` en `<html>` (ya previsto en `styles/main.css`). "Sistema" quita el atributo.
- Cerrar sesión en Ajustes.

## Fuera de alcance
Gestión de cuentas compartidas, invitaciones.

## Pruebas automáticas
- Resolución de tema: preferencia (sistema/claro/oscuro) + modo del sistema → tema aplicado.
- El buffer de logs conserva como mucho 500 entradas y descarta las más antiguas.
- Ninguna entrada de log contiene importes, notas ni nombres de categorías (comprobar con un movimiento de prueba que lleve valores reconocibles).

## Pruebas manuales en iPhone
- [ ] Cambias el tema y se aplica al instante y tras reabrir la app.
- [ ] "Sistema" vuelve a seguir el modo del iPhone.
- [ ] Diagnóstico muestra los eventos recientes y "Copiar" deja el texto en el portapapeles.
- [ ] Cerrar sesión te devuelve al Login.

## Criterio de cierre
- [ ] Puedes cambiar el tema manualmente y copiar el registro de logs para depurar.
- [ ] `npm test` en verde.
- [ ] Todas las tareas del MVP en `docs/ESTADO.md` están en "Hecha".
