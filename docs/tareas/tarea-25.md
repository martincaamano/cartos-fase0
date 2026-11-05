# Tarea 25 — Metas de ahorro («huchas»)

Estado: definida (2026-11-05), pendiente de implementar.
Depende de: 24 (recomendado antes) y 18 (libro compartido, fusionada con la clave del selector).

## Objetivo
Fijar metas de ahorro con fecha («1.000 € para el 1 de marzo para una televisión»), financiadas con aportaciones a partir de ahora, sin tocar los ahorros previos. Es una capa encima de los saldos: el dinero sigue en la cuenta, pero se considera apartado. En el libro personal y en los compartidos.

Partes, cada una usable sola: **25a** modelo, dominio y datos; **25b** bloque en Inicio; **25c** crear, editar y aportar; **25d** cumplir la meta; **25e** libros compartidos.

## Decisiones tomadas (2026-11-05)
- Inicio sigue mostrando la realidad: el TOTAL y los saldos por cuenta nunca cambian por las metas. El saldo se calcula y no se guarda.
- Se quita «Últimos movimientos» de Inicio (queda Historial). En su lugar, un bloque de ahorro (nombre final en `i18n/es.js`) con total apartado, «disponible hipotético» (= total − apartado) y la lista de metas con nombre, apartado / objetivo, barra de progreso y fecha.
- Aportaciones manuales; nada de cuotas automáticas (necesitarían servidor).
- Cada meta: nombre, categoría existente (de gasto), importe objetivo y fecha objetivo.
- Al alcanzar la meta, un botón abre Añadir (gasto) con nota, categoría e importe precargados y editables. Nunca se registra el gasto solo.
- Metas también en libros compartidos, con aportaciones de los dos.
- **Cola sin conexión ampliada (cambio de arquitectura aprobado el 2026-11-05):** la cola del iPhone y la sincronización, que hoy solo suben a `Movements`, pasan a guardar la pestaña de cada cambio y a subir también `Goals` y `Contributions`, con las mismas garantías (ids, sin duplicados, borrados lógicos, RAW). Es el primer paso de 25a, con sus tests, y se anota en la arquitectura.
- Registrar la compra (25d) toca dos pestañas: el movimiento y la meta cumplida se guardan juntos en el iPhone en una sola transacción (como las transferencias entre libros) y se suben una detrás de otra.

## Decisiones propuestas
- Al guardar el gasto desde el atajo, la meta pasa a «cumplida» y se archiva; lo apartado se libera, también la diferencia si se gastó menos.
- Las aportaciones no van ligadas a una cuenta: el disponible hipotético se calcula sobre el TOTAL del libro.
- Aportaciones negativas (retirar) para corregir o usar parte.
- Cuota sugerida, solo informativa: `(objetivo − apartado) / meses que quedan`.
- Una meta alcanzada admite más aportaciones; solo cambia el aviso a «objetivo alcanzado».

## Modelo de datos (pestañas nuevas en el Sheet de cada libro)
- **Goals**: `id`, `name`, `categoryId`, `targetAmount`, `targetDate`, `status` (`active` | `completed`), `completedAt`, `movementId`, `createdBy`, `createdAt`, `updatedAt`, `deleted`.
- **Contributions**: `id`, `goalId`, `amount` (positivo aporta, negativo retira), `date`, `createdBy`, `createdAt`, `updatedAt`, `deleted`.
- `Movements` no cambia. Los libros existentes no tienen estas pestañas: `data/` las crea si faltan (como `Members`), sin romper libros viejos ni compartidos.
- Lo apartado de una meta es la suma de sus aportaciones no borradas, siempre calculada.

## 25a · Modelo, dominio y datos
**Alcance**
- Cola y sincronización por pestaña (ver decisión arriba), con migración de las entradas ya guardadas (son de `Movements`).
- `domain/goals.js`: apartado por meta, total apartado, disponible hipotético, progreso, cuota sugerida, estado (en plazo, alcanzada, vencida). En céntimos.
- `data/`: leer y escribir Goals y Contributions; crear las pestañas si faltan; escrituras por la cola; borrados lógicos; RAW; `crypto.randomUUID()`. Logs solo con ids, operación y resultado.

**Fuera de alcance**: UI.

**Pruebas automáticas**: dominio (apartado, total, disponible, progreso 0 %, parcial, 100 % y más; cuota con fecha pasada, hoy y futura; negativas; borradas; céntimos). Datos con Google simulado: pestañas creadas si faltan y no duplicadas; sin conexión → cola → subida; cola antigua de movimientos migrada sin pérdidas; aportaciones de dos personas sin pérdida; el log sin importes ni nombres.

**Criterio de cierre**: tests en verde; los libros antiguos abren sin errores.

## 25b · Inicio: bloque de metas
**Alcance**
- Quitar «Últimos movimientos» de Inicio; el aviso global de pendientes se mantiene e Historial sigue marcando con «·» (con prueba).
- Bloque de ahorro: el TOTAL real arriba sin cambios; debajo apartado, disponible hipotético y metas con barra y fecha. Estado vacío que invita a crear la primera.
- Respeta el ojo, los contadores y «Reducir movimiento». Tocar una cuenta sigue abriendo Historial filtrado.

**Fuera de alcance**: crear o editar metas.

**Pruebas automáticas (Playwright)**: con y sin metas; TOTAL y saldos iguales con metas; disponible hipotético cuadra; ocultar cifras; pendientes visibles; libro personal y compartido.

**Pruebas manuales en iPhone**: cómo se siente el nuevo Inicio y que el disponible hipotético no se confunda con el saldo real.

**Criterio de cierre**: Inicio sigue mostrando la realidad y el bloque nuevo es claro; CI en verde.

## 25c · Crear, editar y aportar
**Alcance**
- Crear, editar y quitar meta (borrado lógico; libera lo apartado).
- Aportar y retirar: importe, fecha (Hoy/Ayer/Otra), desde la tarjeta de la meta; historial de aportaciones con editar y borrar (dos toques). Mismo teclado y flujo que Añadir, con «✓ aportado · Deshacer». Textos en `i18n/es.js`.

**Fuera de alcance**: cuotas automáticas, aportaciones ligadas a cuentas.

**Pruebas automáticas (Playwright)**: crear → aportar → progreso; retirar; editar; deshacer; borrar con dos toques; sin conexión y subida después; validaciones (importe 0, fecha vacía).

**Criterio de cierre**: el ciclo completo de una meta sin tocar el Sheet.

## 25d · Cumplir la meta: atajo a Añadir
**Alcance**
- Con el objetivo alcanzado, la meta muestra «Registrar compra», que abre Añadir (gasto) con nota, categoría e importe precargados y editables.
- Al guardar: movimiento normal y meta `completed` con `movementId` y `completedAt`, en una sola transacción en el iPhone; sus aportaciones dejan de contar. Salir sin guardar no cambia nada.
- Metas cumplidas archivadas en una lista pequeña.

**Fuera de alcance**: crear el gasto sin pasar por Añadir.

**Pruebas automáticas**: precarga; guardar con otro importe (950 en vez de 1.000) libera la diferencia; salir sin guardar; sin conexión → cola → subida coherente; la cumplida no cuenta en apartado ni disponible; el movimiento sale en Historial y Análisis como gasto normal.

**Pruebas manuales en iPhone**: el flujo completo con la app instalada.

**Criterio de cierre**: de «meta alcanzada» a gasto registrado en dos toques, con el dinero liberado.

## 25e · Metas en libros compartidos
**Alcance**
- Las metas del libro compartido viven en su Sheet; las ven y editan los dos. Cada aportación guarda `createdBy` y la meta muestra quién aportó cuánto.
- Apartado y disponible siempre por libro, sin mezclar.

**Fuera de alcance**: «quién pagó» en los gastos, notificaciones.

**Pruebas automáticas**: dos usuarios simulados aportando a la misma meta, sin pérdidas y con atribución correcta; libros aislados; abrir un compartido sin pestañas de metas las crea.

**Pruebas manuales en iPhone**: con Ana.

**Criterio de cierre**: Martín y Ana fijan y alimentan una meta común.

## Más adelante (no entra)
- Backend gratuito (Cloudflare u otro) para no reconectar el token, cuotas automáticas, gastos recurrentes y base de datos propia: cambio de arquitectura; se decide si tras unos dos meses se siguen usando las aportaciones manuales.
- Presupuestos por categoría, mapa de calor y gasto por cuenta en Análisis.

## Descartado
- Marcar categorías o movimientos como esenciales o discrecionales.
- Descontar lo apartado del saldo de Inicio.
- Crear el gasto automáticamente al cumplir una meta.
