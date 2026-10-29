// The Google Identity Services object is faked; nothing here reaches Google.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureAuth, decodeIdToken, getAuthState, getCurrentUser, renderSignInButton,
  requestDriveAccess, getAccessToken, whenGoogleReady, AuthError, TokenExpiredError, DRIVE_SCOPE, signOut,
  currentUserSub,
} from '../js/data/auth.js';
import { saveBookCache, saveCurrentBook, loadBookCache, loadBooksCache } from '../js/storage/book-cache.js';
import { configureLogs } from '../js/storage/logs.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

function idToken(claims) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

// tokenResponse decides what the fake pop-up answers.
function fakeGoogle({ tokenResponse, grantsScope = true } = {}) {
  const calls = { idCallback: null, tokenConfig: null, requests: [] };
  const google = {
    accounts: {
      id: {
        initialize: (config) => { calls.idCallback = config.callback; },
        renderButton: () => {},
      },
      oauth2: {
        initTokenClient: (config) => {
          calls.tokenConfig = config;
          return {
            requestAccessToken: (options) => {
              calls.requests.push(options);
              if (tokenResponse.errorType) config.error_callback({ type: tokenResponse.errorType });
              else config.callback(tokenResponse);
            },
          };
        },
        hasGrantedAllScopes: (_response, scope) => grantsScope && scope === DRIVE_SCOPE,
      },
    },
  };
  return { google, calls };
}

let clock;
let storage;

function setup(googleOptions) {
  const fake = fakeGoogle(googleOptions);
  configureAuth({ storage: () => storage, google: () => fake.google, now: () => clock });
  return fake.calls;
}

function signIn(calls, claims = { sub: 'user-1', email: 'martin@example.com', name: 'Martín' }) {
  renderSignInButton({}, { theme: 'filled_black' });
  calls.idCallback({ credential: idToken(claims) });
}

beforeEach(() => {
  clock = 1_000_000;
  storage = fakeStorage();
});

test('decodeIdToken reads sub, email and a non-ASCII name', () => {
  const user = decodeIdToken(idToken({ sub: '42', email: 'a@example.com', name: 'Martín Caamaño' }));
  assert.deepEqual(user, { sub: '42', email: 'a@example.com', name: 'Martín Caamaño' });
  assert.equal(decodeIdToken('garbage'), null);
  assert.equal(decodeIdToken(idToken({ email: 'no-sub@example.com' })), null);
});

test('without a session the state asks for login', () => {
  setup({ tokenResponse: {} });
  assert.deepEqual(getAuthState(), { hasSession: false, hasDriveAccess: false, tokenExpired: true });
});

test('signing in stores the identity but not Drive access', () => {
  const calls = setup({ tokenResponse: {} });
  signIn(calls);
  assert.deepEqual(getCurrentUser(), { sub: 'user-1', email: 'martin@example.com', name: 'Martín' });
  assert.deepEqual(getAuthState(), { hasSession: true, hasDriveAccess: false, tokenExpired: true });
  assert.ok(!storage.getItem('cartos.session').includes('signature'), 'raw ID token must not be stored');
});

test('granting Drive access stores a token valid for its lifetime', async () => {
  const calls = setup({ tokenResponse: { access_token: 'tok-1', expires_in: 3599 } });
  signIn(calls);
  await requestDriveAccess();
  assert.equal(calls.tokenConfig.scope, DRIVE_SCOPE);
  assert.equal(calls.tokenConfig.login_hint, 'martin@example.com');
  assert.deepEqual(calls.requests, [{ prompt: '' }]);
  assert.deepEqual(getAuthState(), { hasSession: true, hasDriveAccess: true, tokenExpired: false });
  assert.equal(await getAccessToken(), 'tok-1');
});

test('an expired token is reported, never returned', async () => {
  const calls = setup({ tokenResponse: { access_token: 'tok-1', expires_in: 3599 } });
  signIn(calls);
  await requestDriveAccess();
  clock += 3599 * 1000;
  assert.equal(getAuthState().tokenExpired, true);
  assert.equal(getAuthState().hasDriveAccess, true);
  await assert.rejects(getAccessToken(), TokenExpiredError);
});

test('closing the pop-up rejects with its code and keeps the state', async () => {
  const calls = setup({ tokenResponse: { errorType: 'popup_closed' } });
  signIn(calls);
  await assert.rejects(requestDriveAccess(), (err) => err instanceof AuthError && err.code === 'popup_closed');
  assert.equal(getAuthState().hasDriveAccess, false);
});

test('refusing the drive.file scope leaves Drive access off', async () => {
  const calls = setup({ tokenResponse: { access_token: 'tok-1', expires_in: 3599 }, grantsScope: false });
  signIn(calls);
  await assert.rejects(requestDriveAccess(), (err) => err.code === 'scope_denied');
  assert.equal(getAuthState().hasDriveAccess, false);
  await assert.rejects(getAccessToken(), TokenExpiredError);
});

test('signing in with another account drops the previous Drive access', async () => {
  const calls = setup({ tokenResponse: { access_token: 'tok-1', expires_in: 3599 } });
  signIn(calls);
  await requestDriveAccess();
  signIn(calls, { sub: 'user-2', email: 'other@example.com', name: 'Other' });
  assert.deepEqual(getAuthState(), { hasSession: true, hasDriveAccess: false, tokenExpired: true });
});

test('whenGoogleReady gives up when the script never loads', async () => {
  let now = 0;
  configureAuth({ storage: () => storage, google: () => undefined, now: () => (now += 5000) });
  assert.equal(await whenGoogleReady(8000), false);
  setup({ tokenResponse: {} });
  assert.equal(await whenGoogleReady(), true);
});

// --- signOut ---

function signedInWithBookCopy() {
  storage.setItem('cartos.session', JSON.stringify({
    user: { sub: 'user-1', email: 'martin@example.com', name: 'Martín' },
    driveGranted: true,
    accessToken: 'tok-1',
    tokenExpiresAt: clock + 3_600_000,
  }));
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot: { accounts: [], categories: [], movements: [] } });
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-1' });
  assert.equal(getAuthState().hasSession, true);
  assert.notEqual(loadBookCache(storage, 'user-1'), null);
}

test('signOut forgets the session and the book copy and disables auto-select', () => {
  const logged = [];
  configureLogs({ write: async (entry) => { logged.push(entry); } });
  let disabled = 0;
  configureAuth({
    storage: () => storage,
    google: () => ({ accounts: { id: { disableAutoSelect: () => { disabled += 1; } } } }),
    now: () => clock,
  });
  try {
    signedInWithBookCopy();
    signOut();
    assert.deepEqual(getAuthState(), { hasSession: false, hasDriveAccess: false, tokenExpired: true });
    assert.equal(getCurrentUser(), null);
    assert.equal(loadBookCache(storage, 'user-1'), null);
    assert.equal(loadBooksCache(storage, 'user-1'), null);
    assert.equal(storage.getItem('cartos.books'), null);
    assert.equal(storage.getItem('cartos.book'), null);
    assert.equal(disabled, 1);
    assert.deepEqual(logged.map((e) => [e.type, e.result]), [['login', 'signed_out']]);
  } finally {
    configureLogs();
  }
});

test('signOut works when the Google script is missing', () => {
  configureLogs({ write: async () => {} });
  configureAuth({ storage: () => storage, google: () => undefined, now: () => clock });
  try {
    signedInWithBookCopy();
    assert.doesNotThrow(() => signOut());
    assert.equal(getAuthState().hasSession, false);
    assert.equal(loadBookCache(storage, 'user-1'), null);
  } finally {
    configureLogs();
  }
});

test('after signOut there is no access token', async () => {
  configureLogs({ write: async () => {} });
  configureAuth({ storage: () => storage, google: () => undefined, now: () => clock });
  try {
    signedInWithBookCopy();
    assert.equal(await getAccessToken(), 'tok-1');
    signOut();
    await assert.rejects(getAccessToken(), TokenExpiredError);
  } finally {
    configureLogs();
  }
});

test('currentUserSub is empty without a session and the sub once signed in', () => {
  const calls = setup({ tokenResponse: {} });
  assert.equal(currentUserSub(), '');
  signIn(calls, { sub: 'user-42', email: 'a@example.com', name: 'A' });
  assert.equal(currentUserSub(), 'user-42');
  signOut();
  assert.equal(currentUserSub(), '');
});
