// A balance is always computed (initial balance + movements), never stored.

import { toCents, fromCents } from './money.js';

export function accountBalance(account, movements) {
  let cents = toCents(account.initialBalance);
  for (const movement of movements) {
    if (movement.deleted || movement.accountId !== account.id) continue;
    const amount = toCents(movement.amount);
    cents += movement.type === 'income' ? amount : -amount;
  }
  return fromCents(cents);
}
