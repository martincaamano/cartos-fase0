// Outbox rules and the upload to the Sheet, with an in-memory queue and a
// faked Google API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, planSync, mergePending } from '../js/storage/outbox-logic.js';
import { configureSync, syncOutbox, queueMovement, queueTransfer } from '../js/data/sync.js';
import { ValidationError } from '../js/data/book.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi } from './helpers/fake-google.js';

const m = (id) => ({ id, accountId: 'acc-1', type: 'expense', amount: 1, date: '2026-10-25', categoryId: 'c', deleted: false });

test('a pending movement is not queued twice when saved again', () => {
  const queue = enqueue(enqueue([], m('a')), m('a'));
  assert.deepEqual(queue.map((x) => x.id), ['a']);
});

test('a movement already in the Sheet is not inserted again', () => {
  const { toAppend, done } = planSync([m('a'), m('b'), m('a')], ['b']);
  assert.deepEqual(toAppend.map((x) => x.id), ['a']);
  assert.deepEqual(done.map((x) => x.id), ['b']);
});

test('mergePending adds only the pending movements the book does not have', () => {
  const merged = mergePending([m('a')], [m('a'), m('b'), m('b')]);
  assert.deepEqual(merged.map((x) => x.id), ['a', 'b']);
});

function memoryOutbox(items) {
  const state = { items: [...items] };
  configureSync({
    list: async () => state.items,
    remove: async (ids) => { state.items = state.items.filter((i) => !ids.includes(i.movement.id)); },
  });
  return state;
}

function sheetWith(ids, { failAppend = false } = {}) {
  return setupGoogleApi((call) => {
    if (call.url.pathname.endsWith('values:batchGet')) {
      return { body: { valueRanges: [{ values: [['id'], ...ids.map((id) => [id])] }] } };
    }
    if (call.url.pathname.endsWith(':append')) return failAppend ? { status: 500 } : {};
    return {};
  });
}

test('sync appends what is missing in one call and empties the queue', async () => {
  const state = memoryOutbox([{ fileId: 'f1', movement: m('a') }, { fileId: 'f1', movement: m('b') }]);
  const calls = sheetWith(['b']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 1, pending: 0 });

  const appends = calls.filter((c) => c.url.pathname.endsWith(':append'));
  assert.equal(appends.length, 1);
  assert.equal(appends[0].url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(appends[0].body.values.map((row) => row[0]), ['a']);
  assert.equal(appends[0].body.values[0].length, HEADERS.Movements.length);
  assert.deepEqual(state.items, []);
});

test('retrying after a lost answer does not duplicate the row', async () => {
  memoryOutbox([{ fileId: 'f1', movement: m('a') }]);
  const calls = sheetWith(['a']);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, pending: 0 });
  assert.equal(calls.some((c) => c.url.pathname.endsWith(':append')), false);
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
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, pending: 0 });
  assert.equal(calls.length, 0);
});

test('two syncs at once share a single run', async () => {
  memoryOutbox([{ fileId: 'f1', movement: m('a') }]);
  const calls = sheetWith([]);
  await Promise.all([syncOutbox('f1'), syncOutbox('f1')]);
  assert.equal(calls.filter((c) => c.url.pathname.endsWith(':append')).length, 1);
});

test('queueMovement validates against the book and stores a valid movement', async () => {
  setupGoogleApi();
  const added = [];
  configureSync({ add: async (fileId, movements) => { for (const movement of movements) added.push({ fileId, movement }); }, list: async () => [], remove: async () => {} });
  const book = {
    accounts: [{ id: 'acc-1', deleted: false }],
    categories: [{ id: 'c', deleted: false }, { id: 'gone', deleted: true }],
  };
  const movement = await queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 12.5, date: '2026-10-25', categoryId: 'c' }, book);
  assert.equal(movement.createdBy, 'user-1');
  assert.deepEqual(added, [{ fileId: 'f1', movement }]);

  await assert.rejects(
    queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 0, date: '2026-10-25', categoryId: 'gone' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('amount_invalid') && err.errors.includes('category_unknown')
  );
  assert.equal(added.length, 1, 'an invalid movement is never queued');
});

// An in-memory outbox keyed by movement id, like the IndexedDB store.
function keyedOutbox() {
  const items = new Map();
  configureSync({
    add: async (fileId, movements) => { for (const movement of movements) items.set(movement.id, { fileId, movement }); },
    list: async () => [...items.values()],
    remove: async (ids) => { for (const id of ids) items.delete(id); },
  });
  return items;
}

const book = { accounts: [{ id: 'bank', deleted: false }, { id: 'cash', deleted: false }], categories: [] };
const transfer = { fromAccountId: 'bank', toAccountId: 'cash', amount: 50, date: '2026-10-25' };

test('both halves of a transfer travel to the Sheet in a single request', async () => {
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
  const items = keyedOutbox();
  const halves = await queueTransfer('f1', transfer, book);
  // Saving the same halves again keeps two entries in the queue.
  await saveAgain(items, halves);
  assert.equal(items.size, 2);

  // The first upload reached the Sheet but its answer was lost.
  const calls = sheetWith(halves.map((h) => h.id));
  await syncOutbox('f1');
  assert.equal(calls.some((c) => c.method === 'POST'), false);
  assert.equal(items.size, 0);
});

test('an invalid transfer is never queued', async () => {
  const items = keyedOutbox();
  await assert.rejects(
    queueTransfer('f1', { ...transfer, toAccountId: 'bank' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('same_account')
  );
  assert.equal(items.size, 0);
});

async function saveAgain(items, halves) {
  for (const half of halves) items.set(half.id, { fileId: 'f1', movement: half });
}
