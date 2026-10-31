// Device copies of the books (js/storage/book-cache.js) on a fake storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooksCache, loadBooksCache, loadBookCache, saveBookCache, saveBookList, saveCurrentBook, clearBookCache,
} from '../js/storage/book-cache.js';

function fakeStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const snapshot = { accounts: [{ id: 'a' }], categories: [], movements: [] };
const other = { accounts: [{ id: 'b' }], categories: [{ id: 'c' }], movements: [{ id: 'm' }] };
// What a stored snapshot reads back as: members [] when it had none.
const stored = (snap) => ({ ...snap, members: [] });
const t1 = new Date('2026-10-25T10:00:00Z');
const books = [
  { fileId: 'file-1', name: 'Personal', bookType: 'personal', isPersonal: true },
  { fileId: 'file-2', name: 'Casa', bookType: 'shared' },
];

test('a copy survives a round trip for the same user', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  assert.deepEqual(loadBookCache(storage, 'user-1', 'file-1'), { fileId: 'file-1', snapshot: stored(snapshot), savedAt: '2026-10-25T10:00:00.000Z' });
});

test('saveBookCache does not change the book open', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  assert.equal(loadBooksCache(storage, 'user-1').current, null);
  assert.equal(loadBookCache(storage, 'user-1'), null, 'no current, no default copy');
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-1' });
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-2', snapshot: other }, t1);
  assert.equal(loadBooksCache(storage, 'user-1').current, 'file-1');
  assert.equal(loadBookCache(storage, 'user-1').fileId, 'file-1');
});

test('each book keeps its own copy; without fileId the open one is returned', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-2', snapshot: other }, new Date('2026-10-26T00:00:00Z'));
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-2' });
  assert.deepEqual(loadBookCache(storage, 'user-1'), { fileId: 'file-2', snapshot: stored(other), savedAt: '2026-10-26T00:00:00.000Z' });
  assert.deepEqual(loadBookCache(storage, 'user-1', 'file-1').snapshot, stored(snapshot));
  assert.equal(loadBookCache(storage, 'user-1', 'file-3'), null);
});

test('the open book without a copy gives null', () => {
  const storage = fakeStorage();
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-2' });
  assert.equal(loadBookCache(storage, 'user-1'), null);
  assert.equal(loadBooksCache(storage, 'user-1').current, 'file-2');
});

test('only accounts, categories, movements and members are stored', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot: { ...snapshot, members: [], extra: 'x', token: 'nope' } }, t1);
  assert.deepEqual(Object.keys(loadBookCache(storage, 'user-1', 'file-1').snapshot), ['accounts', 'categories', 'movements', 'members']);
  assert.equal(storage.getItem('cartos.books').includes('nope'), false, 'other keys never reach the storage');
});

// --- members of a shared book (tarea 18b) ---

const members = [
  { id: 'p-1', email: 'martin@example.com', name: 'Martín Inventado', createdAt: '2026-10-20T00:00:00.000Z' },
  { id: 'p-2', email: 'ana@example.com', name: '', createdAt: '2026-10-21T00:00:00.000Z' },
];

test('the members of a shared book survive a round trip', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-2', snapshot: { ...other, members } }, t1);
  assert.deepEqual(loadBookCache(storage, 'user-1', 'file-2').snapshot, { ...other, members });
});

test('the members of a shared book survive in the stored text too (parseBooksCache)', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-2', snapshot: { ...other, members } }, t1);
  const parsed = parseBooksCache(storage.getItem('cartos.books'), 'user-1');
  assert.deepEqual(parsed.snapshots['file-2'].snapshot.members, members);
});

test('a missing or invalid members becomes []', () => {
  for (const bad of [undefined, null, 'ana', 7, { id: 'p-1' }, true]) {
    const storage = fakeStorage();
    saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot: { ...snapshot, members: bad } }, t1);
    assert.deepEqual(loadBookCache(storage, 'user-1', 'file-1').snapshot.members, [], JSON.stringify(bad));
  }
});

test('a stored copy without members (saved before tarea 18b) reads with members []', () => {
  const raw = JSON.stringify({ sub: 'user-1', current: 'file-1', books, snapshots: { 'file-1': { snapshot, savedAt: 'x' } } });
  assert.deepEqual(parseBooksCache(raw, 'user-1').snapshots['file-1'].snapshot, stored(snapshot));
  const withBad = JSON.stringify({ sub: 'user-1', current: 'file-1', books, snapshots: { 'file-1': { snapshot: { ...snapshot, members: 'x' }, savedAt: 'x' } } });
  assert.deepEqual(parseBooksCache(withBad, 'user-1').snapshots['file-1'].snapshot.members, []);
});

test('an empty members list is kept as []', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot: { ...snapshot, members: [] } }, t1);
  assert.deepEqual(loadBookCache(storage, 'user-1', 'file-1').snapshot.members, []);
});

test('saveBookList stores the list and drops copies of books no longer listed', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  saveBookCache(storage, { sub: 'user-1', fileId: 'gone', snapshot: other }, t1);
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-1' });
  saveBookList(storage, { sub: 'user-1', books });
  const cache = loadBooksCache(storage, 'user-1');
  assert.deepEqual(cache.books, books);
  assert.deepEqual(Object.keys(cache.snapshots), ['file-1']);
  assert.equal(cache.current, 'file-1', 'current untouched');
  assert.equal(loadBookCache(storage, 'user-1', 'gone'), null);
});

test('saveBookList with an empty list drops every copy', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  saveBookList(storage, { sub: 'user-1', books: [] });
  assert.deepEqual(loadBooksCache(storage, 'user-1').snapshots, {});
});

test('clearBookCache removes the new and the old key', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  storage.setItem('cartos.book', JSON.stringify({ sub: 'user-1', fileId: 'file-1', snapshot }));
  clearBookCache(storage);
  assert.equal(storage.items.size, 0);
  assert.equal(loadBooksCache(storage, 'user-1'), null);
  assert.equal(loadBookCache(storage, 'user-1'), null);
});

test('another account never sees the copies', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot });
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-1' });
  assert.equal(loadBooksCache(storage, 'user-2'), null);
  assert.equal(loadBookCache(storage, 'user-2'), null);
  assert.equal(loadBookCache(storage, 'user-2', 'file-1'), null);
  assert.equal(loadBookCache(storage, ''), null);
});

test('a write by another account replaces the cache: the first one no longer sees its copies', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot });
  saveBookCache(storage, { sub: 'user-2', fileId: 'file-9', snapshot: other });
  assert.equal(loadBooksCache(storage, 'user-1'), null);
  assert.deepEqual(Object.keys(loadBooksCache(storage, 'user-2').snapshots), ['file-9']);
});

// --- conversion of the single-book copy stored before tarea 17 ---

const oldEntry = { sub: 'user-1', fileId: 'file-1', snapshot, savedAt: '2026-10-20T08:00:00.000Z' };

test('the old single-book copy is read as the open book with its snapshot', () => {
  const storage = fakeStorage();
  storage.setItem('cartos.book', JSON.stringify(oldEntry));
  assert.deepEqual(loadBooksCache(storage, 'user-1'), {
    sub: 'user-1',
    current: 'file-1',
    books: [],
    snapshots: { 'file-1': { snapshot: stored(snapshot), savedAt: '2026-10-20T08:00:00.000Z' } },
  });
  assert.deepEqual(loadBookCache(storage, 'user-1'), { fileId: 'file-1', snapshot: stored(snapshot), savedAt: '2026-10-20T08:00:00.000Z' });
});

test('the old copy of another user, or a broken one, is ignored', () => {
  const storage = fakeStorage();
  storage.setItem('cartos.book', JSON.stringify(oldEntry));
  assert.equal(loadBooksCache(storage, 'user-2'), null);
  storage.setItem('cartos.book', JSON.stringify({ ...oldEntry, snapshot: { accounts: [] } }));
  assert.equal(loadBooksCache(storage, 'user-1'), null);
  storage.setItem('cartos.book', JSON.stringify({ ...oldEntry, fileId: 7 }));
  assert.equal(loadBooksCache(storage, 'user-1'), null);
  storage.setItem('cartos.book', '{broken');
  assert.equal(loadBooksCache(storage, 'user-1'), null);
});

test('any write converts the old copy and removes the old key', () => {
  const storage = fakeStorage();
  storage.setItem('cartos.book', JSON.stringify(oldEntry));
  saveBookList(storage, { sub: 'user-1', books });
  assert.equal(storage.getItem('cartos.book'), null);
  const cache = loadBooksCache(storage, 'user-1');
  assert.equal(cache.current, 'file-1');
  assert.deepEqual(cache.books, books);
  assert.deepEqual(cache.snapshots['file-1'].snapshot, stored(snapshot));
});

test('saveCurrentBook also removes the old key', () => {
  const storage = fakeStorage();
  storage.setItem('cartos.book', JSON.stringify(oldEntry));
  saveCurrentBook(storage, { sub: 'user-1', fileId: 'file-2' });
  assert.equal(storage.getItem('cartos.book'), null);
  const cache = loadBooksCache(storage, 'user-1');
  assert.equal(cache.current, 'file-2');
  assert.deepEqual(Object.keys(cache.snapshots), ['file-1'], 'the old copy is kept');
});

test('the new key wins over the old one', () => {
  const storage = fakeStorage();
  storage.setItem('cartos.books', JSON.stringify({ sub: 'user-1', current: 'file-2', books, snapshots: {} }));
  storage.setItem('cartos.book', JSON.stringify(oldEntry));
  assert.equal(loadBooksCache(storage, 'user-1').current, 'file-2');
});

// --- parseBooksCache ---

test('parseBooksCache ignores corrupt or foreign entries', () => {
  assert.equal(parseBooksCache(null, 'user-1'), null);
  assert.equal(parseBooksCache('not json', 'user-1'), null);
  assert.equal(parseBooksCache('{}', 'user-1'), null);
  assert.equal(parseBooksCache(JSON.stringify({ sub: 'user-1', snapshots: null }), 'user-1'), null);
  assert.equal(parseBooksCache(JSON.stringify({ sub: 'user-2', snapshots: {} }), 'user-1'), null);
  assert.equal(parseBooksCache(JSON.stringify({ sub: 'user-1', snapshots: {} }), ''), null);
});

test('parseBooksCache drops incomplete snapshots and fixes bad current or books', () => {
  const raw = JSON.stringify({
    sub: 'user-1',
    current: 5,
    books: 'nope',
    snapshots: { good: { snapshot, savedAt: 'x' }, bad: { snapshot: { accounts: [] } }, empty: null },
  });
  assert.deepEqual(parseBooksCache(raw, 'user-1'), {
    sub: 'user-1', current: null, books: [], snapshots: { good: { snapshot: stored(snapshot), savedAt: 'x' } },
  });
});

// --- storage errors never throw ---

test('a storage that throws never breaks reads, writes nor clear', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('denied'); },
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(loadBooksCache(broken, 'user-1'), null);
    assert.equal(loadBookCache(broken, 'user-1'), null);
    assert.doesNotThrow(() => saveBookCache(broken, { sub: 'user-1', fileId: 'f', snapshot }));
    assert.doesNotThrow(() => saveBookList(broken, { sub: 'user-1', books }));
    assert.doesNotThrow(() => saveCurrentBook(broken, { sub: 'user-1', fileId: 'f' }));
    assert.doesNotThrow(() => clearBookCache(broken));
  } finally {
    console.warn = warn;
  }
});

test('a full storage (setItem fails) keeps what was there before', () => {
  const storage = fakeStorage();
  saveBookCache(storage, { sub: 'user-1', fileId: 'file-1', snapshot }, t1);
  const setItem = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  const warn = console.warn;
  console.warn = () => {};
  try {
    saveBookCache(storage, { sub: 'user-1', fileId: 'file-2', snapshot: other }, t1);
  } finally {
    console.warn = warn;
    storage.setItem = setItem;
  }
  assert.deepEqual(Object.keys(loadBooksCache(storage, 'user-1').snapshots), ['file-1']);
});
