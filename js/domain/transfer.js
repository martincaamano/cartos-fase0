// A transfer between two accounts of the same book is two ordinary
// movements (architecture §6): an expense in the source account and an
// income in the destination, same amount and date, category Transferencia,
// linked by a shared transferId so both halves can be handled together.

import { createMovement, editMovement, isValidDate, markDeleted } from './movement.js';
import { hasAtMostTwoDecimals } from './money.js';
import { TRANSFER_CATEGORY_ID } from './category.js';
import { activeOnly } from './active.js';

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// fields: { fromAccountId, toAccountId, amount, date }. Returns error codes.
export function validateTransfer({ fromAccountId, toAccountId, amount, date }, { accountIds }) {
  const accounts = new Set(accountIds);
  const errors = [];
  if (!accounts.has(fromAccountId) || !accounts.has(toAccountId)) errors.push('account_unknown');
  else if (fromAccountId === toAccountId) errors.push('same_account');
  if (typeof amount !== 'number' || !(amount > 0) || !hasAtMostTwoDecimals(amount)) errors.push('amount_invalid');
  if (!isValidDate(date)) errors.push('date_invalid');
  return errors;
}

// Returns [outgoing, incoming]. Validate first with validateTransfer.
export function buildTransfer({ fromAccountId, toAccountId, amount, date, note = '' }, { userSub = '', ...deps } = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const transferId = newId();
  const shared = { amount, date, categoryId: TRANSFER_CATEGORY_ID, note, transferId };
  return [
    createMovement({ ...shared, accountId: fromAccountId, type: 'expense' }, { userSub, now, newId }),
    createMovement({ ...shared, accountId: toAccountId, type: 'income' }, { userSub, now, newId }),
  ];
}

// halves: [outgoing, incoming] of a saved transfer. Editing or deleting a
// transfer always changes both rows together (architecture §6). Validate
// the fields first with validateTransfer.
export function editTransfer([outgoing, incoming], { fromAccountId, toAccountId, amount, date, note = '' }, now = new Date()) {
  const shared = { amount, date, categoryId: TRANSFER_CATEGORY_ID, note };
  return [
    editMovement(outgoing, { ...shared, accountId: fromAccountId }, now),
    editMovement(incoming, { ...shared, accountId: toAccountId }, now),
  ];
}

export function deleteTransfer(halves, now = new Date()) {
  return halves.map((half) => markDeleted(half, now));
}

// Newest first by date, then by creation time, then by id so the order
// never depends on how the rows arrived.
export function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

// Active movements as list entries, unsorted. Both halves of a transfer
// become one entry { kind: 'transfer', from, to, amount, date, halves }; a
// half whose pair is missing or deleted shows as an ordinary
// { kind: 'movement' }.
export function groupEntries(movements) {
  const active = activeOnly(movements);
  const pairs = new Map();
  for (const movement of active) {
    if (!movement.transferId) continue;
    const pair = pairs.get(movement.transferId) ?? {};
    pair[movement.type] = movement;
    pairs.set(movement.transferId, pair);
  }

  const entries = [];
  for (const movement of active) {
    const pair = movement.transferId ? pairs.get(movement.transferId) : null;
    if (pair?.expense && pair?.income) {
      if (movement.type !== 'expense') continue;
      entries.push({
        kind: 'transfer',
        id: movement.transferId,
        from: pair.expense.accountId,
        to: pair.income.accountId,
        amount: movement.amount,
        date: movement.date,
        createdAt: movement.createdAt,
        halves: [pair.expense, pair.income],
      });
    } else {
      entries.push({ kind: 'movement', id: movement.id, movement, date: movement.date, createdAt: movement.createdAt });
    }
  }
  return entries;
}

// Latest activity for the Dashboard, newest first.
export function latestEntries(movements, count) {
  return groupEntries(movements).sort(newestFirst).slice(0, count);
}
