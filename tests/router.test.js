import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute, ROUTES } from '../js/ui/router.js';

test('decideRoute covers every session / drive / token combination', () => {
  const cases = [
    // hasSession, hasDriveAccess, tokenExpired, expected
    [false, false, false, ROUTES.LOGIN],
    [false, false, true, ROUTES.LOGIN],
    [false, true, false, ROUTES.LOGIN],
    [false, true, true, ROUTES.LOGIN],
    [true, false, false, ROUTES.CONNECT],
    [true, false, true, ROUTES.CONNECT],
    [true, true, false, ROUTES.HOME],
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

test('decideRoute opens the app offline instead of asking to reconnect', () => {
  assert.equal(
    decideRoute({ hasSession: true, hasDriveAccess: true, tokenExpired: true, offline: true }),
    ROUTES.HOME
  );
  assert.equal(
    decideRoute({ hasSession: false, hasDriveAccess: false, tokenExpired: false, offline: true }),
    ROUTES.LOGIN
  );
});
