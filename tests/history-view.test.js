import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistoryView, saveHistoryView, HISTORY_VIEWS } from '../js/storage/history-view.js';

// In-memory stand-in for localStorage.
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const throwing = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
});

test('HISTORY_VIEWS is summary then list and frozen', () => {
  assert.deepEqual([...HISTORY_VIEWS], ['summary', 'list']);
  assert.ok(Object.isFrozen(HISTORY_VIEWS));
});

test('loadHistoryView defaults to summary when nothing is saved', () => {
  assert.equal(loadHistoryView(fakeStorage()), 'summary');
});

test('saveHistoryView then loadHistoryView gives back the view', () => {
  const storage = fakeStorage();
  saveHistoryView(storage, 'list');
  assert.equal(loadHistoryView(storage), 'list');
  saveHistoryView(storage, 'summary');
  assert.equal(loadHistoryView(storage), 'summary');
});

test('saveHistoryView writes under a single key', () => {
  const storage = fakeStorage();
  saveHistoryView(storage, 'list');
  assert.equal(storage.data.size, 1);
  assert.equal(storage.data.get('cartos.historyView'), 'list');
});

test('loadHistoryView falls back to summary for unknown or empty values', () => {
  for (const value of ['', 'LIST', 'Summary', 'chart', ' list', 'null', 'undefined']) {
    assert.equal(loadHistoryView(fakeStorage({ 'cartos.historyView': value })), 'summary', JSON.stringify(value));
  }
});

test('loadHistoryView falls back to summary when storage throws', () => {
  assert.equal(loadHistoryView(throwing()), 'summary');
});

test('loadHistoryView falls back to summary when storage is missing', () => {
  assert.equal(loadHistoryView(undefined), 'summary');
  assert.equal(loadHistoryView(null), 'summary');
});

test('saveHistoryView never throws, even when storage does or is missing', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.doesNotThrow(() => saveHistoryView(throwing(), 'list'));
  assert.doesNotThrow(() => saveHistoryView(undefined, 'list'));
  assert.doesNotThrow(() => saveHistoryView(null, 'summary'));
});

test('saving an unknown view is read back as summary', () => {
  const storage = fakeStorage();
  saveHistoryView(storage, 'chart');
  assert.equal(loadHistoryView(storage), 'summary');
});
