import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthDeviations, yearDeviations,
  BASELINE_MONTHS, BASELINE_MIN, NOTABLE_EUROS, NOTABLE_SHARE, EXPLAIN_COUNT,
} from '../js/domain/deviations.js';

let seq = 0;
const mv = (type, amount, date, categoryId = 'food', extra = {}) => ({
  id: `m-${++seq}`, type, amount, date, categoryId, accountId: 'bank', deleted: false, ...extra,
});
const expense = (amount, date, categoryId, extra) => mv('expense', amount, date, categoryId, extra);
const income = (amount, date, categoryId = 'salary', extra) => mv('income', amount, date, categoryId, extra);

// The six months before October 2026, the month analysed in most tests.
const SIX = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const MONTH = '2026-10';
const AFTER = '2026-11-05'; // a "today" after the month: it is complete

// One expense of `amount` in `categoryId` on the 10th of each month.
const every = (months, amount, categoryId) => months.map((m) => expense(amount, `${m}-10`, categoryId));

// --- rules ---

test('the rules are the documented ones', () => {
  assert.equal(BASELINE_MONTHS, 6);
  assert.equal(BASELINE_MIN, 3);
  assert.equal(NOTABLE_EUROS, 20);
  assert.equal(NOTABLE_SHARE, 0.25);
  assert.equal(EXPLAIN_COUNT, 3);
});

// --- normal month ---

test('a month close to its average is normal, with totals present', () => {
  const movements = [...every(SIX, 100, 'food'), expense(110, '2026-10-05', 'food')];
  assert.deepEqual(monthDeviations(movements, MONTH, AFTER), {
    status: 'normal',
    month: MONTH,
    inProgress: false,
    baselineMonths: 6,
    spent: 110,
    average: 100,
    difference: 10,
    categories: [],
  });
});

// --- spikes ---

test('a category that spikes is reported with its exact excess in cents', () => {
  const a = expense(40.1, '2026-10-03', 'food');
  const b = expense(30.2, '2026-10-12', 'food');
  const c = expense(0.1, '2026-10-20', 'food');
  const movements = [...every(SIX, 50.1, 'food'), a, b, c];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.spent, 70.4);
  assert.equal(result.average, 50.1);
  assert.equal(result.difference, 20.3);
  assert.deepEqual(result.categories, [{
    categoryId: 'food', spent: 70.4, average: 50.1, excess: 20.3, isNew: false, movements: [a],
  }]);
});

test('several deviating categories are sorted by excess, biggest first', () => {
  const movements = [
    ...every(SIX, 50.1, 'food'),
    ...every(SIX, 10, 'fun'),
    ...every(SIX, 30, 'home'),
    expense(70.4, '2026-10-03', 'food'), // excess 20.30
    expense(60.2, '2026-10-04', 'fun'), // excess 50.20
    expense(31, '2026-10-05', 'home'), // excess 1: not notable
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.categories.map((c) => [c.categoryId, c.excess]), [['fun', 50.2], ['food', 20.3]]);
  assert.equal(result.spent, 161.6);
  assert.equal(result.average, 90.1);
  assert.equal(result.difference, 71.5);
});

test('large amounts stay exact', () => {
  const movements = [...every(SIX, 100000.01, 'home'), expense(125000.02, '2026-10-01', 'home')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.categories[0].excess, 25000.01);
  assert.equal(result.difference, 25000.01);
});

// --- thresholds ---

test('an excess of 19,99 € is not notable even above 25 %', () => {
  const movements = [...every(SIX, 10, 'food'), expense(29.99, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'normal');
  assert.deepEqual(result.categories, []);
  assert.equal(result.difference, 19.99);
});

test('an excess over 20 € but under 25 % of the average is not notable', () => {
  const movements = [...every(SIX, 100, 'food'), expense(124.99, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'normal');
  assert.deepEqual(result.categories, []);
});

test('an excess of exactly 20 € is notable', () => {
  const movements = [...every(SIX, 40, 'food'), expense(60, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.categories[0].excess, 20);
});

test('an excess of exactly 25 % is notable, one céntimo less is not', () => {
  const exact = monthDeviations([...every(SIX, 200, 'food'), expense(250, '2026-10-05', 'food')], MONTH, AFTER);
  assert.equal(exact.status, 'ok');
  assert.equal(exact.categories[0].excess, 50);

  const under = monthDeviations([...every(SIX, 200, 'food'), expense(249.99, '2026-10-05', 'food')], MONTH, AFTER);
  assert.equal(under.status, 'normal');
});

test('exactly 20 € that is also exactly 25 % is notable', () => {
  const movements = [...every(SIX, 80, 'food'), expense(100, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.categories[0].excess, 20);
});

// --- new categories ---

test('a new category over 20 € is listed as new with average 0', () => {
  const trip = expense(20.01, '2026-10-08', 'travel');
  const movements = [...every(SIX, 100, 'food'), expense(100, '2026-10-05', 'food'), trip];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.categories, [{
    categoryId: 'travel', spent: 20.01, average: 0, excess: 20.01, isNew: true, movements: [trip],
  }]);
});

test('a new category of 19,99 € is not listed', () => {
  const movements = [...every(SIX, 100, 'food'), expense(100, '2026-10-05', 'food'), expense(19.99, '2026-10-08', 'travel')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'normal');
  assert.deepEqual(result.categories, []);
  assert.equal(result.spent, 119.99);
});

// --- baseline length ---

test('with no movements there is not enough history', () => {
  assert.deepEqual(monthDeviations([], MONTH, AFTER), { status: 'insufficient', month: MONTH });
});

test('a book that started 2 months before is insufficient', () => {
  const movements = [...every(['2026-08', '2026-09'], 50, 'food'), expense(500, '2026-10-05', 'food')];
  assert.deepEqual(monthDeviations(movements, MONTH, AFTER), { status: 'insufficient', month: MONTH });
});

test('a book that started exactly 3 months before works', () => {
  const movements = [...every(['2026-07', '2026-08', '2026-09'], 50, 'food'), expense(80, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.baselineMonths, 3);
  assert.equal(result.average, 50);
  assert.equal(result.categories[0].excess, 30);
});

test('the baseline never uses months before the first movement', () => {
  // Book starts in June: June..September are 4 months; only June spends.
  const movements = [expense(100, '2026-06-10', 'food'), expense(60, '2026-10-05', 'food')];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.baselineMonths, 4);
  assert.equal(result.average, 25);
  assert.equal(result.categories[0].average, 25);
  assert.equal(result.categories[0].excess, 35);
});

test('the baseline is at most 6 months even with more history', () => {
  const movements = [
    expense(1000, '2025-01-10', 'food'),
    expense(600, '2026-03-10', 'food'), // 7 months before: out
    ...every(SIX, 60, 'food'),
    expense(60, '2026-10-05', 'food'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.baselineMonths, 6);
  assert.equal(result.average, 60);
  assert.equal(result.status, 'normal');
  assert.equal(result.difference, 0);
});

test('months with no spending in a category count as 0 in its average', () => {
  const movements = [
    ...every(SIX, 100, 'food'),
    expense(60, '2026-04-15', 'fun'), // only April: average 60 / 6 = 10
    expense(100, '2026-10-05', 'food'),
    expense(40, '2026-10-06', 'fun'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.deepEqual(result.categories.map((c) => [c.categoryId, c.average, c.excess, c.isNew]), [['fun', 10, 30, false]]);
  assert.equal(result.average, 110);
});

// --- fixed costs ---

test('fixed costs count in spent and average', () => {
  const rent = (date) => expense(500, date, 'rent', { note: 'Rent' });
  const movements = [
    ...SIX.map((m) => rent(`${m}-01`)),
    ...every(SIX, 100, 'food'),
    rent('2026-10-01'),
    expense(150, '2026-10-05', 'food'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.spent, 650);
  assert.equal(result.average, 600);
  assert.equal(result.difference, 50);
  assert.deepEqual(result.categories.map((c) => [c.categoryId, c.excess]), [['food', 50]]);
});

// --- explaining movements ---

test('explaining movements: biggest first, stop once the excess is covered', () => {
  const m40 = expense(40, '2026-10-01', 'food');
  const m30 = expense(30, '2026-10-02', 'food');
  const m25 = expense(25, '2026-10-03', 'food');
  const m10 = expense(10, '2026-10-04', 'food');
  const m5 = expense(5, '2026-10-05', 'food');
  const movements = [...every(SIX, 50, 'food'), m5, m25, m10, m40, m30];
  const [food] = monthDeviations(movements, MONTH, AFTER).categories;
  assert.equal(food.excess, 60);
  assert.deepEqual(food.movements, [m40, m30]);
});

test('explaining movements stop when one covers the excess exactly', () => {
  const a = expense(30, '2026-10-01', 'food');
  const b = expense(30, '2026-10-02', 'food');
  const c = expense(10, '2026-10-03', 'food');
  const movements = [...every(SIX, 40, 'food'), a, b, c];
  const [food] = monthDeviations(movements, MONTH, AFTER).categories;
  assert.equal(food.excess, 30);
  // Same amount: the latest date goes first.
  assert.deepEqual(food.movements, [b]);
});

test('at most 3 explaining movements', () => {
  const days = ['01', '02', '03', '04', '05', '06'];
  const october = days.map((d) => expense(20, `2026-10-${d}`, 'food'));
  const movements = [...every(SIX, 10, 'food'), ...october];
  const [food] = monthDeviations(movements, MONTH, AFTER).categories;
  assert.equal(food.excess, 110);
  assert.equal(food.movements.length, 3);
  assert.deepEqual(food.movements, [october[5], october[4], october[3]]);
});

// --- month in progress ---

test('in the month in progress only movements up to today count, against the whole average', () => {
  const movements = [
    ...every(SIX, 50, 'food'),
    expense(79, '2026-10-05', 'food'),
    expense(1, '2026-10-15', 'food'), // today: counts
    expense(500, '2026-10-16', 'food'), // future: out
  ];
  const result = monthDeviations(movements, MONTH, '2026-10-15');
  assert.equal(result.inProgress, true);
  assert.equal(result.spent, 80);
  assert.equal(result.average, 50);
  assert.equal(result.difference, 30);
  assert.equal(result.categories[0].excess, 30);
  assert.ok(result.categories[0].movements.every((m) => m.date <= '2026-10-15'));
});

test('a past month is not in progress', () => {
  const movements = [...every(SIX, 50, 'food'), expense(50, '2026-10-31', 'food')];
  const result = monthDeviations(movements, MONTH, '2026-11-01');
  assert.equal(result.inProgress, false);
  assert.equal(result.spent, 50);
});

// --- total below average ---

test('the total can be below average while one category deviates', () => {
  const movements = [
    ...every(SIX, 100, 'food'),
    ...every(SIX, 10, 'fun'),
    expense(20, '2026-10-05', 'food'),
    expense(40, '2026-10-06', 'fun'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'ok');
  assert.equal(result.spent, 60);
  assert.equal(result.average, 110);
  assert.equal(result.difference, -50);
  assert.deepEqual(result.categories.map((c) => [c.categoryId, c.excess]), [['fun', 30]]);
});

// --- incomes ---

test('incomes are left out of the sums', () => {
  const movements = [
    ...SIX.map((m) => income(2000, `${m}-28`)),
    ...every(SIX, 100, 'food'),
    income(5000, '2026-10-28'),
    expense(100, '2026-10-05', 'food'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.status, 'normal');
  assert.equal(result.spent, 100);
  assert.equal(result.average, 100);
  assert.equal(result.difference, 0);
});

test('an income can mark the first month of the book', () => {
  const movements = [
    income(1000, '2026-07-01'),
    ...every(['2026-08', '2026-09'], 30, 'food'),
    expense(60, '2026-10-05', 'food'),
  ];
  const result = monthDeviations(movements, MONTH, AFTER);
  assert.equal(result.baselineMonths, 3);
  assert.equal(result.average, 20);
  assert.equal(result.categories[0].excess, 40);
});

// --- yearDeviations ---

test('yearDeviations gives status, difference and top per month', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  const movements = [
    ...every(months, 30, 'food'),
    expense(50, '2026-05-20', 'fun'),
  ];
  assert.deepEqual(yearDeviations(movements, months, AFTER), [
    { month: '2026-01', status: 'insufficient', difference: null, top: null },
    { month: '2026-02', status: 'insufficient', difference: null, top: null },
    { month: '2026-03', status: 'insufficient', difference: null, top: null },
    { month: '2026-04', status: 'normal', difference: 0, top: null },
    { month: '2026-05', status: 'ok', difference: 50, top: { categoryId: 'fun', excess: 50 } },
    // Baseline January..May: (5 × 30 + 50) / 5 = 40.
    { month: '2026-06', status: 'normal', difference: -10, top: null },
  ]);
});

test('yearDeviations picks the biggest excess as top', () => {
  const movements = [
    ...every(SIX, 10, 'food'),
    ...every(SIX, 10, 'fun'),
    expense(40, '2026-10-01', 'food'), // excess 30
    expense(55.5, '2026-10-02', 'fun'), // excess 45,50
  ];
  assert.deepEqual(yearDeviations(movements, [MONTH], AFTER), [
    { month: MONTH, status: 'ok', difference: 75.5, top: { categoryId: 'fun', excess: 45.5 } },
  ]);
});

test('yearDeviations of no months is empty', () => {
  assert.deepEqual(yearDeviations([], [], AFTER), []);
});
