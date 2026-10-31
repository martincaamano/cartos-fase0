# Tarea 20 — Experiencia: pantallas más simples

Estado: hecha (2026-10-31).
Depende de: 17 (fusionada).

## Objetivo
Que cada pantalla quepa en el iPhone sin scroll innecesario y que lo más usado (apuntar un gasto) sea lo más rápido. No cambian el estilo ni las tipografías (diseño §1): solo qué se muestra, en qué orden y cuándo.

Medido en un iPhone 15 (≈ 660 px visibles) antes de la tarea: Añadir 833 px (Guardar quedaba oculto), Historial 860, Editar 952, Categorías 1.095, Libros 1.263.

## Añadir y Editar (definido 2026-10-30)
- Arriba, el nombre del libro (solo con varios) y las pestañas Gasto · Ingreso · Transferencia.
- **Cuenta e importe en la misma línea**, con la línea gruesa debajo: la cuenta a la izquierda (por defecto la última usada, se cambia tocándola); el importe a la derecha, a `--text-2xl`, en gris mientras está vacío. Se escribe con el teclado del iPhone (Safari no lo abre solo: hay que tocar el importe).
- **Categorías en rejilla de 4 columnas**, ordenadas por uso: 11 casillas y la 12.ª es «··· Ver todas». Los nombres largos se parten en dos líneas con guion, nunca con «…».
- **Fecha en una fila**: Hoy · Ayer · Anteayer · Otra…; el calendario solo se abre con «Otra», que pasa a mostrar la fecha elegida (25/10).
- **Nota plegada** («+ Nota»); abierta si el movimiento ya tiene nota.
- **Guardar fijo** encima de la barra inferior, siempre visible. Al guardar se vuelve a INICIO.
- Transferencia: el importe arriba (sin cuenta en esa línea) y líneas compactas Desde / Hacia; si el destino es de otro libro, dos líneas más: «Gasto aquí» e «Ingreso allí», con las categorías recordadas.
- Editar: el mismo formulario, con «← Historial» a la izquierda y «Borrar» arriba a la derecha (lejos de Guardar); las otras pestañas, desactivadas.
- Todo cabe en una pantalla en los seis estados (gasto vacío y relleno, ingreso, transferencia propia y a otro libro, editar).

## Historial (definido 2026-10-30)
- Sin título grande (la barra inferior ya dice dónde se está).
- Primera línea: «Filtrar ▾» a la izquierda (o «Filtrar · N» con N filtros activos y «Quitar») y, a la derecha, el cambio de vista **Resumen | Lista**. Los filtros se limpian al entrar y al salir de Historial; la vista elegida se recuerda en el dispositivo (Resumen la primera vez).
- **Lista**: todos los movimientos uno tras otro, del más reciente al más antiguo, con un encabezado por mes que lleva su cuenta +ingresos − gastos = neto.
- **Resumen: niveles que se despliegan al tocar**, todo plegado al entrar:
  - **TOTAL** de lo filtrado (sin filtros, todo el historial) → sus categorías con el total de cada una → los movimientos de cada categoría.
  - Debajo, **un mes por fila** → las categorías de ese mes → sus movimientos.
  - El TOTAL y cada mes muestran siempre, abiertos o no, la cuenta completa: **+ingresos − gastos = neto**. Las transferencias se ven entre los movimientos pero no entran en esa suma (como en Análisis).
  - Las categorías van de mayor a menor importe. Tocar un movimiento abre Editar.
- Movimientos: fecha, emoji, categoría y la nota en gris; sin la cuenta. Una transferencia: «Abanca → Trade Republic», sin signo.
- Filtros abiertos, compactos (cada grupo en una fila con scroll lateral):
  - **Meses**: todos desde el primer movimiento, el actual a la derecha, cada uno con su año («Oct / 2026»). Un toque elige un mes; tocar otro marca el rango entre los dos (desde – hasta). Arriba se lee el rango («Ago – Oct 2026»).
  - **Cuentas** y **categorías**: chips con selección múltiple, las más usadas primero. Nada marcado en un grupo es «todas».
  - Los resultados se ven debajo y cambian al tocar; no hace falta botón de aplicar.
- Con filtros, el TOTAL dice qué se ha elegido («Ago – Oct 2026 · Abanca, Santander · Supermercado») y suma solo eso; cada mes, igual.
- Análisis se mantiene como pestaña aparte (vista rápida del mes con barras y comparación entre meses).

## Libros, Cuentas y Categorías (definido 2026-10-30)
Las tres siguen el mismo patrón: **una lista limpia con «+ Nuevo…» al final**; crear y editar van en su propia pantalla, con el botón principal fijo encima de la barra. Sin título de ayuda largo.
- **Libros**: los libros con el abierto marcado («✓ abierto»). Tocar otro lo abre; tocar el abierto lleva a su ficha (nombre). «+ Nuevo libro» abre la pantalla de nombre y primera cuenta.
- **Cuentas**: cada cuenta con su saldo. Tocar una abre su **ficha editable: nombre, emoji y saldo inicial** (nuevo: hoy no se puede editar una cuenta). «+ Nueva cuenta» abre el mismo formulario vacío.
- **Categorías**: GASTOS e INGRESOS; los gastos menos usados plegados en «+ N más». Tocar una abre su **ficha editable: nombre, emoji y tipo** (nuevo: hoy solo se crean o se quitan). El tipo solo se puede cambiar si ningún movimiento la usa. «Quitar» va arriba a la derecha de la ficha, con un aviso de cuántos movimientos la usan (la conservan); Transferencia no se edita ni se quita.
- **Emoji**: una fila de opciones y un chip «Otro…» que abre el campo libre (sin la caja repetida de ahora).
- Editar escribe sobre la fila buscada por id, con `RAW` y `updatedAt`, como el borrado lógico.

## Ajustes (definido 2026-10-30)
- Sin título grande; cabe sin scroll.
- **LIBRO**: Libros (con el libro abierto a la derecha), Cuentas (cuántas), Categorías (cuántas) y **Datos** («Importar · Descargar ›»), que abre su pantalla con Importar movimientos, Descargar plantilla y Descargar mis datos.
- **APP**: Tema («Sistema ›» a la derecha), que abre su pantalla: hoy el modo (Sistema · Claro · Oscuro) y, cuando haya más paletas (diseño §1.2), también la paleta; Diagnóstico y «Cerrar sesión · correo» en una sola fila (sigue avisando si hay cambios sin subir).

## INICIO (definido 2026-10-30)
- Sin título grande. Libro, TOTAL, cuentas y últimos movimientos, sin scroll.
- **Cifras ocultas al llegar**: cada vez que se entra en INICIO, los importes se ven como «••••• €» (también al abrir la app y pasar a INICIO). **Pulsar INICIO otra vez** en la barra, estando ya en INICIO, los muestra; el siguiente paso por otra pantalla los vuelve a ocultar. Solo afecta a INICIO.
- Cada cuenta lleva «›» y abre Historial filtrado por esa cuenta.
- «Ver todo ›» junto a ÚLTIMOS MOVIMIENTOS lleva a Historial. Se muestran 4, con el formato de Historial (fecha, emoji, categoría, nota en gris).
- Agitar el teléfono queda descartado: en una web app iOS pide permiso de movimiento tras un toque y puede volver a pedirlo en cada apertura.

## Análisis (definido 2026-10-30)
Pasa de resumen del mes a entender cómo fluctúa el gasto en el tiempo: dónde, cuándo, cómo y en qué se va el dinero. Sin título grande.
- **Periodo** arriba: Mes · 12 meses · Todo. Por defecto, **12 meses**. Todo lo de debajo se calcula para el periodo elegido.
- **Excluir categorías**, dinámico: una línea «Excluir: ninguna ▾» que despliega chips de selección múltiple (como los filtros de Historial) con todas las categorías del libro. Lo excluido no cuenta en ninguna sección. Se recuerda en el dispositivo, por libro. Pensado para, por ejemplo, las aportaciones a Casa do medio.
- Secciones, en este orden:
  1. **Cifras clave** (cuatro cajas): gasto medio al mes (con su cambio frente al periodo anterior equivalente), ahorro (% de los ingresos que queda), «este mes, a este ritmo» (proyección a fin de mes y diferencia con la media) y gasto por día.
  2. **Evolución**: un gráfico de líneas mes a mes con ingresos (verde), gastos (terracota) y neto (tinta, más grueso), una sola escala con la línea del 0 marcada; nombre de cada línea al final y leyenda. Tocar un mes muestra sus tres cifras; tocarlo otra vez abre Historial filtrado por ese mes.
  3. **¿En qué?**: categorías de mayor a menor con barra, una marca ▏ de su media del periodo anterior y el % de cambio (▲ más gasto, ▼ menos); las 6 primeras y «+ N más».
  4. **¿Cómo cambia cada una?**: minigráficas de 12 meses por categoría (las 4–6 mayores) con flecha de tendencia.
  5. **¿Cuándo?**: el mes en curso día a día, gasto acumulado frente a un mes medio, con el día de un gasto grande señalado.
  6. **¿Qué días?**: gasto medio por día de la semana.
  7. **Gastos fijos detectados**: pagos que se repiten cada mes (misma nota e importe parecido), con su día, el total al mes y su peso en el gasto medio.
  8. **Los más grandes**: los mayores gastos del periodo y cuál sería la media sin ellos.
- Las transferencias no cuentan como ingreso ni gasto (como ahora). Las sumas, en céntimos.
- Gráficos en SVG propio, sin librerías (AGENTS.md: cero dependencias). Colores de `tokens.css`; como verde y terracota quedan justos para daltonismo rojo-verde (validado), cada línea lleva su nombre y hay leyenda; modo oscuro con los mismos tokens.
- Fuera por ahora: gasto por cuenta, calendario coloreado, límites por categoría.

## Partes (una PR cada una, usable sola en el iPhone)
- **20a — Añadir y Editar**: la nueva distribución, cuenta por defecto la última usada (en el dispositivo), Guardar fijo.
- **20b — Historial**: Resumen | Lista, filtros de meses (rango), cuentas y categorías con selección múltiple; las cuentas por mes y del total.
- **20c — Libros, Cuentas y Categorías**: listas con «+ Nuevo…», pantallas propias para crear, fichas editables de cuenta (nombre, emoji, saldo inicial) y de categoría (nombre, emoji, tipo).
- **20d — Ajustes e INICIO**: Ajustes agrupado con Datos y Tema en pantallas propias, cifras ocultas en INICIO.
- **20e — Análisis**: periodo, excluir categorías y las ocho secciones (la lógica de cálculo, pura y con tests, en `domain/`).

## Fuera de alcance
Nuevas paletas de color (la pantalla Tema queda lista para ellas), detectar que se agita el teléfono, cambios de estilo o tipografías.

## Pruebas automáticas
- Lógica nueva en `domain/` con tests: las cifras de Análisis (medias, ahorro, proyección, comparación con el periodo anterior, gastos fijos detectados, por día de la semana, excluir categorías); agrupar Historial por total, mes y categoría con sus sumas (en céntimos, sin transferencias), filtros por rango de meses, cuentas y categorías; editar cuenta y categoría (validación, el tipo solo sin movimientos).
- `data/`: editar cuenta y categoría escribe sobre la fila buscada por id, `RAW`, con `updatedAt`.
- Aceptación: cada pantalla cabe sin scroll en el iPhone 15 (Añadir en sus seis estados, Ajustes, Libros), los flujos de cada parte y las fotos de estilos actualizadas a propósito.

## Pruebas manuales en iPhone
- [x] Apuntar un gasto real: importe, categoría y Guardar sin hacer scroll.
- [x] Historial: desplegar un mes hasta un movimiento y elegir un rango de meses deslizando.
- [x] Editar el saldo inicial de una cuenta desde su ficha.
- [x] Análisis: excluir Casa do medio y ver cómo cambian la evolución y las cifras.
- [x] INICIO abre con las cifras ocultas y se ven al pulsar INICIO otra vez.

## Criterio de cierre
- [x] 20a–20e fusionadas y probadas en el iPhone.
- [x] `npm test` y `npm run acceptance` en verde.
