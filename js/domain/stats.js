// Analysis (design §3.7): spending by category and monthly summary for the
// whole book. Months are "YYYY-MM" taken from the movement date, with no
// time zone. Sums are done in cents.

import { TRANSFER_CATEGORY_ID } from './category.js';
import { fromCents, toCents } from './money.js';
import { activeOnly } from './active.js';

export const monthOf = (date) => date.slice(0, 7);

// "2026-01" shifted by -1 → "2025-12".
export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const inMonth = (movements, month) =>
  activeOnly(movements).filter((movement) => monthOf(movement.date) === month);

// Expenses of the month per category, largest first (ties by category id).
// Transferencia is left out: moving money between own accounts is not
// spending. Returns [{ categoryId, amount }]; empty when nothing was spent.
export function spendingByCategory(movements, month) {
  const cents = new Map();
  for (const movement of inMonth(movements, month)) {
    if (movement.type !== 'expense' || movement.categoryId === TRANSFER_CATEGORY_ID) continue;
    cents.set(movement.categoryId, (cents.get(movement.categoryId) ?? 0) + toCents(movement.amount));
  }
  return [...cents]
    .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
    .map(([categoryId, total]) => ({ categoryId, amount: fromCents(total) }));
}

// Income, expenses and savings (income − expenses) of the month. Transfers
// count on both sides (architecture §6), so savings stay right.
export function monthSummary(movements, month) {
  let income = 0;
  let expense = 0;
  for (const movement of inMonth(movements, month)) {
    if (movement.type === 'income') income += toCents(movement.amount);
    else if (movement.type === 'expense') expense += toCents(movement.amount);
  }
  return { income: fromCents(income), expense: fromCents(expense), savings: fromCents(income - expense) };
}

// The months the selector can show: from the first one with a movement to
// the current one. today: the local current day as YYYY-MM-DD.
export function monthRange(movements, today) {
  const last = monthOf(today);
  const first = activeOnly(movements)
    .map((movement) => monthOf(movement.date))
    .reduce((min, month) => (month < min ? month : min), last);
  return { first, last };
}
