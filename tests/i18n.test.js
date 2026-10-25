import { test } from 'node:test';
import assert from 'node:assert/strict';
import { es } from '../i18n/es.js';

test('login, Drive access and reconnect texts exist and are not empty', () => {
  const required = [
    es.appName,
    es.login.note, es.login.unavailable,
    es.connect.title, es.connect.note, es.connect.button,
    es.connect.cancelled, es.connect.failed, es.connect.unavailable,
    es.reconnect.title, es.reconnect.note, es.reconnect.button,
    es.home.connected, es.home.offline,
  ];
  for (const text of required) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0);
  }
  assert.equal(es.reconnect.button, 'Reconectar');
});
