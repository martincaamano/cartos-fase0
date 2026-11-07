import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExcluded, saveExcluded, forgetExcluded } from '../js/storage/analysis-exclude.js';
import { fakeStorage } from './helpers/fake-storage.js';

const KEY = 'cartos.analysisExclude';

test('loadExcluded is empty when nothing was saved', () => {
  assert.deepEqual(loadExcluded(fakeStorage(), 'book-1'), []);
});

test('saveExcluded then loadExcluded returns the same ids', () => {
  const storage = fakeStorage();
  saveExcluded(storage, 'book-1', ['rent', 'fun']);
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent', 'fun']);
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'book-1': ['rent', 'fun'] });
});

test('saveExcluded accepts a Set', () => {
  const storage = fakeStorage();
  saveExcluded(storage, 'book-1', new Set(['rent']));
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent']);
});

test('each book keeps its own exclusions', () => {
  const storage = fakeStorage();
  saveExcluded(storage, 'book-1', ['rent']);
  saveExcluded(storage, 'book-2', ['food', 'fun']);
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent']);
  assert.deepEqual(loadExcluded(storage, 'book-2'), ['food', 'fun']);
  assert.deepEqual(loadExcluded(storage, 'book-3'), []);
  saveExcluded(storage, 'book-1', []);
  assert.deepEqual(loadExcluded(storage, 'book-1'), []);
  assert.deepEqual(loadExcluded(storage, 'book-2'), ['food', 'fun']);
});

test('loadExcluded gives [] on corrupt or unexpected JSON', () => {
  assert.deepEqual(loadExcluded(fakeStorage({ [KEY]: '{not json' }), 'book-1'), []);
  assert.deepEqual(loadExcluded(fakeStorage({ [KEY]: '["rent"]' }), 'book-1'), []);
  assert.deepEqual(loadExcluded(fakeStorage({ [KEY]: 'null' }), 'book-1'), []);
  assert.deepEqual(loadExcluded(fakeStorage({ [KEY]: '42' }), 'book-1'), []);
  assert.deepEqual(loadExcluded(fakeStorage({ [KEY]: '{"book-1":"rent"}' }), 'book-1'), []);
});

test('saveExcluded over corrupt data starts afresh', () => {
  const storage = fakeStorage({ [KEY]: '{not json' });
  saveExcluded(storage, 'book-1', ['rent']);
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent']);
});

test('loadExcluded drops ids that are not strings', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ 'book-1': ['rent', 7, null, { id: 'x' }, 'fun'] }) });
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent', 'fun']);
});

test('saveExcluded does not throw when setItem fails', (t) => {
  t.mock.method(console, 'warn', () => {});
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  assert.doesNotThrow(() => saveExcluded(storage, 'book-1', ['rent']));
  assert.equal(console.warn.mock.callCount(), 1);
});

// --- forgetExcluded (tarea 29) ---

// A storage that counts its writes.
const countingStorage = (initial) => {
  const storage = fakeStorage(initial);
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes += 1; setItem(key, value); };
  return { storage, writes: () => writes };
};

test('forgetExcluded removes only that id, only in that book', () => {
  const storage = fakeStorage();
  saveExcluded(storage, 'book-1', ['rent', 'food', 'fun']);
  saveExcluded(storage, 'book-2', ['food', 'fun']);
  forgetExcluded(storage, 'book-1', 'food');
  assert.deepEqual(loadExcluded(storage, 'book-1'), ['rent', 'fun']);
  assert.deepEqual(loadExcluded(storage, 'book-2'), ['food', 'fun']);
});

test('forgetExcluded of the last id leaves the book with []', () => {
  const storage = fakeStorage();
  saveExcluded(storage, 'book-1', ['food']);
  forgetExcluded(storage, 'book-1', 'food');
  assert.deepEqual(loadExcluded(storage, 'book-1'), []);
});

test('forgetExcluded does not write when the id is not excluded', () => {
  const { storage, writes } = countingStorage({ [KEY]: JSON.stringify({ 'book-1': ['rent'], 'book-2': ['food'] }) });
  forgetExcluded(storage, 'book-1', 'food');
  forgetExcluded(storage, 'book-3', 'food');
  assert.equal(writes(), 0);
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'book-1': ['rent'], 'book-2': ['food'] });
});

test('forgetExcluded on an empty or corrupt storage does nothing and does not throw', () => {
  const empty = countingStorage();
  forgetExcluded(empty.storage, 'book-1', 'food');
  assert.equal(empty.writes(), 0);
  assert.equal(empty.storage.data.has(KEY), false);
  const corrupt = countingStorage({ [KEY]: '{not json' });
  assert.doesNotThrow(() => forgetExcluded(corrupt.storage, 'book-1', 'food'));
  assert.equal(corrupt.writes(), 0);
});
