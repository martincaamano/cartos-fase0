// A balance is always computed (initial balance + movements), never stored.

import { toCents, fromCents } from './money.js';
import { isActive } from './active.js';

export function accountBalance(account, movements) {
  let cents = toCents(account.initialBalance);
  for (const movement of movements) {
    if (movement.deleted || movement.accountId !== account.id) continue;
    const amount = toCents(movement.amount);
    cents += movement.type === 'income' ? amount : -amount;
  }
  return fromCents(cents);
}

// Sum of the balances of every account not deleted, added in cents.
export function totalBalance(accounts, movements) {
  const cents = accounts
    .filter(isActive)
    .reduce((sum, account) => sum + toCents(accountBalance(account, movements)), 0);
  return fromCents(cents);
}
