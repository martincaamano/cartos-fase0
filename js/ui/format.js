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

// What the amount field shows when editing: 1250.5 → "1250,50". No
// thousands dot, so it reads back the same with parseAmountInput.
export function formatAmountInput(amount) {
  const cents = toCents(amount);
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

// A log entry as one line: local day and time, type, result and duration.
// "25/10 13:05:12  api  sheets.append:200  320 ms"
export function formatLogLine({ at, type, result, durationMs }) {
  const date = new Date(at);
  const two = (n) => String(n).padStart(2, '0');
  const when = `${two(date.getDate())}/${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  const duration = Number.isFinite(durationMs) ? `  ${durationMs} ms` : '';
  return `${when}  ${type}  ${result}${duration}`;
}

// How an account or a category is named on screen: "🏦 Abanca". Empty when
// the item is missing (for example, a removed category not in the book).
export function labelOf(item) {
  return item ? `${item.emoji ?? ''} ${item.name ?? ''}`.trim() : '';
}

// "2026-10-25" → "25/10/2026".
export function formatDate(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

// "2026-10-25" → "25/10". The year is left out: the list shows recent dates.
export function formatShortDate(date) {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}
