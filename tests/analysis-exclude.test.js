import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExcluded, saveExcluded } from '../js/storage/analysis-exclude.js';

const KEY = 'cartos.analysisExclude';

const fakeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
};

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
