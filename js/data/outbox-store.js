// Where js/data/ modules put what they save: the outbox in IndexedDB.
// add({ fileId, records, sub, sheet }) for records of one tab of one book;
// addAcross([{ fileId, sheet, record }], sub) for several, in one
// transaction. The tests pass in-memory ones; a fake `add` alone also stands
// in for `addAcross`, one entry after the other.

import { addPending, addPendingAcross } from '../storage/outbox.js';

export function outboxStore(overrides = {}) {
  const store = { add: addPending, addAcross: addPendingAcross, ...overrides };
  if (overrides.add && !overrides.addAcross) {
    store.addAcross = async (items, sub) => {
      for (const { fileId, sheet = 'Movements', record } of items) await overrides.add({ fileId, records: [record], sub, sheet });
    };
  }
  return store;
}
