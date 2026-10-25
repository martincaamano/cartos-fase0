// Decides which screen to show from the session state. Pure: no DOM access,
// so it can be imported from the tests.

// Sections inside the app once the book is ready, chosen by the URL hash:
// #/ (Dashboard), #/add, #/settings, #/settings/categories.
export const SECTIONS = Object.freeze({
  HOME: 'home',
  ADD: 'add',
  SETTINGS: 'settings',
  CATEGORIES: 'categories',
});

const SECTION_BY_PATH = {
  '': SECTIONS.HOME,
  add: SECTIONS.ADD,
  settings: SECTIONS.SETTINGS,
  'settings/categories': SECTIONS.CATEGORIES,
};

export const SECTION_HASH = Object.freeze({
  [SECTIONS.HOME]: '#/',
  [SECTIONS.ADD]: '#/add',
  [SECTIONS.SETTINGS]: '#/settings',
  [SECTIONS.CATEGORIES]: '#/settings/categories',
});

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
