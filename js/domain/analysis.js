// Analysis (tarea 20e): how spending moves over time — what, when, how and
// on what the money goes. Pure functions over the book's movements; sums
// in cents. Transfers never count (they move money, they neither earn nor
// spend it), and neither do the categories the user excludes.
//
// Months are "YYYY-MM" and days "YYYY-MM-DD", both without time zone.

import { TRANSFER_CATEGORY_ID } from './category.js';
import { fromCents, toCents } from './money.js';
import { activeOnly } from './active.js';
import { shiftMonth } from './stats.js';

const monthOf = (date) => date.slice(0, 7);

// The movements that count: active, not a transfer, not excluded.
// excluded: category ids (a Set or an array).
export function countable(movements, excluded = []) {
  const out = new Set(excluded);
  return activeOnly(movements).filter((m) => m.categoryId !== TRANSFER_CATEGORY_ID && !out.has(m.categoryId));
}

// Days in a month: daysInMonth('2026-02') → 28.
export function daysInMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

// The months of a period, oldest first. period: 'month' (just `month`),
// 'year' (the 12 months that end with today's, but none before `first`:
// a young book is not averaged over months it did not have) or 'all'
// (from `first`).
export function periodMonths(period, { today, first, month = monthOf(today) }) {
  const last = monthOf(today);
  if (period === 'month') return [month];
  const yearStart = shiftMonth(last, -11);
  const start = period === 'year' ? (first && first > yearStart ? first : yearStart) : (first ?? last);
  const months = [];
  for (let current = start; current <= last; current = shiftMonth(current, 1)) months.push(current);
  return months;
}

// The same number of months right before `months` (to compare with).
export function previousMonths(months) {
  return months.map((month) => shiftMonth(month, -months.length));
}

// Income, expense and net per month, in euros: [{ month, income, expense, net }].
export function monthlySeries(movements, months) {
  const cents = new Map(months.map((month) => [month, { income: 0, expense: 0 }]));
  for (const movement of movements) {
    const sums = cents.get(monthOf(movement.date));
    if (!sums) continue;
    sums[movement.type === 'income' ? 'income' : 'expense'] += toCents(movement.amount);
  }
  return months.map((month) => {
    const { income, expense } = cents.get(month);
    return { month, income: fromCents(income), expense: fromCents(expense), net: fromCents(income - expense) };
  });
}

const sumOf = (list, key) => list.reduce((sum, item) => sum + toCents(item[key]), 0);

// Change from `before` to `now` as a whole percentage, or null when there
// is nothing to compare with.
const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

// The key figures of a period: average spending per month and its change
// from the previous period of the same length, the share of income saved,
// what this month would end at at this pace and the spending per day.
// movements: already countable. today: YYYY-MM-DD. usual (a usual month,
// the average of the 12 before this one that the book has) and
// projectionOverUsual are null when there is no month before.
export function keyFigures(movements, months, today) {
  const series = monthlySeries(movements, months);
  const before = monthlySeries(movements, previousMonths(months));
  const expense = sumOf(series, 'expense');
  const income = sumOf(series, 'income');
  const average = Math.round(expense / months.length);
  // Only compared when the book reaches back to the start of that period.
  const hadBefore = movements.some((m) => monthOf(m.date) <= previousMonths(months)[0]);
  const averageBefore = Math.round(sumOf(before, 'expense') / months.length);

  // This month at this pace, against the average of the 12 months before it.
  const month = monthOf(today);
  const day = Number(today.slice(8, 10));
  const spentSoFar = sumOf(monthlySeries(movements.filter((m) => m.date <= today), [month]), 'expense');
  const projection = Math.round((spentSoFar / day) * daysInMonth(month));
  const firstMonth = movements.reduce((min, m) => (monthOf(m.date) < min ? monthOf(m.date) : min), month);
  const pastMonths = periodMonths('year', { today: `${shiftMonth(month, -1)}-01` }).filter((m) => m >= firstMonth);
  const past = monthlySeries(movements, pastMonths);
  const usual = past.length ? Math.round(sumOf(past, 'expense') / past.length) : null;

  // Days the period covers, up to today.
  const lastDay = months.at(-1) === month ? day : daysInMonth(months.at(-1));
  const days = months.slice(0, -1).reduce((sum, m) => sum + daysInMonth(m), 0) + lastDay;

  return {
    averageExpense: fromCents(average),
    averageChange: hadBefore ? change(average, averageBefore) : null,
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    projection: fromCents(projection),
    usual: usual === null ? null : fromCents(usual),
    projectionOverUsual: usual === null ? null : fromCents(projection - usual),
    perDay: fromCents(Math.round(expense / days)),
  };
}

// Spending per category in the period, biggest first, with the same months
// before to compare: [{ categoryId, amount, previous, change }]. previous
// is null when `compare` is false (the whole history has nothing before).
export function categoryChanges(movements, months, { compare = true } = {}) {
  const inside = new Set(months);
  const before = new Set(previousMonths(months));
  const now = new Map();
  const then = new Map();
  for (const movement of movements) {
    if (movement.type !== 'expense') continue;
    const month = monthOf(movement.date);
    const target = inside.has(month) ? now : before.has(month) ? then : null;
    if (target) target.set(movement.categoryId, (target.get(movement.categoryId) ?? 0) + toCents(movement.amount));
  }
  return [...now]
    .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
    .map(([categoryId, cents]) => {
      const previous = then.get(categoryId) ?? 0;
      return {
        categoryId,
        amount: fromCents(cents),
        previous: compare ? fromCents(previous) : null,
        change: compare ? change(cents, previous) : null,
      };
    });
}

// Each of the biggest categories month by month over `months`, with where it
// is heading: the last three months against the ones before, ±15 %.
// → [{ categoryId, series: [euros], trend: 'up' | 'down' | 'flat' }]
export function categoryTrends(movements, months, count = 4) {
  const top = categoryChanges(movements, months, { compare: false }).slice(0, count);
  return top.map(({ categoryId }) => {
    const mine = movements.filter((m) => m.type === 'expense' && m.categoryId === categoryId);
    const series = monthlySeries(mine, months).map((point) => point.expense);
    const recent = series.slice(-3);
    const earlier = series.slice(0, -3);
    const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
    const delta = earlier.length && average(earlier) > 0 ? (average(recent) - average(earlier)) / average(earlier) : 0;
    return { categoryId, series, trend: delta > 0.15 ? 'up' : delta < -0.15 ? 'down' : 'flat' };
  });
}

// The month in progress day by day: spending so far each day against a
// month spent at `usualMonthly`. The biggest expense of the month stands out
// when it is a quarter of it or more.
// → { days, spent: [euros per day up to today], usual: [euros], peak }
export function monthPace(movements, today, usualMonthly) {
  const month = monthOf(today);
  const days = daysInMonth(month);
  const day = Number(today.slice(8, 10));
  const daily = new Array(days).fill(0);
  let peak = null;
  for (const movement of movements) {
    // Up to today: an expense dated later has not happened yet.
    if (movement.type !== 'expense' || monthOf(movement.date) !== month || movement.date > today) continue;
    const index = Number(movement.date.slice(8, 10)) - 1;
    daily[index] += toCents(movement.amount);
    if (!peak || toCents(movement.amount) > toCents(peak.amount)) peak = movement;
  }
  const spent = [];
  let running = 0;
  for (let index = 0; index < day; index += 1) {
    running += daily[index];
    spent.push(fromCents(running));
  }
  const usualCents = toCents(usualMonthly);
  const usual = Array.from({ length: days }, (_, index) => fromCents(Math.round((usualCents * (index + 1)) / days)));
  const standsOut = peak && running > 0 && toCents(peak.amount) * 4 >= running;
  return { days, spent, usual, peak: standsOut ? peak : null };
}

// Average spending per weekday over the period, Monday first: [7 euros].
// Each weekday is divided by how many of it the period has up to today.
export function weekdayPattern(movements, months, today) {
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  const last = months.at(-1) === monthOf(today) ? today : `${months.at(-1)}-${daysInMonth(months.at(-1))}`;
  for (const month of months) {
    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date > last) break;
      counts[weekdayOf(date)] += 1;
    }
  }
  const inside = new Set(months);
  for (const movement of movements) {
    if (movement.type !== 'expense' || !inside.has(monthOf(movement.date)) || movement.date > last) continue;
    totals[weekdayOf(movement.date)] += toCents(movement.amount);
  }
  return totals.map((total, index) => (counts[index] ? fromCents(Math.round(total / counts[index])) : 0));
}

// 0 for Monday … 6 for Sunday.
function weekdayOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

const normalize = (note) => note.trim().toLocaleLowerCase('es');

// Payments that come back every month: the same note (and category) in at
// least 3 of the last 4 complete months, with amounts within 10 % of each
// other. → [{ note, categoryId, day, amount }] (the latest one), biggest first.
export function fixedCosts(movements, today) {
  const month = monthOf(today);
  const window = [1, 2, 3, 4].map((step) => shiftMonth(month, -step));
  const groups = new Map();
  for (const movement of movements) {
    if (movement.type !== 'expense' || !movement.note?.trim() || !window.includes(monthOf(movement.date))) continue;
    const key = `${normalize(movement.note)}|${movement.categoryId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(movement);
  }
  const found = [];
  for (const list of groups.values()) {
    const monthsSeen = new Set(list.map((m) => monthOf(m.date)));
    if (monthsSeen.size < 3) continue;
    const amounts = list.map((m) => toCents(m.amount));
    if (Math.max(...amounts) > Math.min(...amounts) * 1.1) continue;
    const latest = list.reduce((a, b) => (b.date > a.date ? b : a));
    found.push({ note: latest.note.trim(), categoryId: latest.categoryId, day: Number(latest.date.slice(8, 10)), amount: latest.amount });
  }
  return found.sort((a, b) => toCents(b.amount) - toCents(a.amount) || a.note.localeCompare(b.note));
}

// The biggest expenses of the period, and the average per month without
// them. → { items: [movement], averageWithout }
export function largestExpenses(movements, months, count = 3) {
  const inside = new Set(months);
  const expenses = movements.filter((m) => m.type === 'expense' && inside.has(monthOf(m.date)));
  const items = [...expenses].sort((a, b) => toCents(b.amount) - toCents(a.amount) || b.date.localeCompare(a.date)).slice(0, count);
  const rest = sumOf(expenses, 'amount') - sumOf(items, 'amount');
  return { items, averageWithout: fromCents(Math.round(rest / months.length)) };
}
