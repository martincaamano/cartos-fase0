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

### 1.2. Estilos, tokens y paletas (tarea 12)

Los estilos están en cuatro archivos, enlazados en este orden desde `index.html`:

- `styles/tokens.css`: el único archivo con valores escritos a mano (colores, tamaños de letra, espaciados, zona táctil, radio, opacidades).
- `styles/base.css`: elementos HTML y utilidades (`.text-muted`, `.amount-expense`, `[hidden]`...).
- `styles/components.css`: piezas compartidas (pantallas, botones, formularios, líneas de recibo, barra inferior, pestañas, chips, selector de categoría).
- `styles/screens.css`: solo lo propio de una pantalla.

Los colores tienen dos niveles:

- **Paleta** (`--palette-paper`, `--palette-ink`, `--palette-ink-soft`, `--palette-rule`, `--palette-terracotta`, `--palette-green`): qué colores son. Cada uno se escribe una vez como `light-dark(claro, oscuro)`, y `color-scheme` elige el valor según el sistema o el tema forzado desde Ajustes (`data-theme`). Necesita iOS 17.5 o posterior.
- **Semánticos** (`--color-bg`, `--color-ink`, `--color-ink-muted`, `--color-line`, `--color-expense`, `--color-income`, `--color-bar`, `--color-bar-track`): para qué se usa cada color. Componentes y pantallas solo usan estos.

**Añadir una paleta** es escribir en `tokens.css` un bloque `html[data-palette="nombre"] { --palette-…: light-dark(…, …); }` con los seis colores, y poner `data-palette="nombre"` en `<html>`. Nada más cambia. Elegir paleta desde Ajustes queda para el futuro.

Tamaños de letra: `--text-2xs` (11 px) … `--text-2xl` (32 px). Un test (`tests/styles.test.js`) impide colores escritos a mano fuera de `tokens.css`, variables sin definir y tamaños de letra fuera de la escala.

## 2. Navegación

Barra de navegación fija inferior, patrón estándar tipo Instagram o Twitter, con cinco secciones. No hay botón flotante independiente.

1. **Inicio** (Dashboard). Desde la tarea 17 la app abre en Añadir.
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
- **Cuentas** (añadido el 2026-10-25, tarea 06): lista de las cuentas del libro con su saldo, como líneas de recibo, y un formulario para crear otra (nombre, emoji y saldo inicial, como en el onboarding). Un nombre repetido se rechaza. En el MVP no se editan ni se borran cuentas.
- **Categorías**: gestión de categorías — ver las del libro agrupadas en Gastos e Ingresos, crear las propias (nombre, emoji y tipo) y quitar cualquiera, también las que vienen por defecto, salvo `Transferencia`, que es fija (decidido el 2026-10-25). Quitar es un borrado lógico: los movimientos que ya la usan la conservan. Vive aquí y no en la barra principal porque se toca pocas veces.
- Selector de tema: Sistema (por defecto) / Claro / Oscuro.
- Acceso a la pantalla de Diagnóstico.
- Libros: compartir un libro y abrir uno compartido contigo (tarea 18).

### 3.9. Diagnóstico

Dentro de Ajustes. Lista de las últimas aproximadamente 500 entradas de log (fecha/hora, tipo de evento, resultado, duración), guardadas en local. Botón para copiar el contenido. No incluye importes, notas ni nombres de categorías — solo ids y códigos de resultado.

## 4. Fuera del MVP (no bloquea diseño actual)

- Deep link `#/add?type=expense&amount=12` para Apple Shortcuts. La ruta `#/add` y el parámetro `type` ya existen desde la tarea 05; falta leer `amount`.
- Pantalla o bloque de pagos programados.
