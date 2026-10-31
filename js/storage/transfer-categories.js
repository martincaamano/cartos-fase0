// The two categories last used for a transfer to an account of another
// book, so the next one (the monthly contribution) comes filled in. Kept on
// the device, per destination account; only ids, never names or amounts.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

import { readMap, writeEntry } from './json-map.js';

const KEY = 'cartos.transferCategories';

// → { expenseCategoryId, incomeCategoryId } or null.
export function loadTransferCategories(storage, toAccountId) {
  const entry = readMap(storage, KEY)[toAccountId];
  if (typeof entry?.expenseCategoryId !== 'string' || typeof entry?.incomeCategoryId !== 'string') return null;
  return { expenseCategoryId: entry.expenseCategoryId, incomeCategoryId: entry.incomeCategoryId };
}

export function saveTransferCategories(storage, toAccountId, { expenseCategoryId, incomeCategoryId }) {
  writeEntry(storage, KEY, toAccountId, { expenseCategoryId, incomeCategoryId });
}
