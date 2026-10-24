# Diseño y flujo de pantallas — Cartos

Documento de diseño funcional y visual, complementario al de arquitectura técnica. Aquí vive el "qué ve y qué toca el usuario"; en el de arquitectura vive el "cómo se construye por dentro".

## 1. Dirección de estilo

Estética minimalista tipo recibo o ticket de compra, con inspiración en el lenguaje visual de Nothing OS.

- **Tipografía**: monoespaciada, de aire retro (calculadora / máquina de escribir). Ventaja práctica además de estética: las cifras alinean perfecto en columna.
- **Color**: blanco y negro casi puro como base. Acentos mínimos y reservados: rojo o terracota apagado para gastos, verde apagado para ingresos. Nada más de color.
- **Listados**: se dibujan visualmente como un recibo — separadores con líneas discontinuas, importes alineados a la derecha, un total al final como el total de una compra.
- **Tono general**: sin florituras. Cada pantalla enseña lo que hace falta y ya. No es una app vistosa, es operativa.

### 1.1. Modo claro / oscuro

- Por defecto, la app sigue el modo del sistema operativo (claro u oscuro según el ajuste del iPhone).
- El usuario puede forzar un modo distinto al del sistema desde Ajustes.
- Implementación pensada como variables de tema (colores base definidos una sola vez), ya que la paleta es casi blanco/negro puro: el modo oscuro es, en esencia, invertir esos dos tonos base y mantener igual el resto.

## 2. Navegación

Barra de navegación fija inferior, patrón estándar tipo Instagram o Twitter, con cinco secciones. No hay botón flotante independiente.

1. **Dashboard** (por defecto al abrir la app)
2. **Historial**
3. **Añadir** (acción central)
4. **Análisis**
5. **Ajustes** (incluye Categorías, selector de tema y Diagnóstico)

Categorías no tiene hueco fijo en la barra: se gestiona pocas veces (normalmente una vez al principio), así que vive dentro de Ajustes en vez de competir por espacio con las secciones de uso diario.

## 3. Pantallas

### 3.1. Login

Pantalla desnuda, casi vacía. Nombre "Cartos" arriba, en tipografía monoespaciada, con aire de cabecera de recibo. Un único botón: "Continuar con Google" (negro sobre blanco, o invertido en modo oscuro). Sin imágenes ni texto de relleno.

Bajo el botón, una línea corta explicando el porqué del acceso, para generar confianza sin sobrecargar: algo así como "Tus datos se guardan solo en tu Google Drive, nadie más los ve".

Si ya existe sesión previa, esta pantalla no llega a mostrarse: se salta directo al Dashboard.

### 3.2. Conceder acceso a Drive

Pantalla intermedia, solo la primera vez (o si el acceso caducó). Botón separado del login, para evitar el bloqueo de pop-ups de Safari al encadenar dos permisos automáticamente. Línea corta explicando el motivo: ese permiso es para poder crear y leer el propio archivo de Cartos, nada más.

### 3.3. Onboarding

Solo si no existe todavía un libro personal. Formulario corto para la primera cuenta: nombre, emoji, saldo inicial. Al confirmar, la app crea el libro en el Drive del usuario.

### 3.4. Dashboard

Pantalla principal, la que se ve por defecto.

- **Arriba**: saldo total (suma de todas las cuentas del libro personal), como el número más grande de toda la app — la línea "TOTAL" de un ticket.
- **En medio**: cada cuenta como una línea tipo recibo — emoji, nombre y saldo alineado a la derecha, separadas por líneas discontinuas.
- **Abajo**: bloque "Últimos movimientos", mismo estilo de líneas, con fecha, categoría e importe.

### 3.5. Añadir

Tres pestañas arriba: Gasto, Ingreso, Transferencia — empezando siempre en Gasto.

**Campos comunes a Gasto e Ingreso:**
- Cuenta.
- Importe: campo numérico nativo de iOS (abre el teclado numérico del sistema al tocar), limitado a número entero más hasta dos decimales.
- Categoría: rejilla de iconos con las categorías más usadas/recientes, tocables directo; botón "Ver todas" abajo para el resto, vía lista con buscador.
- Fecha: tres opciones rápidas — Hoy (marcada por defecto), Ayer, Anteayer — más selector de calendario nativo para cualquier otra fecha.
- Nota (opcional).

**Campos para Transferencia:**
- Cuenta origen.
- Cuenta destino.
- Importe.
- Fecha (mismas tres opciones rápidas + calendario).
- Sin selector de categoría: la asigna la app automáticamente (categoría `Transferencia`).

### 3.6. Historial

Listado completo de movimientos, mismo estilo visual de recibo que el Dashboard. Filtros por cuenta, categoría y rango de fechas. Cada movimiento es tocable para editar o borrar.

*(Fuera del MVP: interruptor "incluir transferencias" para excluirlas de los totales al analizar varias cuentas juntas.)*

### 3.7. Análisis

Pantalla con dos bloques, pensada para responder qué categoría se lleva más gasto y cómo evoluciona el dinero mes a mes.

**Bloque de categorías**: categorías ordenadas de mayor a menor gasto, cada una como una barra horizontal en escala de grises con el importe al lado — legible de un vistazo, coherente con el estilo de recibo, sin recurrir a un gráfico de rosco multicolor que rompería la estética blanco y negro.

**Bloque de evolución mensual**: selector de mes hacia atrás, mostrando tres cifras por mes — ingresos, gastos y ahorro (la resta entre ambos). Empieza en granularidad mensual; semanal y diaria quedan fuera del MVP hasta ver si de verdad hacen falta.

### 3.8. Ajustes

Incluye:
- **Categorías**: gestión de categorías — ver las que vienen por defecto (incluida `Transferencia`, no editable/borrable), y crear o quitar las propias. Vive aquí y no en la barra principal porque se toca pocas veces.
- Selector de tema: Sistema (por defecto) / Claro / Oscuro.
- Acceso a la pantalla de Diagnóstico.
- *(Fuera del MVP: gestión de cuentas compartidas, invitaciones.)*

### 3.9. Diagnóstico

Dentro de Ajustes. Lista de las últimas aproximadamente 500 entradas de log (fecha/hora, tipo de evento, resultado, duración), guardadas en local. Botón para copiar el contenido. No incluye importes, notas ni nombres de categorías — solo ids y códigos de resultado.

## 4. Fuera del MVP (no bloquea diseño actual)

- Pantallas de invitación y aceptación de cuentas compartidas.
- Selector "¿Quién lo pagó?" en Añadir (aparece solo en cuentas compartidas, con las personas del libro más la opción "Común").
- Deep link `#/add?tipo=gasto&importe=12` para Apple Shortcuts.
- Pantalla o bloque de pagos programados.
