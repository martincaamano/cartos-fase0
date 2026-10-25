// Decides which screen to show from the session state. Pure: no DOM access,
// so it can be imported from the tests.

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
