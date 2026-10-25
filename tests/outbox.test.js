// Outbox rules and the upload to the Sheet, with an in-memory queue and a
// faked Google API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, planSync, mergePending } from '../js/storage/outbox-logic.js';
import {
  configureSync,
  syncOutbox,
  queueMovement,
  queueTransfer,
  queueEdit,
  queueTransferEdit,
  queueDelete,
} from '../js/data/sync.js';
import { ValidationError } from '../js/data/book.js';
import { HEADERS, toRow } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

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

test('planSync appends new ids and rewrites the row of ids already in the Sheet', () => {
  // existingIds[i] lives in row i + 2 (row 1 is the header).
  const { toAppend, toUpdate } = planSync([m('a'), m('b'), m('c')], ['x', 'b', 'y', 'c']);
  assert.deepEqual(toAppend.map((x) => x.id), ['a']);
  assert.deepEqual(toUpdate.map(({ movement, row }) => [movement.id, row]), [['b', 3], ['c', 5]]);
});

test('planSync: the first data row is row 2', () => {
  const { toAppend, toUpdate } = planSync([m('a')], ['a']);
  assert.deepEqual(toAppend, []);
  assert.equal(toUpdate[0].row, 2);
});

test('planSync keeps the last version when an id repeats in the queue', () => {
  const v1 = m('a', { amount: 1 });
  const v2 = m('a', { amount: 2 });
  const fresh = planSync([v1, v2], []);
  assert.deepEqual(fresh.toAppend, [v2]);
  const existing = planSync([v1, v2], ['a']);
  assert.deepEqual(existing.toUpdate, [{ movement: v2, row: 2 }]);
  assert.deepEqual(existing.toAppend, []);
});

test('planSync on an empty queue plans nothing', () => {
  assert.deepEqual(planSync([], ['a', 'b']), { toAppend: [], toUpdate: [] });
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

// An in-memory outbox keyed by movement id, like the IndexedDB store.
function keyedOutbox() {
  const items = new Map();
  configureSync({
    add: async (fileId, movements) => { for (const movement of movements) items.set(movement.id, { fileId, movement }); },
    list: async () => [...items.values()],
    remove: async (movements) => {
      for (const movement of movements) {
        if (items.get(movement.id)?.movement.updatedAt === movement.updatedAt) items.delete(movement.id);
      }
    },
  });
  return items;
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

// --- queueMovement / queueTransfer ---

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
  const calls = sheetWith(['other', ...halves.map((h) => h.id)]);
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 2, pending: 0 });
  assert.equal(calls.some(isAppend), false);
  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1, 'both halves in one request');
  assert.deepEqual(updates[0].body.data.map((d) => d.range), ['Movements!A3:M3', 'Movements!A4:M4']);
  assert.deepEqual(updates[0].body.data.map((d) => d.values[0][0]), halves.map((h) => h.id));
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

// --- queueEdit ---

const editBook = {
  accounts: [{ id: 'acc-1', deleted: false }, { id: 'acc-2', deleted: false }],
  categories: [
    { id: 'c', deleted: false },
    { id: 'gone', deleted: true },
    { id: 'old', deleted: true },
  ],
};

test('queueEdit keeps the id and stores the new version', async () => {
  const items = keyedOutbox();
  const original = m('a', { transferId: '' });
  const edited = await queueEdit('f1', original, { accountId: 'acc-2', amount: 0.01, date: '2026-10-31', categoryId: 'c', note: 'n' }, editBook);
  assert.equal(edited.id, 'a');
  assert.equal(edited.createdAt, OLD);
  assert.equal(edited.type, 'expense');
  assert.equal(edited.accountId, 'acc-2');
  assert.equal(edited.amount, 0.01);
  assert.notEqual(edited.updatedAt, OLD);
  assert.deepEqual([...items.keys()], ['a']);
  assert.equal(items.get('a').movement, edited);
});

test('queueEdit validates the fields and queues nothing when invalid', async () => {
  const items = keyedOutbox();
  await assert.rejects(
    queueEdit('f1', m('a'), { accountId: 'acc-1', amount: -5, date: '2026-02-30', categoryId: 'c' }, editBook),
    (err) => err instanceof ValidationError && err.errors.includes('amount_invalid') && err.errors.includes('date_invalid'),
  );
  await assert.rejects(
    queueEdit('f1', m('a'), { accountId: 'nope', amount: 5, date: '2026-10-25', categoryId: 'c' }, editBook),
    (err) => err instanceof ValidationError && err.errors.includes('account_unknown'),
  );
  assert.equal(items.size, 0);
});

test('queueEdit accepts the original category even if it was deleted', async () => {
  const items = keyedOutbox();
  const original = m('a', { categoryId: 'gone' });
  const edited = await queueEdit('f1', original, { accountId: 'acc-1', amount: 3, date: '2026-10-25', categoryId: 'gone' }, editBook);
  assert.equal(edited.categoryId, 'gone');
  assert.equal(items.size, 1);
});

test('queueEdit rejects a different deleted category', async () => {
  const items = keyedOutbox();
  const original = m('a', { categoryId: 'gone' });
  await assert.rejects(
    queueEdit('f1', original, { accountId: 'acc-1', amount: 3, date: '2026-10-25', categoryId: 'old' }, editBook),
    (err) => err instanceof ValidationError && err.errors.includes('category_unknown'),
  );
  assert.equal(items.size, 0);
});

// --- queueTransferEdit ---

const savedHalves = () => {
  const shared = { amount: 50, date: '2026-10-10', categoryId: 'transfer', transferId: 't-1' };
  return [
    m('t-1-out', { ...shared, accountId: 'bank', type: 'expense' }),
    m('t-1-in', { ...shared, accountId: 'cash', type: 'income' }),
  ];
};

test('queueTransferEdit changes and queues both halves, keeping their ids', async () => {
  const items = keyedOutbox();
  const edited = await queueTransferEdit('f1', savedHalves(), { fromAccountId: 'cash', toAccountId: 'bank', amount: 75.25, date: '2026-10-31' }, book);
  assert.deepEqual(edited.map((h) => h.id), ['t-1-out', 't-1-in']);
  assert.deepEqual(edited.map((h) => h.transferId), ['t-1', 't-1']);
  assert.deepEqual(edited.map((h) => h.accountId), ['cash', 'bank']);
  assert.deepEqual(edited.map((h) => h.amount), [75.25, 75.25]);
  assert.deepEqual(edited.map((h) => h.date), ['2026-10-31', '2026-10-31']);
  assert.deepEqual([...items.keys()].sort(), ['t-1-in', 't-1-out']);
});

test('queueTransferEdit rejects the same account on both sides and queues nothing', async () => {
  const items = keyedOutbox();
  await assert.rejects(
    queueTransferEdit('f1', savedHalves(), { fromAccountId: 'bank', toAccountId: 'bank', amount: 10, date: '2026-10-25' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('same_account'),
  );
  assert.equal(items.size, 0);
});

// --- queueDelete ---

test('queueDelete marks one movement deleted and queues it', async () => {
  const items = keyedOutbox();
  const [deleted] = await queueDelete('f1', [m('a')]);
  assert.equal(deleted.id, 'a');
  assert.equal(deleted.deleted, true);
  assert.notEqual(deleted.updatedAt, OLD);
  assert.equal(items.get('a').movement.deleted, true);
});

test('queueDelete of a transfer deletes both halves', async () => {
  const items = keyedOutbox();
  const deleted = await queueDelete('f1', savedHalves());
  assert.deepEqual(deleted.map((h) => [h.id, h.deleted]), [['t-1-out', true], ['t-1-in', true]]);
  assert.equal(deleted[0].updatedAt, deleted[1].updatedAt);
  assert.equal(items.size, 2);
  for (const { movement } of items.values()) assert.equal(movement.deleted, true);
});

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
