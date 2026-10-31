# Tarea 18 — Libro compartido

Estado: definida (2026-10-31), pendiente de implementar.
Depende de: 17 (varios libros) y 19 (Casa do Medio con datos), fusionadas.

## Objetivo
Compartir «Casa do Medio» con la pareja: que ella lo abra desde su propio Cartos y que los dos apunten en él. En los gastos de un libro compartido se puede indicar quién pagó (o «Común»), y Historial y Análisis lo muestran.

Se hace en dos partes, cada una usable sola en el iPhone:
- **18a**: compartir el libro y abrirlo desde la app de la otra persona.
- **18b**: la persona en los gastos.

## Decisiones tomadas (2026-10-31)
- Sin enlace de invitación: Drive avisa por email y la otra persona abre el libro desde Ajustes → Libros → «Abrir un libro compartido conmigo» con el Picker de Google. Cambia el §5 de la arquitectura.
- Se permite un segundo script externo de Google, `apis.google.com/js/api.js`, solo para el Picker, cargado al usarlo. AGENTS.md se actualiza.
- Clave de API nueva, restringida al dominio de la app (y `localhost:5173`) y a la Picker API. Es pública por diseño y va en `js/config.js` junto al número de proyecto (`setAppId`).
- El Picker solo acepta libros de Cartos de tipo compartido.
- Pestaña `Members` (`id`, `email`, `name`, `createdAt`): se crea si falta; cada persona se apunta sola al abrir el libro.
- La persona solo se pide en los gastos de libros compartidos: Martín · Ana · Común, por defecto quien registra. Se guarda en `personId` (ya existe). Las aportaciones siguen siendo categorías de ingreso (tarea 19).
- Quien ya tiene libro personal abre el compartido desde Ajustes; la primera pantalla de la app no cambia.

## Alcance técnico (18a)
- `js/domain/members.js`: validar el email, saber si alguien ya está apuntado, nombre visible.
- `js/data/rows.js`, `js/data/book.js`: pestaña `Members` (crear si falta, leer, apuntarse).
- `js/data/drive.js`: compartir (`permissions.create`) y `writersCanShare=false`.
- `js/data/picker.js`: cargar el script del Picker al usarlo, abrirlo y validar el archivo elegido.
- `js/screens/book-card.js`: «Compartir con…» y la lista de personas. `js/screens/books.js`: «Abrir un libro compartido conmigo».
- `js/config.js`, `i18n/es.js`, `sw.js`, AGENTS.md.

## Alcance técnico (18b)
- Añadir y Editar: fila de persona en gastos de libros compartidos.
- Historial: persona junto a la nota y filtro por persona.
- Análisis: sección «¿Quién?» con el gasto por persona en el periodo.

## Fuera de alcance
Quitar el acceso a alguien (se hace desde Drive). Enlace de invitación. Abrir un libro compartido desde la primera pantalla. Personas en ingresos.

## Pruebas automáticas
- Dominio de personas; datos con `fetch` simulado (compartir, `Members`, archivo del Picker válido o no).
- Aceptación con Google y Picker simulados: compartir, abrir un libro compartido y verlo en la lista; persona en Añadir, Historial y Análisis (18b).

## Pruebas manuales en iPhone
- [ ] 18a: compartir Casa do Medio con Ana; a Ana le llega el aviso de Drive.
- [ ] 18a: en el iPhone de Ana, Ajustes → Libros → «Abrir un libro compartido conmigo»: aparece Casa do Medio con sus movimientos.
- [ ] 18a: Ana apunta un gasto y aparece en tu Casa do Medio.
- [ ] 18b: un gasto con «Ana» y otro con «Común»; Historial y Análisis los muestran por persona.

## Criterio de cierre
- [ ] 18a y 18b fusionadas y probadas en el iPhone (los dos teléfonos).
- [ ] `npm test` y `npm run acceptance` en verde.
