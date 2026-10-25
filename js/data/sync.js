// Uploads the outbox to the book's Movements tab. Reads the ids already in
// the Sheet first: new movements are appended, edited or deleted ones are
// written over the row found by id, so a retry after a lost answer never
// duplicates a row. One run at a time: a second call while one is running
// gets the same run.

import { append, batchGet, batchUpdateValues } from './sheets.js';
import { HEADERS, toRow } from './rows.js';
import { getCurrentUser } from './auth.js';
import { ValidationError } from './book.js';
import { planSync } from '../storage/outbox-logic.js';
import { addPending, listPending, removePending } from '../storage/outbox.js';
import { logEvent } from '../storage/logs.js';
import { createMovement, editMovement, markDeleted, validateMovement } from '../domain/movement.js';
import { buildTransfer, deleteTransfer, editTransfer, validateTransfer } from '../domain/transfer.js';

const defaults = { add: addPending, list: listPending, remove: removePending };
let store = defaults;
let running = null;

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureSync(overrides = {}) {
  store = { ...defaults, ...overrides };
  running = null;
}

const LAST_COLUMN = String.fromCharCode(64 + HEADERS.Movements.length);

const activeIds = (items) => items.filter((item) => !item.deleted).map((item) => item.id);

async function run(fileId) {
  const pending = (await store.list()).filter((item) => item.fileId === fileId).map((item) => item.movement);
  if (pending.length === 0) return { appended: 0, updated: 0, pending: 0 };

  const [idColumn] = await batchGet(fileId, ['Movements!A:A']);
  const existingIds = idColumn.slice(1).map((row) => String(row[0] ?? ''));
  const { toAppend, toUpdate } = planSync(pending, existingIds);
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

// Validates a new movement against the book and stores it in the outbox at
// once; syncOutbox() uploads it when there is a connection.
export async function queueMovement(fileId, fields, book) {
  const movement = createMovement(fields, { userSub: getCurrentUser()?.sub ?? '' });
  const errors = validateMovement(movement, {
    accountIds: activeIds(book.accounts),
    categoryIds: activeIds(book.categories),
  });
  if (errors.length) throw new ValidationError(errors);
  await store.add(fileId, [movement]);
  return movement;
}

// Validates a transfer and stores both halves in the outbox together; they
// travel to the Sheet in the same upload.
export async function queueTransfer(fileId, fields, book) {
  const errors = validateTransfer(fields, { accountIds: activeIds(book.accounts) });
  if (errors.length) throw new ValidationError(errors);
  const halves = buildTransfer(fields, { userSub: getCurrentUser()?.sub ?? '' });
  await store.add(fileId, halves);
  return halves;
}

// original: the saved movement (book plus outbox). Its own account and
// category stay valid even if the category was removed since.
export async function queueEdit(fileId, original, fields, book) {
  const movement = editMovement(original, fields);
  const errors = validateMovement(movement, {
    accountIds: [...activeIds(book.accounts), original.accountId],
    categoryIds: [...activeIds(book.categories), original.categoryId],
  });
  if (errors.length) throw new ValidationError(errors);
  await store.add(fileId, [movement]);
  return movement;
}

// halves: [outgoing, incoming]. Both rows change in the same upload.
export async function queueTransferEdit(fileId, halves, fields, book) {
  const errors = validateTransfer(fields, { accountIds: activeIds(book.accounts) });
  if (errors.length) throw new ValidationError(errors);
  const edited = editTransfer(halves, fields);
  await store.add(fileId, edited);
  return edited;
}

// Logical delete of one movement, or of both halves of a transfer.
export async function queueDelete(fileId, movements) {
  const deleted = movements.length === 2 ? deleteTransfer(movements) : movements.map((m) => markDeleted(m));
  await store.add(fileId, deleted);
  return deleted;
}

export function syncOutbox(fileId) {
  if (!running) {
    running = run(fileId).finally(() => {
      running = null;
    });
  }
  return running;
}
