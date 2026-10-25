import { test } from 'node:test';
import assert from 'node:assert/strict';
import { es } from '../i18n/es.js';

function assertTexts(texts) {
  for (const text of texts) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0);
  }
}

test('login, Drive access and reconnect texts exist and are not empty', () => {
  assertTexts([
    es.appName,
    es.login.note, es.login.unavailable,
    es.connect.title, es.connect.note, es.connect.button,
    es.connect.cancelled, es.connect.failed, es.connect.unavailable,
    es.reconnect.title, es.reconnect.note, es.reconnect.button,
  ]);
  assert.equal(es.reconnect.button, 'Reconectar');
});

test('every text of the status, onboarding, Dashboard and navbar groups is filled', () => {
  for (const group of ['status', 'onboarding', 'dashboard', 'navbar']) {
    assertTexts(Object.values(es[group]));
  }
});
