# Tarea 02 — Login y acceso a Drive

Estado: hecha (2026-10-25). Quedan dos comprobaciones manuales por verificar en uso real (ver abajo).
Depende de: 01 cerrada.

## Objetivo
Pantalla de Login con "Continuar con Google" y una línea explicativa. Tras iniciar sesión, pantalla "Conceder acceso a Drive" con su propio botón y texto. Si ya hay sesión y acceso previos, se saltan ambas.

## Alcance técnico
- `js/config.js`: `GOOGLE_CLIENT_ID` (público, se versiona).
- `js/data/auth.js`: login con Google Identity Services (ID token para la identidad), token client aparte para el scope `drive.file`, y una única función `getAccessToken()` por la que pasa todo acceso a token (ver arquitectura §7 y §8).
- `js/screens/login.js` y `js/screens/connect.js`.
- `js/storage/logs.js`: sistema de logs desde ya (ver arquitectura §9). Separa la construcción de la entrada de log (pura) del guardado en IndexedDB.
- `js/ui/router.js`: función pura `decideRoute(state)` que elige entre login, connect y el resto según el estado de sesión. No debe tocar `document` al importarse.
- `i18n/es.js`: textos de las dos pantallas.
- Añadir a `APP_SHELL` en `sw.js` los archivos nuevos necesarios para arrancar.

Reutiliza lo que ya funcionó en iPhone: `docs/referencia/fase0-spike.html`. El botón de Drive va separado del de login para evitar el bloqueo de pop-ups de Safari.

## Fuera de alcance
Leer o escribir Sheets, onboarding, navegación inferior.

## Pruebas automáticas
- `decideRoute`: tabla con todas las combinaciones de (sesión sí/no, acceso a Drive sí/no, token caducado sí/no) y la pantalla esperada.
- Entrada de log: contiene fecha, tipo de evento, resultado y duración; nunca incluye importes, notas ni nombres de categorías.

## Pruebas manuales en iPhone
Antes: en Google Cloud Console añade `http://localhost:5173` a los orígenes autorizados si quieres probar en el Mac.
- [x] En la PWA instalada, "Continuar con Google" abre el login y vuelve a la app.
- [x] "Conceder acceso a Drive" pide el permiso `drive.file` y lo obtiene.
- [x] Cerrar la app del todo y reabrirla no vuelve a pedir ninguna de las dos cosas.
- [x] Con el token caducado aparece un botón "Reconectar", no un fallo mudo. *Verificado en el iPhone el 2026-10-25.*
- [ ] Los logs registran los eventos de login y token (se verán en Diagnóstico en la tarea 09). *Pendiente; se verificará en la tarea 09.*

## Transversal
En cuanto el login funcione, pasar la app de Google Cloud de "Testing" a "Production" para evitar la caducidad de 7 días (arquitectura §8). Comprobar si Google pide algún paso extra con el scope `drive.file`.

Resultado (2026-10-25): publicada. Google no pidió verificación, pero sí completar la página de marca (nombre, correos de contacto, dominio autorizado `martincaamano.github.io`, página principal y política de privacidad en `privacy.html`). Sin logotipo, para no activar la verificación de marca.

## Criterio de cierre
- [x] Puedes iniciar sesión con Google, conceder acceso a Drive, cerrar la app y volver a abrirla sin que te lo pida de nuevo.
- [x] La app está publicada en Production.
- [x] `npm test` en verde.
