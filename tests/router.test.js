import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute, ROUTES, parseHash, SECTIONS, SECTION_HASH } from '../js/ui/router.js';

test('decideRoute covers every session / drive / token combination', () => {
  const cases = [
    // hasSession, hasDriveAccess, tokenExpired, expected (book still unknown)
    [false, false, false, ROUTES.LOGIN],
    [false, false, true, ROUTES.LOGIN],
    [false, true, false, ROUTES.LOGIN],
    [false, true, true, ROUTES.LOGIN],
    [true, false, false, ROUTES.CONNECT],
    [true, false, true, ROUTES.CONNECT],
    [true, true, false, ROUTES.LOADING],
    [true, true, true, ROUTES.RECONNECT],
  ];
  for (const [hasSession, hasDriveAccess, tokenExpired, expected] of cases) {
    assert.equal(
      decideRoute({ hasSession, hasDriveAccess, tokenExpired }),
      expected,
      `session=${hasSession} drive=${hasDriveAccess} expired=${tokenExpired}`
    );
  }
});

const signedIn = { hasSession: true, hasDriveAccess: true, tokenExpired: false };

test('decideRoute goes to onboarding without a personal book and to the Dashboard with one', () => {
  assert.equal(decideRoute({ ...signedIn, book: 'none' }), ROUTES.ONBOARDING);
  assert.equal(decideRoute({ ...signedIn, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, book: 'unknown' }), ROUTES.LOADING);
});

test('offline, the device copy opens the Dashboard; without one, the offline screen', () => {
  assert.equal(decideRoute({ ...signedIn, offline: true, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, offline: true, tokenExpired: true, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, offline: true, book: 'unknown' }), ROUTES.OFFLINE);
  assert.equal(
    decideRoute({ hasSession: false, hasDriveAccess: false, tokenExpired: false, offline: true }),
    ROUTES.LOGIN
  );
});

test('online with an expired token asks to reconnect even with a device copy', () => {
  assert.equal(decideRoute({ ...signedIn, tokenExpired: true, book: 'ready' }), ROUTES.RECONNECT);
});

test('parseHash maps each hash to its section and keeps the query', () => {
  assert.deepEqual(parseHash(''), { section: SECTIONS.HOME, params: {} });
  assert.deepEqual(parseHash('#/'), { section: SECTIONS.HOME, params: {} });
  assert.deepEqual(parseHash('#/add?type=income'), { section: SECTIONS.ADD, params: { type: 'income' } });
  assert.deepEqual(parseHash('#/settings'), { section: SECTIONS.SETTINGS, params: {} });
  assert.deepEqual(parseHash('#/settings/categories/'), { section: SECTIONS.CATEGORIES, params: {} });
  assert.deepEqual(parseHash('#/settings/accounts'), { section: SECTIONS.ACCOUNTS, params: {} });
  assert.deepEqual(parseHash('#/nope'), { section: SECTIONS.HOME, params: {} });
});

test('every section has a hash that parses back to it', () => {
  for (const [section, hash] of Object.entries(SECTION_HASH)) assert.equal(parseHash(hash).section, section);
});
