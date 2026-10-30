import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countable, daysInMonth, periodMonths, previousMonths, monthlySeries, keyFigures,
  categoryChanges, categoryTrends, monthPace, weekdayPattern, fixedCosts, largestExpenses,
} from '../js/domain/analysis.js';
import { TRANSFER_CATEGORY_ID } from '../js/domain/category.js';

let seq = 0;
const mv = (type, amount, date, categoryId = 'food', extra = {}) => ({
  id: `m-${++seq}`, type, amount, date, categoryId, accountId: 'bank', deleted: false, ...extra,
});
const expense = (amount, date, categoryId, extra) => mv('expense', amount, date, categoryId, extra);
const income = (amount, date, categoryId = 'salary', extra) => mv('income', amount, date, categoryId, extra);

// --- countable ---

test('countable drops deleted movements and transfers', () => {
  const keep = expense(10, '2026-10-01', 'food');
  const kept = income(500, '2026-10-02');
  const movements = [
    keep,
    kept,
    expense(20, '2026-10-03', 'food', { deleted: true }),
    expense(30, '2026-10-04', TRANSFER_CATEGORY_ID),
    income(30, '2026-10-04', TRANSFER_CATEGORY_ID),
  ];
  assert.deepEqual(countable(movements), [keep, kept]);
});

test('countable drops excluded categories given as an array or a Set', () => {
  const food = expense(10, '2026-10-01', 'food');
  const rent = expense(700, '2026-10-01', 'rent');
  const fun = expense(25, '2026-10-05', 'fun');
  const movements = [food, rent, fun];
  assert.deepEqual(countable(movements, ['rent']), [food, fun]);
  assert.deepEqual(countable(movements, new Set(['rent', 'fun'])), [food]);
  assert.deepEqual(countable(movements, []), movements);
});

test('countable on an empty list is empty', () => {
  assert.deepEqual(countable([]), []);
});

// --- daysInMonth ---

test('daysInMonth knows 31, 30 and February lengths', () => {
  assert.equal(daysInMonth('2026-01'), 31);
  assert.equal(daysInMonth('2026-04'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
  assert.equal(daysInMonth('2026-02'), 28);
});

test('daysInMonth handles leap years', () => {
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2000-02'), 29);
  assert.equal(daysInMonth('2100-02'), 28);
});

// --- periodMonths ---

test("periodMonths 'month' gives today's month or the given one", () => {
  assert.deepEqual(periodMonths('month', { today: '2026-10-30' }), ['2026-10']);
  assert.deepEqual(periodMonths('month', { today: '2026-10-30', month: '2026-07' }), ['2026-07']);
});

test("periodMonths 'year' gives the 12 months ending at today's month", () => {
  const months = periodMonths('year', { today: '2026-10-30' });
  assert.equal(months.length, 12);
  assert.equal(months[0], '2025-11');
  assert.equal(months[11], '2026-10');
  assert.deepEqual(periodMonths('year', { today: '2026-01-15' }), [
    '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07',
    '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
  ]);
});

test("periodMonths 'all' runs from the first month to today's, crossing years", () => {
  assert.deepEqual(periodMonths('all', { today: '2026-10-30', first: '2026-08' }), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(periodMonths('all', { today: '2026-02-01', first: '2025-11' }), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(periodMonths('all', { today: '2026-10-30', first: '2026-10' }), ['2026-10']);
});

test("periodMonths 'all' without a first month is just today's", () => {
  assert.deepEqual(periodMonths('all', { today: '2026-10-30' }), ['2026-10']);
});

// --- previousMonths ---

test('previousMonths gives the same number of months right before', () => {
  assert.deepEqual(previousMonths(['2026-10']), ['2026-09']);
  assert.deepEqual(previousMonths(['2026-01', '2026-02']), ['2025-11', '2025-12']);
  assert.deepEqual(previousMonths(['2026-09', '2026-10', '2026-11']), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(previousMonths([]), []);
});

// --- monthlySeries ---

test('monthlySeries sums income, expense and net per month in cents', () => {
  const movements = [
    expense(0.1, '2026-10-01'),
    expense(0.2, '2026-10-31'),
    income(1000, '2026-10-01'),
    expense(99, '2026-08-15'), // outside the months asked
  ];
  assert.deepEqual(monthlySeries(movements, ['2026-09', '2026-10']), [
    { month: '2026-09', income: 0, expense: 0, net: 0 },
    { month: '2026-10', income: 1000, expense: 0.3, net: 999.7 },
  ]);
});

test('monthlySeries handles one cent, large amounts and negative net', () => {
  const movements = [
    expense(0.01, '2026-10-05'),
    income(1234567.89, '2026-11-01'),
    expense(1234567.9, '2026-11-02'),
  ];
  assert.deepEqual(monthlySeries(movements, ['2026-10', '2026-11']), [
    { month: '2026-10', income: 0, expense: 0.01, net: -0.01 },
    { month: '2026-11', income: 1234567.89, expense: 1234567.9, net: -0.01 },
  ]);
});

test('monthlySeries with no movements gives zeros for every month', () => {
  assert.deepEqual(monthlySeries([], ['2026-10']), [{ month: '2026-10', income: 0, expense: 0, net: 0 }]);
});

// --- keyFigures ---

test('keyFigures for a single month: average, change, savings, projection, per day', () => {
  const movements = [
    expense(300, '2026-10-05'),
    income(1000, '2026-10-01'),
    expense(200, '2026-09-10'),
  ];
  // usual = 200 € over the 12 months 2025-10..2026-09 = 16.67 €
  // projection = 300 / 15 × 31 = 620 €
  assert.deepEqual(keyFigures(movements, ['2026-10'], '2026-10-15'), {
    averageExpense: 300,
    averageChange: 50,
    savingsRate: 70,
    projection: 620,
    projectionOverUsual: 603.33,
    perDay: 20,
  });
});

test('keyFigures projects only what is spent up to today', () => {
  const movements = [expense(300, '2026-10-05'), expense(900, '2026-10-25')];
  assert.equal(keyFigures(movements, ['2026-10'], '2026-10-15').projection, 620);
});

test('keyFigures averageChange is null when the book does not reach back to the previous period', () => {
  const months = periodMonths('year', { today: '2026-10-30' }); // 2025-11..2026-10
  const movements = [expense(1200, '2024-12-01'), expense(2400, '2026-01-10')];
  assert.equal(keyFigures(movements, months, '2026-10-30').averageChange, null);
  assert.equal(keyFigures([expense(300, '2026-10-05')], ['2026-10'], '2026-10-15').averageChange, null);
});

test('keyFigures averageChange is a number when the book reaches the start of the previous period', () => {
  const months = periodMonths('year', { today: '2026-10-30' }); // previous starts 2024-11
  const movements = [expense(1200, '2024-11-01'), expense(2400, '2026-01-10')];
  const figures = keyFigures(movements, months, '2026-10-30');
  assert.equal(figures.averageExpense, 200); // 2400 / 12
  assert.equal(figures.averageChange, 100); // 200 vs 100
  // 364 days from 2025-11-01 to 2026-10-30: 2400 / 364 = 6.593… → 6.59
  assert.equal(figures.perDay, 6.59);
});

test('keyFigures averageChange is null when the previous period spent nothing', () => {
  const movements = [income(50, '2026-09-01'), expense(300, '2026-10-05')];
  assert.equal(keyFigures(movements, ['2026-10'], '2026-10-15').averageChange, null);
});

test('keyFigures savingsRate is null with no income and negative when spending exceeds it', () => {
  assert.equal(keyFigures([expense(300, '2026-10-05')], ['2026-10'], '2026-10-15').savingsRate, null);
  const over = [income(100, '2026-10-01'), expense(150, '2026-10-02')];
  assert.equal(keyFigures(over, ['2026-10'], '2026-10-15').savingsRate, -50);
});

test('keyFigures projectionOverUsual compares with the average of the 12 months before the current', () => {
  const movements = [expense(1000, '2025-09-15')]; // 13 months back: not counted
  for (let n = 0; n < 12; n += 1) {
    const month = n < 3 ? `2025-${10 + n}` : `2026-0${n - 2}`; // 2025-10 .. 2026-09
    movements.push(expense(100, `${month}-15`));
  }
  movements.push(expense(50, '2026-10-03'));
  // projection = 50 / 10 × 31 = 155; usual = 100
  assert.deepEqual(keyFigures(movements, ['2026-10'], '2026-10-10'), {
    averageExpense: 50,
    averageChange: -50,
    savingsRate: null,
    projection: 155,
    projectionOverUsual: 55,
    perDay: 5,
  });
});

test('keyFigures projection on the last day of the month equals what was spent', () => {
  const figures = keyFigures([expense(310, '2026-10-31')], ['2026-10'], '2026-10-31');
  assert.equal(figures.projection, 310);
  assert.equal(figures.perDay, 10);
});

test('keyFigures perDay over a past month uses all its days', () => {
  const figures = keyFigures([expense(300, '2026-09-10')], ['2026-09'], '2026-10-15');
  assert.equal(figures.perDay, 10);
  assert.equal(figures.projection, 0);
});

test('keyFigures with no movements gives zeros and nulls', () => {
  assert.deepEqual(keyFigures([], ['2026-10'], '2026-10-15'), {
    averageExpense: 0,
    averageChange: null,
    savingsRate: null,
    projection: 0,
    projectionOverUsual: 0,
    perDay: 0,
  });
});

// --- categoryChanges ---

const changesFixture = () => [
  expense(30, '2026-10-01', 'food'),
  expense(20, '2026-10-20', 'food'),
  expense(500, '2026-10-01', 'rent'),
  expense(50, '2026-10-12', 'fun'),
  expense(25, '2026-09-12', 'fun'),
  expense(500, '2026-09-01', 'rent'),
  expense(80, '2026-09-08', 'gifts'), // only before: not listed
  income(2000, '2026-10-01', 'salary'),
  expense(999, '2026-08-01', 'food'), // two months back: ignored
];

test('categoryChanges sorts biggest first, ties by id, with previous and change', () => {
  assert.deepEqual(categoryChanges(changesFixture(), ['2026-10']), [
    { categoryId: 'rent', amount: 500, previous: 500, change: 0 },
    { categoryId: 'food', amount: 50, previous: 0, change: null },
    { categoryId: 'fun', amount: 50, previous: 25, change: 100 },
  ]);
});

test('categoryChanges with compare:false gives null previous and change', () => {
  assert.deepEqual(categoryChanges(changesFixture(), ['2026-10'], { compare: false }), [
    { categoryId: 'rent', amount: 500, previous: null, change: null },
    { categoryId: 'food', amount: 50, previous: null, change: null },
    { categoryId: 'fun', amount: 50, previous: null, change: null },
  ]);
});

test('categoryChanges sums cents safely and rounds the change', () => {
  const movements = [
    expense(0.1, '2026-10-01', 'food'),
    expense(0.2, '2026-10-02', 'food'),
    expense(0.2, '2026-09-02', 'food'),
  ];
  // 0.30 vs 0.20 → +50 %
  assert.deepEqual(categoryChanges(movements, ['2026-10']), [
    { categoryId: 'food', amount: 0.3, previous: 0.2, change: 50 },
  ]);
  const third = [expense(2, '2026-10-01', 'food'), expense(3, '2026-09-01', 'food')];
  assert.equal(categoryChanges(third, ['2026-10'])[0].change, -33); // -33.3… → -33
});

test('categoryChanges with nothing in the period is empty', () => {
  assert.deepEqual(categoryChanges([expense(10, '2026-09-01')], ['2026-10']), []);
});

// --- categoryTrends ---

const sixMonths = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const monthly = (categoryId, amounts) => amounts.map((amount, i) => expense(amount, `${sixMonths[i]}-10`, categoryId));

test('categoryTrends marks up, down and flat at ±15 %', () => {
  const movements = [
    ...monthly('up', [100, 100, 100, 120, 120, 120]), // +20 % → up (total 660)
    ...monthly('flat', [100, 100, 100, 115, 115, 115]), // +15 % exactly → flat (645)
    ...monthly('flatdown', [100, 100, 100, 85, 85, 85]), // -15 % exactly → flat (555)
    ...monthly('down', [100, 100, 100, 80, 80, 80]), // -20 % → down (540)
    ...monthly('tiny', [1, 1, 1, 1, 1, 1]), // fifth: left out by default
  ];
  assert.deepEqual(categoryTrends(movements, sixMonths), [
    { categoryId: 'up', series: [100, 100, 100, 120, 120, 120], trend: 'up' },
    { categoryId: 'flat', series: [100, 100, 100, 115, 115, 115], trend: 'flat' },
    { categoryId: 'flatdown', series: [100, 100, 100, 85, 85, 85], trend: 'flat' },
    { categoryId: 'down', series: [100, 100, 100, 80, 80, 80], trend: 'down' },
  ]);
  assert.deepEqual(categoryTrends(movements, sixMonths, 2).map((t) => t.categoryId), ['up', 'flat']);
});

test('categoryTrends is flat with no earlier months or nothing spent earlier', () => {
  const short = [expense(50, '2026-10-01', 'food')];
  assert.deepEqual(categoryTrends(short, ['2026-10']), [{ categoryId: 'food', series: [50], trend: 'flat' }]);
  const fresh = monthly('new', [0, 0, 0, 10, 20, 30]).filter((m) => m.amount > 0);
  assert.deepEqual(categoryTrends(fresh, sixMonths), [{ categoryId: 'new', series: [0, 0, 0, 10, 20, 30], trend: 'flat' }]);
});

test('categoryTrends ignores income and is empty with no expenses', () => {
  assert.deepEqual(categoryTrends([income(100, '2026-10-01')], sixMonths), []);
});

// --- monthPace ---

test('monthPace gives cumulative spending up to today and the usual spread', () => {
  const peak = expense(20, '2026-10-03');
  const movements = [
    expense(10, '2026-10-01'),
    peak,
    income(500, '2026-10-02'),
    expense(50, '2026-09-30'), // another month
  ];
  const pace = monthPace(movements, '2026-10-03', 310);
  assert.equal(pace.days, 31);
  assert.deepEqual(pace.spent, [10, 10, 30]);
  assert.equal(pace.usual.length, 31);
  assert.equal(pace.usual[0], 10);
  assert.equal(pace.usual[14], 150);
  assert.equal(pace.usual[30], 310);
  assert.equal(pace.peak, peak); // 20 × 4 ≥ 30
});

test('monthPace usual rounds each day to cents and ends at the monthly figure', () => {
  const pace = monthPace([], '2026-11-01', 100);
  assert.equal(pace.days, 30);
  assert.equal(pace.usual[0], 3.33);
  assert.equal(pace.usual[1], 6.67);
  assert.equal(pace.usual[29], 100);
});

test('monthPace peak only stands out at a quarter of the month or more', () => {
  const four = [1, 2, 3, 4].map((d) => expense(10, `2026-10-0${d}`));
  assert.equal(monthPace(four, '2026-10-05', 0).peak, four[0]); // 10 × 4 = 40 ≥ 40
  const five = [1, 2, 3, 4, 5].map((d) => expense(10, `2026-10-0${d}`));
  assert.equal(monthPace(five, '2026-10-05', 0).peak, null); // 40 < 50
});

test('monthPace leaves out expenses dated after today, for the peak too', () => {
  const today = expense(10, '2026-10-01');
  const pace = monthPace([today, expense(999, '2026-10-20')], '2026-10-03', 0);
  assert.deepEqual(pace.spent, [10, 10, 10]);
  assert.equal(pace.peak, today);
});

test('monthPace with nothing spent has zeros and no peak', () => {
  const pace = monthPace([], '2026-02-28', 0);
  assert.equal(pace.days, 28);
  assert.equal(pace.spent.length, 28);
  assert.ok(pace.spent.every((x) => x === 0));
  assert.equal(pace.peak, null);
});

test('monthPace on February of a leap year', () => {
  const pace = monthPace([expense(0.1, '2028-02-01'), expense(0.2, '2028-02-29')], '2028-02-29', 29);
  assert.equal(pace.days, 29);
  assert.equal(pace.spent[0], 0.1);
  assert.equal(pace.spent[28], 0.3);
  assert.equal(pace.usual[28], 29);
});

// --- weekdayPattern ---

// June 2026 starts on a Monday: 5 Mondays and 5 Tuesdays, 4 of every other day.
test('weekdayPattern averages per weekday, Monday first, over a full past month', () => {
  const movements = [
    expense(50, '2026-06-01'), // Mon
    expense(50, '2026-06-08'), // Mon
    expense(10, '2026-06-02'), // Tue
    expense(40, '2026-06-07'), // Sun
    income(900, '2026-06-03'), // Wed, income: ignored
    expense(70, '2026-07-01'), // outside the months
  ];
  assert.deepEqual(weekdayPattern(movements, ['2026-06'], '2026-10-30'), [20, 2, 0, 0, 0, 0, 10]);
});

test('weekdayPattern only counts weekdays up to today in the current month', () => {
  const movements = [
    expense(30, '2026-06-01'), // Mon: 2 Mondays so far → 15
    expense(25, '2026-06-04'), // Thu: 1 so far → 25
    expense(100, '2026-06-20'), // after today: ignored
  ];
  assert.deepEqual(weekdayPattern(movements, ['2026-06'], '2026-06-10'), [15, 0, 0, 25, 0, 0, 0]);
});

test('weekdayPattern with no movements is all zeros', () => {
  assert.deepEqual(weekdayPattern([], ['2026-10'], '2026-10-30'), [0, 0, 0, 0, 0, 0, 0]);
});

// --- fixedCosts ---

test('fixedCosts finds payments repeated in 3 of the last 4 complete months', () => {
  const movements = [
    // case and spaces in the note do not matter
    expense(12.99, '2026-06-05', 'subs', { note: 'Netflix' }),
    expense(12.99, '2026-07-05', 'subs', { note: '  netflix ' }),
    expense(12.99, '2026-08-05', 'subs', { note: 'NETFLIX' }),
    // 4 months, max 770 = min 700 × 1.1: still within 10 %
    expense(700, '2026-06-01', 'home', { note: 'Alquiler' }),
    expense(700, '2026-07-01', 'home', { note: 'Alquiler' }),
    expense(750, '2026-08-01', 'home', { note: 'Alquiler' }),
    expense(770, '2026-09-01', 'home', { note: 'Alquiler' }),
  ];
  assert.deepEqual(fixedCosts(movements, '2026-10-30'), [
    { note: 'Alquiler', categoryId: 'home', day: 1, amount: 770 },
    { note: 'NETFLIX', categoryId: 'subs', day: 5, amount: 12.99 },
  ]);
});

test('fixedCosts leaves out what does not repeat enough or varies over 10 %', () => {
  const movements = [
    // over 10 %: 34 > 30 × 1.1
    expense(30, '2026-06-02', 'sport', { note: 'Gym' }),
    expense(30, '2026-07-02', 'sport', { note: 'Gym' }),
    expense(34, '2026-08-02', 'sport', { note: 'Gym' }),
    // same note, different category: two groups of fewer than 3
    expense(40, '2026-06-03', 'food', { note: 'Super' }),
    expense(40, '2026-07-03', 'food', { note: 'Super' }),
    expense(40, '2026-08-03', 'home', { note: 'Super' }),
    // the current month does not count
    expense(20, '2026-07-04', 'phone', { note: 'Phone' }),
    expense(20, '2026-08-04', 'phone', { note: 'Phone' }),
    expense(20, '2026-10-04', 'phone', { note: 'Phone' }),
    // five months back is outside the window
    expense(15, '2026-05-06', 'car', { note: 'Gas' }),
    expense(15, '2026-06-06', 'car', { note: 'Gas' }),
    expense(15, '2026-07-06', 'car', { note: 'Gas' }),
    // three times in one month is one month
    expense(2, '2026-09-01', 'food', { note: 'Coffee' }),
    expense(2, '2026-09-02', 'food', { note: 'Coffee' }),
    expense(2, '2026-09-03', 'food', { note: 'Coffee' }),
    // no note: ignored
    expense(9, '2026-06-07', 'misc'),
    expense(9, '2026-07-07', 'misc', { note: '' }),
    expense(9, '2026-08-07', 'misc', { note: '   ' }),
    // income: ignored
    income(1500, '2026-06-28', 'salary', { note: 'Nomina' }),
    income(1500, '2026-07-28', 'salary', { note: 'Nomina' }),
    income(1500, '2026-08-28', 'salary', { note: 'Nomina' }),
  ];
  assert.deepEqual(fixedCosts(movements, '2026-10-30'), []);
});

test('fixedCosts window crosses the year', () => {
  const movements = ['2025-10', '2025-11', '2025-12'].map((month) => expense(5, `${month}-15`, 'subs', { note: 'Cloud' }));
  assert.deepEqual(fixedCosts(movements, '2026-01-10'), [{ note: 'Cloud', categoryId: 'subs', day: 15, amount: 5 }]);
  assert.deepEqual(fixedCosts(movements, '2026-03-10'), []); // window 2025-11..2026-02: only 2
});

// --- largestExpenses ---

test('largestExpenses gives the top 3 and the monthly average without them', () => {
  const big = expense(500, '2026-09-03');
  const tieNew = expense(300, '2026-10-02');
  const tieOld = expense(300, '2026-09-15');
  const movements = [
    expense(50, '2026-10-05'),
    tieOld,
    big,
    expense(20, '2026-09-20'),
    tieNew,
    expense(10, '2026-10-30'),
    income(1000, '2026-10-01'),
    expense(900, '2026-08-01'), // outside the months
  ];
  const result = largestExpenses(movements, ['2026-09', '2026-10']);
  assert.deepEqual(result.items, [big, tieNew, tieOld]);
  assert.equal(result.averageWithout, 40); // (50 + 20 + 10) / 2
});

test('largestExpenses with fewer expenses than asked, a custom count and cents', () => {
  const only = expense(10, '2026-10-01');
  assert.deepEqual(largestExpenses([only], ['2026-10']), { items: [only], averageWithout: 0 });
  const a = expense(0.1, '2026-10-01');
  const b = expense(0.2, '2026-10-02');
  const c = expense(5, '2026-10-03');
  assert.deepEqual(largestExpenses([a, b, c], ['2026-10'], 1), { items: [c], averageWithout: 0.3 });
  assert.deepEqual(largestExpenses([], ['2026-10']), { items: [], averageWithout: 0 });
});
