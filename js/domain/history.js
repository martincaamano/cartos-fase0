// History (design §3.6, tarea 20b): every active movement, newest first,
// filtered on the device, and the sums that summarise it: the total, each
// month and each category, as income − spending = net. A transfer is one
// entry, like on the Dashboard; it is listed but never counted, since it
// moves money without earning or spending it.

import { TRANSFER_CATEGORY_ID } from './category.js';
import { groupEntries, newestFirst } from './transfer.js';
import { toCents, fromCents } from './money.js';

const accountsOf = (entry) => (entry.kind === 'transfer' ? [entry.from, entry.to] : [entry.movement.accountId]);
const categoryOf = (entry) => (entry.kind === 'transfer' ? TRANSFER_CATEGORY_ID : entry.movement.categoryId);
// Who paid (tarea 18b): a member id, or '' for common (transfers included).
const personOf = (entry) => (entry.kind === 'transfer' ? '' : entry.movement.personId ?? '');
export const monthOf = (entry) => entry.date.slice(0, 7);

// A transfer, or a loose half of one (its category is still Transferencia).
const isTransfer = (entry) => categoryOf(entry) === TRANSFER_CATEGORY_ID;

// filters: { accountIds, categoryIds, personIds, fromMonth, toMonth }. An
// empty list or month means no filter. Months are YYYY-MM and both ends are
// included. A transfer matches an account when either half belongs to it.
// personIds: member ids, '' for common (a transfer is common).
export function historyEntries(movements, {
  accountIds = [], categoryIds = [], personIds = [], fromMonth = '', toMonth = '',
} = {}) {
  return groupEntries(movements)
    .filter((entry) => accountIds.length === 0 || accountsOf(entry).some((id) => accountIds.includes(id)))
    .filter((entry) => categoryIds.length === 0 || categoryIds.includes(categoryOf(entry)))
    .filter((entry) => personIds.length === 0 || personIds.includes(personOf(entry)))
    .filter((entry) => (!fromMonth || monthOf(entry) >= fromMonth) && (!toMonth || monthOf(entry) <= toMonth))
    .sort(newestFirst);
}

// How many filters are on: each month range, account, category and person
// counts one.
export function activeFilterCount({ accountIds = [], categoryIds = [], personIds = [], fromMonth = '' } = {}) {
  return accountIds.length + categoryIds.length + personIds.length + (fromMonth ? 1 : 0);
}

// The entry a history line points to: a movement id or a transferId.
export function findEntry(movements, id) {
  return groupEntries(movements).find((entry) => entry.id === id) ?? null;
}

// income − expense = net of some entries, in euros; transfers left out.
export function sumEntries(entries) {
  let income = 0;
  let expense = 0;
  for (const entry of entries) {
    if (isTransfer(entry)) continue;
    const cents = toCents(entry.movement.amount);
    if (entry.movement.type === 'income') income += cents;
    else expense += cents;
  }
  return { income: fromCents(income), expense: fromCents(expense), net: fromCents(income - expense) };
}

// Entries grouped by category, biggest first (by what they move, income or
// spending). Each group: { categoryId, ...sumEntries, entries }. Transfers
// go last in their own group, which counts nothing.
export function byCategory(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const id = categoryOf(entry);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(entry);
  }
  const size = (group) => Math.abs(toCents(group.net));
  return [...groups].map(([categoryId, list]) => ({ categoryId, ...sumEntries(list), entries: list }))
    .sort((a, b) => (a.categoryId === TRANSFER_CATEGORY_ID) - (b.categoryId === TRANSFER_CATEGORY_ID)
      || size(b) - size(a));
}

// Total moved by the transfers among some entries, in euros. A loose half
// (its pair missing or deleted) counts with its own amount.
const amountOf = (entry) => (entry.kind === 'transfer' ? entry.amount : entry.movement.amount);

export function transferAmount(entries) {
  return fromCents(entries.filter(isTransfer).reduce((sum, entry) => sum + toCents(amountOf(entry)), 0));
}

// The Resumen view: { total, months } where total and each month are
// { ...sumEntries, categories: byCategory } and months also carry month
// (YYYY-MM), newest first. entries: from historyEntries (newest first).
export function summarizeHistory(entries) {
  const months = new Map();
  for (const entry of entries) {
    const month = monthOf(entry);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(entry);
  }
  const node = (list) => ({ ...sumEntries(list), categories: byCategory(list) });
  return {
    total: node(entries),
    months: [...months].map(([month, list]) => ({ month, ...node(list) })),
  };
}

// Every month from the first movement to the current one (YYYY-MM), oldest
// first, for the month strip. today: YYYY-MM-DD.
export function monthsSpan(movements, today) {
  const last = today.slice(0, 7);
  const dates = groupEntries(movements).map(monthOf).filter((month) => month <= last).sort();
  const months = [];
  let [year, month] = (dates[0] ?? last).split('-').map(Number);
  for (;;) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    months.push(current);
    if (current >= last) return months;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

// Tapping a month in the strip. range: { from, to, open } or null; open
// means one month is chosen and the next tap closes the range.
// No range → that month (open). Open + another month → the range between
// both (closed). Open + the same month → no range. Closed + any month →
// a new range starting there.
export function selectMonth(range, month) {
  if (range?.open) {
    if (month === range.from) return null;
    return { from: month < range.from ? month : range.from, to: month < range.from ? range.from : month, open: false };
  }
  return { from: month, to: month, open: true };
}
