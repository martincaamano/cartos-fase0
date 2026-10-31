// Display formats. Pure: no DOM access, so it can be imported from the tests.

import { es } from '../../i18n/es.js';
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

// A whole number of euros for the big figures: 1.684 €.
export const formatWholeEuros = (amount) => formatEuros(Math.round(amount)).replace(/,00 €$/, ' €');

// income − spending = net, as History shows it: "+1.601,27 − 3.547,58 =
// −1.946,31 €". sums: { income, expense, net }.
export function formatSums({ income, expense, net }) {
  const bare = (amount) => formatEuros(amount).replace(' €', '');
  return { income: `+${bare(income)}`, expense: bare(expense), net: `${net > 0 ? '+' : ''}${formatEuros(net)}` };
}

// What the amount field shows when editing: 1250.5 → "1250,50", −10.5 →
// "-10,50". No thousands dot, so it reads back the same with
// parseAmountInput.
export function formatAmountInput(amount) {
  const cents = toCents(amount);
  const units = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(units / 100)},${String(units % 100).padStart(2, '0')}`;
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

// "2026-10" → "OCTUBRE 2026".
export function formatMonth(month) {
  const [year, number] = month.split('-');
  return `${es.months[Number(number) - 1]} ${year}`;
}

// "2026-10" → "Oct".
export const formatShortMonth = (month) => es.monthsShort[Number(month.slice(5)) - 1];

// A range of months, the year said once when it is the same:
// "Oct 2026", "Sep – Oct 2026", "Dic 2025 – Ene 2026".
export function formatMonthRange({ from, to }) {
  const year = to.slice(0, 4);
  if (from === to) return `${formatShortMonth(from)} ${year}`;
  const fromYear = from.slice(0, 4) === year ? '' : ` ${from.slice(0, 4)}`;
  return `${formatShortMonth(from)}${fromYear} – ${formatShortMonth(to)} ${year}`;
}
