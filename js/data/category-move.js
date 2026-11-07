// Moving the movements of a category to another one (tarea 29): to remove
// it without leaving them orphaned, or to merge it into the other one. The
// movements, the goals that use it and, when removed, the category go to the
// outbox together, in one transaction; js/data/sync.js uploads them in one
// values:batchUpdate (they are all rows already in the Sheet), so Google
// applies all of it or nothing. Works offline.

import { currentUserSub } from './auth.js';
import { assertValid } from './errors.js';
import { addPendingAcross } from '../storage/outbox.js';
import { moveCategory, validateMove } from '../domain/category.js';

const defaults = { addAcross: addPendingAcross };
let store = defaults;

// Lets the tests swap the IndexedDB outbox for an in-memory one. A fake
// `add` alone stands in for `addAcross`, one entry at a time.
export function configureCategoryMove(overrides = {}) {
  store = { ...defaults, ...overrides };
  if (overrides.add && !overrides.addAcross) {
    store.addAcross = async (items, sub) => {
      for (const { fileId, sheet, record } of items) await overrides.add(fileId, [record], sub, sheet);
    };
  }
}

// origin, target: categories of `book`. remove: origin is removed too.
// Returns what changed: { categories, movements, goals }.
export async function queueCategoryMove(fileId, book, origin, target, { remove = false } = {}) {
  assertValid(validateMove(origin, target, book));
  const changed = moveCategory(origin, target, book, { remove });
  const items = [
    ...changed.categories.map((record) => ({ fileId, sheet: 'Categories', record })),
    ...changed.movements.map((record) => ({ fileId, sheet: 'Movements', record })),
    ...changed.goals.map((record) => ({ fileId, sheet: 'Goals', record })),
  ];
  await store.addAcross(items, currentUserSub());
  return changed;
}
