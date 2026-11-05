// Desviaciones (tarea 24): why a month spent more than usual. Each category's
// spending in the month is set against its average over the months before
// it, and the ones that went up notably are explained by their biggest
// movements. Pure functions; sums in cents, results in euros.
//
// movements: already countable (see countable in analysis.js): transfers
// and the excluded categories are out. Fixed costs count like any expense.

import { fromCents, toCents } from './money.js';
import { monthOf, monthsBetween, shiftMonth } from './stats.js';

// The rules, in one place to adjust them.
// The average is over up to BASELINE_MONTHS months before the one analysed,
// none before the book's first; with fewer than BASELINE_MIN there is not
// enough history.
export const BASELINE_MONTHS = 6;
export const BASELINE_MIN = 3;
// A category deviates when it spends at least NOTABLE_EUROS and at least
// NOTABLE_SHARE more than its average.
export const NOTABLE_EUROS = 20;
export const NOTABLE_SHARE = 0.25;
// At most this many movements explain a category.
export const EXPLAIN_COUNT = 3;

// Whether an excess over an average (both in cents) is notable.
function isNotable(excess, average) {
  return excess >= NOTABLE_EUROS * 100 && excess >= average * NOTABLE_SHARE;
}

// The months the average of `month` is taken over: up to BASELINE_MONTHS
// right before it, none before `first`.
function baselineOf(month, first) {
  const start = shiftMonth(month, -BASELINE_MONTHS);
  const from = first > start ? first : start;
  const last = shiftMonth(month, -1);
  return from > last ? [] : monthsBetween(from, last);
}

// Expense cents per category in some months: Map categoryId → cents.
function spentByCategory(expenses) {
  const sums = new Map();
  for (const m of expenses) sums.set(m.categoryId, (sums.get(m.categoryId) ?? 0) + toCents(m.amount));
  return sums;
}

// The biggest movements first, until they cover the excess (cents).
function explaining(expenses, excess) {
  const sorted = [...expenses].sort((a, b) => toCents(b.amount) - toCents(a.amount) || b.date.localeCompare(a.date));
  const out = [];
  let covered = 0;
  for (const movement of sorted) {
    if (out.length === EXPLAIN_COUNT || covered >= excess) break;
    out.push(movement);
    covered += toCents(movement.amount);
  }
  return out;
}

// How `month` ("YYYY-MM") went against its average. today: YYYY-MM-DD; in
// the month in progress only what is dated up to today counts, against the
// whole average (not prorated).
// → { status: 'insufficient', month } when there are fewer than
//   BASELINE_MIN months before it, or
//   { status: 'ok' | 'normal', month, inProgress, baselineMonths,
//     spent, average, difference,               (the month's total, euros)
//     categories: [{ categoryId, spent, average, excess, isNew, movements }] }
// 'ok' when some category deviates (biggest excess first), 'normal' when none.
export function monthDeviations(movements, month, today) {
  const expenses = movements.filter((m) => m.type === 'expense');
  const first = movements.reduce((min, m) => (monthOf(m.date) < min ? monthOf(m.date) : min), month);
  const baseline = baselineOf(month, first);
  if (baseline.length < BASELINE_MIN) return { status: 'insufficient', month };

  const inBaseline = new Set(baseline);
  const thisMonth = expenses.filter((m) => monthOf(m.date) === month && m.date <= today);
  const now = spentByCategory(thisMonth);
  const before = spentByCategory(expenses.filter((m) => inBaseline.has(monthOf(m.date))));
  const averageOf = (cents) => Math.round(cents / baseline.length);

  const categories = [];
  for (const [categoryId, spent] of now) {
    const average = averageOf(before.get(categoryId) ?? 0);
    const excess = spent - average;
    if (!isNotable(excess, average)) continue;
    categories.push({
      categoryId,
      spent: fromCents(spent),
      average: fromCents(average),
      excess: fromCents(excess),
      isNew: !before.has(categoryId),
      movements: explaining(thisMonth.filter((m) => m.categoryId === categoryId), excess),
    });
  }
  categories.sort((a, b) => toCents(b.excess) - toCents(a.excess));

  const spent = [...now.values()].reduce((sum, cents) => sum + cents, 0);
  const average = averageOf([...before.values()].reduce((sum, cents) => sum + cents, 0));
  return {
    status: categories.length ? 'ok' : 'normal',
    month,
    inProgress: month === monthOf(today),
    baselineMonths: baseline.length,
    spent: fromCents(spent),
    average: fromCents(average),
    difference: fromCents(spent - average),
    categories,
  };
}

// The months of a period at a glance: for each, how far it went from its
// average and the category that weighs most (null when none deviates).
// → [{ month, status, difference, top: { categoryId, excess } | null }]
//   (difference and top are null when the month has not enough history).
export function yearDeviations(movements, months, today) {
  return months.map((month) => {
    const result = monthDeviations(movements, month, today);
    if (result.status === 'insufficient') return { month, status: result.status, difference: null, top: null };
    const [top] = result.categories;
    return {
      month,
      status: result.status,
      difference: result.difference,
      top: top ? { categoryId: top.categoryId, excess: top.excess } : null,
    };
  });
}
