// Session kept on the device so reopening the app does not ask again.
// Stores only the identity claims (sub, email, name), whether Drive access was
// granted, and the current access token with its expiry. Never the raw ID token.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.session';

// Treat the token as expired a bit early, so a call never starts with a token
// that dies halfway through.
export const EXPIRY_MARGIN_MS = 60 * 1000;

export function emptySession() {
  return { user: null, driveGranted: false, accessToken: null, tokenExpiresAt: null };
}

export function parseSession(raw) {
  if (!raw) return emptySession();
  try {
    const data = JSON.parse(raw);
    const user = data.user && typeof data.user.sub === 'string'
      ? { sub: data.user.sub, email: String(data.user.email ?? ''), name: String(data.user.name ?? '') }
      : null;
    return {
      user,
      driveGranted: data.driveGranted === true,
      accessToken: typeof data.accessToken === 'string' ? data.accessToken : null,
      tokenExpiresAt: Number.isFinite(data.tokenExpiresAt) ? data.tokenExpiresAt : null,
    };
  } catch {
    return emptySession();
  }
}

export function isTokenExpired(session, nowMs) {
  if (!session.accessToken || !session.tokenExpiresAt) return true;
  return nowMs >= session.tokenExpiresAt - EXPIRY_MARGIN_MS;
}

export function loadSession(storage) {
  try {
    return parseSession(storage.getItem(KEY));
  } catch {
    // Safari can throw on storage access in some private modes.
    return emptySession();
  }
}

export function saveSession(storage, session) {
  try {
    storage.setItem(KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Session write failed', err);
  }
}

export function clearSession(storage) {
  try {
    storage.removeItem(KEY);
  } catch (err) {
    console.warn('Session clear failed', err);
  }
}
