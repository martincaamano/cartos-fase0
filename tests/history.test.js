import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historyEntries,
  findEntry,
  activeFilterCount,
  sumEntries,
  byCategory,
  transferAmount,
  summarizeHistory,
  monthOf,
  monthsSpan,
  selectMonth,
} from '../js/domain/history.js';
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
  assert.deepEqual(ids(historyEntries(book(), { accountIds: [], categoryIds: [], fromMonth: '', toMonth: '' })), all);
  assert.deepEqual(ids(historyEntries(book(), {})), all);
  assert.equal(all.length, 6);
});

test('historyEntries on an empty list returns an empty list', () => {
  assert.deepEqual(historyEntries([]), []);
  assert.deepEqual(historyEntries([], { accountIds: ['acc-1'] }), []);
});

test('historyEntries filters by one account; a transfer matches either half', () => {
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-1'] })), ['m-nov', 'm-salary', 't-1', 'm-food-1']);
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-2'] })), ['m-food-2', 't-1']);
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-3'] })), ['m-sep']);
});

test('historyEntries with several accounts keeps entries of any of them, a transfer once', () => {
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-2', 'acc-3'] })), ['m-food-2', 't-1', 'm-sep']);
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-1', 'acc-2'] })), [
    'm-nov', 'm-salary', 'm-food-2', 't-1', 'm-food-1',
  ]);
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-1', 'acc-2', 'acc-3'] })), ids(historyEntries(book())));
});

test('historyEntries with an unknown account returns nothing', () => {
  assert.deepEqual(historyEntries(book(), { accountIds: ['acc-missing'] }), []);
  assert.deepEqual(ids(historyEntries(book(), { accountIds: ['acc-missing', 'acc-3'] })), ['m-sep']);
});

test('historyEntries filters by one or several categories', () => {
  assert.deepEqual(ids(historyEntries(book(), { categoryIds: ['cat-food'] })), ['m-nov', 'm-food-2', 'm-food-1']);
  assert.deepEqual(ids(historyEntries(book(), { categoryIds: ['cat-salary'] })), ['m-salary', 'm-sep']);
  assert.deepEqual(ids(historyEntries(book(), { categoryIds: ['cat-food', 'transfer'] })), ['m-nov', 'm-food-2', 't-1', 'm-food-1']);
  assert.deepEqual(historyEntries(book(), { categoryIds: ['cat-missing'] }), []);
});

test('historyEntries category filter "transfer" returns the transfer as one entry', () => {
  const entries = historyEntries(book(), { categoryIds: ['transfer'] });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'transfer');
  assert.equal(entries[0].id, 't-1');
});

test('historyEntries category filter "transfer" also keeps a loose transfer half', () => {
  const [outgoing] = transferHalves('t-loose', { date: '2026-10-05' });
  assert.deepEqual(ids(historyEntries([...book(), outgoing], { categoryIds: ['transfer'] })), ['t-1', 't-loose-out']);
});

test('historyEntries month range includes both month ends (day 01 and day 31)', () => {
  // 2026-10-01 and 2026-10-31 are inside; 2026-09-30 and 2026-11-01 are out.
  assert.deepEqual(ids(historyEntries(book(), { fromMonth: '2026-10', toMonth: '2026-10' })), [
    'm-salary', 'm-food-2', 't-1', 'm-food-1',
  ]);
});

test('historyEntries a range over several months is inclusive', () => {
  assert.deepEqual(ids(historyEntries(book(), { fromMonth: '2026-09', toMonth: '2026-10' })), [
    'm-salary', 'm-food-2', 't-1', 'm-food-1', 'm-sep',
  ]);
  assert.deepEqual(ids(historyEntries(book(), { fromMonth: '2026-09', toMonth: '2026-11' })), ids(historyEntries(book())));
});

test('historyEntries month range crosses the year', () => {
  const movements = [
    mov('m-nov25', { date: '2025-11-30' }),
    mov('m-dec31', { date: '2025-12-31' }),
    mov('m-jan01', { date: '2026-01-01' }),
    mov('m-feb', { date: '2026-02-28' }),
  ];
  assert.deepEqual(ids(historyEntries(movements, { fromMonth: '2025-12', toMonth: '2026-01' })), ['m-jan01', 'm-dec31']);
});

test('historyEntries with only fromMonth or only toMonth is open on the other side', () => {
  assert.deepEqual(ids(historyEntries(book(), { fromMonth: '2026-11' })), ['m-nov']);
  assert.deepEqual(ids(historyEntries(book(), { toMonth: '2026-09' })), ['m-sep']);
});

test('historyEntries with fromMonth after toMonth returns nothing', () => {
  assert.deepEqual(historyEntries(book(), { fromMonth: '2026-11', toMonth: '2026-09' }), []);
});

test('historyEntries a month without movements returns nothing', () => {
  assert.deepEqual(historyEntries(book(), { fromMonth: '2026-12', toMonth: '2026-12' }), []);
});

test('historyEntries combines accounts, categories and month range', () => {
  assert.deepEqual(
    ids(historyEntries(book(), { accountIds: ['acc-1'], categoryIds: ['cat-food'], fromMonth: '2026-10', toMonth: '2026-10' })),
    ['m-food-1'],
  );
  assert.deepEqual(
    ids(historyEntries(book(), { accountIds: ['acc-2'], categoryIds: ['transfer'], fromMonth: '2026-10', toMonth: '2026-10' })),
    ['t-1'],
  );
  assert.deepEqual(historyEntries(book(), { accountIds: ['acc-3'], categoryIds: ['cat-food'] }), []);
  assert.deepEqual(historyEntries(book(), { accountIds: ['acc-2'], categoryIds: ['transfer'], fromMonth: '2026-11' }), []);
  assert.deepEqual(
    ids(historyEntries(book(), { accountIds: ['acc-1', 'acc-3'], categoryIds: ['cat-salary', 'cat-food'], toMonth: '2026-10' })),
    ['m-salary', 'm-food-1', 'm-sep'],
  );
});

test('historyEntries does not mutate the filter arrays', () => {
  const filters = { accountIds: ['acc-2', 'acc-1'], categoryIds: ['cat-food'] };
  historyEntries(book(), filters);
  assert.deepEqual(filters, { accountIds: ['acc-2', 'acc-1'], categoryIds: ['cat-food'] });
});

// --- historyEntries: deleted movements ---

test('historyEntries leaves out deleted movements, even when they match the filters', () => {
  const movements = [mov('m-alive'), mov('m-gone', { deleted: true })];
  assert.deepEqual(ids(historyEntries(movements)), ['m-alive']);
  assert.deepEqual(ids(historyEntries(movements, { accountIds: ['acc-1'], categoryIds: ['cat-food'] })), ['m-alive']);
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
  assert.deepEqual(historyEntries([{ ...outgoing, deleted: true }, incoming], { accountIds: ['acc-1'] }), []);
  assert.deepEqual(ids(historyEntries([{ ...outgoing, deleted: true }, incoming], { accountIds: ['acc-2'] })), [incoming.id]);
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

// --- activeFilterCount ---

test('activeFilterCount is 0 with no filters', () => {
  assert.equal(activeFilterCount({ accountIds: [], categoryIds: [], fromMonth: '' }), 0);
  assert.equal(activeFilterCount({}), 0);
  assert.equal(activeFilterCount(), 0);
});

test('activeFilterCount counts each account and category, and the range once', () => {
  assert.equal(activeFilterCount({ accountIds: ['acc-1'] }), 1);
  assert.equal(activeFilterCount({ accountIds: ['acc-1', 'acc-2'], categoryIds: ['cat-food'] }), 3);
  assert.equal(activeFilterCount({ fromMonth: '2026-10', toMonth: '2026-10' }), 1);
  assert.equal(activeFilterCount({ fromMonth: '2025-11', toMonth: '2026-02' }), 1);
  assert.equal(
    activeFilterCount({ accountIds: ['acc-1', 'acc-2'], categoryIds: ['cat-food', 'transfer'], fromMonth: '2026-09', toMonth: '2026-10' }),
    5,
  );
});

// --- monthOf ---

test('monthOf takes YYYY-MM from the entry date', () => {
  assert.equal(monthOf({ date: '2026-10-31' }), '2026-10');
  assert.equal(monthOf({ date: '2026-01-01' }), '2026-01');
  const [entry] = historyEntries(transferHalves('t-1', { date: '2028-02-29' }));
  assert.equal(monthOf(entry), '2028-02');
});

// --- sumEntries ---

const entriesOf = (movements) => historyEntries(movements);

test('sumEntries: income − expense = net, in euros', () => {
  const sums = sumEntries(entriesOf([
    mov('i-1', { type: 'income', amount: 1500 }),
    mov('i-2', { type: 'income', amount: 101.27 }),
    mov('e-1', { amount: 3000 }),
    mov('e-2', { amount: 547.58 }),
  ]));
  assert.deepEqual(sums, { income: 1601.27, expense: 3547.58, net: -1946.31 });
});

test('sumEntries works in cents: 0,1 + 0,2 is exactly 0,3', () => {
  assert.deepEqual(sumEntries(entriesOf([mov('a', { amount: 0.1 }), mov('b', { amount: 0.2 })])), {
    income: 0, expense: 0.3, net: -0.3,
  });
  assert.deepEqual(
    sumEntries(entriesOf([mov('a', { type: 'income', amount: 0.1 }), mov('b', { type: 'income', amount: 0.2 })])),
    { income: 0.3, expense: 0, net: 0.3 },
  );
  // 0,3 − 0,1 − 0,2 is exactly 0 (in floats it would be −2.7e-17).
  assert.deepEqual(
    sumEntries(entriesOf([mov('a', { type: 'income', amount: 0.3 }), mov('b', { amount: 0.1 }), mov('c', { amount: 0.2 })])),
    { income: 0.3, expense: 0.3, net: 0 },
  );
});

test('sumEntries: no entries is all zero', () => {
  assert.deepEqual(sumEntries([]), { income: 0, expense: 0, net: 0 });
});

test('sumEntries: one cent and big amounts', () => {
  assert.deepEqual(sumEntries(entriesOf([mov('a', { amount: 0.01 })])), { income: 0, expense: 0.01, net: -0.01 });
  assert.deepEqual(
    sumEntries(entriesOf([mov('a', { type: 'income', amount: 999999.99 }), mov('b', { type: 'income', amount: 0.01 })])),
    { income: 1000000, expense: 0, net: 1000000 },
  );
});

test('sumEntries leaves transfers and loose transfer halves out', () => {
  const [looseOut] = transferHalves('t-loose-a', { amount: 70 });
  const [, looseIn] = transferHalves('t-loose-b', { amount: 80 });
  const entries = entriesOf([
    mov('e-1', { amount: 10 }),
    ...transferHalves('t-1', { amount: 500 }),
    looseOut,
    looseIn,
  ]);
  assert.equal(entries.length, 4);
  assert.deepEqual(sumEntries(entries), { income: 0, expense: 10, net: -10 });
  assert.deepEqual(sumEntries(entriesOf(transferHalves('t-2'))), { income: 0, expense: 0, net: 0 });
});

// --- byCategory ---

const categoryBook = () => [
  mov('food-1', { categoryId: 'cat-food', amount: 10, date: '2026-10-03' }),
  mov('food-2', { categoryId: 'cat-food', amount: 20.5, date: '2026-10-02' }),
  mov('food-refund', { categoryId: 'cat-food', type: 'income', amount: 5, date: '2026-10-01' }),
  mov('salary', { categoryId: 'cat-salary', type: 'income', amount: 2000, date: '2026-10-28' }),
  mov('fun', { categoryId: 'cat-fun', amount: 100, date: '2026-10-15' }),
  ...transferHalves('t-1', { amount: 5000, date: '2026-10-20' }),
];

test('byCategory groups by category with its sums, biggest |net| first, transfers last', () => {
  const groups = byCategory(entriesOf(categoryBook()));
  assert.deepEqual(groups.map((g) => g.categoryId), ['cat-salary', 'cat-fun', 'cat-food', 'transfer']);
  const [salary, fun, food, transfer] = groups;
  assert.deepEqual({ ...salary, entries: ids(salary.entries) }, {
    categoryId: 'cat-salary', income: 2000, expense: 0, net: 2000, entries: ['salary'],
  });
  assert.deepEqual({ ...fun, entries: ids(fun.entries) }, {
    categoryId: 'cat-fun', income: 0, expense: 100, net: -100, entries: ['fun'],
  });
  assert.deepEqual({ ...food, entries: ids(food.entries) }, {
    categoryId: 'cat-food', income: 5, expense: 30.5, net: -25.5, entries: ['food-1', 'food-2', 'food-refund'],
  });
  assert.deepEqual({ ...transfer, entries: ids(transfer.entries) }, {
    categoryId: 'transfer', income: 0, expense: 0, net: 0, entries: ['t-1'],
  });
});

test('byCategory puts the transfer group last even after a category whose net is 0', () => {
  const groups = byCategory(entriesOf([
    ...transferHalves('t-1', { amount: 999999.99 }),
    mov('in', { categoryId: 'cat-even', type: 'income', amount: 10.1 }),
    mov('out', { categoryId: 'cat-even', amount: 10.1 }),
  ]));
  assert.deepEqual(groups.map((g) => [g.categoryId, g.net]), [['cat-even', 0], ['transfer', 0]]);
});

test('byCategory puts loose transfer halves in the transfer group, counted as nothing', () => {
  const [looseOut] = transferHalves('t-loose', { amount: 70 });
  const groups = byCategory(entriesOf([...transferHalves('t-1'), looseOut, mov('e', { amount: 1 })]));
  assert.deepEqual(groups.map((g) => g.categoryId), ['cat-food', 'transfer']);
  assert.deepEqual(ids(groups[1].entries).sort(), ['t-1', 't-loose-out']);
  assert.equal(groups[1].net, 0);
});

test('byCategory ranks by |net|: a big income outranks a smaller expense and vice versa', () => {
  const groups = byCategory(entriesOf([
    mov('a', { categoryId: 'cat-a', amount: 0.01 }),
    mov('b', { categoryId: 'cat-b', type: 'income', amount: 0.02 }),
    mov('c', { categoryId: 'cat-c', amount: 0.03 }),
  ]));
  assert.deepEqual(groups.map((g) => g.categoryId), ['cat-c', 'cat-b', 'cat-a']);
});

test('byCategory of nothing is an empty list', () => {
  assert.deepEqual(byCategory([]), []);
});

// --- transferAmount ---

test('transferAmount adds the transfers in cents and ignores the rest', () => {
  const entries = entriesOf([
    ...transferHalves('t-1', { amount: 50 }),
    ...transferHalves('t-2', { amount: 0.1 }),
    ...transferHalves('t-3', { amount: 0.2 }),
    mov('e', { amount: 1000 }),
    mov('i', { type: 'income', amount: 1000 }),
  ]);
  assert.equal(transferAmount(entries), 50.3);
});

test('transferAmount is 0 with no transfers or no entries', () => {
  assert.equal(transferAmount([]), 0);
  assert.equal(transferAmount(entriesOf([mov('e', { amount: 10 })])), 0);
});

test('transferAmount handles one cent and big amounts', () => {
  assert.equal(transferAmount(entriesOf(transferHalves('t-1', { amount: 0.01 }))), 0.01);
  assert.equal(
    transferAmount(entriesOf([...transferHalves('t-1', { amount: 999999.99 }), ...transferHalves('t-2', { amount: 0.01 })])),
    1000000,
  );
});

test('transferAmount of the transfer group with a loose half is a number (the half counts)', () => {
  // byCategory puts a loose half in the transfer group; the screen shows
  // transferAmount(group.entries) as that group's total.
  const [looseOut] = transferHalves('t-loose', { amount: 60 });
  const entries = entriesOf([...transferHalves('t-1', { amount: 50 }), looseOut]);
  const group = byCategory(entries).find((g) => g.categoryId === 'transfer');
  assert.equal(group.entries.length, 2);
  assert.equal(transferAmount(group.entries), 110);
});

// --- summarizeHistory ---

test('summarizeHistory gives the total and each month, newest first', () => {
  const summary = summarizeHistory(historyEntries(book()));
  assert.deepEqual(
    { income: summary.total.income, expense: summary.total.expense, net: summary.total.net },
    { income: 2000, expense: 40, net: 1960 },
  );
  assert.deepEqual(
    summary.total.categories.map((g) => [g.categoryId, g.income, g.expense, g.net]),
    [['cat-salary', 2000, 10, 1990], ['cat-food', 0, 30, -30], ['transfer', 0, 0, 0]],
  );
  assert.deepEqual(
    summary.months.map(({ month, income, expense, net }) => ({ month, income, expense, net })),
    [
      { month: '2026-11', income: 0, expense: 10, net: -10 },
      { month: '2026-10', income: 2000, expense: 20, net: 1980 },
      { month: '2026-09', income: 0, expense: 10, net: -10 },
    ],
  );
  const october = summary.months[1];
  assert.deepEqual(
    october.categories.map((g) => [g.categoryId, ids(g.entries)]),
    [['cat-salary', ['m-salary']], ['cat-food', ['m-food-2', 'm-food-1']], ['transfer', ['t-1']]],
  );
});

test('summarizeHistory month sums add up to the total, in cents', () => {
  const movements = [
    mov('a', { date: '2025-12-31', amount: 0.1 }),
    mov('b', { date: '2026-01-01', amount: 0.2 }),
    mov('c', { date: '2026-01-31', type: 'income', amount: 0.3 }),
  ];
  const summary = summarizeHistory(historyEntries(movements));
  assert.deepEqual(summary.months.map((m) => [m.month, m.net]), [['2026-01', 0.1], ['2025-12', -0.1]]);
  assert.deepEqual(
    { income: summary.total.income, expense: summary.total.expense, net: summary.total.net },
    { income: 0.3, expense: 0.3, net: 0 },
  );
});

test('summarizeHistory of nothing is a zero total and no months', () => {
  assert.deepEqual(summarizeHistory([]), { total: { income: 0, expense: 0, net: 0, categories: [] }, months: [] });
});

test('summarizeHistory of only transfers counts nothing but keeps the month', () => {
  const summary = summarizeHistory(historyEntries(transferHalves('t-1', { amount: 300, date: '2026-10-31' })));
  assert.deepEqual(summary.total.categories.map((g) => g.categoryId), ['transfer']);
  assert.deepEqual(summary.months.map(({ month, net }) => [month, net]), [['2026-10', 0]]);
});

// --- monthsSpan ---

test('monthsSpan goes from the first movement month to today, ignoring future movements', () => {
  // m-nov (2026-11-01) is after today and does not extend the strip.
  assert.deepEqual(monthsSpan(book(), '2026-10-30'), ['2026-09', '2026-10']);
});

test('monthsSpan crosses years, oldest first', () => {
  const movements = [mov('a', { date: '2026-01-10' }), mov('b', { date: '2025-11-30' })];
  assert.deepEqual(monthsSpan(movements, '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('monthsSpan with no movements is just the current month', () => {
  assert.deepEqual(monthsSpan([], '2026-10-30'), ['2026-10']);
  assert.deepEqual(monthsSpan([], '2026-12-31'), ['2026-12']);
});

test('monthsSpan with only future or deleted movements is just the current month', () => {
  assert.deepEqual(monthsSpan([mov('f', { date: '2026-11-01' })], '2026-10-31'), ['2026-10']);
  assert.deepEqual(monthsSpan([mov('d', { date: '2025-01-01', deleted: true })], '2026-10-30'), ['2026-10']);
});

test('monthsSpan with movements only in the current month is that month', () => {
  assert.deepEqual(monthsSpan([mov('a', { date: '2026-10-01' }), mov('b', { date: '2026-10-31' })], '2026-10-15'), ['2026-10']);
});

test('monthsSpan uses the first active movement, deleted ones do not count', () => {
  const movements = [mov('old', { date: '2024-01-01', deleted: true }), mov('a', { date: '2026-08-15' })];
  assert.deepEqual(monthsSpan(movements, '2026-10-30'), ['2026-08', '2026-09', '2026-10']);
});

test('monthsSpan over several years lists every month once', () => {
  const span = monthsSpan([mov('a', { date: '2024-01-31' })], '2026-10-30');
  assert.equal(span.length, 34);
  assert.equal(span[0], '2024-01');
  assert.equal(span[11], '2024-12');
  assert.equal(span[12], '2025-01');
  assert.equal(span.at(-1), '2026-10');
  assert.equal(new Set(span).size, span.length);
});

test('monthsSpan counts a transfer once by its month', () => {
  assert.deepEqual(monthsSpan(transferHalves('t-1', { date: '2026-09-30' }), '2026-10-01'), ['2026-09', '2026-10']);
});

// --- selectMonth ---

test('selectMonth with no range opens a single month', () => {
  assert.deepEqual(selectMonth(null, '2026-10'), { from: '2026-10', to: '2026-10', open: true });
  assert.deepEqual(selectMonth(undefined, '2026-10'), { from: '2026-10', to: '2026-10', open: true });
});

test('selectMonth open + a later month closes the range', () => {
  const open = selectMonth(null, '2026-09');
  assert.deepEqual(selectMonth(open, '2026-10'), { from: '2026-09', to: '2026-10', open: false });
});

test('selectMonth open + an earlier month closes the range in order', () => {
  const open = selectMonth(null, '2026-02');
  assert.deepEqual(selectMonth(open, '2025-11'), { from: '2025-11', to: '2026-02', open: false });
});

test('selectMonth open + the same month clears the range', () => {
  assert.equal(selectMonth({ from: '2026-10', to: '2026-10', open: true }, '2026-10'), null);
});

test('selectMonth closed range + any month starts a new open month', () => {
  const closed = { from: '2026-08', to: '2026-10', open: false };
  assert.deepEqual(selectMonth(closed, '2026-09'), { from: '2026-09', to: '2026-09', open: true });
  assert.deepEqual(selectMonth(closed, '2026-08'), { from: '2026-08', to: '2026-08', open: true });
  assert.deepEqual(selectMonth(closed, '2025-01'), { from: '2025-01', to: '2025-01', open: true });
});

test('selectMonth does not mutate the range', () => {
  const open = { from: '2026-10', to: '2026-10', open: true };
  selectMonth(open, '2026-12');
  assert.deepEqual(open, { from: '2026-10', to: '2026-10', open: true });
});

test('a closed selectMonth range filters historyEntries', () => {
  const range = selectMonth(selectMonth(null, '2026-11'), '2026-10');
  assert.deepEqual(
    ids(historyEntries(book(), { fromMonth: range.from, toMonth: range.to })),
    ['m-nov', 'm-salary', 'm-food-2', 't-1', 'm-food-1'],
  );
});
