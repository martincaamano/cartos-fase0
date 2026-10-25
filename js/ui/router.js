// Decides which screen to show from the session state. Pure: no DOM access,
// so it can be imported from the tests.

// Sections inside the app once the book is ready, chosen by the URL hash:
// #/ (Dashboard), #/history, #/history/edit?id=…, #/add,
// #/analysis?month=YYYY-MM, #/settings, #/settings/categories,
// #/settings/accounts, #/settings/diagnostics.
export const SECTIONS = Object.freeze({
  HOME: 'home',
  HISTORY: 'history',
  EDIT: 'edit',
  ADD: 'add',
  ANALYSIS: 'analysis',
  SETTINGS: 'settings',
  CATEGORIES: 'categories',
  ACCOUNTS: 'accounts',
  DIAGNOSTICS: 'diagnostics',
});

const SECTION_BY_PATH = {
  '': SECTIONS.HOME,
  history: SECTIONS.HISTORY,
  'history/edit': SECTIONS.EDIT,
  add: SECTIONS.ADD,
  analysis: SECTIONS.ANALYSIS,
  settings: SECTIONS.SETTINGS,
  'settings/categories': SECTIONS.CATEGORIES,
  'settings/accounts': SECTIONS.ACCOUNTS,
  'settings/diagnostics': SECTIONS.DIAGNOSTICS,
};

export const SECTION_HASH = Object.freeze({
  [SECTIONS.HOME]: '#/',
  [SECTIONS.HISTORY]: '#/history',
  [SECTIONS.EDIT]: '#/history/edit',
  [SECTIONS.ADD]: '#/add',
  [SECTIONS.ANALYSIS]: '#/analysis',
  [SECTIONS.SETTINGS]: '#/settings',
  [SECTIONS.CATEGORIES]: '#/settings/categories',
  [SECTIONS.ACCOUNTS]: '#/settings/accounts',
  [SECTIONS.DIAGNOSTICS]: '#/settings/diagnostics',
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
