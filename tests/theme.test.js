// Theme preference: parsing and device storage.
// Importing the module must not touch `document` (it does not exist in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, parseTheme, loadTheme, saveTheme } from '../js/ui/theme.js';
import { fakeStorage } from './helpers/fake-storage.js';

const KEY = 'cartos.theme';

const throwingStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('quota'); },
  removeItem: () => { throw new Error('denied'); },
};

test('importing the module works without a document', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
});

test('parseTheme keeps valid values', () => {
  for (const theme of THEMES) assert.equal(parseTheme(theme), theme);
});

test('parseTheme turns invalid values into system', () => {
  for (const raw of [null, undefined, '', 'Dark', 'LIGHT', ' dark', 'sepia', 0, 1, true, {}, []]) {
    assert.equal(parseTheme(raw), 'system', `raw=${JSON.stringify(raw)}`);
  }
});

test('saveTheme then loadTheme round-trips every theme', () => {
  const storage = fakeStorage();
  for (const theme of THEMES) {
    saveTheme(theme, storage);
    assert.equal(storage.items.get(KEY), theme);
    assert.equal(loadTheme(storage), theme);
  }
});

test('loadTheme with nothing saved gives system', () => {
  assert.equal(loadTheme(fakeStorage()), 'system');
});

test('loadTheme ignores a corrupt saved value', () => {
  assert.equal(loadTheme(fakeStorage([[KEY, 'purple']])), 'system');
});

test('saveTheme stores system for an invalid preference', () => {
  const storage = fakeStorage([[KEY, 'dark']]);
  saveTheme('purple', storage);
  assert.equal(storage.items.get(KEY), 'system');
});

test('a storage that throws never breaks reading or writing', () => {
  assert.equal(loadTheme(throwingStorage), 'system');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => saveTheme('dark', throwingStorage));
  } finally {
    console.warn = warn;
  }
});

test('a missing storage reads as system', () => {
  assert.equal(loadTheme(null), 'system');
});
