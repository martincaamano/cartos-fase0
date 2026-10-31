// Saving to the outbox (js/data/movements.js): validation against the book,
// new movements, edits, logical deletes and both halves of a transfer.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueMovement,
  queueTransfer,
  queueEdit,
  queueTransferEdit,
  queueDelete,
  queueCrossBookTransfer,
  configureMovements,
} from '../js/data/movements.js';
import { ValidationError } from '../js/data/errors.js';
import { setupGoogleApi } from './helpers/fake-google.js';
import { memoryOutbox } from './helpers/memory-outbox.js';

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

let items;
beforeEach(() => {
  // A signed-in user (createdBy comes from the session); no call reaches Google.
  setupGoogleApi();
  items = memoryOutbox();
});

// --- queueMovement ---

test('queueMovement validates against the book and stores a valid movement', async () => {
  const book = {
    accounts: [{ id: 'acc-1', deleted: false }],
    categories: [{ id: 'c', deleted: false }, { id: 'gone', deleted: true }],
  };
  const movement = await queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 12.5, date: '2026-10-25', categoryId: 'c' }, book);
  assert.equal(movement.createdBy, 'user-1');
  assert.deepEqual([...items.values()], [{ fileId: 'f1', movement }]);

  await assert.rejects(
    queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 0, date: '2026-10-25', categoryId: 'gone' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('amount_invalid') && err.errors.includes('category_unknown')
  );
  assert.equal(items.size, 1, 'an invalid movement is never queued');
});

// --- queueTransfer ---

const book = { accounts: [{ id: 'bank', deleted: false }, { id: 'cash', deleted: false }], categories: [] };
const transfer = { fromAccountId: 'bank', toAccountId: 'cash', amount: 50, date: '2026-10-25' };

test('queueTransfer stores both halves together', async () => {
  const halves = await queueTransfer('f1', transfer, book);
  assert.equal(halves.length, 2);
  assert.deepEqual([...items.keys()].sort(), halves.map((h) => h.id).sort());
  for (const { fileId } of items.values()) assert.equal(fileId, 'f1');
});

test('an invalid transfer is never queued', async () => {
  await assert.rejects(
    queueTransfer('f1', { ...transfer, toAccountId: 'bank' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('same_account')
  );
  assert.equal(items.size, 0);
});

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
  const original = m('a', { categoryId: 'gone' });
  const edited = await queueEdit('f1', original, { accountId: 'acc-1', amount: 3, date: '2026-10-25', categoryId: 'gone' }, editBook);
  assert.equal(edited.categoryId, 'gone');
  assert.equal(items.size, 1);
});

test('queueEdit rejects a different deleted category', async () => {
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
  const edited = await queueTransferEdit('f1', savedHalves(), { fromAccountId: 'cash', toAccountId: 'bank', amount: 75.25, date: '2026-10-31' }, book);
  assert.deepEqual(edited.map((h) => h.id), ['t-1-out', 't-1-in']);
  assert.deepEqual(edited.map((h) => h.transferId), ['t-1', 't-1']);
  assert.deepEqual(edited.map((h) => h.accountId), ['cash', 'bank']);
  assert.deepEqual(edited.map((h) => h.amount), [75.25, 75.25]);
  assert.deepEqual(edited.map((h) => h.date), ['2026-10-31', '2026-10-31']);
  assert.deepEqual([...items.keys()].sort(), ['t-1-in', 't-1-out']);
});

test('queueTransferEdit rejects the same account on both sides and queues nothing', async () => {
  await assert.rejects(
    queueTransferEdit('f1', savedHalves(), { fromAccountId: 'bank', toAccountId: 'bank', amount: 10, date: '2026-10-25' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('same_account'),
  );
  assert.equal(items.size, 0);
});

// --- queueDelete ---

test('queueDelete marks one movement deleted and queues it', async () => {
  const [deleted] = await queueDelete('f1', [m('a')]);
  assert.equal(deleted.id, 'a');
  assert.equal(deleted.deleted, true);
  assert.notEqual(deleted.updatedAt, OLD);
  assert.equal(items.get('a').movement.deleted, true);
});

test('queueDelete of a transfer deletes both halves', async () => {
  const deleted = await queueDelete('f1', savedHalves());
  assert.deepEqual(deleted.map((h) => [h.id, h.deleted]), [['t-1-out', true], ['t-1-in', true]]);
  assert.equal(deleted[0].updatedAt, deleted[1].updatedAt);
  assert.equal(items.size, 2);
  for (const { movement } of items.values()) assert.equal(movement.deleted, true);
});

test('saving to the outbox makes no call to Google', async () => {
  const calls = setupGoogleApi();
  await queueEdit('f1', m('a', { accountId: 'bank' }), { accountId: 'cash', amount: 2, date: '2026-10-25', categoryId: 'c' }, book);
  await queueTransfer('f1', transfer, book);
  await queueDelete('f1', [m('a')]);
  assert.equal(calls.length, 0);
});

// --- queueCrossBookTransfer ---

const myBook = {
  accounts: [{ id: 'my-bank', deleted: false }, { id: 'my-old', deleted: true }],
  categories: [{ id: 'cat-house', deleted: false }, { id: 'cat-gone', deleted: true }],
};
const houseBook = {
  accounts: [{ id: 'house-bank', deleted: false }],
  categories: [{ id: 'cat-contribution', deleted: false }],
};
const here = { fileId: 'file-mine', book: myBook };
const there = { fileId: 'file-house', book: houseBook };
const cross = {
  fromAccountId: 'my-bank', toAccountId: 'house-bank', amount: 300, date: '2026-10-31',
  note: 'aportación', expenseCategoryId: 'cat-house', incomeCategoryId: 'cat-contribution',
};

function recordingStore() {
  const calls = [];
  configureMovements({ add: async (fileId, movements) => { calls.push({ fileId, movements }); } });
  return calls;
}

async function rejectsWith(fields, expected, sides = [here, there]) {
  const calls = recordingStore();
  await assert.rejects(
    queueCrossBookTransfer(sides[0], sides[1], fields),
    (err) => {
      assert.ok(err instanceof ValidationError);
      assert.deepEqual([...err.errors].sort(), [...expected].sort());
      return true;
    }
  );
  assert.equal(calls.length, 0, 'nothing is written when invalid');
}

test('queueCrossBookTransfer adds the outgoing half here and the incoming half there, in that order', async () => {
  const calls = recordingStore();
  const halves = await queueCrossBookTransfer(here, there, cross);
  const [out, inc] = halves;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].fileId, 'file-mine');
  assert.deepEqual(calls[0].movements, [out]);
  assert.equal(calls[1].fileId, 'file-house');
  assert.deepEqual(calls[1].movements, [inc]);
  assert.deepEqual([out.accountId, out.type, out.categoryId], ['my-bank', 'expense', 'cat-house']);
  assert.deepEqual([inc.accountId, inc.type, inc.categoryId], ['house-bank', 'income', 'cat-contribution']);
  for (const half of halves) {
    assert.equal(half.amount, 300);
    assert.equal(half.transferId, '');
    assert.equal(half.createdBy, 'user-1');
  }
  assert.notEqual(out.id, inc.id);
});

test('queueCrossBookTransfer accepts one cent and a large amount', async () => {
  for (const amount of [0.01, 999999999.99]) {
    const calls = recordingStore();
    const halves = await queueCrossBookTransfer(here, there, { ...cross, amount });
    assert.deepEqual(halves.map((h) => h.amount), [amount, amount]);
    assert.equal(calls.length, 2);
  }
});

test('queueCrossBookTransfer reports a shared error code once', async () => {
  await rejectsWith({ ...cross, amount: 0 }, ['amount_invalid']);
  await rejectsWith({ ...cross, amount: -5 }, ['amount_invalid']);
  await rejectsWith({ ...cross, amount: 1.005 }, ['amount_invalid']);
  await rejectsWith({ ...cross, date: '2026-02-29' }, ['date_invalid']);
  await rejectsWith({ ...cross, amount: '300', date: '2026-10-31T00:00' }, ['amount_invalid', 'date_invalid']);
});

test('queueCrossBookTransfer returns the union of the codes of both halves', async () => {
  await rejectsWith({ ...cross, fromAccountId: 'nope', incomeCategoryId: 'nope' }, ['account_unknown', 'category_unknown']);
  await rejectsWith({ ...cross, fromAccountId: 'nope', toAccountId: 'nope' }, ['account_unknown']);
});

test('queueCrossBookTransfer rejects accounts and categories of the other book on the wrong side', async () => {
  await rejectsWith({ ...cross, fromAccountId: 'house-bank' }, ['account_unknown']);
  await rejectsWith({ ...cross, toAccountId: 'my-bank' }, ['account_unknown']);
  await rejectsWith({ ...cross, expenseCategoryId: 'cat-contribution' }, ['category_unknown']);
  await rejectsWith({ ...cross, incomeCategoryId: 'cat-house' }, ['category_unknown']);
  // here and there swapped: every id is now on the wrong side.
  await rejectsWith(cross, ['account_unknown', 'category_unknown'], [there, here]);
});

test('queueCrossBookTransfer rejects deleted accounts and categories', async () => {
  await rejectsWith({ ...cross, fromAccountId: 'my-old' }, ['account_unknown']);
  await rejectsWith({ ...cross, expenseCategoryId: 'cat-gone' }, ['category_unknown']);
});

test('queueCrossBookTransfer makes no call to Google', async () => {
  const google = setupGoogleApi();
  recordingStore();
  await queueCrossBookTransfer(here, there, cross);
  assert.equal(google.length, 0);
});

// --- the signed-in sub goes with every save (tarea 21) ---

// A store that records add and addAcross with every argument.
function subStore() {
  const adds = [];
  const across = [];
  configureMovements({
    add: async (fileId, movements, sub) => { adds.push({ fileId, movements, sub }); },
    addAcross: async (items, sub) => { across.push({ items, sub }); },
  });
  return { adds, across };
}

test('every save passes the signed-in sub to store.add', async () => {
  const { adds, across } = subStore();
  const shop = { accounts: [{ id: 'acc-1', deleted: false }], categories: [{ id: 'c', deleted: false }] };
  const created = await queueMovement('f1', { accountId: 'acc-1', type: 'expense', amount: 0.01, date: '2026-10-31', categoryId: 'c' }, shop);
  await queueEdit('f1', created, { accountId: 'acc-1', amount: 2, date: '2026-10-31', categoryId: 'c' }, shop);
  const halves = await queueTransfer('f1', transfer, book);
  await queueTransferEdit('f1', halves, { ...transfer, amount: 60 }, book);
  await queueDelete('f1', [created]);
  await queueDelete('f1', halves);
  assert.equal(adds.length, 6);
  // helpers/fake-google.js signs in user-1.
  for (const call of adds) {
    assert.equal(call.sub, 'user-1');
    assert.equal(call.fileId, 'f1');
  }
  assert.deepEqual(adds.map((call) => call.movements.length), [1, 1, 2, 2, 1, 2]);
  assert.equal(across.length, 0, 'saves in one book do not use addAcross');
});

test('queueCrossBookTransfer calls addAcross once with both halves and the sub', async () => {
  const { adds, across } = subStore();
  const [out, inc] = await queueCrossBookTransfer(here, there, cross);
  assert.equal(adds.length, 0, 'add is not used');
  assert.equal(across.length, 1);
  assert.deepEqual(across[0].items, [
    { fileId: 'file-mine', movement: out },
    { fileId: 'file-house', movement: inc },
  ]);
  assert.equal(across[0].sub, 'user-1');
});

test('queueCrossBookTransfer invalid: addAcross is never called', async () => {
  const { across } = subStore();
  await assert.rejects(queueCrossBookTransfer(here, there, { ...cross, amount: 0 }), ValidationError);
  assert.equal(across.length, 0);
});

test('configureMovements with only add: addAcross falls back to add per book, with the sub', async () => {
  const calls = [];
  configureMovements({ add: async (fileId, movements, sub) => { calls.push({ fileId, movements, sub }); } });
  const [out, inc] = await queueCrossBookTransfer(here, there, cross);
  assert.deepEqual(calls, [
    { fileId: 'file-mine', movements: [out], sub: 'user-1' },
    { fileId: 'file-house', movements: [inc], sub: 'user-1' },
  ]);
});
