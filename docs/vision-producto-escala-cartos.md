# Cartos — Visión de producto a escala (post-MVP)

Documento de requisitos funcionales y técnicos para una eventual evolución de Cartos de "herramienta personal sobre Drive" a producto distribuible, con cuentas propias, backend real y base de datos propia. No sustituye al MVP actual: lo complementa como mapa de hacia dónde podría crecer si el proyecto lo justifica. Mantiene las funcionalidades, el modelo de datos conceptual (cuentas, movimientos, categorías, libros) y la estética ya definidos en `arquitectura-app-finanzas.md` y `diseno-flujo-pantallas-cartos.md` — lo que cambia aquí es la infraestructura que lo sostiene, no la experiencia de uso.

---

## 1. Qué cambia respecto al MVP, y por qué

El MVP apoya toda su persistencia en Google Sheets y Drive, y toda su autenticación en una cuenta de Google. Es una decisión deliberada para validar el producto rápido, sin coste y sin backend propio. Tiene techo: obliga a que cada usuario tenga cuenta de Google, hace que compartir cuentas dependa de los permisos de Drive, y limita cualquier procesado inteligente de los datos porque no hay un sitio central donde razonar sobre ellos.

Dar el salto a un producto genérico implica tres cambios estructurales:

1. **Identidad propia**: usuarios con su propio correo y contraseña (o login social, pero como opción, no como requisito), sin depender de tener cuenta de Google.
2. **Backend y base de datos propios**: los datos dejan de vivir en archivos de Sheets y pasan a vivir en una base de datos pensada para este dominio, con una API propia delante.
3. **Distribución real**: la app pasa de ser una PWA instalada manualmente a algo publicable en App Store, Play Store y como web pública, con todo lo que eso implica en cuanto a cuentas de desarrollador, revisión, versiones y actualizaciones.

---

## 2. Requisitos funcionales

Esta sección describe qué debe poder hacer la aplicación, independientemente de la tecnología concreta. La mayoría ya está cubierta conceptualmente en el diseño del MVP; aquí se listan de forma completa porque un desarrollo con backend propio los implementa todos desde la base, en vez de ir añadiéndolos sobre la marcha.

### 2.1 Cuentas de usuario
- Registro con correo y contraseña propios.
- Opción de login social (Google, Apple) como alternativa, no como único camino.
- Verificación de correo electrónico.
- Recuperación de contraseña.
- Edición de perfil básico (nombre, correo, contraseña).
- Borrado de cuenta, con eliminación real de los datos asociados.

### 2.2 Cuentas de dinero (accounts) y libros
- Crear, editar y archivar cuentas de dinero (efectivo, banco, tarjeta, etc.), cada una con nombre, icono y saldo.
- Cuentas personales, visibles solo por su dueño.
- Cuentas compartidas, visibles y editables por varios usuarios con permisos definidos (ver 2.6).
- Saldo calculado en base a los movimientos, nunca almacenado como único valor fuente de verdad (evita desincronización).

### 2.3 Movimientos
- Registrar gastos, ingresos y transferencias.
- Campos: importe, cuenta, categoría, fecha, nota opcional, quién lo registró, quién pagó/recibió realmente (para cuentas compartidas).
- Transferencias entre cuentas propias y entre cuentas de distintos usuarios, con garantías de atomicidad reales (a diferencia del MVP, aquí si hay backend propio con transacciones de base de datos, una transferencia puede y debe ser una operación atómica de verdad, también cuando cruza de una cuenta a otra de distinto propietario).
- Edición y borrado de movimientos, con histórico de cambios (auditoría) en vez de solo borrado lógico simple.
- Movimientos recurrentes / pagos programados: definir una plantilla (importe, categoría, cuenta, periodicidad) que genera movimientos automáticamente o recuerda al usuario registrarlos.

### 2.4 Categorías
- Categorías por defecto al crear la cuenta.
- Categorías propias, con nombre, icono y color.
- Subcategorías (opcional, a valorar si el usuario real lo pide).
- Sugerencia de categorías nuevas en base a los movimientos del usuario (ver 2.8).

### 2.5 Historial y análisis
- Listado completo de movimientos, filtrable por cuenta, categoría, rango de fechas, persona (en cuentas compartidas).
- Ranking de categorías por gasto.
- Evolución mensual de ingresos, gastos y ahorro.
- Comparativas entre periodos (mes actual contra mes anterior, año contra año).
- Exportación de datos (CSV, PDF) para quien quiera sus datos fuera de la app.

### 2.6 Cuentas compartidas y multiusuario real
- Compartir una cuenta de dinero con otros usuarios de la app (no por correo de Drive, sino por su usuario de Cartos).
- Roles por cuenta compartida: propietario, puede editar, solo puede ver.
- Invitaciones por correo o enlace, con aceptación explícita.
- Sin punto único de fallo: a diferencia del modelo MVP (donde el propietario del libro es imprescindible), una cuenta compartida con backend propio puede sobrevivir a que el creador original borre su usuario, transfiriendo la propiedad a otro miembro.

### 2.7 Sincronización y modo offline
- Uso completo sin conexión: registrar movimientos, consultarlos, editarlos.
- Sincronización automática en segundo plano en cuanto hay red, sin depender de que la app esté en primer plano (a diferencia del MVP, limitado por no tener backend ni refresco silencioso de sesión).
- Resolución de conflictos cuando el mismo movimiento se edita desde dos dispositivos sin conexión (last-write-wins como base, con aviso al usuario si hay colisión real).

### 2.8 Inteligencia artificial aplicada
- **Categorización automática de gastos**: al registrar un movimiento, sugerir la categoría más probable en base al histórico del propio usuario (y, opcionalmente, patrones agregados anónimos de otros usuarios).
- **Sugerencia de categorías nuevas**: detectar patrones de gasto que no encajan bien en las categorías existentes del usuario y proponer crear una nueva.
- **Detección de movimientos recurrentes**: identificar que un gasto se repite con una periodicidad y ofrecer convertirlo en pago programado automáticamente.
- **Resúmenes e insights en lenguaje natural**: generar observaciones legibles ("este mes has gastado un 20% más en restaurantes que de media"), no solo gráficas.
- Todo esto requiere que los datos vivan en un backend propio con capacidad de cómputo sobre ellos — es la pieza que el modelo actual de Sheets no puede ofrecer con garantías ni rendimiento razonable a medida que crece el histórico.

### 2.9 Notificaciones
- Recordatorio de pagos programados próximos.
- Aviso de actividad en cuentas compartidas (alguien ha añadido un movimiento).
- Resumen periódico opcional (semanal/mensual).

### 2.10 Privacidad y control de datos
- El usuario puede exportar todos sus datos en cualquier momento.
- El usuario puede borrar su cuenta y sus datos de forma completa y verificable.
- Transparencia sobre qué datos se usan para las funciones de inteligencia artificial, con opción de desactivarlas.

---

## 3. Arquitectura técnica propuesta

### 3.1 Visión general
Arquitectura cliente-servidor clásica: apps cliente (iOS, Android, web) que hablan con una API propia, que a su vez es la única que toca la base de datos. Nada de llamadas directas del cliente a servicios externos de almacenamiento como ocurre hoy con Sheets.

```
Clientes (iOS / Android / Web)
        |
        | HTTPS (API REST o GraphQL)
        v
   Backend (API propia)
        |
        v
  Base de datos (PostgreSQL)
        |
        +-- Servicio de autenticación
        +-- Servicio de notificaciones push
        +-- Servicio de IA / categorización
```

### 3.2 Backend
- Responsable de autenticación, lógica de negocio (cálculo de saldos, validación de movimientos, construcción de transferencias), y de ser el único punto de acceso a la base de datos.
- Expone una API (REST o GraphQL) consumida por todos los clientes por igual, de forma que la lógica de negocio vive en un solo sitio y no se duplica entre apps.
- Capa de autenticación con tokens (JWT u similar) de corta duración más refresco silencioso real, resolviendo la limitación actual del MVP (expiración de 7 días en modo Testing, renovación manual del token de Google).
- Tareas en segundo plano (colas) para: generación de movimientos recurrentes, envío de notificaciones, procesado de categorización por IA, generación de resúmenes periódicos.

### 3.3 Base de datos
- Relacional (PostgreSQL es la opción natural: robusta, con buen soporte de transacciones atómicas — clave para que las transferencias entre cuentas de distintos usuarios sean seguras de verdad — y con extensiones maduras si en el futuro se necesita búsqueda o vectores para IA).
- Modelo de datos conceptual equivalente al que ya existe en el MVP (usuarios, cuentas, categorías, movimientos, membresías de cuentas compartidas), pero como tablas relacionadas con claves foráneas e índices, en vez de pestañas de una hoja de cálculo.
- Migraciones versionadas desde el primer día, para poder evolucionar el esquema sin perder datos de usuarios reales.

### 3.4 Autenticación
- Sistema propio de usuarios (correo + contraseña con hash seguro, tipo bcrypt o argon2) como base.
- Login social (Google, Apple) como proveedores adicionales de identidad, no como requisito.
- Tokens de sesión con refresco automático, gestionados enteramente por el backend — elimina el problema actual de que el usuario tenga que reconectar manualmente cuando expira el token de Google.

### 3.5 Apps cliente
- Mismo diseño visual y de interacción ya validado (estética recibo/ticket, navegación inferior de cinco secciones, flujos de pantallas ya definidos).
- Cambia la capa de datos interna: en vez de hablar con Drive/Sheets, habla con la API propia.
- Posibilidad real de apps nativas (Swift/SwiftUI en iOS, Kotlin en Android) o de mantener un enfoque multiplataforma (React Native, Flutter) para no triplicar el desarrollo — a decidir según recursos cuando se llegue a este punto.
- Versión web pública, servida de forma independiente a las tiendas, para quien prefiera no instalar nada.

### 3.6 Infraestructura y despliegue
- Backend desplegado en un proveedor cloud (opciones ligeras y de coste bajo a escala inicial: Railway, Render, Fly.io, o un VPS simple; AWS/GCP si el proyecto crece).
- Base de datos gestionada (evita responsabilidad de mantenimiento manual de backups y réplicas en fases tempranas).
- Almacenamiento de archivos (si se añaden adjuntos a movimientos, por ejemplo fotos de recibos) en un servicio de almacenamiento de objetos (S3 o equivalente), nunca en la propia base de datos.
- Entorno de pruebas (staging) separado de producción antes de cualquier despliegue.

### 3.7 Distribución
- **App Store**: cuenta de desarrollador Apple, cumplimiento de sus guías (incluye, por ejemplo, tener borrado de cuenta accesible desde dentro de la app, ya contemplado en 2.1).
- **Play Store**: cuenta de desarrollador Google, proceso de revisión equivalente.
- **Web pública**: dominio propio, hosting de la versión web, independiente de las tiendas.
- Gestión de versiones y actualizaciones centralizada, con changelog por versión.

---

## 4. Lo que se mantiene sin cambios

- Estética: tipografía monoespaciada / de puntos, paleta casi blanco y negro con acentos mínimos, listas en formato recibo, modo claro y oscuro.
- Navegación de cinco secciones: Dashboard, Historial, Añadir, Análisis, Ajustes.
- Modelo conceptual de datos: cuentas, movimientos, categorías, transferencias como forma de registrar dos movimientos relacionados.
- Principios de producto: sin anuncios, sin conexión bancaria obligatoria, registro manual como base, privacidad como valor central.

---

## 5. Relación con el MVP actual

Este documento no implica abandonar el MVP sobre Drive. Al contrario: el MVP sirve como validación barata y rápida de que el producto, la estética y los flujos funcionan de verdad en el uso diario, antes de invertir en backend propio, base de datos y distribución en tiendas. El dominio de negocio (cálculo de saldos, validación de movimientos, construcción de transferencias) ya está pensado en el MVP como lógica pura y aislada (`js/domain/`), lo que facilita que, si algún día se da el salto, buena parte de esa lógica pueda trasladarse casi tal cual al backend, en vez de reescribirse desde cero.

La decisión de cuándo (o si) dar este salto depende de señales reales de uso: si Cartos crece más allá de un círculo cercano de confianza, si la fricción del modelo Drive/Google se vuelve un problema recurrente, o si hay apetito real por las funciones de inteligencia artificial descritas en 2.8, que el modelo actual no puede sostener con garantías.
