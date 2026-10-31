# Tarea 19 — Importar la reforma

Estado: hecha (2026-10-31).
Depende de: 16 (importar desde Ajustes) y 17 (varios libros), fusionadas.

## Objetivo
Pasar el histórico de la reforma de la vivienda, que hoy vive en un Excel, al libro compartido «Casa do Medio», para que su INICIO, Historial y Análisis cuadren con el banco desde el primer día.

## Decisiones tomadas (2026-10-31)
- Va antes que la 18 (libro compartido): no necesita código y deja Casa do Medio con datos reales cuanto antes.
- Se usa el importador de la tarea 16 (Ajustes → Datos → Importar), con el JSON de Cartos para que las categorías nuevas traigan su emoji. Crea solo las categorías que falten. Se espera no tener que tocar el código; si hiciera falta, se para y se pregunta.
- Las aportaciones siguen como categorías de ingreso («Aportación Martín», «Aportación Ana»), no como personas. La persona por movimiento llega en la 18, solo para los gastos.
- Los datos reales nunca entran en el repositorio:
  - el JSON se genera y se revisa fuera del repo;
  - se entrega al usuario como archivo, y él lo importa desde el iPhone.
- Quedan fuera los cargos que no son de la reforma, aunque salieran de la cuenta: compras ajenas y sus devoluciones, y un cargo y su devolución que se anulan entre sí. Se incluye el ajuste que ya trae el Excel para cuadrar con el banco.
- Se añaden los movimientos del banco y los pagos que faltan en el Excel. La lista se revisa con el usuario en la conversación, no aquí.
- La columna de presupuesto del Excel no se importa.
- Saldo inicial de la cuenta: el que haga que el saldo calculado coincida con el del banco más lo pendiente de devolver. Se calcula al generar el JSON y el usuario lo pone desde la ficha de la cuenta.

## Pasos
1. Leer el Excel en local y convertirlo al JSON de Cartos (`cartos-import` v1).
2. Revisar con el usuario un resumen: movimientos por categoría, totales y el saldo final esperado.
3. El usuario importa el JSON en Casa do Medio y ajusta el saldo inicial.
4. Comprobar con la descarga CSV del libro que lo importado coincide fila a fila con lo generado.
5. El usuario guarda el Excel en Drive como copia.

## Fuera de alcance
Compartir el libro y las personas por movimiento (tarea 18). Presupuestos por categoría.

## Pruebas manuales en iPhone
- [x] Ajustes → Datos → Importar el JSON en Casa do Medio: el resumen coincide con el revisado y no avisa de repetidos.
- [x] Ficha de la cuenta: saldo inicial corregido; INICIO muestra el saldo esperado.
- [x] Historial y Análisis de Casa do Medio muestran la reforma completa.

## Criterio de cierre
- [x] Reforma importada y cuadrada con el banco.
- [x] `npm test` y `npm run acceptance` en verde (sin cambios de código, deben seguir igual).
