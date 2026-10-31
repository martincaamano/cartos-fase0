// Uploads the outbox (filled by js/data/movements.js) to the book's
// Movements tab. Reads the ids already in the Sheet first: new movements
// are appended, edited or deleted ones are written over the row found by
// id, so a retry after a lost answer never duplicates a row. One run at a
// time per book: a call for the same book while one is running waits for it
// and gets one more run after it, so a movement saved meanwhile is uploaded
// too.

import { currentUserSub } from './auth.js';

import { append, batchGet, batchUpdateValues } from './sheets.js';
import { rowRange, rowsById, toRow } from './rows.js';
import { planSync } from '../storage/outbox-logic.js';
import { listPending, removePending } from '../storage/outbox.js';
import { logEvent } from '../storage/logs.js';

const defaults = { list: listPending, remove: removePending };
let store = defaults;
// fileId → { promise, again } of the run in progress for that book.
const running = new Map();

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureSync(overrides = {}) {
  store = { ...defaults, ...overrides };
  running.clear();
}

async function run(fileId) {
  const pending = (await store.list(currentUserSub())).filter((item) => item.fileId === fileId).map((item) => item.movement);
  if (pending.length === 0) return { appended: 0, updated: 0, pending: 0 };

  const [idColumn] = await batchGet(fileId, ['Movements!A:A']);
  const { toAppend, toUpdate } = planSync(pending, rowsById(idColumn));
  if (toUpdate.length > 0) {
    await batchUpdateValues(fileId, toUpdate.map(({ movement, row }) => ({
      range: rowRange('Movements', row),
      values: [toRow('Movements', movement)],
    })));
  }
  if (toAppend.length > 0) await append(fileId, 'Movements', toAppend.map((m) => toRow('Movements', m)));
  await store.remove([...toUpdate.map(({ movement }) => movement), ...toAppend]);
  logEvent({ type: 'sync', result: `ok:${toAppend.length}:${toUpdate.length}` });
  return { appended: toAppend.length, updated: toUpdate.length, pending: 0 };
}

// Resolves with what all the runs did together: { appended, updated, pending }.
export function syncOutbox(fileId) {
  const busy = running.get(fileId);
  if (busy) {
    busy.again = true;
    return busy.promise;
  }
  const entry = { again: false };
  entry.promise = (async () => {
    const total = { appended: 0, updated: 0, pending: 0 };
    do {
      entry.again = false;
      const result = await run(fileId);
      total.appended += result.appended;
      total.updated += result.updated;
      total.pending = result.pending;
    } while (entry.again);
    return total;
  })().finally(() => running.delete(fileId));
  running.set(fileId, entry);
  return entry.promise;
}
