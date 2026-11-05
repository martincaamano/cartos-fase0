# Tarea 24 — Análisis de desviaciones

Estado: definida (2026-11-05), pendiente de implementar.
Depende de: 23 (fusionada).

## Objetivo
Responder de un vistazo a «¿por qué este mes se ha salido de lo normal?», por mes y por año, sin etiquetar nada: la app detecta sola las categorías que subieron respecto a su media y los movimientos concretos que lo explican.

Se hace en tres partes, cada una usable sola: **24a** dominio, **24b** bloque del mes en Análisis, **24c** vista anual.

## Decisiones tomadas (2026-11-05)
- Nada de marcar gastos o categorías como esenciales o discrecionales: la esencialidad depende del gasto concreto. La detección es automática.
- La desviación es por categoría: el gasto del mes frente a la media de los meses anteriores.
- Los gastos fijos detectados (misma nota y categoría casi todos los meses) no cuentan como desviación. La detección de gastos fijos existente (`fixedCosts`) se generaliza para aceptar el mes de referencia, de modo que un mes pasado se compare con los 4 meses anteriores a él, no a hoy. Sin duplicarla.
- Las transferencias nunca cuentan; se respetan las categorías excluidas de Análisis (se recuerdan por libro).
- Salida: una frase resumen del mes, las categorías que se salen de forma notable con el importe de más y, debajo, los movimientos grandes que lo explican.
- Vista anual: qué meses desviaron la tendencia y por qué.
- La línea base son los hasta 6 meses anteriores; en los textos se llama «tu media de los últimos 6 meses», no «mes normal», para no confundirla con «un mes normal» de las cifras clave (que usa 12).
- Historial acepta abrirse filtrado por categoría (además de mes y cuenta), para que tocar una desviación lleve al sitio exacto.

## Decisiones propuestas (se implementan y se ajustan tras verlas)
- Línea base por categoría: media del gasto mensual de los hasta 6 meses anteriores al mes analizado; los meses sin gasto en esa categoría cuentan como 0. Con menos de 3 meses de histórico el bloque dice «Aún no hay histórico suficiente».
- Desviación notable: exceso ≥ 20 € y ≥ 25 % sobre la media de la categoría. Las dos constantes viven en un solo módulo de dominio. Una categoría sin histórico con gasto > 20 € cuenta entero (media 0) y se marca «nueva».
- Movimientos que lo explican: dentro de cada categoría desviada, de mayor a menor importe hasta cubrir el exceso, como mucho 3.
- Mes en curso: el acumulado real frente a la línea base completa, sin prorratear; solo aparece si ya se superó. Etiqueta «mes en curso».
- Solo desviaciones al alza en esta versión.

## 24a · Dominio (sin UI)
**Alcance**
- `domain/deviations.js` (puro): línea base por categoría, exceso, umbrales, movimientos que lo explican y los datos de la frase resumen (el texto sale de `i18n/es.js`).
- Reutiliza la detección de gastos fijos (generalizada con mes de referencia) y la exclusión de categorías; nada duplicado con `domain/analysis.js`.
- Vista anual: desviación total y principal motivo de cada mes del año.

**Fuera de alcance**: cualquier pantalla.

**Pruebas automáticas (Node)**: mes normal sin desviaciones; una categoría que se dispara con su exceso exacto en céntimos; por debajo de cada umbral no aparece; categoría nueva con y sin importe relevante; menos de 3 meses → insuficiente; gastos fijos, transferencias y categorías excluidas no cuentan; meses a cero en la media; selección de movimientos (orden, máximo 3, para al cubrir el exceso); mes en curso; céntimos exactos; gastos fijos con mes de referencia pasado.

**Criterio de cierre**: tests en verde en CI, sin código duplicado respecto a Análisis.

## 24b · Análisis: bloque «Desviaciones» del mes
**Alcance**
- Bloque nuevo en Análisis, arriba o junto a las cifras clave (se decide según el diseño actual y se documenta). Mes elegible; por defecto el último cerrado o el actual.
- Frase resumen arriba, p. ej. «Octubre: +230 € sobre tu media de los últimos 6 meses, sobre todo por Ocio y Hogar».
- Categorías desviadas con el exceso a la derecha en terracota apagado; se despliegan para mostrar sus movimientos; tocar uno abre Historial filtrado a ese mes y categoría (Historial gana el filtro por categoría desde la URL).
- Estados vacíos: «Este mes ha ido dentro de lo normal» y «Aún no hay histórico suficiente».
- Respeta el ojo de ocultar cifras, los desplegables y animaciones existentes y «Reducir movimiento». Textos en `i18n/es.js`.

**Fuera de alcance**: vista anual, etiquetas manuales, categorías a la baja.

**Pruebas automáticas (Playwright)**: mes con pico (frase y categorías esperadas); mes normal (vacío); histórico corto (insuficiente); navegación a Historial filtrado por mes y categoría; cambio de mes; ocultar cifras; categorías excluidas.

**Pruebas manuales en iPhone**: legibilidad de la frase y las filas; cómo se siente el desplegable.

**Criterio de cierre**: con los datos reales se ve de un vistazo por qué un mes se disparó; CI en verde.

## 24c · Vista anual de desviaciones
**Alcance**
- En Análisis con «12 meses» (y «Todo» si cabe): lista de meses con su desviación frente a su línea base y el principal motivo. Tocar un mes lleva al detalle de 24b de ese mes.
- Lista sobria; sin gráficos nuevos salvo que el espacio lo justifique.

**Fuera de alcance**: comparar años distintos.

**Pruebas automáticas**: dominio (agregado anual) y Playwright (lista, navegación al mes, estados vacíos).

**Criterio de cierre**: desde el año completo se llega en dos toques al motivo de cualquier pico.
