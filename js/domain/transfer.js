// A transfer between two accounts of the same book is two ordinary
// movements (architecture §6): an expense in the source account and an
// income in the destination, same amount and date, category Transferencia,
// linked by a shared transferId so both halves can be handled together.

import { createMovement, isValidDate } from './movement.js';
import { hasAtMostTwoDecimals } from './money.js';
import { TRANSFER_CATEGORY_ID } from './category.js';

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

// Latest activity for the Dashboard, newest first. Both halves of a transfer
// become one entry { kind: 'transfer', from, to, amount, date }; a half whose
// pair is missing or deleted shows as an ordinary { kind: 'movement' }.
export function latestEntries(movements, count) {
  const active = movements.filter((movement) => !movement.deleted);
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
      });
    } else {
      entries.push({ kind: 'movement', id: movement.id, movement, date: movement.date, createdAt: movement.createdAt });
    }
  }
  return entries
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, count);
}
