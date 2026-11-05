// Saving goals and contributions to the outbox (js/data/goals.js):
// validation against the book, new ones, edits and logical deletes. The
// upload of the Goals and Contributions tabs is tested in outbox.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueGoal,
  queueGoalEdit,
  queueGoalDelete,
  queueContribution,
  queueContributionEdit,
  queueContributionDelete,
  queuePurchase,
} from '../js/data/goals.js';
import { ValidationError } from '../js/data/errors.js';
import { setupGoogleApi } from './helpers/fake-google.js';
import { memoryOutbox } from './helpers/memory-outbox.js';

const OLD = '2026-10-01T08:00:00.000Z';

const goal = (id, extra = {}) => ({
  id,
  name: 'Tele',
  categoryId: 'food',
  targetAmount: 1000,
  targetDate: '2027-03-01',
  status: 'active',
  completedAt: '',
  movementId: '',
  createdBy: 'user-2',
  createdAt: OLD,
  updatedAt: OLD,
  deleted: false,
  ...extra,
});

const contribution = (id, goalId, extra = {}) => ({
  id, goalId, amount: 250, date: '2026-11-01', createdBy: 'user-2', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});

const book = {
  categories: [
    { id: 'food', kind: 'expense', deleted: false },
    { id: 'salary', kind: 'income', deleted: false },
    { id: 'mixed', kind: 'both', deleted: false },
    { id: 'transfer', kind: 'both', deleted: false },
    { id: 'gone', kind: 'expense', deleted: true },
  ],
  movements: [],
  goals: [goal('g-1'), goal('g-done', { status: 'completed' }), goal('g-del', { deleted: true })],
};

const fields = { name: 'Tele', categoryId: 'food', targetAmount: 1000, targetDate: '2027-03-01' };

let items;
let calls;
beforeEach(() => {
  // A signed-in user-1 (createdBy comes from the session); no call reaches Google.
  calls = setupGoogleApi();
  items = memoryOutbox();
});

const rejectsWith = (promise, ...codes) => assert.rejects(
  promise,
  (err) => err instanceof ValidationError && codes.every((code) => err.errors.includes(code)),
);

// --- queueGoal ---

test('queueGoal queues a valid goal into Goals with the current user as author', async () => {
  const created = await queueGoal('f1', { ...fields, name: ' Tele ' }, book);
  assert.equal(created.createdBy, 'user-1');
  assert.equal(created.name, 'Tele');
  assert.equal(created.status, 'active');
  assert.equal(created.deleted, false);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.equal(created.createdAt, created.updatedAt);
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Goals', record: created }]);
  assert.equal(calls.length, 0, 'saving never calls Google');
});

test('queueGoal accepts a category of both kinds', async () => {
  const created = await queueGoal('f1', { ...fields, categoryId: 'mixed' }, book);
  assert.equal(created.categoryId, 'mixed');
});

test('queueGoal refuses an income-only, the transfer, a deleted or an unknown category', async () => {
  for (const categoryId of ['salary', 'transfer', 'gone', 'nope']) {
    await rejectsWith(queueGoal('f1', { ...fields, categoryId }, book), 'category_unknown');
  }
  assert.equal(items.size, 0);
});

test('an invalid goal throws ValidationError with every code and is never queued', async () => {
  await rejectsWith(
    queueGoal('f1', { name: '', categoryId: 'food', targetAmount: 0, targetDate: '2026-02-30' }, book),
    'name_required', 'amount_invalid', 'date_invalid',
  );
  await rejectsWith(queueGoal('f1', { ...fields, targetAmount: 10.001 }, book), 'amount_invalid');
  await rejectsWith(queueGoal('f1', { ...fields, targetAmount: -5 }, book), 'amount_invalid');
  assert.equal(items.size, 0);
});

// --- queueGoalEdit ---

test('queueGoalEdit keeps id, createdAt and author, and queues the new version', async () => {
  const original = goal('g-1');
  const edited = await queueGoalEdit('f1', original, { ...fields, name: 'Sofá', targetAmount: 600.5 }, book);
  assert.equal(edited.id, 'g-1');
  assert.equal(edited.createdAt, OLD);
  assert.equal(edited.createdBy, 'user-2');
  assert.equal(edited.name, 'Sofá');
  assert.equal(edited.targetAmount, 600.5);
  assert.notEqual(edited.updatedAt, OLD);
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Goals', record: edited }]);
});

test('queueGoalEdit allows the original category even if it was deleted since', async () => {
  const original = goal('g-1', { categoryId: 'gone' });
  const edited = await queueGoalEdit('f1', original, { ...fields, categoryId: 'gone' }, book);
  assert.equal(edited.categoryId, 'gone');
  assert.equal(items.size, 1);
});

test('queueGoalEdit refuses another deleted or income category and invalid fields', async () => {
  const original = goal('g-1');
  await rejectsWith(queueGoalEdit('f1', original, { ...fields, categoryId: 'gone' }, book), 'category_unknown');
  await rejectsWith(queueGoalEdit('f1', original, { ...fields, categoryId: 'salary' }, book), 'category_unknown');
  await rejectsWith(queueGoalEdit('f1', original, { ...fields, targetDate: '2027-02-29' }, book), 'date_invalid');
  assert.equal(items.size, 0);
});

test('editing a queued goal replaces it in the outbox: one entry per id', async () => {
  const created = await queueGoal('f1', fields, book);
  const edited = await queueGoalEdit('f1', created, { ...fields, targetAmount: 1500 }, book);
  assert.equal(items.size, 1);
  assert.equal(items.get(created.id).record, edited);
});

// --- queueGoalDelete ---

test('queueGoalDelete marks the goal deleted and queues it into Goals', async () => {
  const original = goal('g-1');
  const deleted = await queueGoalDelete('f1', original);
  assert.equal(deleted.id, 'g-1');
  assert.equal(deleted.deleted, true);
  assert.notEqual(deleted.updatedAt, OLD);
  assert.equal(original.deleted, false, 'the original is not changed');
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Goals', record: deleted }]);
});

// --- queueContribution ---

test('queueContribution queues into Contributions with the current user as author', async () => {
  const created = await queueContribution('f1', { goalId: 'g-1', amount: 250, date: '2026-11-05' }, book);
  assert.equal(created.createdBy, 'user-1');
  assert.equal(created.goalId, 'g-1');
  assert.equal(created.amount, 250);
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Contributions', record: created }]);
});

test('queueContribution accepts a negative amount (taking money back) and one cent', async () => {
  assert.equal((await queueContribution('f1', { goalId: 'g-1', amount: -40.5, date: '2026-11-05' }, book)).amount, -40.5);
  assert.equal((await queueContribution('f1', { goalId: 'g-1', amount: 0.01, date: '2026-11-05' }, book)).amount, 0.01);
  assert.equal(items.size, 2);
});

test('queueContribution refuses a completed, deleted or unknown goal', async () => {
  for (const goalId of ['g-done', 'g-del', 'nope']) {
    await rejectsWith(queueContribution('f1', { goalId, amount: 10, date: '2026-11-05' }, book), 'goal_unknown');
  }
  assert.equal(items.size, 0);
});

test('queueContribution refuses 0, 3 decimals and an impossible date', async () => {
  await rejectsWith(queueContribution('f1', { goalId: 'g-1', amount: 0, date: '2026-11-05' }, book), 'amount_invalid');
  await rejectsWith(queueContribution('f1', { goalId: 'g-1', amount: 1.005, date: '2026-11-05' }, book), 'amount_invalid');
  await rejectsWith(queueContribution('f1', { goalId: 'g-1', amount: 10, date: '2026-02-30' }, book), 'date_invalid');
  assert.equal(items.size, 0);
});

// --- queueContributionEdit / queueContributionDelete ---

test('queueContributionEdit keeps id, goal and createdAt and queues the new amount and date', async () => {
  const original = contribution('c-1', 'g-1');
  const edited = await queueContributionEdit('f1', original, { amount: -20, date: '2026-11-30' }, book);
  assert.equal(edited.id, 'c-1');
  assert.equal(edited.goalId, 'g-1');
  assert.equal(edited.createdAt, OLD);
  assert.equal(edited.createdBy, 'user-2');
  assert.equal(edited.amount, -20);
  assert.equal(edited.date, '2026-11-30');
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Contributions', record: edited }]);
});

test('queueContributionEdit allows the contribution\'s own goal even if it is no longer active', async () => {
  const edited = await queueContributionEdit('f1', contribution('c-1', 'g-done'), { amount: 300, date: '2026-11-01' }, book);
  assert.equal(edited.goalId, 'g-done');
  assert.equal(items.size, 1);
});

test('queueContributionEdit refuses an invalid amount or date', async () => {
  const original = contribution('c-1', 'g-1');
  await rejectsWith(queueContributionEdit('f1', original, { amount: 0, date: '2026-11-01' }, book), 'amount_invalid');
  await rejectsWith(queueContributionEdit('f1', original, { amount: 5, date: '2026-11-31' }, book), 'date_invalid');
  assert.equal(items.size, 0);
});

test('queueContributionDelete marks it deleted and queues it into Contributions', async () => {
  const original = contribution('c-1', 'g-1');
  const deleted = await queueContributionDelete('f1', original);
  assert.equal(deleted.id, 'c-1');
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.amount, 250);
  assert.equal(original.deleted, false);
  assert.deepEqual([...items.values()], [{ fileId: 'f1', sheet: 'Contributions', record: deleted }]);
});

// --- queuePurchase (tarea 25d) ---

const purchaseBook = { ...book, accounts: [{ id: 'acc-1', deleted: false }] };
const purchase = { accountId: 'acc-1', amount: 950, date: '2026-11-05', categoryId: 'food', note: 'Tele' };

test('queuePurchase queues the expense and the goal, completed with it, together', async () => {
  const [movement, completed] = await queuePurchase('f1', purchase, goal('g-1'), purchaseBook);
  assert.equal(movement.type, 'expense');
  assert.equal(movement.amount, 950);
  assert.equal(completed.id, 'g-1');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.movementId, movement.id);
  assert.ok(completed.completedAt);
  assert.deepEqual([...items.values()].map((e) => [e.sheet, e.record.id]), [['Movements', movement.id], ['Goals', 'g-1']]);
  assert.equal(calls.length, 0, 'nothing reaches Google while saving');
});

test('queuePurchase keeps the goal category even if it was removed since', async () => {
  const [movement] = await queuePurchase('f1', { ...purchase, categoryId: 'gone' }, goal('g-1', { categoryId: 'gone' }), purchaseBook);
  assert.equal(movement.categoryId, 'gone');
});

test('queuePurchase with an invalid movement queues nothing', async () => {
  await rejectsWith(queuePurchase('f1', { ...purchase, amount: 0 }, goal('g-1'), purchaseBook), 'amount_invalid');
  assert.equal(items.size, 0);
});
