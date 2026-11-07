// Accounts and categories edited in Ajustes (tarea 30c) go to the outbox
// like movements, validated with domain/: new ones, edits and the logical
// delete of a category. js/data/sync.js appends the new rows and rewrites
// the others, found by id; it all works offline. A new book's first
// account is still written with the book (it needs Drive anyway).

import { currentUserSub } from './auth.js';
import { assertValid } from './errors.js';
import { outboxStore } from './outbox-store.js';
import { createAccount, editAccount, validateAccount } from '../domain/account.js';
import {
  canRemoveCategory, categoryUses, createCategory, editCategory, validateCategory, validateCategoryEdit,
} from '../domain/category.js';
import { markDeleted } from '../domain/movement.js';

let store = outboxStore();

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureBookItems(overrides = {}) {
  store = outboxStore(overrides);
}

async function save(fileId, sheet, record) {
  await store.add({ fileId, records: [record], sub: currentUserSub(), sheet });
  return record;
}

// existing: the book's accounts, to reject a repeated name.
export async function queueAccount(fileId, fields, existing) {
  const account = createAccount(fields);
  assertValid(validateAccount(account, existing));
  return save(fileId, 'Accounts', account);
}

export async function queueAccountEdit(fileId, original, fields, existing) {
  const account = editAccount(original, fields);
  assertValid(validateAccount(account, existing));
  return save(fileId, 'Accounts', account);
}

// existing: the book's categories, to reject a repeated name.
export async function queueCategory(fileId, fields, existing) {
  const category = createCategory(fields);
  assertValid(validateCategory(category, existing));
  return save(fileId, 'Categories', category);
}

// book: { categories, movements } (the kind changes only while no movement
// uses the category).
export async function queueCategoryEdit(fileId, original, fields, book) {
  const category = editCategory(original, fields);
  assertValid(validateCategoryEdit(category, original, book));
  return save(fileId, 'Categories', category);
}

// Logical delete of a category no movement uses (one with movements is
// moved first: data/category-move.js). movements: the book's, to check it.
export async function queueCategoryRemove(fileId, category, movements) {
  assertValid(canRemoveCategory(category) ? [] : ['not_removable']);
  assertValid(categoryUses(category, movements) === 0 ? [] : ['in_use']);
  return save(fileId, 'Categories', markDeleted(category));
}
