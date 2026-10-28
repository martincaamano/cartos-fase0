// Uploads the outbox (filled by js/data/movements.js) to the book's
// Movements tab. Reads the ids already in the Sheet first: new movements
// are appended, edited or deleted ones are written over the row found by
// id, so a retry after a lost answer never duplicates a row. One run at a
// time: a second call while one is running gets the same run.

import { append, batchGet, batchUpdateValues } from './sheets.js';
import { HEADERS, rowsById, toRow } from './rows.js';
import { planSync } from '../storage/outbox-logic.js';
import { listPending, removePending } from '../storage/outbox.js';
import { logEvent } from '../storage/logs.js';

const defaults = { list: listPending, remove: removePending };
let store = defaults;
let running = null;

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureSync(overrides = {}) {
  store = { ...defaults, ...overrides };
  running = null;
}

const LAST_COLUMN = String.fromCharCode(64 + HEADERS.Movements.length);

async function run(fileId) {
  const pending = (await store.list()).filter((item) => item.fileId === fileId).map((item) => item.movement);
  if (pending.length === 0) return { appended: 0, updated: 0, pending: 0 };

  const [idColumn] = await batchGet(fileId, ['Movements!A:A']);
  const { toAppend, toUpdate } = planSync(pending, rowsById(idColumn));
  if (toUpdate.length > 0) {
    await batchUpdateValues(fileId, toUpdate.map(({ movement, row }) => ({
      range: `Movements!A${row}:${LAST_COLUMN}${row}`,
      values: [toRow('Movements', movement)],
    })));
  }
  if (toAppend.length > 0) await append(fileId, 'Movements', toAppend.map((m) => toRow('Movements', m)));
  await store.remove([...toUpdate.map(({ movement }) => movement), ...toAppend]);
  logEvent({ type: 'sync', result: `ok:${toAppend.length}:${toUpdate.length}` });
  return { appended: toAppend.length, updated: toUpdate.length, pending: 0 };
}

export function syncOutbox(fileId) {
  if (!running) {
    running = run(fileId).finally(() => {
      running = null;
    });
  }
  return running;
}
