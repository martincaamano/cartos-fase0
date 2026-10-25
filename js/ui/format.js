// Display formats. Pure: no DOM access, so it can be imported from the tests.

import { toCents } from '../domain/money.js';

// European style: 1.250,50 €. Built by hand because Intl in es-ES does not
// group four-digit numbers (it gives 1250,50).
export function formatEuros(amount) {
  const cents = Math.abs(toCents(amount));
  const units = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(cents % 100).padStart(2, '0');
  const sign = toCents(amount) < 0 ? '−' : '';
  return `${sign}${units},${decimals} €`;
}

// "2026-10-25" → "25/10". The year is left out: the list shows recent dates.
export function formatShortDate(date) {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}
