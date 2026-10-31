import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  for (const group of ['status', 'onboarding', 'dashboard', 'navbar', 'add', 'settings', 'categoryAdmin', 'accountAdmin']) {
    assertTexts(Object.values(es[group]));
  }
});

// A text whose name appears nowhere in js/ is left over from something
// removed (tarea 22d). Names are looked up as words, so a text read with a
// computed key (t[view]) still counts when its name is written somewhere.
test('every text of es is used somewhere in js/', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [readFileSync(full, 'utf8')] : [];
  });
  const code = walk(new URL('../js', import.meta.url).pathname).join('\n');
  const unused = [];
  for (const [group, texts] of Object.entries(es)) {
    if (!texts || typeof texts !== 'object' || Array.isArray(texts)) continue;
    for (const key of Object.keys(texts)) {
      if (!new RegExp(`\\b${key}\\b`).test(code)) unused.push(`${group}.${key}`);
    }
  }
  assert.deepEqual(unused, []);
});
