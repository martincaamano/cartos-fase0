// Decides which screen to show from the session state. Pure: no DOM access,
// so it can be imported from the tests.

// Screens inside the app once the book is ready, one row each: the section
// name, its path in the URL hash (#/history, #/settings/accounts...) and
// whether it may be repainted when fresh data arrives. A half-filled form
// never is, and neither is the History, whose filters would reset.
// Adding a screen: a row here, its renderer in js/views.js and the file in
// sw.js (tests check both).
export const SCREENS = Object.freeze([
  { section: 'home', path: '', repaint: true },
  { section: 'history', path: 'history' },
  { section: 'edit', path: 'history/edit' },
  { section: 'add', path: 'add' },
  { section: 'analysis', path: 'analysis', repaint: true },
  { section: 'settings', path: 'settings' },
  { section: 'categories', path: 'settings/categories', repaint: true },
  { section: 'accounts', path: 'settings/accounts', repaint: true },
  { section: 'diagnostics', path: 'settings/diagnostics' },
].map(Object.freeze));

// SECTIONS.HOME === 'home', SECTIONS.HISTORY === 'history'...
export const SECTIONS = Object.freeze(
  Object.fromEntries(SCREENS.map(({ section }) => [section.toUpperCase(), section]))
);

export const SECTION_HASH = Object.freeze(
  Object.fromEntries(SCREENS.map(({ section, path }) => [section, `#/${path}`]))
);

const SECTION_BY_PATH = Object.fromEntries(SCREENS.map(({ section, path }) => [path, section]));

const REPAINTABLE = new Set(SCREENS.filter((screen) => screen.repaint).map(({ section }) => section));

export const isRepaintable = (section) => REPAINTABLE.has(section);

// "#/add?type=income" → { section: 'add', params: { type: 'income' } }.
// Anything unknown falls back to the Dashboard.
export function parseHash(hash) {
  const [path = '', query = ''] = String(hash ?? '').replace(/^#\/?/, '').split('?');
  const section = SECTION_BY_PATH[path.replace(/\/+$/, '')] ?? SECTIONS.HOME;
  return { section, params: Object.fromEntries(new URLSearchParams(query)) };
}

export const ROUTES = Object.freeze({
  LOGIN: 'login',
  CONNECT: 'connect',
  RECONNECT: 'reconnect',
  LOADING: 'loading',
  OFFLINE: 'offline',
  ONBOARDING: 'onboarding',
  DASHBOARD: 'dashboard',
});

// state: { hasSession, hasDriveAccess, tokenExpired, offline, book }
// book: 'unknown' (not looked up yet), 'none' (no personal book with
// accounts) or 'ready' (a book is loaded, from Drive or from the device copy).
export function decideRoute({ hasSession, hasDriveAccess, tokenExpired, offline = false, book = 'unknown' }) {
  if (!hasSession) return ROUTES.LOGIN;
  if (!hasDriveAccess) return ROUTES.CONNECT;
  // Reconnecting needs the network; offline the app opens with the device copy.
  if (tokenExpired && !offline) return ROUTES.RECONNECT;
  if (book === 'ready') return ROUTES.DASHBOARD;
  if (offline) return ROUTES.OFFLINE;
  if (book === 'none') return ROUTES.ONBOARDING;
  return ROUTES.LOADING;
}
