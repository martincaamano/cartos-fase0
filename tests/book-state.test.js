// The state of the books (js/book-state.js) with fake deps: the open book,
// the list, switching books and the upload of the outbox of every book.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBookState } from '../js/book-state.js';
import { TokenExpiredError } from '../js/data/auth.js';
import { ApiError } from '../js/data/errors.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

const m1 = { id: 'm1', date: '2026-10-01', amount: 12.5, type: 'expense' };
const m2 = { id: 'm2', date: '2026-10-02', amount: 100, type: 'income' };
const m3 = { id: 'm3', date: '2026-10-31', amount: 0.01, type: 'expense' };
const book = (movements = [m1], accountId = 'a1') => ({ accounts: [{ id: accountId }], movements });
const ready = (movements, fileId = 'f1') => ({ status: 'ready', fileId, book: book(movements, `acc-${fileId}`) });
const BOOKS = [
  { fileId: 'f1', name: 'Personal', bookType: 'personal', isPersonal: true },
  { fileId: 'f2', name: 'Casa do medio', bookType: 'shared' },
  { fileId: 'f3', name: 'Viaje', bookType: 'shared' },
];

// Fake deps that write every call and every event into one log, in order.
// outbox: the items waiting, like IndexedDB; the fake syncOutbox uploads
// (removes) the items of the book it is given and counts them as appended.
function setup(overrides = {}, { outbox = [], copies = {} } = {}) {
  const log = [];
  const logged = [];
  const queue = [...outbox];
  const deps = {
    cachedBooks: () => { log.push('cached'); return null; },
    fetchBooks: async () => { log.push('fetch'); return { ...ready([m1]), books: BOOKS }; },
    reloadBook: async (fileId) => { log.push(`reload:${fileId}`); return ready([m1, m2], fileId); },
    openBook: (fileId) => { log.push(`open:${fileId}`); return copies[fileId] ?? null; },
    syncOutbox: async (fileId) => {
      log.push(`syncOutbox:${fileId}`);
      const mine = queue.filter((item) => item.fileId === fileId);
      for (const item of mine) queue.splice(queue.indexOf(item), 1);
      return { appended: mine.length, updated: 0, pending: 0 };
    },
    listPending: async () => [...queue],
    getAuthState: () => ({ hasSession: true, hasDriveAccess: true, tokenExpired: false }),
    isOnline: () => true,
    logEvent: (event) => logged.push(event),
    ...overrides,
  };
  const state = createBookState(deps);
  state.on((event) => log.push(event));
  const count = (entry) => log.filter((item) => item === entry).length;
  return { state, log, logged, count, queue };
}

// --- refresh ---

test('refresh paints from the device copy with its list, then reads Drive and emits data', async () => {
  let atRoute = null;
  const { state, log } = setup({
    cachedBooks: () => { log.push('cached'); return { ...ready([m1]), books: BOOKS.slice(0, 1), savedAt: 'x' }; },
  });
  state.on((event) => { if (event === 'route' && !atRoute) atRoute = { status: state.status, books: state.books.length }; });
  await state.refresh();
  assert.deepEqual(atRoute, { status: 'ready', books: 1 }, 'the copy and its list are on screen at once');
  assert.deepEqual(log, ['cached', 'route', 'fetch', 'data', 'data']);
  assert.equal(state.status, 'ready');
  assert.equal(state.fileId, 'f1');
  assert.deepEqual(state.books, BOOKS, 'the list read from Drive');
});

test('refresh keeps the list even when fetchBooks finds no book with accounts', async () => {
  const { state } = setup({
    fetchBooks: async () => ({ status: 'none', fileId: 'f1', book: book([]), books: BOOKS.slice(0, 1) }),
  });
  await state.refresh();
  assert.equal(state.status, 'none');
  assert.deepEqual(state.books, BOOKS.slice(0, 1));
});

test('refresh with no books at all leaves status none and an empty list', async () => {
  const { state, count } = setup({
    fetchBooks: async () => ({ status: 'none', fileId: null, book: null, books: [] }),
  });
  await state.refresh();
  assert.equal(state.status, 'none');
  assert.equal(state.fileId, null);
  assert.deepEqual(state.books, []);
  assert.equal(state.bookInfo, null);
  assert.equal(count('syncOutbox:f1'), 0, 'nothing to sync without a ready book');
});

test('book merges the pending movements of the open book only; pendingCount counts them', async () => {
  const edited = { ...m1, amount: 0.01 };
  // Offline, so nothing is uploaded and the pending stay.
  const offline = setup({ isOnline: () => false, cachedBooks: () => ready([m1]) }, {
    outbox: [
      { fileId: 'f1', movement: edited },
      { fileId: 'f1', movement: m2 },
      { fileId: 'other', movement: { id: 'm9', amount: 999999.99 } },
    ],
  }).state;
  await offline.refresh();
  assert.equal(offline.pendingCount, 2);
  assert.deepEqual(offline.book.movements, [edited, m2]);
  assert.deepEqual(offline.book.accounts, [{ id: 'acc-f1' }]);
  // savedBook is the Sheet as read, without pending changes.
  assert.deepEqual(offline.savedBook.movements, [m1]);
});

test('an expired token while reading Drive asks to re-decide the route', async () => {
  const { state, log } = setup({
    fetchBooks: async () => { log.push('fetch'); throw new TokenExpiredError(); },
  });
  await state.refresh();
  assert.deepEqual(log, ['cached', 'route', 'fetch', 'route']);
  assert.ok(!log.includes('loadFailed'));
});

test('a failed load without a device copy emits loadFailed', async () => {
  const { state, log } = setup({
    fetchBooks: async () => { log.push('fetch'); throw new Error('network'); },
  });
  await state.refresh();
  assert.notEqual(state.status, 'ready');
  assert.equal(log.at(-1), 'loadFailed');
});

test('a failed load with a device copy keeps it and does not emit loadFailed', async () => {
  const { state, log } = setup({
    cachedBooks: () => ({ ...ready([m1]), books: BOOKS }),
    fetchBooks: async () => { throw new Error('network'); },
  });
  await state.refresh();
  assert.equal(state.status, 'ready');
  assert.ok(!log.includes('loadFailed'));
  assert.deepEqual(state.book.movements, [m1]);
  assert.deepEqual(state.books, BOOKS);
});

test('offline, refresh uses the device copy and does not read Drive', async () => {
  const { state, log, count } = setup({
    cachedBooks: () => ({ ...ready([m1]), books: BOOKS }),
    isOnline: () => false,
  });
  await state.refresh();
  assert.equal(state.status, 'ready');
  assert.equal(count('fetch'), 0);
  assert.deepEqual(log, ['route']);
});

test('refresh searches Drive once with fetchBooks and does not reload when nothing was uploaded', async () => {
  const { state, count } = setup();
  await state.refresh();
  assert.equal(count('fetch'), 1);
  assert.equal(count('reload:f1'), 0);
});

// --- sync: the outbox of every book ---

test('sync that uploaded something of the open book reads it again by its file, without searching Drive', async () => {
  const { state, log, count } = setup({}, { outbox: [{ fileId: 'f1', movement: m2 }] });
  await state.refresh();
  assert.equal(count('fetch'), 1, 'only the first read searches Drive');
  assert.equal(count('syncOutbox:f1'), 1);
  assert.equal(count('reload:f1'), 1);
  assert.ok(log.indexOf('reload:f1') > log.indexOf('syncOutbox:f1'));
  assert.equal(log.at(-1), 'data');
  assert.deepEqual(state.savedBook.movements, [m1, m2]);
  assert.equal(state.pendingCount, 0);
});

test('an updated row alone also reads the open book again', async () => {
  const { state, log, count } = setup({
    syncOutbox: async (fileId) => { log.push(`syncOutbox:${fileId}`); return { appended: 0, updated: 2 }; },
    listPending: async () => [{ fileId: 'f9', movement: m1 }],
  });
  state.setUp(ready([], 'f9'));
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['syncOutbox:f9', 'reload:f9', 'data']);
  assert.equal(count('fetch'), 0);
});

test('a pending change of a book that is not open is uploaded, without reading the open one again', async () => {
  const { state, log, queue } = setup({}, { outbox: [{ fileId: 'f2', movement: m3 }] });
  state.setUp({ ...ready([m1]), books: BOOKS });
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['syncOutbox:f2', 'data']);
  assert.deepEqual(queue, []);
  assert.equal(state.fileId, 'f1');
  assert.equal(state.pendingCount, 0);
});

test('pending changes in several books: each book is uploaded once, the open one read again once', async () => {
  const { state, log, count, queue } = setup({}, {
    outbox: [
      { fileId: 'f2', movement: m3 },
      { fileId: 'f1', movement: m2 },
      { fileId: 'f2', movement: { ...m1, id: 'm4' } },
      { fileId: 'f3', movement: { ...m1, id: 'm5' } },
    ],
  });
  state.setUp({ ...ready([m1]), books: BOOKS });
  log.length = 0;
  await state.sync();
  assert.equal(count('syncOutbox:f1'), 1);
  assert.equal(count('syncOutbox:f2'), 1);
  assert.equal(count('syncOutbox:f3'), 1);
  assert.equal(count('reload:f1'), 1);
  assert.equal(log.some((e) => e === 'reload:f2' || e === 'reload:f3'), false);
  assert.deepEqual(queue, []);
  assert.equal(log.at(-1), 'data');
});

test('sync with nothing pending makes no upload, no reload, and emits data', async () => {
  const { state, log, count } = setup();
  await state.refresh();
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['data']);
  assert.equal(count('reload:f1'), 0);
});

test('sync does nothing offline, with an expired token, or without a ready book', async () => {
  const outbox = [{ fileId: 'f1', movement: m2 }];
  const offline = setup({ isOnline: () => false }, { outbox });
  offline.state.setUp(ready([]));
  offline.log.length = 0;
  await offline.state.sync();
  assert.deepEqual(offline.log, []);

  const expired = setup({ getAuthState: () => ({ hasSession: true, hasDriveAccess: true, tokenExpired: true }) }, { outbox });
  expired.state.setUp(ready([]));
  expired.log.length = 0;
  await expired.state.sync();
  assert.deepEqual(expired.log, []);

  const none = setup({}, { outbox });
  none.state.setUp({ status: 'none', fileId: 'f1', book: book([]) });
  none.log.length = 0;
  await none.state.sync();
  assert.deepEqual(none.log, []);
});

test('an expired token while reloading the book asks to re-decide the route', async () => {
  const { state, log, logged } = setup({
    reloadBook: async (fileId) => { log.push(`reload:${fileId}`); throw new TokenExpiredError(); },
  }, { outbox: [{ fileId: 'f1', movement: m2 }] });
  state.setUp(ready([m1]));
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['syncOutbox:f1', 'reload:f1', 'route']);
  assert.deepEqual(logged, []);
  assert.equal(state.status, 'ready', 'the book in memory is kept');
});

test('a sync error that is not the token logs only its name and status', async () => {
  const { state, logged } = setup({
    syncOutbox: async () => { throw Object.assign(new Error('boom'), { name: 'ApiError', status: 500 }); },
  }, { outbox: [{ fileId: 'f1', movement: m2 }] });
  await state.refresh();
  assert.deepEqual(logged, [{ type: 'error', result: 'sync:ApiError:500' }]);
  // Nothing of the movement leaks into the log.
  assert.doesNotMatch(JSON.stringify(logged), /m2|100|income/);
});

test('a book that fails to upload is logged and the other books are still uploaded', async () => {
  const { state, log, logged, queue, count } = setup({
    syncOutbox: async (fileId) => {
      log.push(`syncOutbox:${fileId}`);
      if (fileId === 'f2') throw Object.assign(new Error('boom'), { name: 'ApiError', status: 500 });
      const mine = queue.filter((item) => item.fileId === fileId);
      for (const item of mine) queue.splice(queue.indexOf(item), 1);
      return { appended: mine.length, updated: 0 };
    },
  }, {
    outbox: [
      { fileId: 'f2', movement: m3 },
      { fileId: 'f1', movement: m2 },
      { fileId: 'f3', movement: { ...m1, id: 'm5' } },
    ],
  });
  state.setUp({ ...ready([m1]), books: BOOKS });
  log.length = 0;
  await state.sync();
  assert.deepEqual(log.filter((e) => e.startsWith('syncOutbox:')), ['syncOutbox:f2', 'syncOutbox:f1', 'syncOutbox:f3']);
  assert.deepEqual(logged, [{ type: 'error', result: 'sync:ApiError:500' }]);
  assert.doesNotMatch(JSON.stringify(logged), /m3|0\.01/);
  assert.deepEqual(queue.map((item) => item.fileId), ['f2'], 'only the failed book keeps its pending');
  assert.equal(count('reload:f1'), 1, 'the open book changed: read again');
  assert.equal(log.at(-1), 'data');
});

test('when the open book fails to upload, its pending stay and it is not read again', async () => {
  const { state, log, logged, count } = setup({
    syncOutbox: async (fileId) => {
      log.push(`syncOutbox:${fileId}`);
      if (fileId === 'f1') throw Object.assign(new Error('x'), { name: 'ApiError', status: 503 });
      return { appended: 1, updated: 0 };
    },
  }, { outbox: [{ fileId: 'f1', movement: m2 }, { fileId: 'f2', movement: m3 }] });
  state.setUp({ ...ready([m1]), books: BOOKS });
  log.length = 0;
  await state.sync();
  assert.equal(count('syncOutbox:f2'), 1);
  assert.equal(count('reload:f1'), 0);
  assert.equal(state.pendingCount, 1);
  assert.deepEqual(logged, [{ type: 'error', result: 'sync:ApiError:503' }]);
  assert.equal(log.at(-1), 'data');
});

test('an expired token while uploading one book stops the others, emits route and logs nothing', async () => {
  const { state, log, logged } = setup({
    syncOutbox: async (fileId) => { log.push(`syncOutbox:${fileId}`); throw new TokenExpiredError(); },
  }, { outbox: [{ fileId: 'f2', movement: m3 }, { fileId: 'f1', movement: m2 }] });
  state.setUp({ ...ready([m1]), books: BOOKS });
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['syncOutbox:f2', 'route']);
  assert.deepEqual(logged, []);
});

test('an expired token during sync re-decides the route and logs nothing', async () => {
  const { state, log, logged } = setup({
    syncOutbox: async () => { throw new TokenExpiredError(); },
  }, { outbox: [{ fileId: 'f2', movement: m2 }] });
  await state.refresh();
  assert.equal(log.at(-1), 'route');
  assert.deepEqual(logged, []);
});

test('reloadBook without a file id calls nothing', async () => {
  const { state, log } = setup();
  await state.reloadBook();
  assert.deepEqual(log, []);
  state.setUp({ status: 'none', fileId: null });
  log.length = 0;
  await state.reloadBook();
  assert.deepEqual(log, []);
});

// --- saved ---

test('saved counts the movement at once and starts the upload of its book', async () => {
  const { state, log, queue } = setup();
  state.setUp(ready([]));
  log.length = 0;
  // What movements.js writes to the outbox before the form calls saved().
  queue.push({ fileId: 'f1', movement: m2 });
  state.saved(m2);
  assert.equal(state.pendingCount, 1);
  assert.deepEqual(state.book.movements, [m2]);
  await tick();
  await tick();
  assert.ok(log.includes('syncOutbox:f1'));
});

test('saved takes both halves of a transfer and keeps one version per id', () => {
  const { state } = setup({ isOnline: () => false });
  state.setUp(ready([]));
  const out = { id: 't1', amount: 50 };
  const into = { id: 't2', amount: 50 };
  state.saved([out, into]);
  state.saved({ ...out, amount: 60 });
  assert.equal(state.pendingCount, 2);
});

// --- switchBook ---

test('switching books shows the device copy at once, with the pending of the new book only', async () => {
  const copyF2 = ready([m3], 'f2');
  const { state, log } = setup({ isOnline: () => false }, {
    copies: { f2: copyF2 },
    outbox: [
      { fileId: 'f1', movement: m1 },
      { fileId: 'f2', movement: m2 },
    ],
  });
  state.setUp({ ...ready([]), books: BOOKS });
  log.length = 0;
  let atRoute = null;
  state.on((event) => {
    if (event === 'route' && !atRoute) atRoute = { fileId: state.fileId, ids: state.book.movements.map((m) => m.id), pending: state.pendingCount };
  });
  await state.switchBook('f2');
  assert.deepEqual(atRoute, { fileId: 'f2', ids: ['m3', 'm2'], pending: 1 });
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.savedBook, copyF2.book);
  assert.deepEqual(state.bookInfo, BOOKS[1]);
  assert.deepEqual(log, ['open:f2', 'route', 'route'], 'offline: no reload');
});

test('switching books online reads the new book from Drive after showing the copy', async () => {
  const { state, log } = setup({}, { copies: { f2: ready([m3], 'f2') } });
  state.setUp({ ...ready([]), books: BOOKS });
  log.length = 0;
  await state.switchBook('f2');
  assert.deepEqual(log, ['open:f2', 'route', 'reload:f2', 'data', 'route']);
  assert.equal(state.fileId, 'f2');
  assert.deepEqual(state.savedBook.movements, [m1, m2], 'the fresh read replaces the copy');
});

test('switching to a book without a device copy is unknown until Drive answers', async () => {
  const { state, log } = setup();
  state.setUp({ ...ready([]), books: BOOKS });
  log.length = 0;
  let atRoute = null;
  state.on((event) => { if (event === 'route' && !atRoute) atRoute = { status: state.status, fileId: state.fileId }; });
  await state.switchBook('f3');
  assert.deepEqual(atRoute, { status: 'unknown', fileId: 'f3' });
  assert.equal(state.status, 'ready');
  assert.equal(state.fileId, 'f3');
  assert.equal(log.includes('reload:f3'), true);
});

test('switching offline to a book without a copy stays unknown', async () => {
  const { state, log } = setup({ isOnline: () => false });
  state.setUp({ ...ready([]), books: BOOKS });
  await state.switchBook('f3');
  assert.equal(state.status, 'unknown');
  assert.equal(state.fileId, 'f3');
  assert.equal(log.includes('reload:f3'), false);
});

test('switching to the book already open does nothing', async () => {
  const { state, log } = setup();
  state.setUp({ ...ready([]), books: BOOKS });
  log.length = 0;
  await state.switchBook('f1');
  assert.deepEqual(log, []);
});

test('a reload result is ignored when another book was opened meanwhile', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const { state } = setup({
    reloadBook: async (fileId) => {
      if (fileId === 'f2') { await slow; return ready([m1], 'f2'); }
      return ready([m3], fileId);
    },
  }, { copies: { f2: ready([], 'f2'), f3: ready([], 'f3') } });
  state.setUp({ ...ready([]), books: BOOKS });
  const first = state.switchBook('f2');
  await tick();
  await state.switchBook('f3');
  assert.equal(state.fileId, 'f3');
  release();
  await first;
  assert.equal(state.fileId, 'f3');
  assert.deepEqual(state.savedBook.movements, [m3], 'the late f2 answer did not overwrite f3');
});

test('switching books while refresh reads Drive keeps the new book and takes only the new list', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const fetched = [...BOOKS, { fileId: 'f4', name: 'Nuevo', bookType: 'shared' }];
  const { state, log } = setup({
    cachedBooks: () => ({ ...ready([m1]), books: BOOKS }),
    fetchBooks: async () => { log.push('fetch'); await slow; return { ...ready([m1]), books: fetched }; },
  }, { copies: { f2: ready([m3], 'f2') } });
  const loading = state.refresh();
  await tick();
  await state.switchBook('f2');
  assert.equal(state.fileId, 'f2');
  release();
  await loading;
  assert.equal(state.fileId, 'f2', 'the late fetch of f1 does not reopen it');
  assert.deepEqual(state.savedBook.movements, [m1, m2], 'f2 as reloaded after the switch');
  assert.deepEqual(state.books, fetched, 'the list from Drive is applied');
  assert.equal(state.bookInfo.name, 'Casa do medio');
});

test('without a switch, a refresh that ends late still opens the book it read', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const { state } = setup({
    cachedBooks: () => ({ ...ready([], 'f1'), books: BOOKS }),
    fetchBooks: async () => { await slow; return { ...ready([m2], 'f3'), books: BOOKS }; },
  });
  const loading = state.refresh();
  await tick();
  release();
  await loading;
  assert.equal(state.fileId, 'f3');
  assert.deepEqual(state.savedBook.movements, [m2]);
});

test('an expired token while reading the new book re-decides the route and keeps the copy', async () => {
  const { state, log } = setup({
    reloadBook: async () => { throw new TokenExpiredError(); },
  }, { copies: { f2: ready([m3], 'f2') } });
  state.setUp({ ...ready([]), books: BOOKS });
  log.length = 0;
  await state.switchBook('f2');
  assert.deepEqual(log, ['open:f2', 'route', 'route', 'route']);
  assert.equal(state.fileId, 'f2');
  assert.deepEqual(state.savedBook.movements, [m3]);
});

// --- books, bookInfo, renamed, setUp, reset ---

test('bookInfo is the entry of the open book in the list, or null', () => {
  const { state } = setup();
  assert.equal(state.bookInfo, null);
  state.setUp({ ...ready([], 'f2'), books: BOOKS });
  assert.deepEqual(state.bookInfo, BOOKS[1]);
  state.setUp(ready([], 'not-listed'));
  assert.equal(state.bookInfo, null);
});

test('renamed replaces the list and emits data', () => {
  const { state, log } = setup();
  state.setUp({ ...ready([], 'f2'), books: BOOKS });
  log.length = 0;
  const list = BOOKS.map((b) => (b.fileId === 'f2' ? { ...b, name: 'Casa' } : b));
  state.renamed(list);
  assert.deepEqual(log, ['data']);
  assert.equal(state.books, list);
  assert.equal(state.bookInfo.name, 'Casa');
});

test('setUp stores the new book and emits route', () => {
  const { state, log } = setup();
  assert.equal(state.status, 'unknown');
  state.setUp(ready([], 'new'));
  assert.equal(state.status, 'ready');
  assert.equal(state.fileId, 'new');
  assert.deepEqual(log, ['route']);
});

test('setUp takes result.books when present and keeps the list otherwise', () => {
  const { state } = setup();
  state.setUp({ ...ready([], 'f1'), books: BOOKS });
  assert.deepEqual(state.books, BOOKS);
  state.setUp(ready([], 'f1'));
  assert.deepEqual(state.books, BOOKS, 'onboarding result without books keeps the list');
  const more = [...BOOKS, { fileId: 'f4', name: 'Nuevo', bookType: 'shared' }];
  state.setUp({ ...ready([], 'f4'), books: more });
  assert.deepEqual(state.books, more);
  assert.equal(state.bookInfo.name, 'Nuevo');
  assert.equal('books' in { ...state.savedBook }, false, 'the list is not mixed into the book');
});

test('reset forgets the book, the list and the pending movements', async () => {
  const { state } = setup({
    cachedBooks: () => ({ ...ready([m1]), books: BOOKS }),
    isOnline: () => false,
  }, { outbox: [{ fileId: 'f1', movement: m2 }] });
  await state.refresh();
  assert.equal(state.pendingCount, 1);
  assert.equal(state.books.length, 3);
  state.reset();
  assert.equal(state.status, 'unknown');
  assert.equal(state.pendingCount, 0);
  assert.equal(state.fileId, null);
  assert.deepEqual(state.books, []);
  assert.equal(state.bookInfo, null);
});

// --- reset during a Drive read (tarea 21) ---

test('a fetchBooks that resolves after reset changes nothing and emits no data', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const { state, log, count } = setup({
    fetchBooks: async () => { log.push('fetch'); await slow; return { ...ready([m1]), books: BOOKS }; },
  });
  const loading = state.refresh();
  await tick();
  state.reset();
  log.length = 0;
  release();
  await loading;
  assert.equal(state.status, 'unknown');
  assert.equal(state.fileId, null);
  assert.deepEqual(state.books, []);
  assert.equal(count('data'), 0);
  assert.equal(count('syncOutbox:f1'), 0, 'nothing of the old session is uploaded');
});

test('a fetchBooks that fails after reset emits neither loadFailed nor route', async () => {
  let fail;
  const slow = new Promise((_, reject) => { fail = reject; });
  const { state, log } = setup({ fetchBooks: async () => { await slow; } });
  const loading = state.refresh();
  await tick();
  state.reset();
  log.length = 0;
  fail(new Error('network'));
  await loading;
  assert.deepEqual(log, []);
});

test('a refresh right after reset is not blocked by the stale read', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const { state, log } = setup({
    fetchBooks: async () => {
      calls += 1;
      log.push(`fetch${calls}`);
      if (calls === 1) { await slow; return { ...ready([m1], 'f1'), books: BOOKS }; }
      return { ...ready([m3], 'f2'), books: BOOKS.slice(1) };
    },
  });
  const first = state.refresh();
  await tick();
  state.reset();
  await state.refresh();
  assert.equal(calls, 2, 'the new session reads Drive at once');
  assert.equal(state.fileId, 'f2');
  // The stale read ends late: the new session keeps its book and list.
  release();
  await first;
  assert.equal(state.fileId, 'f2');
  assert.deepEqual(state.savedBook.movements, [m3]);
  assert.deepEqual(state.books, BOOKS.slice(1));
});

test('after the stale read ends, a later refresh still reads Drive (its finally does not lock)', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  let hold;
  const { state } = setup({
    fetchBooks: async () => {
      calls += 1;
      const call = calls;
      if (call === 1) await slow;
      if (call === 2) await new Promise((resolve) => { hold = resolve; });
      return { ...ready([m1]), books: BOOKS };
    },
  });
  const first = state.refresh();
  await tick();
  state.reset();
  const second = state.refresh();
  await tick();
  // The stale read ends while the new one is still running: it must not free the new one's lock.
  release();
  await first;
  await state.refresh();
  assert.equal(calls, 2, 'a refresh while the new read runs does not start a third');
  hold();
  await second;
  await state.refresh();
  assert.equal(calls, 3);
});

// --- blockedCount: books that refuse the upload (tarea 21) ---

const refusing = (statusByFile) => async (fileId) => {
  const status = statusByFile[fileId];
  if (status) throw new ApiError(status, 'sheets.append');
  return { appended: 0, updated: 0 };
};

for (const status of [403, 404]) {
  test(`blockedCount counts the queued movements of a book that answers ${status}`, async () => {
    const { state, logged } = setup({ syncOutbox: refusing({ f2: status }) }, {
      outbox: [
        { fileId: 'f2', movement: m1 },
        { fileId: 'f2', movement: m3 },
        { fileId: 'f1', movement: m2 },
        { fileId: 'f3', movement: { ...m1, id: 'm5' } },
      ],
    });
    state.setUp({ ...ready([m1]), books: BOOKS });
    assert.equal(state.blockedCount, 0);
    await state.sync();
    assert.equal(state.blockedCount, 2);
    assert.equal(logged.length, 1);
    assert.match(logged[0].result, new RegExp(`^sync:\\w+:${status}$`));
    assert.doesNotMatch(JSON.stringify(logged), /m1|m3|12\.5|0\.01/);
  });
}

test('blockedCount adds up several refusing books', async () => {
  const { state } = setup({ syncOutbox: refusing({ f2: 403, f3: 404 }) }, {
    outbox: [
      { fileId: 'f2', movement: m1 },
      { fileId: 'f3', movement: m2 },
      { fileId: 'f3', movement: m3 },
    ],
  });
  state.setUp({ ...ready([m1]), books: BOOKS });
  await state.sync();
  assert.equal(state.blockedCount, 3);
});

test('a later successful sync of that book clears blockedCount', async () => {
  let status = 403;
  const { state } = setup({
    syncOutbox: async (fileId) => {
      if (status) throw new ApiError(status, 'sheets.batchGet');
      return { appended: 1, updated: 0 };
    },
  }, { outbox: [{ fileId: 'f2', movement: m1 }] });
  state.setUp({ ...ready([m1]), books: BOOKS });
  await state.sync();
  assert.equal(state.blockedCount, 1);
  status = 0;
  await state.sync();
  assert.equal(state.blockedCount, 0);
});

test('reset clears blockedCount', async () => {
  const { state } = setup({ syncOutbox: refusing({ f2: 404 }) }, { outbox: [{ fileId: 'f2', movement: m1 }] });
  state.setUp({ ...ready([m1]), books: BOOKS });
  await state.sync();
  assert.equal(state.blockedCount, 1);
  state.reset();
  assert.equal(state.blockedCount, 0);
});

test('other errors (400, 500, 503, network 0, not an ApiError) do not count as blocked', async () => {
  for (const error of [
    new ApiError(400, 'sheets.append'), new ApiError(500, 'sheets.append'),
    new ApiError(503, 'sheets.append'), new ApiError(0, 'sheets.append'),
    Object.assign(new Error('x'), { status: 403 }),
  ]) {
    const { state } = setup({ syncOutbox: async () => { throw error; } }, { outbox: [{ fileId: 'f2', movement: m1 }] });
    state.setUp({ ...ready([m1]), books: BOOKS });
    await state.sync();
    assert.equal(state.blockedCount, 0, `${error.name}:${error.status}`);
  }
});
