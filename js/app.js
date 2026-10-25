// Cartos — app entry point. Picks the screen from the session and the
// personal book, and re-checks both when the app comes back to the
// foreground or regains network (an access token lasts about an hour).

import { es } from '../i18n/es.js';
import { decideRoute, ROUTES } from './ui/router.js';
import { getAuthState, TokenExpiredError } from './data/auth.js';
import { cachedPersonalBook, fetchPersonalBook } from './data/personal-book.js';
import { renderLogin } from './screens/login.js';
import { renderConnect } from './screens/connect.js';
import { renderStatus } from './screens/status.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderDashboard } from './screens/dashboard.js';

const UNKNOWN = { status: 'unknown', fileId: null, book: null };

// What is known about the personal book: unknown, none or ready.
let personal = UNKNOWN;
let currentRoute = null;
let fetching = false;

function show({ force = false } = {}) {
  const offline = !navigator.onLine;
  const route = decideRoute({ ...getAuthState(), offline, book: personal.status });
  if (route === currentRoute && !force) return;
  currentRoute = route;

  const root = document.getElementById('app');
  switch (route) {
    case ROUTES.LOGIN:
      renderLogin(root, { onSignedIn: () => { personal = UNKNOWN; refresh(); } });
      break;
    case ROUTES.CONNECT:
    case ROUTES.RECONNECT:
      renderConnect(root, { mode: route, onConnected: refresh });
      break;
    case ROUTES.LOADING:
      renderStatus(root, { message: es.status.loading });
      break;
    case ROUTES.OFFLINE:
      renderStatus(root, { message: es.status.offline });
      break;
    case ROUTES.ONBOARDING:
      renderOnboarding(root, {
        fileId: personal.fileId,
        onDone: (result) => { personal = result; show(); },
      });
      break;
    default:
      renderDashboard(root, { book: personal.book, offline });
  }
}

function showLoadFailed() {
  currentRoute = null;
  renderStatus(document.getElementById('app'), { message: es.status.loadFailed, onRetry: refresh });
}

// Paints from the device copy at once, then reads Drive when it can.
async function refresh() {
  if (personal.status === 'unknown') personal = cachedPersonalBook() ?? UNKNOWN;
  show();

  const { hasSession, hasDriveAccess, tokenExpired } = getAuthState();
  if (!hasSession || !hasDriveAccess || tokenExpired || !navigator.onLine || fetching) return;
  fetching = true;
  try {
    personal = await fetchPersonalBook();
    show({ force: currentRoute === ROUTES.DASHBOARD });
  } catch (err) {
    if (err instanceof TokenExpiredError) show();
    else if (personal.status !== 'ready') showLoadFailed();
  } finally {
    fetching = false;
  }
}

refresh();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
window.addEventListener('online', refresh);
window.addEventListener('offline', () => show({ force: currentRoute === ROUTES.DASHBOARD }));
