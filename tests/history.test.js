import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyEntries, findEntry } from '../js/domain/history.js';
import { editMovement, markDeleted } from '../js/domain/movement.js';
import { editTransfer, deleteTransfer } from '../js/domain/transfer.js';
import { accountBalance } from '../js/domain/balance.js';

// Fixture builder: a saved movement with every column.
const mov = (id, extra = {}) => ({
  id,
  accountId: 'acc-1',
  type: 'expense',
  amount: 10,
  date: '2026-10-15',
  categoryId: 'cat-food',
  note: '',
  transferId: '',
  personId: '',
  createdBy: 'user-1',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  deleted: false,
  ...extra,
});

// Both halves of a saved transfer.
const transferHalves = (transferId, { from = 'acc-1', to = 'acc-2', amount = 50, date = '2026-10-10', createdAt } = {}) => {
  const shared = { amount, date, categoryId: 'transfer', transferId, createdAt: createdAt ?? `${date}T09:00:00.000Z` };
  return [
    mov(`${transferId}-out`, { ...shared, accountId: from, type: 'expense' }),
    mov(`${transferId}-in`, { ...shared, accountId: to, type: 'income' }),
  ];
};

const ids = (entries) => entries.map((entry) => entry.id);

const book = () => [
  mov('m-food-1', { date: '2026-10-01', categoryId: 'cat-food', accountId: 'acc-1' }),
  mov('m-food-2', { date: '2026-10-20', categoryId: 'cat-food', accountId: 'acc-2' }),
  mov('m-salary', { date: '2026-10-31', categoryId: 'cat-salary', type: 'income', amount: 2000, accountId: 'acc-1' }),
  mov('m-nov', { date: '2026-11-01', categoryId: 'cat-food', accountId: 'acc-1' }),
  mov('m-sep', { date: '2026-09-30', categoryId: 'cat-salary', accountId: 'acc-3' }),
  ...transferHalves('t-1', { from: 'acc-1', to: 'acc-2', date: '2026-10-10' }),
];

// --- historyEntries: filters ---

test('historyEntries without filters lists every active entry, newest first', () => {
  assert.deepEqual(ids(historyEntries(book())), ['m-nov', 'm-salary', 'm-food-2', 't-1', 'm-food-1', 'm-sep']);
});

test('historyEntries with empty filter values behaves as no filter', () => {
  const all = ids(historyEntries(book()));
  assert.deepEqual(ids(historyEntries(book(), { accountId: '', categoryId: '', from: '', to: '' })), all);
  assert.deepEqual(ids(historyEntries(book(), {})), all);
});

test('historyEntries on an empty list returns an empty list', () => {
  assert.deepEqual(historyEntries([]), []);
  assert.deepEqual(historyEntries([], { accountId: 'acc-1' }), []);
});

test('historyEntries filters by account; a transfer matches either half', () => {
  assert.deepEqual(ids(historyEntries(book(), { accountId: 'acc-1' })), ['m-nov', 'm-salary', 't-1', 'm-food-1']);
  assert.deepEqual(ids(historyEntries(book(), { accountId: 'acc-2' })), ['m-food-2', 't-1']);
  assert.deepEqual(ids(historyEntries(book(), { accountId: 'acc-3' })), ['m-sep']);
});

test('historyEntries with an unknown account returns nothing', () => {
  assert.deepEqual(historyEntries(book(), { accountId: 'acc-missing' }), []);
});

test('historyEntries filters by category', () => {
  assert.deepEqual(ids(historyEntries(book(), { categoryId: 'cat-food' })), ['m-nov', 'm-food-2', 'm-food-1']);
  assert.deepEqual(ids(historyEntries(book(), { categoryId: 'cat-salary' })), ['m-salary', 'm-sep']);
});

test('historyEntries category filter "transfer" returns the transfer as one entry', () => {
  const entries = historyEntries(book(), { categoryId: 'transfer' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'transfer');
  assert.equal(entries[0].id, 't-1');
});

test('historyEntries date range includes both ends (month end and next month start)', () => {
  // 2026-10-01 and 2026-10-31 are inside; 2026-09-30 and 2026-11-01 are out.
  assert.deepEqual(ids(historyEntries(book(), { from: '2026-10-01', to: '2026-10-31' })), [
    'm-salary',
    'm-food-2',
    't-1',
    'm-food-1',
  ]);
});

test('historyEntries a one-day range keeps only that day', () => {
  assert.deepEqual(ids(historyEntries(book(), { from: '2026-10-31', to: '2026-10-31' })), ['m-salary']);
  assert.deepEqual(ids(historyEntries(book(), { from: '2026-10-10', to: '2026-10-10' })), ['t-1']);
});

test('historyEntries with only from or only to is open on the other side', () => {
  assert.deepEqual(ids(historyEntries(book(), { from: '2026-10-31' })), ['m-nov', 'm-salary']);
  assert.deepEqual(ids(historyEntries(book(), { to: '2026-10-01' })), ['m-food-1', 'm-sep']);
});

test('historyEntries with from after to returns nothing', () => {
  assert.deepEqual(historyEntries(book(), { from: '2026-10-31', to: '2026-10-01' }), []);
});

test('historyEntries combines account, category and date filters', () => {
  assert.deepEqual(
    ids(historyEntries(book(), { accountId: 'acc-1', categoryId: 'cat-food', from: '2026-10-01', to: '2026-10-31' })),
    ['m-food-1'],
  );
  assert.deepEqual(
    ids(historyEntries(book(), { accountId: 'acc-2', categoryId: 'transfer', from: '2026-10-01', to: '2026-10-31' })),
    ['t-1'],
  );
  assert.deepEqual(historyEntries(book(), { accountId: 'acc-3', categoryId: 'cat-food' }), []);
  assert.deepEqual(historyEntries(book(), { accountId: 'acc-2', categoryId: 'transfer', from: '2026-10-11' }), []);
});

// --- historyEntries: deleted movements ---

test('historyEntries leaves out deleted movements, even when they match the filters', () => {
  const movements = [mov('m-alive'), mov('m-gone', { deleted: true })];
  assert.deepEqual(ids(historyEntries(movements)), ['m-alive']);
  assert.deepEqual(ids(historyEntries(movements, { accountId: 'acc-1', categoryId: 'cat-food' })), ['m-alive']);
});

test('historyEntries leaves out a transfer with both halves deleted', () => {
  const halves = transferHalves('t-x').map((half) => ({ ...half, deleted: true }));
  assert.deepEqual(historyEntries(halves), []);
});

// --- historyEntries: order ---

test('historyEntries orders by date desc, then createdAt desc, then id asc', () => {
  const movements = [
    mov('b', { date: '2026-10-15', createdAt: '2026-10-15T10:00:00.000Z' }),
    mov('a', { date: '2026-10-15', createdAt: '2026-10-15T10:00:00.000Z' }),
    mov('late', { date: '2026-10-15', createdAt: '2026-10-15T23:59:59.999Z' }),
    mov('older-day-created-later', { date: '2026-10-14', createdAt: '2026-10-20T00:00:00.000Z' }),
    mov('newest-day', { date: '2026-10-16', createdAt: '2026-10-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(ids(historyEntries(movements)), ['newest-day', 'late', 'a', 'b', 'older-day-created-later']);
});

test('historyEntries order does not depend on input order', () => {
  const movements = book();
  const expected = ids(historyEntries(movements));
  const reversed = [...movements].reverse();
  const rotated = [...movements.slice(3), ...movements.slice(0, 3)];
  assert.deepEqual(ids(historyEntries(reversed)), expected);
  assert.deepEqual(ids(historyEntries(rotated)), expected);
});

test('historyEntries does not mutate the input array', () => {
  const movements = book();
  const before = ids(movements);
  historyEntries(movements);
  assert.deepEqual(ids(movements), before);
});

// --- historyEntries: transfers ---

test('historyEntries turns both halves of a transfer into one entry with from, to and halves', () => {
  const [outgoing, incoming] = transferHalves('t-1', { from: 'acc-1', to: 'acc-2', amount: 0.01, date: '2026-10-31' });
  // Incoming first: the grouping must not depend on the row order.
  const entries = historyEntries([incoming, outgoing]);
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.kind, 'transfer');
  assert.equal(entry.id, 't-1');
  assert.equal(entry.from, 'acc-1');
  assert.equal(entry.to, 'acc-2');
  assert.equal(entry.amount, 0.01);
  assert.equal(entry.date, '2026-10-31');
  assert.deepEqual(entry.halves, [outgoing, incoming]);
});

test('historyEntries shows a transfer half without its pair as a movement', () => {
  const [outgoing] = transferHalves('t-1');
  const entries = historyEntries([outgoing]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'movement');
  assert.equal(entries[0].id, outgoing.id);
  assert.equal(entries[0].movement, outgoing);
});

test('historyEntries shows a transfer half whose pair is deleted as a movement', () => {
  const [outgoing, incoming] = transferHalves('t-1');
  const entries = historyEntries([{ ...outgoing, deleted: true }, incoming]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'movement');
  assert.equal(entries[0].id, incoming.id);
  // The orphan only matches its own account.
  assert.deepEqual(historyEntries([{ ...outgoing, deleted: true }, incoming], { accountId: 'acc-1' }), []);
  assert.deepEqual(ids(historyEntries([{ ...outgoing, deleted: true }, incoming], { accountId: 'acc-2' })), [incoming.id]);
});

// --- findEntry ---

test('findEntry finds a movement by its id', () => {
  const entry = findEntry(book(), 'm-food-2');
  assert.equal(entry.kind, 'movement');
  assert.equal(entry.movement.id, 'm-food-2');
});

test('findEntry finds a transfer by its transferId', () => {
  const entry = findEntry(book(), 't-1');
  assert.equal(entry.kind, 'transfer');
  assert.deepEqual(ids(entry.halves), ['t-1-out', 't-1-in']);
});

test('findEntry returns null for unknown, empty or deleted ids', () => {
  const movements = [...book(), mov('m-gone', { deleted: true })];
  assert.equal(findEntry(movements, 'nope'), null);
  assert.equal(findEntry(movements, ''), null);
  assert.equal(findEntry(movements, 'm-gone'), null);
  assert.equal(findEntry([], 'm-food-1'), null);
});

test('findEntry returns null for a transfer whose halves are both deleted', () => {
  const halves = deleteTransfer(transferHalves('t-x'), new Date('2026-10-25T00:00:00.000Z'));
  assert.equal(findEntry(halves, 't-x'), null);
});

// --- editMovement ---

const editNow = new Date('2026-10-25T12:34:56.000Z');

test('editMovement keeps identity fields and changes only the editable ones', () => {
  const original = mov('m-1', { transferId: '', personId: 'p-1' });
  const fields = { accountId: 'acc-2', amount: 1234567.89, date: '2026-12-31', categoryId: 'cat-salary', note: 'fixed' };
  const edited = editMovement(original, fields, editNow);
  assert.deepEqual(edited, {
    ...original,
    accountId: 'acc-2',
    amount: 1234567.89,
    date: '2026-12-31',
    categoryId: 'cat-salary',
    note: 'fixed',
    updatedAt: '2026-10-25T12:34:56.000Z',
  });
  assert.equal(edited.id, 'm-1');
  assert.equal(edited.createdBy, 'user-1');
  assert.equal(edited.createdAt, '2026-10-15T10:00:00.000Z');
  assert.equal(edited.type, 'expense');
});

test('editMovement ignores attempts to change id, type, createdBy, createdAt or transferId', () => {
  const original = mov('m-1', { transferId: 't-9' });
  const edited = editMovement(
    original,
    {
      id: 'hacked',
      type: 'income',
      createdBy: 'other',
      createdAt: '2000-01-01T00:00:00.000Z',
      transferId: 't-other',
      accountId: 'acc-1',
      amount: 0.01,
      date: '2026-10-15',
      categoryId: 'cat-food',
      note: '',
    },
    editNow,
  );
  assert.equal(edited.id, 'm-1');
  assert.equal(edited.type, 'expense');
  assert.equal(edited.createdBy, 'user-1');
  assert.equal(edited.createdAt, '2026-10-15T10:00:00.000Z');
  assert.equal(edited.transferId, 't-9');
  assert.equal(edited.amount, 0.01);
});

test('editMovement turns a missing note into an empty string and does not mutate the original', () => {
  const original = mov('m-1', { note: 'old' });
  const snapshot = { ...original };
  const edited = editMovement(original, { accountId: 'acc-1', amount: 5, date: '2026-10-15', categoryId: 'cat-food' }, editNow);
  assert.equal(edited.note, '');
  assert.deepEqual(original, snapshot);
  assert.notEqual(edited, original);
});

test('an edited movement changes the balance by the difference', () => {
  const account = { id: 'acc-1', initialBalance: 100 };
  const original = mov('m-1', { amount: 10 });
  const edited = editMovement(original, { accountId: 'acc-1', amount: 10.1, date: '2026-10-15', categoryId: 'cat-food' }, editNow);
  assert.equal(accountBalance(account, [original]), 90);
  assert.equal(accountBalance(account, [edited]), 89.9);
});

// --- editTransfer / deleteTransfer ---

test('editTransfer changes both halves together and keeps ids, types and transferId', () => {
  const halves = transferHalves('t-1', { from: 'acc-1', to: 'acc-2', amount: 50, date: '2026-10-10' });
  const [outgoing, incoming] = editTransfer(
    halves,
    { fromAccountId: 'acc-3', toAccountId: 'acc-4', amount: 75.5, date: '2026-10-31', note: 'rent' },
    editNow,
  );
  assert.equal(outgoing.id, 't-1-out');
  assert.equal(incoming.id, 't-1-in');
  assert.equal(outgoing.transferId, 't-1');
  assert.equal(incoming.transferId, 't-1');
  assert.equal(outgoing.type, 'expense');
  assert.equal(incoming.type, 'income');
  assert.equal(outgoing.accountId, 'acc-3');
  assert.equal(incoming.accountId, 'acc-4');
  for (const half of [outgoing, incoming]) {
    assert.equal(half.amount, 75.5);
    assert.equal(half.date, '2026-10-31');
    assert.equal(half.note, 'rent');
    assert.equal(half.categoryId, 'transfer');
    assert.equal(half.createdAt, '2026-10-10T09:00:00.000Z');
    assert.equal(half.createdBy, 'user-1');
    assert.equal(half.updatedAt, '2026-10-25T12:34:56.000Z');
    assert.equal(half.deleted, false);
  }
  assert.equal(halves[0].amount, 50, 'original halves are not mutated');
});

test('an edited transfer is still one history entry with the new accounts', () => {
  const edited = editTransfer(
    transferHalves('t-1'),
    { fromAccountId: 'acc-2', toAccountId: 'acc-1', amount: 0.01, date: '2026-10-10' },
    editNow,
  );
  const entries = historyEntries(edited);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'transfer');
  assert.equal(entries[0].from, 'acc-2');
  assert.equal(entries[0].to, 'acc-1');
  assert.equal(entries[0].halves[0].note, '');
});

test('deleteTransfer marks both halves deleted with the same updatedAt and keeps ids', () => {
  const halves = transferHalves('t-1');
  const deleted = deleteTransfer(halves, editNow);
  assert.equal(deleted.length, 2);
  assert.deepEqual(ids(deleted), ['t-1-out', 't-1-in']);
  for (const half of deleted) {
    assert.equal(half.deleted, true);
    assert.equal(half.transferId, 't-1');
    assert.equal(half.updatedAt, '2026-10-25T12:34:56.000Z');
    assert.equal(half.amount, 50);
  }
  assert.equal(halves[0].deleted, false, 'original halves are not mutated');
  assert.deepEqual(historyEntries(deleted), []);
});

// --- balance with deleted movements ---
// tests/movement-balance.test.js already checks a hand-built deleted row; these
// cover rows deleted through the domain functions used by the History screen.

test('a movement deleted with markDeleted no longer counts in the balance', () => {
  const account = { id: 'acc-1', initialBalance: 0 };
  const kept = mov('m-1', { amount: 0.1 });
  const removed = markDeleted(mov('m-2', { amount: 0.2 }), editNow);
  assert.equal(accountBalance(account, [kept, removed]), -0.1);
});

test('a deleted transfer no longer counts in either account balance', () => {
  const source = { id: 'acc-1', initialBalance: 1000 };
  const target = { id: 'acc-2', initialBalance: 0 };
  const halves = transferHalves('t-1', { amount: 250.25 });
  assert.equal(accountBalance(source, halves), 749.75);
  assert.equal(accountBalance(target, halves), 250.25);
  const deleted = deleteTransfer(halves, editNow);
  assert.equal(accountBalance(source, deleted), 1000);
  assert.equal(accountBalance(target, deleted), 0);
});
