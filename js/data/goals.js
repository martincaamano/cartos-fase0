// Goals and contributions (tarea 25) go to the outbox like movements,
// validated with domain/: new ones, edits and logical deletes.
// js/data/sync.js uploads them to the tabs Goals and Contributions.

import { currentUserSub } from './auth.js';
import { assertValid } from './errors.js';
import { outboxStore } from './outbox-store.js';
import { rankCategories } from '../domain/category.js';
import {
  activeGoals, completeGoal, createContribution, createGoal, editContribution, editGoal, validateContribution, validateGoal,
} from '../domain/goals.js';
import { activeIds } from '../domain/active.js';
import { createMovement, markDeleted, validateMovement } from '../domain/movement.js';

let store = outboxStore();

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureGoals(overrides = {}) {
  store = outboxStore(overrides);
}

const save = (fileId, sheet, records) => store.add(fileId, records, currentUserSub(), sheet);

// What a goal may be spent on: the expense categories of the book.
const expenseIds = (book) => rankCategories(book.categories, book.movements, 'expense').map((c) => c.id);

// --- Goals ---

export async function queueGoal(fileId, fields, book) {
  const goal = createGoal(fields, { userSub: currentUserSub() });
  assertValid(validateGoal(goal, { categoryIds: expenseIds(book) }));
  await save(fileId, 'Goals', [goal]);
  return goal;
}

// original: the saved goal. Its own category stays valid even if it was
// removed since.
export async function queueGoalEdit(fileId, original, fields, book) {
  const goal = editGoal(original, fields);
  assertValid(validateGoal(goal, { categoryIds: [...expenseIds(book), original.categoryId] }));
  await save(fileId, 'Goals', [goal]);
  return goal;
}

// A goal removed frees what it put aside (its contributions stop counting).
export async function queueGoalDelete(fileId, goal) {
  const deleted = markDeleted(goal);
  await save(fileId, 'Goals', [deleted]);
  return deleted;
}

// The purchase a goal was for (tarea 25d): the expense and the goal, now
// completed, go to the outbox together, in one transaction. fields: those
// of a movement (createMovement). Returns [movement, goal].
export async function queuePurchase(fileId, fields, goal, book) {
  const movement = createMovement({ ...fields, type: 'expense' }, { userSub: currentUserSub() });
  assertValid(validateMovement(movement, {
    accountIds: activeIds(book.accounts),
    categoryIds: [...activeIds(book.categories), goal.categoryId],
  }));
  const completed = completeGoal(goal, movement.id);
  await store.addAcross([
    { fileId, sheet: 'Movements', record: movement },
    { fileId, sheet: 'Goals', record: completed },
  ], currentUserSub());
  return [movement, completed];
}

// --- Contributions ---

export async function queueContribution(fileId, fields, book) {
  const contribution = createContribution(fields, { userSub: currentUserSub() });
  assertValid(validateContribution(contribution, { goalIds: activeGoals(book.goals).map((goal) => goal.id) }));
  await save(fileId, 'Contributions', [contribution]);
  return contribution;
}

export async function queueContributionEdit(fileId, original, fields, book) {
  const contribution = editContribution(original, fields);
  const goalIds = [...activeGoals(book.goals).map((goal) => goal.id), original.goalId];
  assertValid(validateContribution(contribution, { goalIds }));
  await save(fileId, 'Contributions', [contribution]);
  return contribution;
}

export async function queueContributionDelete(fileId, contribution) {
  const deleted = markDeleted(contribution);
  await save(fileId, 'Contributions', [deleted]);
  return deleted;
}
