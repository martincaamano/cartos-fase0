// Cartos — app entry point. Picks the screen from the session, the personal
// book and the URL hash, keeps the outbox flowing to the Sheet, and re-checks
// everything when the app comes back to the foreground or regains network
// (an access token lasts about an hour).

import { es } from '../i18n/es.js';
import { decideRoute, parseHash, ROUTES, SECTIONS, SECTION_HASH } from './ui/router.js';
import { getAuthState, TokenExpiredError } from './data/auth.js';
import { cachedPersonalBook, fetchPersonalBook } from './data/personal-book.js';
import { syncOutbox } from './data/sync.js';
import { listPending } from './storage/outbox.js';
import { enqueue, mergePending } from './storage/outbox-logic.js';
import { renderLogin } from './screens/login.js';
import { renderConnect } from './screens/connect.js';
import { renderStatus } from './screens/status.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderAddMovement } from './screens/addMovement.js';
import { renderHistory } from './screens/history.js';
import { renderAnalysis } from './screens/analysis.js';
import { findEntry } from './domain/history.js';
import { renderSettings } from './screens/settings.js';
import { renderCategories } from './screens/categories.js';
import { renderAccounts } from './screens/accounts.js';

const UNKNOWN = { status: 'unknown', fileId: null, book: null };

// What is known about the personal book: unknown, none or ready.
let personal = UNKNOWN;
// Movements of the personal book saved on the device but not in the Sheet yet.
let pending = [];
let currentKey = null;
let fetching = false;

// Screens that may be repainted with fresh data; a half-filled Add form
// never is, and neither is the History, so its filters stay put.
const REPAINTABLE = new Set(
  [SECTIONS.HOME, SECTIONS.ANALYSIS, SECTIONS.CATEGORIES, SECTIONS.ACCOUNTS].map((section) => `${ROUTES.DASHBOARD}:${section}`)
);
const repaint = () => show({ force: REPAINTABLE.has(currentKey) });

// Puts what the Add form saved (a movement, or both halves of a transfer)
// into the in-memory queue, goes to `hash` and starts a sync.
const afterSave = (hash) => (saved) => {
  for (const movement of [saved].flat()) pending = enqueue(pending, movement);
  location.hash = hash;
  sync();
};

function showSection(root, { section, params }, offline) {
  const book = { ...personal.book, movements: mergePending(personal.book.movements, pending) };
  switch (section) {
    case SECTIONS.ADD:
      renderAddMovement(root, { book, fileId: personal.fileId, params, onSaved: afterSave(SECTION_HASH.home) });
      break;
    case SECTIONS.HISTORY:
      renderHistory(root, { book });
      break;
    case SECTIONS.ANALYSIS:
      renderAnalysis(root, { book, params });
      break;
    case SECTIONS.EDIT: {
      const entry = findEntry(book.movements, params.id);
      if (!entry) {
        // Deleted meanwhile, or a stale link.
        location.replace(SECTION_HASH.history);
        break;
      }
      renderAddMovement(root, { book, fileId: personal.fileId, entry, onSaved: afterSave(SECTION_HASH.history) });
      break;
    }
    case SECTIONS.SETTINGS:
      renderSettings(root);
      break;
    case SECTIONS.CATEGORIES:
      renderCategories(root, { book: personal.book, fileId: personal.fileId, onChanged: reloadBook });
      break;
    case SECTIONS.ACCOUNTS:
      renderAccounts(root, { book, fileId: personal.fileId, onChanged: reloadBook });
      break;
    default:
      renderDashboard(root, { book, offline, pendingCount: pending.length });
  }
}

function show({ force = false } = {}) {
  const offline = !navigator.onLine;
  const route = decideRoute({ ...getAuthState(), offline, book: personal.status });
  const section = route === ROUTES.DASHBOARD ? parseHash(location.hash) : null;
  const key = section ? `${route}:${section.section}` : route;
  if (key === currentKey && !force) return;
  currentKey = key;

  const root = document.getElementById('app');
  switch (route) {
    case ROUTES.LOGIN:
      renderLogin(root, { onSignedIn: () => { personal = UNKNOWN; pending = []; refresh(); } });
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
      showSection(root, section, offline);
  }
}

function showLoadFailed() {
  currentKey = null;
  renderStatus(document.getElementById('app'), { message: es.status.loadFailed, onRetry: refresh });
}

async function loadPending() {
  try {
    pending = (await listPending())
      .filter((item) => item.fileId === personal.fileId)
      .map((item) => item.movement);
  } catch (err) {
    console.warn('Outbox read failed', err);
  }
}

const canReachDrive = () => {
  const { hasSession, hasDriveAccess, tokenExpired } = getAuthState();
  return hasSession && hasDriveAccess && !tokenExpired && navigator.onLine;
};

// Reads the book again from Drive (after a sync or a category change).
async function reloadBook() {
  if (!canReachDrive()) return;
  try {
    personal = await fetchPersonalBook();
    await loadPending();
    repaint();
  } catch (err) {
    if (err instanceof TokenExpiredError) show();
    else console.warn('Book reload failed', err);
  }
}

// Uploads the outbox, then refreshes the book so the Sheet is the truth.
async function sync() {
  if (personal.status !== 'ready' || !canReachDrive()) return;
  try {
    const { appended, updated } = await syncOutbox(personal.fileId);
    await loadPending();
    if (appended + updated > 0) await reloadBook();
    else repaint();
  } catch (err) {
    if (err instanceof TokenExpiredError) show();
    else console.warn('Sync failed', err);
  }
}

// Paints from the device copy at once, then reads Drive and syncs when it can.
async function refresh() {
  if (personal.status === 'unknown') {
    personal = cachedPersonalBook() ?? UNKNOWN;
    if (personal.status === 'ready') await loadPending();
  }
  show();

  if (!canReachDrive() || fetching) return;
  fetching = true;
  try {
    personal = await fetchPersonalBook();
    await loadPending();
    repaint();
    await sync();
  } catch (err) {
    if (err instanceof TokenExpiredError) show();
    else if (personal.status !== 'ready') showLoadFailed();
  } finally {
    fetching = false;
  }
}

refresh();

window.addEventListener('hashchange', () => show());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
window.addEventListener('online', refresh);
window.addEventListener('offline', repaint);
