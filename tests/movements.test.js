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
