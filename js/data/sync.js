// Uploads the outbox to the book's Movements tab. Reads the ids already in
// the Sheet first, so a retry after a lost answer never duplicates a row.
// One run at a time: a second call while one is running gets the same run.

import { append, batchGet } from './sheets.js';
import { toRow } from './rows.js';
import { getCurrentUser } from './auth.js';
import { ValidationError } from './book.js';
import { planSync } from '../storage/outbox-logic.js';
import { addPending, listPending, removePending } from '../storage/outbox.js';
import { logEvent } from '../storage/logs.js';
import { createMovement, validateMovement } from '../domain/movement.js';

const defaults = { add: addPending, list: listPending, remove: removePending };
let store = defaults;
let running = null;

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureSync(overrides = {}) {
  store = { ...defaults, ...overrides };
  running = null;
}

async function run(fileId) {
  const pending = (await store.list()).filter((item) => item.fileId === fileId).map((item) => item.movement);
  if (pending.length === 0) return { appended: 0, pending: 0 };

  const [idColumn] = await batchGet(fileId, ['Movements!A:A']);
  const existingIds = idColumn.slice(1).map((row) => String(row[0] ?? ''));
  const { toAppend, done } = planSync(pending, existingIds);
  if (toAppend.length > 0) await append(fileId, 'Movements', toAppend.map((m) => toRow('Movements', m)));
  await store.remove([...done, ...toAppend].map((m) => m.id));
  logEvent({ type: 'sync', result: `ok:${toAppend.length}` });
  return { appended: toAppend.length, pending: 0 };
}

// Validates a new movement against the book and stores it in the outbox at
// once; syncOutbox() uploads it when there is a connection.
export async function queueMovement(fileId, fields, book) {
  const movement = createMovement(fields, { userSub: getCurrentUser()?.sub ?? '' });
  const errors = validateMovement(movement, {
    accountIds: book.accounts.filter((a) => !a.deleted).map((a) => a.id),
    categoryIds: book.categories.filter((c) => !c.deleted).map((c) => c.id),
  });
  if (errors.length) throw new ValidationError(errors);
  await store.add(fileId, movement);
  return movement;
}

export function syncOutbox(fileId) {
  if (!running) {
    running = run(fileId).finally(() => {
      running = null;
    });
  }
  return running;
}
