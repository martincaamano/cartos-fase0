// Decides which screen to show from the session state. Pure: no DOM access,
// so it can be imported from the tests.

export const ROUTES = Object.freeze({
  LOGIN: 'login',
  CONNECT: 'connect',
  RECONNECT: 'reconnect',
  HOME: 'home',
});

// state: { hasSession, hasDriveAccess, tokenExpired, offline }
export function decideRoute({ hasSession, hasDriveAccess, tokenExpired, offline = false }) {
  if (!hasSession) return ROUTES.LOGIN;
  if (!hasDriveAccess) return ROUTES.CONNECT;
  // Reconnecting needs the network; offline the app opens with what it has.
  if (tokenExpired && !offline) return ROUTES.RECONNECT;
  return ROUTES.HOME;
}
