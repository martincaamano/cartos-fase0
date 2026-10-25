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
export function validateAccount(account) {
  const errors = [];
  if (!account.name) errors.push('name_required');
  if (typeof account.initialBalance !== 'number' || !hasAtMostTwoDecimals(account.initialBalance)) {
    errors.push('initial_balance_invalid');
  }
  return errors;
}
