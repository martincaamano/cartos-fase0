import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf, shiftMonth, spendingByCategory, monthSummary, monthRange } from '../js/domain/stats.js';
import { TRANSFER_CATEGORY_ID } from '../js/domain/category.js';
import { buildTransfer } from '../js/domain/transfer.js';

let seq = 0;
const mv = (type, amount, date, categoryId = 'food', extra = {}) => ({
  id: `m-${++seq}`, type, amount, date, categoryId, accountId: 'bank', deleted: false, ...extra,
});
const expense = (amount, date, categoryId, extra) => mv('expense', amount, date, categoryId, extra);
const income = (amount, date, categoryId = 'salary', extra) => mv('income', amount, date, categoryId, extra);

// --- monthOf ---

test('monthOf takes YYYY-MM from a YYYY-MM-DD date', () => {
  assert.equal(monthOf('2026-10-25'), '2026-10');
  assert.equal(monthOf('2026-01-01'), '2026-01');
  assert.equal(monthOf('2025-12-31'), '2025-12');
});

// --- shiftMonth ---

test('shiftMonth moves within the same year', () => {
  assert.equal(shiftMonth('2026-05', 1), '2026-06');
  assert.equal(shiftMonth('2026-05', -1), '2026-04');
  assert.equal(shiftMonth('2026-05', 0), '2026-05');
});

test('shiftMonth crosses the year backwards and forwards', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -13), '2024-12');
});

test('shiftMonth handles large deltas', () => {
  assert.equal(shiftMonth('2026-10', -22), '2024-12');
  assert.equal(shiftMonth('2026-03', -27), '2023-12');
  assert.equal(shiftMonth('2026-10', 120), '2036-10');
  assert.equal(shiftMonth('2026-10', -120), '2016-10');
  assert.equal(shiftMonth('2026-10', 1200), '2126-10');
});

// --- spendingByCategory ---

test('spendingByCategory sums expenses per category, largest first', () => {
  const movements = [
    expense(12.5, '2026-10-01', 'food'),
    expense(40, '2026-10-02', 'rent'),
    expense(7.5, '2026-10-15', 'food'),
    expense(3, '2026-10-31', 'coffee'),
  ];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [
    { categoryId: 'rent', amount: 40 },
    { categoryId: 'food', amount: 20 },
    { categoryId: 'coffee', amount: 3 },
  ]);
});

test('spendingByCategory breaks ties by category id', () => {
  const movements = [
    expense(10, '2026-10-01', 'b-cat'),
    expense(10, '2026-10-02', 'a-cat'),
    expense(10, '2026-10-03', 'c-cat'),
    expense(25, '2026-10-04', 'z-cat'),
  ];
  assert.deepEqual(spendingByCategory(movements, '2026-10').map((row) => row.categoryId),
    ['z-cat', 'a-cat', 'b-cat', 'c-cat']);
});

test('spendingByCategory sums in cents: 0.1 + 0.2 is exactly 0.3', () => {
  const movements = [expense(0.1, '2026-10-01', 'food'), expense(0.2, '2026-10-02', 'food')];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [{ categoryId: 'food', amount: 0.3 }]);
});

test('spendingByCategory handles one cent and large amounts', () => {
  const movements = [
    expense(0.01, '2026-10-01', 'tiny'),
    expense(999999999.99, '2026-10-01', 'big'),
    expense(0.01, '2026-10-02', 'big'),
  ];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [
    { categoryId: 'big', amount: 1000000000 },
    { categoryId: 'tiny', amount: 0.01 },
  ]);
});

test('spendingByCategory only counts the requested month', () => {
  const movements = [
    expense(5, '2026-09-30', 'food'),
    expense(8, '2026-10-01', 'food'),
    expense(13, '2026-10-31', 'food'),
    expense(21, '2026-11-01', 'food'),
    expense(34, '2025-10-15', 'food'),
  ];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [{ categoryId: 'food', amount: 21 }]);
});

test('spendingByCategory returns an empty list for a month without expenses', () => {
  assert.deepEqual(spendingByCategory([], '2026-10'), []);
  assert.deepEqual(spendingByCategory([expense(10, '2026-09-10', 'food')], '2026-10'), []);
  assert.deepEqual(spendingByCategory([income(1000, '2026-10-01')], '2026-10'), []);
});

test('spendingByCategory ignores income', () => {
  const movements = [expense(10, '2026-10-01', 'food'), income(500, '2026-10-01', 'food')];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [{ categoryId: 'food', amount: 10 }]);
});

test('spendingByCategory leaves the transfer category out of the ranking', () => {
  const movements = [
    expense(300, '2026-10-05', TRANSFER_CATEGORY_ID, { transferId: 't-1' }),
    income(300, '2026-10-05', TRANSFER_CATEGORY_ID, { transferId: 't-1', accountId: 'cash' }),
    expense(20, '2026-10-06', 'food'),
  ];
  assert.equal(TRANSFER_CATEGORY_ID, 'transfer');
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [{ categoryId: 'food', amount: 20 }]);
});

test('spendingByCategory ignores deleted movements', () => {
  const movements = [
    expense(10, '2026-10-01', 'food'),
    expense(90, '2026-10-02', 'food', { deleted: true }),
    expense(50, '2026-10-03', 'rent', { deleted: true }),
  ];
  assert.deepEqual(spendingByCategory(movements, '2026-10'), [{ categoryId: 'food', amount: 10 }]);
});

// --- monthSummary ---

test('monthSummary gives income, expense and savings = income - expense', () => {
  const movements = [
    income(1500, '2026-10-01'),
    expense(400, '2026-10-02', 'rent'),
    expense(120.35, '2026-10-20', 'food'),
  ];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 1500, expense: 520.35, savings: 979.65 });
});

test('monthSummary savings can be negative', () => {
  const movements = [income(100, '2026-10-01'), expense(250.5, '2026-10-02', 'food')];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 100, expense: 250.5, savings: -150.5 });
});

test('monthSummary of an empty month is all zeros', () => {
  assert.deepEqual(monthSummary([], '2026-10'), { income: 0, expense: 0, savings: 0 });
  assert.deepEqual(monthSummary([income(10, '2026-09-30')], '2026-10'), { income: 0, expense: 0, savings: 0 });
});

test('monthSummary sums in cents: 0.1 + 0.2 and one cent', () => {
  const movements = [income(0.1, '2026-10-01'), income(0.2, '2026-10-02'), expense(0.01, '2026-10-03', 'food')];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 0.3, expense: 0.01, savings: 0.29 });
});

test('monthSummary handles large amounts', () => {
  const movements = [income(999999999.99, '2026-10-01'), expense(0.99, '2026-10-02', 'food')];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 999999999.99, expense: 0.99, savings: 999999999 });
});

test('monthSummary: last day of a month and first of the next fall in different months', () => {
  const movements = [expense(10, '2026-10-31', 'food'), expense(20, '2026-11-01', 'food')];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 0, expense: 10, savings: -10 });
  assert.deepEqual(monthSummary(movements, '2026-11'), { income: 0, expense: 20, savings: -20 });
});

test('monthSummary: February 28 and March 1 fall in different months', () => {
  const movements = [income(5, '2026-02-28'), income(7, '2026-03-01')];
  assert.equal(monthSummary(movements, '2026-02').income, 5);
  assert.equal(monthSummary(movements, '2026-03').income, 7);
});

test('monthSummary: December 31 and January 1 fall in different years', () => {
  const movements = [income(100, '2025-12-31'), expense(30, '2026-01-01', 'food')];
  assert.deepEqual(monthSummary(movements, '2025-12'), { income: 100, expense: 0, savings: 100 });
  assert.deepEqual(monthSummary(movements, '2026-01'), { income: 0, expense: 30, savings: -30 });
});

test('monthSummary: a transfer inflates both totals but leaves savings unchanged', () => {
  const base = [income(1000, '2026-10-01'), expense(200, '2026-10-02', 'food')];
  const transfer = [
    expense(300, '2026-10-05', TRANSFER_CATEGORY_ID, { transferId: 't-1', accountId: 'bank' }),
    income(300, '2026-10-05', TRANSFER_CATEGORY_ID, { transferId: 't-1', accountId: 'cash' }),
  ];
  const before = monthSummary(base, '2026-10');
  const after = monthSummary([...base, ...transfer], '2026-10');
  assert.deepEqual(before, { income: 1000, expense: 200, savings: 800 });
  assert.deepEqual(after, { income: 1300, expense: 500, savings: 800 });
});

test('monthSummary: a transfer built by buildTransfer leaves savings unchanged', () => {
  let n = 0;
  const deps = { now: () => new Date('2026-10-25T10:00:00Z'), newId: () => `tid-${++n}`, userSub: 'user-1' };
  const halves = buildTransfer(
    { fromAccountId: 'bank', toAccountId: 'cash', amount: 0.3, date: '2026-10-25', note: '' }, deps);
  const base = [income(0.1, '2026-10-01'), income(0.2, '2026-10-02')];
  const after = monthSummary([...base, ...halves], '2026-10');
  assert.deepEqual(after, { income: 0.6, expense: 0.3, savings: 0.3 });
  assert.deepEqual(spendingByCategory([...base, ...halves], '2026-10'), []);
});

test('monthSummary ignores deleted movements', () => {
  const movements = [
    income(1000, '2026-10-01'),
    income(5000, '2026-10-01', 'salary', { deleted: true }),
    expense(100, '2026-10-02', 'food'),
    expense(700, '2026-10-03', 'food', { deleted: true }),
  ];
  assert.deepEqual(monthSummary(movements, '2026-10'), { income: 1000, expense: 100, savings: 900 });
});

// --- monthRange ---

test('monthRange goes from the oldest active movement month to the month of today', () => {
  const movements = [
    expense(10, '2026-03-15', 'food'),
    income(10, '2025-11-30'),
    expense(10, '2026-10-01', 'food'),
  ];
  assert.deepEqual(monthRange(movements, '2026-10-25'), { first: '2025-11', last: '2026-10' });
});

test('monthRange without movements has first = last = month of today', () => {
  assert.deepEqual(monthRange([], '2026-10-25'), { first: '2026-10', last: '2026-10' });
  assert.deepEqual(monthRange([], '2026-01-01'), { first: '2026-01', last: '2026-01' });
});

test('monthRange ignores deleted movements', () => {
  const movements = [
    expense(10, '2024-01-10', 'food', { deleted: true }),
    expense(10, '2026-06-10', 'food'),
  ];
  assert.deepEqual(monthRange(movements, '2026-10-25'), { first: '2026-06', last: '2026-10' });
});

test('monthRange with only deleted movements has first = last', () => {
  const movements = [expense(10, '2024-01-10', 'food', { deleted: true })];
  assert.deepEqual(monthRange(movements, '2026-10-25'), { first: '2026-10', last: '2026-10' });
});

test('monthRange crosses the year boundary', () => {
  const movements = [income(10, '2025-12-31')];
  assert.deepEqual(monthRange(movements, '2026-01-01'), { first: '2025-12', last: '2026-01' });
});
