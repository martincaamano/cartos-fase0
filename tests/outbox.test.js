// Outbox rules and the upload to the Sheet (js/data/sync.js), with an
// in-memory queue and a faked Google API. Saving to the outbox is tested in
// movements.test.js; here js/data/movements.js only fills the shared queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, planSync, mergePending } from '../js/storage/outbox-logic.js';
import { configureSync, syncOutbox } from '../js/data/sync.js';
import { queueMovement, queueTransfer, queueEdit } from '../js/data/movements.js';
import { HEADERS, toRow, rowsById } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';
import { memoryOutbox as keyedOutbox } from './helpers/memory-outbox.js';

const OLD = '2026-10-01T08:00:00.000Z';

const m = (id, extra = {}) => ({
  id,
  accountId: 'acc-1',
  type: 'expense',
  amount: 1,
  date: '2026-10-25',
  categoryId: 'c',
  note: '',
  transferId: '',
  personId: '',
  createdBy: 'user-1',
  createdAt: OLD,
  updatedAt: OLD,
  deleted: false,
  ...extra,
});

const isAppend = (call) => call.url.pathname.endsWith(':append');
const isBatchUpdate = (call) => call.url.pathname.endsWith('values:batchUpdate');

// --- enqueue ---

test('a pending movement is not queued twice when saved again', () => {
  const queue = enqueue(enqueue([], m('a')), m('a'));
  assert.deepEqual(queue.map((x) => x.id), ['a']);
});

test('enqueue replaces the older version of the same id with the new one', () => {
  const queue = enqueue(enqueue(enqueue([], m('a', { amount: 1 })), m('b')), m('a', { amount: 2 }));
  assert.equal(queue.length, 2);
  assert.equal(queue.find((x) => x.id === 'a').amount, 2);
});

// --- planSync ---

// The id column as the Sheets API returns it: header first, then one id per row.
const sheetIds = (...ids) => rowsById([['id'], ...ids.map((id) => [id])]);

test('planSync appends new ids and rewrites the row of ids already in the Sheet', () => {
  // ids[i] lives in row i + 2 (row 1 is the header).
  const { toAppend, toUpdate } = planSync([m('a'), m('b'), m('c')], sheetIds('x', 'b', 'y', 'c'));
  assert.deepEqual(toAppend.map((x) => x.id), ['a']);
  assert.deepEqual(toUpdate.map(({ movement, row }) => [movement.id, row]), [['b', 3], ['c', 5]]);
});

test('planSync: the first data row is row 2', () => {
  const { toAppend, toUpdate } = planSync([m('a')], sheetIds('a'));
  assert.deepEqual(toAppend, []);
  assert.equal(toUpdate[0].row, 2);
});

test('planSync uses the row number given in the map as is', () => {
  const { toUpdate } = planSync([m('a')], new Map([['a', 1000]]));
  assert.deepEqual(toUpdate.map(({ movement, row }) => [movement.id, row]), [['a', 1000]]);
});

test('planSync keeps the last version when an id repeats in the queue', () => {
  const v1 = m('a', { amount: 1 });
  const v2 = m('a', { amount: 2 });
  const fresh = planSync([v1, v2], new Map());
  assert.deepEqual(fresh.toAppend, [v2]);
  const existing = planSync([v1, v2], sheetIds('a'));
  assert.deepEqual(existing.toUpdate, [{ movement: v2, row: 2 }]);
  assert.deepEqual(existing.toAppend, []);
});

test('planSync on an empty queue plans nothing', () => {
  assert.deepEqual(planSync([], sheetIds('a', 'b')), { toAppend: [], toUpdate: [] });
});

// --- mergePending ---

test('mergePending adds only the pending movements the book does not have', () => {
  const merged = mergePending([m('a')], [m('a'), m('b'), m('b')]);
  assert.deepEqual(merged.map((x) => x.id), ['a', 'b']);
});

test('mergePending: the queued version replaces the book version', () => {
  const merged = mergePending([m('a', { amount: 1 }), m('z')], [m('a', { amount: 9, deleted: true })]);
  assert.deepEqual(merged.map((x) => x.id), ['a', 'z']);
  assert.equal(merged[0].amount, 9);
  assert.equal(merged[0].deleted, true);
});

// --- in-memory stores with the IndexedDB rule: remove only matching updatedAt ---

function memoryOutbox(items) {
  const state = { items: [...items] };
  configureSync({
    list: async () => state.items,
    remove: async (movements) => {
      state.items = state.items.filter(
        (i) => !movements.some((done) => done.id === i.movement.id && done.updatedAt === i.movement.updatedAt),
      );
    },
  });
  return state;
}

function sheetWith(ids, { failAppend = false, onRead = () => {} } = {}) {
  return setupGoogleApi((call) => {
    if (call.url.pathname.endsWith('values:batchGet')) {
      onRead();
      return { body: { valueRanges: [{ values: [['id'], ...ids.map((id) => [id])] }] } };
    }
    if (isAppend(call)) return failAppend ? { status: 500 } : {};
    return {};
  });
}

// --- syncOutbox ---

test('sync appends what is missing in one call and empties the queue', async () => {
  const state = memoryOutbox([{ fileId: 'f1', movement: m('a') }, { fileId: 'f1', movement: m('c') }]);
  const calls = sheetWith(['b']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 2, updated: 0, pending: 0 });

  const appends = calls.filter(isAppend);
  assert.equal(appends.length, 1);
  assert.equal(appends[0].url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(appends[0].body.values.map((row) => row[0]), ['a', 'c']);
  assert.equal(appends[0].body.values[0].length, HEADERS.Movements.length);
  assert.equal(calls.some(isBatchUpdate), false);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(state.items, []);
});

test('sync rewrites existing rows with batchUpdate and appends the new ones', async () => {
  const edited = m('b', { amount: 7.5, updatedAt: '2026-10-25T10:00:00.000Z' });
  const state = memoryOutbox([{ fileId: 'f1', movement: m('a') }, { fileId: 'f1', movement: edited }]);
  const calls = sheetWith(['x', 'b']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 1, updated: 1, pending: 0 });

  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].method, 'POST');
  assert.equal(updates[0].body.valueInputOption, 'RAW');
  assert.deepEqual(updates[0].body.data, [{ range: 'Movements!A3:M3', values: [toRow('Movements', edited)] }]);
  assert.equal(updates[0].body.data[0].values[0].length, HEADERS.Movements.length);

  const appends = calls.filter(isAppend);
  assert.equal(appends.length, 1);
  assert.deepEqual(appends[0].body.values.map((row) => row[0]), ['a']);
  assert.deepEqual(state.items, []);
});

test('retrying after a lost answer does not duplicate the row', async () => {
  const pending = m('a');
  const state = memoryOutbox([{ fileId: 'f1', movement: pending }]);
  const calls = sheetWith(['a']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 1, pending: 0 });
  assert.equal(calls.some(isAppend), false);
  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].body.data, [{ range: 'Movements!A2:M2', values: [toRow('Movements', pending)] }]);
  assert.deepEqual(state.items, []);
});

test('a failed upload leaves the queue untouched', async () => {
  const state = memoryOutbox([{ fileId: 'f1', movement: m('a') }]);
  sheetWith([], { failAppend: true });
  await assert.rejects(syncOutbox('f1'));
  assert.equal(state.items.length, 1);
});

test('other books and an empty queue make no calls', async () => {
  memoryOutbox([{ fileId: 'other', movement: m('a') }]);
  const calls = sheetWith([]);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 0, pending: 0 });
  assert.equal(calls.length, 0);
});

test('two syncs at once share a single run', async () => {
  memoryOutbox([{ fileId: 'f1', movement: m('a') }]);
  const calls = sheetWith([]);
  await Promise.all([syncOutbox('f1'), syncOutbox('f1')]);
  assert.equal(calls.filter(isAppend).length, 1);
});

test('an edit saved while a sync is running is not lost', async () => {
  const items = keyedOutbox();
  const original = m('a', { categoryId: 'c' });
  items.set('a', { fileId: 'f1', movement: original });
  const book = { accounts: [{ id: 'acc-1', deleted: false }], categories: [{ id: 'c', deleted: false }] };

  let editing;
  // The user saves an edit after the queue was read, before the upload ends.
  const calls = sheetWith([], {
    onRead: () => {
      editing = queueEdit('f1', original, { accountId: 'acc-1', amount: 99, date: '2026-10-25', categoryId: 'c' }, book);
    },
  });
  assert.deepEqual(await syncOutbox('f1'), { appended: 1, updated: 0, pending: 0 });
  const edited = await editing;

  assert.deepEqual(calls.filter(isAppend)[0].body.values.map((row) => row[3]), [1], 'the old version was uploaded');
  assert.equal(items.size, 1, 'the newer version stays queued');
  assert.equal(items.get('a').movement, edited);
  assert.equal(items.get('a').movement.amount, 99);

  // The next sync rewrites the row it just appended.
  const next = sheetWith(['a']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 1, pending: 0 });
  assert.equal(next.some(isAppend), false);
  assert.equal(items.size, 0);
});

// --- saved with js/data/movements.js, then uploaded ---

const book = { accounts: [{ id: 'bank', deleted: false }, { id: 'cash', deleted: false }], categories: [] };
const transfer = { fromAccountId: 'bank', toAccountId: 'cash', amount: 50, date: '2026-10-25' };

test('both halves of a transfer travel to the Sheet in a single request', async () => {
  setupGoogleApi();
  const items = keyedOutbox();
  const halves = await queueTransfer('f1', transfer, book);
  assert.equal(items.size, 2);

  const calls = sheetWith([]);
  await syncOutbox('f1');
  const writes = calls.filter((c) => c.method === 'POST');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body.values.map((row) => row[0]), halves.map((h) => h.id));
  assert.equal(items.size, 0);
});

test('retrying the same transfer does not create four rows', async () => {
  setupGoogleApi();
  const items = keyedOutbox();
  const halves = await queueTransfer('f1', transfer, book);
  // Saving the same halves again keeps two entries in the queue.
  await saveAgain(items, halves);
  assert.equal(items.size, 2);

  // The first upload reached the Sheet but its answer was lost.
  const calls = sheetWith(['other', ...halves.map((h) => h.id)]);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 2, pending: 0 });
  assert.equal(calls.some(isAppend), false);
  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1, 'both halves in one request');
  assert.deepEqual(updates[0].body.data.map((d) => d.range), ['Movements!A3:M3', 'Movements!A4:M4']);
  assert.deepEqual(updates[0].body.data.map((d) => d.values[0][0]), halves.map((h) => h.id));
  assert.equal(items.size, 0);
});

async function saveAgain(items, halves) {
  for (const half of halves) items.set(half.id, { fileId: 'f1', movement: half });
}

// --- end to end ---

test('editing a movement that was never uploaded ends in a single append of the new version', async () => {
  setupGoogleApi();
  const items = keyedOutbox();
  const shopBook = { accounts: [{ id: 'acc-1', deleted: false }], categories: [{ id: 'c', deleted: false }] };
  const created = await queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 12.5, date: '2026-10-25', categoryId: 'c' }, shopBook);
  const edited = await queueEdit('f1', created, { accountId: 'acc-1', amount: 20, date: '2026-10-24', categoryId: 'c', note: 'fixed' }, shopBook);
  assert.equal(items.size, 1);

  const calls = sheetWith([]);
  assert.deepEqual(await syncOutbox('f1'), { appended: 1, updated: 0, pending: 0 });
  const appends = calls.filter(isAppend);
  assert.equal(appends.length, 1);
  assert.deepEqual(appends[0].body.values, [toRow('Movements', edited)]);
  assert.equal(appends[0].body.values[0][0], created.id);
  assert.equal(calls.some(isBatchUpdate), false);
  assert.equal(items.size, 0);
});
