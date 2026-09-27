# Fase 0 — Validar los riesgos antes de construir la app

Todo esto se puede hacer 100% desde el iPhone con Safari, sin ordenador ni terminal (usamos GitHub Pages en vez de Firebase CLI, que sí necesita terminal).

## A. Crea el repositorio en GitHub (Safari)

1. github.com → inicia sesión (o crea cuenta) → icono "+" → **New repository**.
2. Nombre, por ejemplo `finanzas-fase0`. Público. Sin README. Crear.
3. Tu URL de Pages será `https://TU-USUARIO.github.io/finanzas-fase0/` — apúntala.

## B. Google Cloud Console (activa "Solicitar sitio de escritorio" en Safari)

1. console.cloud.google.com → crea un proyecto.
2. **APIs y servicios → Biblioteca**: activa "Google Drive API" y "Google Sheets API".
3. **APIs y servicios → Pantalla de consentimiento OAuth**: Externo → añade el scope `.../auth/drive.file` → en "Usuarios de prueba" añade tu email y el de tu pareja → guarda, déjalo en estado **Prueba** (no lo publiques, así evitas la revisión de Google).
4. **APIs y servicios → Credenciales**:
   - Crear credenciales → ID de cliente de OAuth → tipo "Aplicación web". En **"Orígenes de JavaScript autorizados"** pon solo `https://TU-USUARIO.github.io` (sin la ruta del repo — Google solo acepta el dominio). Guarda el Client ID.
   - Crear credenciales → Clave de API → restríngela a "Picker API".

## C. Sube los archivos y rellena las credenciales (todo en github.com)

1. En tu repo → **Add file → Upload files** → sube los 4 archivos (guárdalos antes en la app Archivos desde el chat) → Commit changes.
2. Abre `index.html` en el repo → icono del lápiz → sustituye `TU_CLIENT_ID.apps.googleusercontent.com` y `TU_API_KEY` por los valores reales del paso B.4 → Commit changes.
3. Repo → **Settings → Pages** → Source: "Deploy from a branch" → `main` → `/ (root)` → Save. Espera 1-2 minutos.

## D. Probar en el iPhone

1. Abre la URL en Safari.
2. Compartir → **Añadir a pantalla de inicio**.
3. Cierra Safari del todo y abre la app desde su icono (modo standalone).
4. Sigue los 5 pasos de la pantalla y comprueba en el registro:

| Riesgo (de la arquitectura) | Cómo se ve si funciona |
|---|---|
| Login de Google en PWA instalada en iOS | El botón de Google funciona y el paso 1 muestra tu email |
| Token `drive.file` | El paso 2 muestra "Token obtenido" |
| Creación y escritura de un Sheet | El paso 3 crea el archivo y lo ves en tu Google Drive con una fila de datos |
| Descubrimiento por `appProperties` | El paso 4 devuelve el Sheet que acabas de crear |
| Picker en modo standalone (riesgo del popup) | El paso 5 abre el selector sin salirte de la app ni romperse |
| Invitación completa | Comparte el Sheet de prueba (desde Google Drive, manualmente por ahora) con la otra cuenta, entra con esa cuenta y compruébalo con el Picker (paso 5) |
| Persistencia tras re-login | Cierra sesión (borra el token recargando la página), vuelve a iniciar sesión, y comprueba que el paso 4 sigue encontrando el archivo sin repetir el Picker |

Si los 4-5 riesgos salen bien, pasamos a construir el proyecto real (Vite + estructura de carpetas de la arquitectura). Si alguno falla, lo resolvemos antes de seguir.
