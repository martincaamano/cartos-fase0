// What the app saves goes first to the outbox, validated with domain/:
// new movements, edits, logical deletes and both halves of a transfer
// together. js/data/sync.js uploads the outbox when there is a connection.

import { currentUserSub } from './auth.js';
import { ValidationError } from './errors.js';
import { addPending } from '../storage/outbox.js';
import { createMovement, editMovement, markDeleted, validateMovement } from '../domain/movement.js';
import { buildTransfer, deleteTransfer, editTransfer, validateTransfer } from '../domain/transfer.js';
import { activeIds } from '../domain/active.js';

const defaults = { add: addPending };
let store = defaults;

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureMovements(overrides = {}) {
  store = { ...defaults, ...overrides };
}

// Validates a new movement against the book and stores it in the outbox at
// once; syncOutbox() uploads it when there is a connection.
export async function queueMovement(fileId, fields, book) {
  const movement = createMovement(fields, { userSub: currentUserSub() });
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
  const halves = buildTransfer(fields, { userSub: currentUserSub() });
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
