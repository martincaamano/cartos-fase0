// Categories remembered per destination account for transfers to another
// book (js/storage/transfer-categories.js), with an in-memory storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTransferCategories, saveTransferCategories } from '../js/storage/transfer-categories.js';
import { fakeStorage } from './helpers/fake-storage.js';

const KEY = 'cartos.transferCategories';

const throwingStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('quota'); },
};

test('save then load returns the two category ids of that account', () => {
  const storage = fakeStorage();
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'cat-house', incomeCategoryId: 'cat-contribution' });
  assert.deepEqual(loadTransferCategories(storage, 'house-bank'), { expenseCategoryId: 'cat-house', incomeCategoryId: 'cat-contribution' });
});

test('load returns null for an empty storage or an unknown account', () => {
  assert.equal(loadTransferCategories(fakeStorage(), 'house-bank'), null);
  const storage = fakeStorage({ [KEY]: JSON.stringify({ other: { expenseCategoryId: 'a', incomeCategoryId: 'b' } }) });
  assert.equal(loadTransferCategories(storage, 'house-bank'), null);
});

test('load returns null for malformed JSON', () => {
  for (const raw of ['{not json', '', 'undefined']) {
    assert.equal(loadTransferCategories(fakeStorage({ [KEY]: raw }), 'house-bank'), null, JSON.stringify(raw));
  }
});

test('load returns null when the stored value is an array, null or a scalar', () => {
  for (const raw of ['[]', '[{"expenseCategoryId":"a","incomeCategoryId":"b"}]', 'null', '42', '"text"']) {
    assert.equal(loadTransferCategories(fakeStorage({ [KEY]: raw }), '0'), null, raw);
  }
});

test('load returns null when the ids are not both strings', () => {
  const entries = [
    { expenseCategoryId: 'a' },
    { incomeCategoryId: 'b' },
    { expenseCategoryId: 1, incomeCategoryId: 'b' },
    { expenseCategoryId: 'a', incomeCategoryId: null },
    { expenseCategoryId: ['a'], incomeCategoryId: 'b' },
    'a,b',
    null,
    [],
  ];
  for (const entry of entries) {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ 'house-bank': entry }) });
    assert.equal(loadTransferCategories(storage, 'house-bank'), null, JSON.stringify(entry));
  }
});

test('load returns only the two ids, without extra fields', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ 'house-bank': { expenseCategoryId: 'a', incomeCategoryId: 'b', amount: 300 } }) });
  assert.deepEqual(loadTransferCategories(storage, 'house-bank'), { expenseCategoryId: 'a', incomeCategoryId: 'b' });
});

test('save keeps the entries of other accounts', () => {
  const storage = fakeStorage();
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  saveTransferCategories(storage, 'trip-bank', { expenseCategoryId: 'c', incomeCategoryId: 'd' });
  assert.deepEqual(loadTransferCategories(storage, 'house-bank'), { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  assert.deepEqual(loadTransferCategories(storage, 'trip-bank'), { expenseCategoryId: 'c', incomeCategoryId: 'd' });
});

test('save overwrites the entry of the same account', () => {
  const storage = fakeStorage();
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'c', incomeCategoryId: 'd' });
  assert.deepEqual(loadTransferCategories(storage, 'house-bank'), { expenseCategoryId: 'c', incomeCategoryId: 'd' });
  assert.deepEqual(Object.keys(JSON.parse(storage.data.get(KEY))), ['house-bank']);
});

test('save over malformed data starts again from an empty map', () => {
  const storage = fakeStorage({ [KEY]: '{broken' });
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'house-bank': { expenseCategoryId: 'a', incomeCategoryId: 'b' } });
});

test('only ids are stored, under a single key', () => {
  const storage = fakeStorage();
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  assert.deepEqual([...storage.data.keys()], [KEY]);
});

test('a storage that throws never throws out', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.doesNotThrow(() => saveTransferCategories(throwingStorage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' }));
  assert.doesNotThrow(() => loadTransferCategories(throwingStorage, 'house-bank'));
  assert.equal(loadTransferCategories(throwingStorage, 'house-bank'), null);
});

test('a storage whose write fails keeps the previous value', (t) => {
  t.mock.method(console, 'warn', () => {});
  const storage = fakeStorage();
  saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'a', incomeCategoryId: 'b' });
  storage.setItem = () => { throw new Error('quota'); };
  assert.doesNotThrow(() => saveTransferCategories(storage, 'house-bank', { expenseCategoryId: 'c', incomeCategoryId: 'd' }));
  assert.deepEqual(loadTransferCategories(storage, 'house-bank'), { expenseCategoryId: 'a', incomeCategoryId: 'b' });
});
