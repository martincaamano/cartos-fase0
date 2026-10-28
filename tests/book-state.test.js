import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBookState } from '../js/book-state.js';
import { TokenExpiredError } from '../js/data/auth.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

const m1 = { id: 'm1', date: '2026-10-01', amount: 12.5, type: 'expense' };
const m2 = { id: 'm2', date: '2026-10-02', amount: 100, type: 'income' };
const book = (movements = [m1]) => ({ accounts: [{ id: 'a1' }], movements });
const ready = (movements, fileId = 'f1') => ({ status: 'ready', fileId, book: book(movements) });

// Fake deps that write every call and every event into one log, in order.
function setup(overrides = {}) {
  const log = [];
  const logged = [];
  const deps = {
    cachedPersonalBook: () => { log.push('cached'); return null; },
    fetchPersonalBook: async () => { log.push('fetch'); return ready([m1]); },
    reloadPersonalBook: async (fileId) => { log.push(`reload:${fileId}`); return ready([m1, m2], fileId); },
    syncOutbox: async (fileId) => { log.push(`syncOutbox:${fileId}`); return { appended: 0, updated: 0 }; },
    listPending: async () => [],
    getAuthState: () => ({ hasSession: true, hasDriveAccess: true, tokenExpired: false }),
    isOnline: () => true,
    logEvent: (event) => logged.push(event),
    ...overrides,
  };
  const state = createBookState(deps);
  state.on((event) => log.push(event));
  const count = (entry) => log.filter((item) => item === entry).length;
  return { state, log, logged, count };
}

test('refresh paints from the device copy, then reads Drive and emits data', async () => {
  const { state, log } = setup({
    cachedPersonalBook: () => { log.push('cached'); return ready([m1]); },
  });
  await state.refresh();
  assert.equal(state.status, 'ready');
  assert.equal(state.fileId, 'f1');
  // 'route' goes out before Drive is read, so the copy is on screen at once.
  assert.deepEqual(log.slice(0, 4), ['cached', 'route', 'fetch', 'data']);
  assert.ok(log.includes('syncOutbox:f1'));
});

test('book merges the pending movements of the same file only; pendingCount counts them', async () => {
  const edited = { ...m1, amount: 0.01 };
  const { state } = setup({
    fetchPersonalBook: async () => ready([m1]),
    listPending: async () => [
      { fileId: 'f1', movement: edited },
      { fileId: 'f1', movement: m2 },
      { fileId: 'other', movement: { id: 'm3', amount: 999999.99 } },
    ],
  });
  await state.refresh();
  assert.equal(state.pendingCount, 2);
  assert.deepEqual(state.book.movements, [edited, m2]);
  assert.deepEqual(state.book.accounts, [{ id: 'a1' }]);
  // savedBook is the Sheet as read, without pending changes.
  assert.deepEqual(state.savedBook.movements, [m1]);
});

test('sync that uploaded something reads the book again by its file, without searching Drive', async () => {
  const { state, log, count } = setup({
    syncOutbox: async () => ({ appended: 1, updated: 0 }),
  });
  await state.refresh();
  assert.equal(count('fetch'), 1, 'only the first read searches Drive');
  assert.equal(count('reload:f1'), 1);
  assert.equal(count('data'), 2);
  assert.ok(log.indexOf('reload:f1') > log.indexOf('fetch'));
  assert.equal(log.at(-1), 'data');
  assert.deepEqual(state.savedBook.movements, [m1, m2]);
});

test('an updated row alone also reads the book again by its file', async () => {
  const { state, log, count } = setup({ syncOutbox: async () => ({ appended: 0, updated: 2 }) });
  state.setUp(ready([], 'f9'));
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['reload:f9', 'data']);
  assert.equal(count('fetch'), 0);
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

test('refresh still searches Drive with fetchPersonalBook', async () => {
  const { state, count } = setup();
  await state.refresh();
  assert.equal(count('fetch'), 1);
  assert.equal(count('reload:f1'), 0);
});

test('an expired token while reloading the book asks to re-decide the route', async () => {
  const { state, log, logged } = setup({
    syncOutbox: async () => ({ appended: 1, updated: 0 }),
    reloadPersonalBook: async (fileId) => { log.push(`reload:${fileId}`); throw new TokenExpiredError(); },
  });
  state.setUp(ready([m1]));
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['reload:f1', 'route']);
  assert.deepEqual(logged, []);
  assert.equal(state.status, 'ready', 'the book in memory is kept');
});

test('sync with nothing to upload does not read the book again and emits data', async () => {
  const { state, log, count } = setup();
  await state.refresh();
  assert.equal(count('fetch'), 1);
  assert.equal(log.at(-1), 'data');
  log.length = 0;
  await state.sync();
  assert.deepEqual(log, ['syncOutbox:f1', 'data']);
});

test('an expired token while reading Drive asks to re-decide the route', async () => {
  const { state, log } = setup({
    fetchPersonalBook: async () => { log.push('fetch'); throw new TokenExpiredError(); },
  });
  await state.refresh();
  assert.deepEqual(log, ['cached', 'route', 'fetch', 'route']);
  assert.ok(!log.includes('loadFailed'));
});

test('a failed load without a device copy emits loadFailed', async () => {
  const { state, log } = setup({
    fetchPersonalBook: async () => { log.push('fetch'); throw new Error('network'); },
  });
  await state.refresh();
  assert.notEqual(state.status, 'ready');
  assert.equal(log.at(-1), 'loadFailed');
});

test('a failed load with a device copy keeps it and does not emit loadFailed', async () => {
  const { state, log } = setup({
    cachedPersonalBook: () => ready([m1]),
    fetchPersonalBook: async () => { throw new Error('network'); },
  });
  await state.refresh();
  assert.equal(state.status, 'ready');
  assert.ok(!log.includes('loadFailed'));
  assert.deepEqual(state.book.movements, [m1]);
});

test('a sync error that is not the token logs only its name and status', async () => {
  const { state, logged } = setup({
    syncOutbox: async () => { throw Object.assign(new Error('boom'), { name: 'ApiError', status: 500 }); },
    listPending: async () => [{ fileId: 'f1', movement: m2 }],
  });
  await state.refresh();
  assert.deepEqual(logged, [{ type: 'error', result: 'sync:ApiError:500' }]);
  // Nothing of the movement leaks into the log.
  assert.doesNotMatch(JSON.stringify(logged), /m2|100|income/);
});

test('an expired token during sync re-decides the route and logs nothing', async () => {
  const { state, log, logged } = setup({
    syncOutbox: async () => { throw new TokenExpiredError(); },
  });
  await state.refresh();
  assert.equal(log.at(-1), 'route');
  assert.deepEqual(logged, []);
});

test('offline, refresh uses the device copy and does not read Drive', async () => {
  const { state, log, count } = setup({
    cachedPersonalBook: () => ready([m1]),
    isOnline: () => false,
  });
  await state.refresh();
  assert.equal(state.status, 'ready');
  assert.equal(count('fetch'), 0);
  assert.deepEqual(log, ['route']);
});

test('saved counts the movement at once and starts the upload', async () => {
  const { state, log } = setup();
  state.setUp(ready([]));
  log.length = 0;
  state.saved(m2);
  assert.equal(state.pendingCount, 1);
  assert.deepEqual(state.book.movements, [m2]);
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

test('reset forgets the book and the pending movements', async () => {
  const { state } = setup({
    cachedPersonalBook: () => ready([m1]),
    listPending: async () => [{ fileId: 'f1', movement: m2 }],
    isOnline: () => false,
  });
  await state.refresh();
  assert.equal(state.pendingCount, 1);
  state.reset();
  assert.equal(state.status, 'unknown');
  assert.equal(state.pendingCount, 0);
  assert.equal(state.fileId, null);
});

test('setUp stores the new book and emits route', () => {
  const { state, log } = setup();
  assert.equal(state.status, 'unknown');
  state.setUp(ready([], 'new'));
  assert.equal(state.status, 'ready');
  assert.equal(state.fileId, 'new');
  assert.deepEqual(log, ['route']);
});
