// An account lives in a book (Accounts tab). Its balance is never stored:
// see balance.js.

import { hasAtMostTwoDecimals } from './money.js';

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

export function createAccount({ name, emoji = '', initialBalance = 0 }, deps = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const at = now().toISOString();
  return {
    id: newId(),
    name: String(name ?? '').trim(),
    emoji: String(emoji ?? '').trim(),
    initialBalance,
    createdAt: at,
    updatedAt: at,
    deleted: false,
  };
}

// Returns a list of error codes; empty means valid. A negative initial
// balance is allowed (an overdrawn account).
// existing: the accounts already in the book, to reject a repeated name
// (case-insensitive, deleted accounts ignored).
export function validateAccount(account, existing = []) {
  const errors = [];
  const sameName = (other) => other.name.trim().toLocaleLowerCase('es') === account.name.toLocaleLowerCase('es');
  if (!account.name) errors.push('name_required');
  else if (existing.some((other) => !other.deleted && other.id !== account.id && sameName(other))) errors.push('name_taken');
  if (typeof account.initialBalance !== 'number' || !hasAtMostTwoDecimals(account.initialBalance)) {
    errors.push('initial_balance_invalid');
  }
  return errors;
}
