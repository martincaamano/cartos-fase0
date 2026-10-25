// Cartos — app entry point. Picks the screen from the session state and
// re-checks it when the app comes back to the foreground or regains network
// (an access token lasts about an hour).

import { decideRoute, ROUTES } from './ui/router.js';
import { getAuthState, getCurrentUser } from './data/auth.js';
import { renderLogin } from './screens/login.js';
import { renderConnect } from './screens/connect.js';
import { renderHome } from './screens/home.js';

let currentRoute = null;

function show() {
  const offline = !navigator.onLine;
  const route = decideRoute({ ...getAuthState(), offline });
  if (route === currentRoute) return;
  currentRoute = route;

  const root = document.getElementById('app');
  switch (route) {
    case ROUTES.LOGIN:
      renderLogin(root, { onSignedIn: show });
      break;
    case ROUTES.CONNECT:
    case ROUTES.RECONNECT:
      renderConnect(root, { mode: route, onConnected: show });
      break;
    default:
      renderHome(root, { email: getCurrentUser()?.email ?? '', offline });
  }
}

show();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') show();
});
window.addEventListener('online', show);
