// Months: "YYYY-MM" taken from the movement date, with no time zone. The
// figures of Análisis live in analysis.js.

import { activeOnly } from './active.js';

export const monthOf = (date) => date.slice(0, 7);

// The day of the month of a YYYY-MM-DD date: dayOf('2026-10-05') → 5.
export const dayOf = (date) => Number(date.slice(8, 10));

// A YYYY-MM month written as such (from a URL, for instance).
export const isMonth = (text) => /^\d{4}-\d{2}$/.test(text ?? '');

// "2026-01" shifted by -1 → "2025-12".
export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

// Every month from `first` to `last`, both included, oldest first.
export function monthsBetween(first, last) {
  const months = [];
  for (let current = first; current <= last; current = shiftMonth(current, 1)) months.push(current);
  return months;
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
