// History (design §3.6): every active movement, newest first, filtered on
// the device. A transfer is one entry, like on the Dashboard.

import { TRANSFER_CATEGORY_ID } from './category.js';
import { groupEntries, newestFirst } from './transfer.js';

const accountsOf = (entry) => (entry.kind === 'transfer' ? [entry.from, entry.to] : [entry.movement.accountId]);
const categoryOf = (entry) => (entry.kind === 'transfer' ? TRANSFER_CATEGORY_ID : entry.movement.categoryId);

// filters: { accountId, categoryId, from, to }; an empty value means no
// filter. from and to are YYYY-MM-DD and both ends are included. A transfer
// matches an account when either half belongs to it.
export function historyEntries(movements, { accountId = '', categoryId = '', from = '', to = '' } = {}) {
  return groupEntries(movements)
    .filter((entry) => !accountId || accountsOf(entry).includes(accountId))
    .filter((entry) => !categoryId || categoryOf(entry) === categoryId)
    .filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to))
    .sort(newestFirst);
}

// The entry a history line points to: a movement id or a transferId.
export function findEntry(movements, id) {
  return groupEntries(movements).find((entry) => entry.id === id) ?? null;
}
