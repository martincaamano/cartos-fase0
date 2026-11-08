// Theme preference: parsing and device storage.
// Importing the module must not touch `document` (it does not exist in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, parseTheme, loadTheme, saveTheme, PALETTES, DEFAULT_PALETTE, parsePalette, loadPalette, savePalette,
} from '../js/ui/theme.js';
import { es } from '../i18n/es.js';
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

// --- style (tarea 32) ---

test('the styles: Cartos first, as the default, and each one with its name', () => {
  assert.equal(DEFAULT_PALETTE, 'cartos');
  assert.deepEqual(PALETTES, ['cartos', 'libreta']);
  for (const palette of PALETTES) assert.equal(typeof es.themeScreen.palettes[palette], 'string', palette);
});

test('parsePalette keeps a known style and turns anything else into Cartos', () => {
  for (const palette of PALETTES) assert.equal(parsePalette(palette), palette);
  for (const raw of [null, undefined, '', 'Libreta', 'sepia', 'dark', 0, {}]) {
    assert.equal(parsePalette(raw), 'cartos', `raw=${JSON.stringify(raw)}`);
  }
});

test('savePalette then loadPalette keeps the style on the device, apart from the mode', () => {
  const storage = fakeStorage([[KEY, 'dark']]);
  assert.equal(loadPalette(storage), 'cartos', 'nothing saved yet');
  savePalette('libreta', storage);
  assert.equal(storage.items.get('cartos.palette'), 'libreta');
  assert.equal(loadPalette(storage), 'libreta');
  assert.equal(loadTheme(storage), 'dark', 'the mode is untouched');
  savePalette('purple', storage);
  assert.equal(loadPalette(storage), 'cartos');
});

test('a style saved by a later version and since removed reads as Cartos', () => {
  assert.equal(loadPalette(fakeStorage([['cartos.palette', 'sepia']])), 'cartos');
});

test('a storage that throws or is missing reads the style as Cartos', () => {
  assert.equal(loadPalette(throwingStorage), 'cartos');
  assert.equal(loadPalette(null), 'cartos');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => savePalette('libreta', throwingStorage));
  } finally {
    console.warn = warn;
  }
});

test('every style in PALETTES but the default has its block in styles/themes.css', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/themes.css', import.meta.url), 'utf8');
  for (const palette of PALETTES.slice(1)) assert.ok(css.includes(`html[data-palette="${palette}"]`), palette);
});
