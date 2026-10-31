import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, isMonth, monthOf, monthsBetween, shiftMonth, monthRange } from '../js/domain/stats.js';
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

// --- month helpers (tarea 22b) ---

test('monthsBetween lists every month, both ends included, across a year', () => {
  assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsBetween('2026-10', '2026-10'), ['2026-10']);
  assert.deepEqual(monthsBetween('2026-11', '2026-10'), []);
});

test('dayOf and isMonth', () => {
  assert.equal(dayOf('2026-10-05'), 5);
  assert.equal(dayOf('2026-02-28'), 28);
  assert.equal(isMonth('2026-10'), true);
  for (const text of ['2026-1', '2026-10-01', '', null, undefined, 'x']) assert.equal(isMonth(text), false);
});
