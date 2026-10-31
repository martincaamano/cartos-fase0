// Months: "YYYY-MM" taken from the movement date, with no time zone. The
// figures of Análisis live in analysis.js.

import { activeOnly } from './active.js';

export const monthOf = (date) => date.slice(0, 7);

// "2026-01" shifted by -1 → "2025-12".
export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
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
