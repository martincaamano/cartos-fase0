import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBookCache, saveBookCache, clearBookCache, parseBookCache } from '../js/storage/book-cache.js';
import { pickPersonalBook } from '../js/data/drive.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const snapshot = { accounts: [{ id: 'a' }], categories: [], movements: [] };

test('the device copy survives a round trip for the same user', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, new Date('2026-10-25T10:00:00Z'));
  assert.deepEqual(loadBookCache(storage, 'user-1'), { fileId: 'file-1', snapshot, savedAt: '2026-10-25T10:00:00.000Z' });
  clearBookCache(storage);
  assert.equal(loadBookCache(storage, 'user-1'), null);
});

test('another account never sees the copy', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot });
  assert.equal(loadBookCache(storage, 'user-2'), null);
  assert.equal(loadBookCache(storage, ''), null);
});

test('corrupt or incomplete copies are ignored', () => {
  assert.equal(parseBookCache('not json', 'user-1'), null);
  assert.equal(parseBookCache(JSON.stringify({ sub: 'user-1', fileId: 'f', snapshot: { accounts: [] } }), 'user-1'), null);
  assert.equal(loadBookCache({ getItem: () => { throw new Error('denied'); } }, 'user-1'), null);
});

test('pickPersonalBook takes the oldest personal book and ignores shared ones', () => {
  const files = [
    { id: 'shared', createdTime: '2026-01-01T00:00:00Z', appProperties: { bookType: 'shared' } },
    { id: 'newer', createdTime: '2026-10-25T00:00:00Z', appProperties: { bookType: 'personal' } },
    { id: 'older', createdTime: '2026-10-20T00:00:00Z', appProperties: { bookType: 'personal' } },
  ];
  assert.equal(pickPersonalBook(files).id, 'older');
  assert.equal(pickPersonalBook([files[0]]), null);
  assert.equal(pickPersonalBook([]), null);
});
