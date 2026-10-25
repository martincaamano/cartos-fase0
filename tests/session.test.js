import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySession, parseSession, isTokenExpired, loadSession, saveSession, clearSession, EXPIRY_MARGIN_MS,
} from '../js/storage/session.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

test('a saved session survives a round trip', () => {
  const storage = fakeStorage();
  const session = {
    user: { sub: '123', email: 'a@example.com', name: 'A' },
    driveGranted: true,
    accessToken: 'tok',
    tokenExpiresAt: 1_000_000,
  };
  saveSession(storage, session);
  assert.deepEqual(loadSession(storage), session);
  clearSession(storage);
  assert.deepEqual(loadSession(storage), emptySession());
});

test('corrupt or foreign data falls back to an empty session', () => {
  assert.deepEqual(parseSession('not json'), emptySession());
  assert.deepEqual(parseSession(null), emptySession());
  assert.deepEqual(
    parseSession(JSON.stringify({ user: { email: 'x' }, driveGranted: 'yes', idToken: 'raw' })),
    emptySession()
  );
});

test('storage that throws does not break loading', () => {
  const storage = { getItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadSession(storage), emptySession());
});

test('token counts as expired a minute early, or when missing', () => {
  const expiresAt = 10 * 60 * 1000;
  const session = { ...emptySession(), accessToken: 'tok', tokenExpiresAt: expiresAt };
  assert.equal(isTokenExpired(session, expiresAt - EXPIRY_MARGIN_MS - 1), false);
  assert.equal(isTokenExpired(session, expiresAt - EXPIRY_MARGIN_MS), true);
  assert.equal(isTokenExpired(emptySession(), 0), true);
});
