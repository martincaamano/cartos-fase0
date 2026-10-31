// Last account used per book (js/storage/last-account.js), with an
// in-memory storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLastAccount, saveLastAccount } from '../js/storage/last-account.js';
import { fakeStorage } from './helpers/fake-storage.js';

const KEY = 'cartos.lastAccount';

const throwingStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('quota'); },
};

test('save then load returns the account id of that book', () => {
  const storage = fakeStorage();
  saveLastAccount(storage, 'book-home', 'acc-bank');
  assert.equal(loadLastAccount(storage, 'book-home'), 'acc-bank');
});

test('load returns null for an empty storage or an unknown book', () => {
  assert.equal(loadLastAccount(fakeStorage(), 'book-home'), null);
  const storage = fakeStorage({ [KEY]: JSON.stringify({ 'book-trip': 'acc-cash' }) });
  assert.equal(loadLastAccount(storage, 'book-home'), null);
});

test('load returns null for malformed JSON', () => {
  for (const raw of ['{not json', '', 'undefined', '{"book-home":']) {
    assert.equal(loadLastAccount(fakeStorage({ [KEY]: raw }), 'book-home'), null, JSON.stringify(raw));
  }
});

test('load returns null when the stored value is an array, null or a scalar', () => {
  for (const raw of ['[]', '["acc-bank"]', 'null', '42', '"acc-bank"', 'true']) {
    assert.equal(loadLastAccount(fakeStorage({ [KEY]: raw }), '0'), null, raw);
  }
});

test('load returns null when the entry is not a string', () => {
  for (const entry of [42, 0, null, true, ['acc-bank'], { id: 'acc-bank' }]) {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ 'book-home': entry }) });
    assert.equal(loadLastAccount(storage, 'book-home'), null, JSON.stringify(entry));
  }
});

test('load does not pick up inherited properties as a book', () => {
  const storage = fakeStorage({ [KEY]: '{}' });
  assert.equal(loadLastAccount(storage, 'toString'), null);
  assert.equal(loadLastAccount(storage, '__proto__'), null);
});

test('save keeps the entries of other books', () => {
  const storage = fakeStorage();
  saveLastAccount(storage, 'book-home', 'acc-bank');
  saveLastAccount(storage, 'book-trip', 'acc-cash');
  assert.equal(loadLastAccount(storage, 'book-home'), 'acc-bank');
  assert.equal(loadLastAccount(storage, 'book-trip'), 'acc-cash');
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'book-home': 'acc-bank', 'book-trip': 'acc-cash' });
});

test('save overwrites the entry of the same book', () => {
  const storage = fakeStorage();
  saveLastAccount(storage, 'book-home', 'acc-bank');
  saveLastAccount(storage, 'book-home', 'acc-card');
  assert.equal(loadLastAccount(storage, 'book-home'), 'acc-card');
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'book-home': 'acc-card' });
});

test('save over malformed or array content starts a clean object', () => {
  for (const raw of ['{not json', '[]', '["acc-old"]', 'null']) {
    const storage = fakeStorage({ [KEY]: raw });
    saveLastAccount(storage, 'book-home', 'acc-bank');
    assert.deepEqual(JSON.parse(storage.data.get(KEY)), { 'book-home': 'acc-bank' }, raw);
  }
});

test('only ids are stored, under a single key', () => {
  const storage = fakeStorage();
  saveLastAccount(storage, 'book-home', 'acc-bank');
  assert.deepEqual([...storage.data.keys()], [KEY]);
});

test('a storage that throws never throws out', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal(loadLastAccount(throwingStorage, 'book-home'), null);
  assert.doesNotThrow(() => saveLastAccount(throwingStorage, 'book-home', 'acc-bank'));
});

test('a storage whose setItem throws (quota) never throws out', (t) => {
  t.mock.method(console, 'warn', () => {});
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => saveLastAccount(storage, 'book-home', 'acc-bank'));
});
