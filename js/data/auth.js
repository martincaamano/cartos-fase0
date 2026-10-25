// Google sign-in and Drive access (architecture §7 and §8).
//
// Two separate steps, each started by its own tap so Safari does not block the
// pop-up: the ID token gives the identity, and a separate token client asks for
// the drive.file scope. Every access token in the app comes from
// getAccessToken(), so a token backend can be added later without touching
// the rest of the app.
//
// Nothing here touches `document` or `google` at import time.

import { GOOGLE_CLIENT_ID } from '../config.js';
import { clearSession, emptySession, isTokenExpired, loadSession, saveSession } from '../storage/session.js';
import { clearBookCache } from '../storage/book-cache.js';
import { logEvent } from '../storage/logs.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class AuthError extends Error {
  constructor(code) {
    super(`Auth failed: ${code}`);
    this.code = code;
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super('token_expired');
  }
}

const defaults = {
  storage: () => globalThis.localStorage,
  google: () => globalThis.google,
  now: () => Date.now(),
};

let deps = defaults;
let tokenClient = null;
let pending = null;

// Lets the tests swap the browser globals for fakes.
export function configureAuth(overrides = {}) {
  deps = { ...defaults, ...overrides };
  tokenClient = null;
  pending = null;
}

const load = () => loadSession(deps.storage());
const save = (session) => saveSession(deps.storage(), session);

// Reads the claims of a Google ID token. The token itself is not stored.
export function decodeIdToken(jwt) {
  try {
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims.sub !== 'string') return null;
    return { sub: claims.sub, email: claims.email ?? '', name: claims.name ?? '' };
  } catch {
    return null;
  }
}

// The Google script loads async and is missing offline.
export function whenGoogleReady(timeoutMs = 8000) {
  const started = deps.now();
  return new Promise((resolve) => {
    const check = () => {
      const google = deps.google();
      if (google?.accounts?.id && google?.accounts?.oauth2) return resolve(true);
      if (deps.now() - started >= timeoutMs) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

export function getAuthState() {
  const session = load();
  return {
    hasSession: session.user !== null,
    hasDriveAccess: session.driveGranted,
    tokenExpired: isTokenExpired(session, deps.now()),
  };
}

export function getCurrentUser() {
  return load().user;
}

function handleCredential(response, onSignedIn) {
  const user = decodeIdToken(response?.credential ?? '');
  if (!user) {
    logEvent({ type: 'login', result: 'invalid_credential' });
    return;
  }
  const session = load();
  // A different account must not inherit the previous Drive grant.
  const next = session.user?.sub === user.sub ? { ...session, user } : { ...emptySession(), user };
  save(next);
  tokenClient = null;
  logEvent({ type: 'login', result: 'ok' });
  onSignedIn?.(user);
}

// Renders Google's own "Continue with Google" button (GIS does not allow a
// custom one). Call only after whenGoogleReady() resolved true.
export function renderSignInButton(container, { theme, onSignedIn }) {
  const { id } = deps.google().accounts;
  id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => handleCredential(response, onSignedIn),
  });
  id.renderButton(container, {
    theme,
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: 280,
  });
}

function settle(code, startedAt) {
  const current = pending;
  pending = null;
  logEvent({ type: 'token', result: code, durationMs: deps.now() - startedAt });
  if (!current) return;
  if (code === 'ok') current.resolve();
  else current.reject(new AuthError(code));
}

function handleTokenResponse(response) {
  const startedAt = pending?.startedAt ?? deps.now();
  if (response.error) return settle(response.error, startedAt);
  const session = load();
  if (!deps.google().accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
    save({ ...session, driveGranted: false, accessToken: null, tokenExpiresAt: null });
    return settle('scope_denied', startedAt);
  }
  save({
    ...session,
    driveGranted: true,
    accessToken: response.access_token,
    tokenExpiresAt: deps.now() + Number(response.expires_in) * 1000,
  });
  settle('ok', startedAt);
}

// Builds the token client ahead of the tap, so the tap itself opens the
// pop-up synchronously (Safari blocks it otherwise).
export function prepareDriveAccess() {
  if (tokenClient) return;
  tokenClient = deps.google().accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    login_hint: load().user?.email || undefined,
    callback: handleTokenResponse,
    error_callback: (error) => settle(error?.type ?? 'error', pending?.startedAt ?? deps.now()),
  });
}

// Call straight from a tap: first grant and "Reconectar" both go through here.
export function requestDriveAccess() {
  prepareDriveAccess();
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, startedAt: deps.now() };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

// The only way to get an access token. Without a backend there is no silent
// refresh: an expired token means the user has to tap "Reconectar".
export async function getAccessToken() {
  const session = load();
  if (!session.accessToken || isTokenExpired(session, deps.now())) throw new TokenExpiredError();
  return session.accessToken;
}

// Google rejected the token (401) before its expiry, e.g. access revoked:
// drop it so the app asks to reconnect instead of retrying with it.
export function expireAccessToken() {
  const session = load();
  save({ ...session, accessToken: null, tokenExpiresAt: null });
}

// Forgets what the device keeps for this account: the session and the copy
// of the book. Drive access is not revoked, so signing in again needs no
// permission screen. The outbox stays: it is tied to the book file and is
// uploaded when the same account signs in again.
export function signOut() {
  const storage = deps.storage();
  clearSession(storage);
  clearBookCache(storage);
  tokenClient = null;
  pending = null;
  deps.google()?.accounts?.id?.disableAutoSelect?.();
  logEvent({ type: 'login', result: 'signed_out' });
}
