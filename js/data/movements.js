// What the app saves goes first to the outbox, validated with domain/:
// new movements, edits, logical deletes and both halves of a transfer
// together. js/data/sync.js uploads the outbox when there is a connection.

import { currentUserSub } from './auth.js';
import { ValidationError } from './errors.js';
import { addPending, addPendingAcross } from '../storage/outbox.js';
import { createMovement, editMovement, markDeleted, validateMovement } from '../domain/movement.js';
import {
  buildCrossBookTransfer, buildTransfer, deleteTransfer, editTransfer, validateTransfer,
} from '../domain/transfer.js';
import { activeIds } from '../domain/active.js';

const defaults = { add: addPending, addAcross: addPendingAcross };
let store = defaults;

// Lets the tests swap the IndexedDB outbox for an in-memory one. A fake
// `add` alone also stands in for `addAcross`, one book after the other.
export function configureMovements(overrides = {}) {
  store = { ...defaults, ...overrides };
  if (overrides.add && !overrides.addAcross) {
    store.addAcross = async (items, sub) => {
      for (const { fileId, movement } of items) await overrides.add(fileId, [movement], sub);
    };
  }
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
  await store.add(fileId, [movement], currentUserSub());
  return movement;
}

// Validates a transfer and stores both halves in the outbox together; they
// travel to the Sheet in the same upload.
export async function queueTransfer(fileId, fields, book) {
  const errors = validateTransfer(fields, { accountIds: activeIds(book.accounts) });
  if (errors.length) throw new ValidationError(errors);
  const halves = buildTransfer(fields, { userSub: currentUserSub() });
  await store.add(fileId, halves, currentUserSub());
  return halves;
}

const idsOf = (book) => ({ accountIds: activeIds(book.accounts), categoryIds: activeIds(book.categories) });

// A transfer to another book: each half is validated against its own book
// and goes to that book's outbox. They are independent from then on
// (architecture §6): if one upload fails, the other still goes.
// here / there: { fileId, book }. Returns [outgoing, incoming].
export async function queueCrossBookTransfer(here, there, fields) {
  const [outgoing, incoming] = buildCrossBookTransfer(fields, { userSub: currentUserSub() });
  const errors = [...new Set([
    ...validateMovement(outgoing, idsOf(here.book)),
    ...validateMovement(incoming, idsOf(there.book)),
  ])];
  if (errors.length) throw new ValidationError(errors);
  // Both halves or none, though they go to two books.
  await store.addAcross([{ fileId: here.fileId, movement: outgoing }, { fileId: there.fileId, movement: incoming }], currentUserSub());
  return [outgoing, incoming];
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
  await store.add(fileId, [movement], currentUserSub());
  return movement;
}

// halves: [outgoing, incoming]. Both rows change in the same upload.
export async function queueTransferEdit(fileId, halves, fields, book) {
  const errors = validateTransfer(fields, { accountIds: activeIds(book.accounts) });
  if (errors.length) throw new ValidationError(errors);
  const edited = editTransfer(halves, fields);
  await store.add(fileId, edited, currentUserSub());
  return edited;
}

// Logical delete of one movement, or of both halves of a transfer.
export async function queueDelete(fileId, movements) {
  const deleted = movements.length === 2 ? deleteTransfer(movements) : movements.map((m) => markDeleted(m));
  await store.add(fileId, deleted, currentUserSub());
  return deleted;
}
