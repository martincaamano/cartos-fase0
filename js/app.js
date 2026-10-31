// Cartos — app entry point. Wires the book state (js/book-state.js) to the
// screens: decides which screen to show from the session, the book and the
// URL hash, and re-checks everything when the app comes back to the
// foreground or regains network (an access token lasts about an hour).

import { es } from '../i18n/es.js';
import { decideRoute, isRepaintable, parseHash, ROUTES, SECTION_HASH } from './ui/router.js';
import { startTheme } from './ui/theme.js';
import { currentUserSub, getAuthState, signOut } from './data/auth.js';
import { cachedBooks, fetchBooks, openBook, reloadBook } from './data/books.js';
import { syncOutbox } from './data/sync.js';
import { listPending } from './storage/outbox.js';
import { toIsoDate } from './domain/movement.js';
import { logEvent } from './storage/logs.js';
import { createBookState } from './book-state.js';
import { VIEWS } from './views.js';
import { renderLogin } from './screens/login.js';
import { renderConnect } from './screens/connect.js';
import { renderStatus } from './screens/status.js';
import { renderOnboarding } from './screens/onboarding.js';

const state = createBookState({
  cachedBooks,
  fetchBooks,
  reloadBook,
  openBook,
  syncOutbox,
  // Only what the signed-in user saved.
  listPending: () => listPending(currentUserSub()),
  getAuthState,
  isOnline: () => navigator.onLine,
  logEvent,
});

const root = () => document.getElementById('app');
// The screen on view: a route, or "dashboard:<section>" inside the app.
let current = { key: null, section: null };
// The day the screen on view was painted: «Hoy» and this month depend on it.
let paintedDay = '';

// repaint: the same screen again with fresh data (not a new visit).
function showSection({ section, params }, offline, repaint) {
  VIEWS[section]({
    root: root(),
    state,
    params,
    offline,
    repaint,
    redirect: (hash) => location.replace(hash),
    // After the Add form saved: count it and upload, then go to `hash`.
    saved: (hash) => (movements) => {
      state.saved(movements);
      location.hash = hash;
    },
    signOut: () => {
      signOut();
      state.reset();
      location.hash = SECTION_HASH.home;
      show({ force: true });
    },
  });
}

function show({ force = false } = {}) {
  const offline = !navigator.onLine;
  const route = decideRoute({ ...getAuthState(), offline, book: state.status });
  const section = route === ROUTES.DASHBOARD ? parseHash(location.hash) : null;
  // History keeps its filter in the URL (a month, an account): tapping
  // HISTORIAL in the bar opens it clean.
  const filter = section?.section === 'history' ? location.hash : '';
  const key = section ? `${route}:${section.section}${filter}` : route;
  if (key === current.key && !force) return;
  const repaint = key === current.key;
  current = { key, section: section?.section ?? null };
  paintedDay = toIsoDate(new Date());

  switch (route) {
    case ROUTES.LOGIN:
      renderLogin(root(), { onSignedIn: () => { state.reset(); state.refresh(); } });
      break;
    case ROUTES.CONNECT:
    case ROUTES.RECONNECT:
      renderConnect(root(), { mode: route, onConnected: state.refresh });
      break;
    case ROUTES.LOADING:
      renderStatus(root(), { message: es.status.loading });
      break;
    case ROUTES.OFFLINE:
      renderStatus(root(), { message: es.status.offline });
      break;
    case ROUTES.ONBOARDING:
      renderOnboarding(root(), { fileId: state.fileId, onDone: state.setUp });
      break;
    default:
      showSection(section, offline, repaint);
  }
}

// Fresh data repaints only the screens that can take it without losing
// what the user is doing.
const repaint = () => show({ force: current.section !== null && isRepaintable(current.section) });

function showLoadFailed() {
  current = { key: null, section: null };
  renderStatus(root(), { message: es.status.loadFailed, onRetry: state.refresh });
}

state.on((event) => {
  if (event === 'route') show();
  else if (event === 'data') repaint();
  else if (event === 'loadFailed') showLoadFailed();
});

// Opening the app (no section in the URL) shows Añadir: it is opened to
// write down an expense far more often than to look at the balance.
if (!location.hash) history.replaceState(null, '', SECTION_HASH.add);

startTheme();
state.refresh();

window.addEventListener('hashchange', () => show());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Left open overnight: paint again, so «Hoy» is today.
  if (paintedDay && paintedDay !== toIsoDate(new Date())) show({ force: true });
  state.refresh();
});
window.addEventListener('online', state.refresh);
window.addEventListener('offline', repaint);
