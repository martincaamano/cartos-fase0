// Savings goals (tarea 25): «1.000 € for the 1st of March for a TV». A goal
// (Goals tab) is funded by contributions (Contributions tab) from now on;
// what it has put aside is always the sum of its contributions, never
// stored. It is a layer over the balances: the money stays in the accounts,
// the TOTAL never changes, and «available» is the TOTAL minus what the
// active goals put aside. Contributions are tied to no account; a negative
// one takes money back. Sums in cents, results in euros.

import { fromCents, hasAtMostTwoDecimals, sumCents, toCents } from './money.js';
import { isValidDate } from './movement.js';
import { monthOf, shiftMonth } from './stats.js';

export const GOAL_STATUSES = Object.freeze(['active', 'completed']);

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

const isAmount = (amount) => typeof amount === 'number' && Number.isFinite(amount) && hasAtMostTwoDecimals(amount);

// --- Goals ---

export function createGoal(fields, { userSub = '', ...deps } = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const at = now().toISOString();
  return {
    id: newId(),
    name: String(fields.name ?? '').trim(),
    categoryId: fields.categoryId,
    targetAmount: fields.targetAmount,
    targetDate: fields.targetDate,
    status: 'active',
    completedAt: '',
    movementId: '',
    createdBy: userSub,
    createdAt: at,
    updatedAt: at,
    deleted: false,
  };
}

// A new version of a goal: only what the user can change, and updatedAt.
export function editGoal(original, fields, now = new Date()) {
  return {
    ...original,
    name: String(fields.name ?? '').trim(),
    categoryId: fields.categoryId,
    targetAmount: fields.targetAmount,
    targetDate: fields.targetDate,
    updatedAt: now.toISOString(),
  };
}

// categoryIds: the expense categories the goal may use (what it will be
// spent on). Returns a list of error codes; empty means valid.
export function validateGoal(goal, { categoryIds }) {
  const errors = [];
  if (!goal.name) errors.push('name_required');
  if (!isAmount(goal.targetAmount) || !(goal.targetAmount > 0)) errors.push('amount_invalid');
  if (!isValidDate(goal.targetDate)) errors.push('date_invalid');
  if (!new Set(categoryIds).has(goal.categoryId)) errors.push('category_unknown');
  return errors;
}

// --- Contributions ---

export function createContribution(fields, { userSub = '', ...deps } = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const at = now().toISOString();
  return {
    id: newId(),
    goalId: fields.goalId,
    amount: fields.amount,
    date: fields.date,
    createdBy: userSub,
    createdAt: at,
    updatedAt: at,
    deleted: false,
  };
}

export function editContribution(original, fields, now = new Date()) {
  return { ...original, amount: fields.amount, date: fields.date, updatedAt: now.toISOString() };
}

// goalIds: the goals it may go to (the active ones). A contribution adds
// (positive) or takes back (negative); zero is not one.
export function validateContribution(contribution, { goalIds }) {
  const errors = [];
  if (!isAmount(contribution.amount) || contribution.amount === 0) errors.push('amount_invalid');
  if (!isValidDate(contribution.date)) errors.push('date_invalid');
  if (!new Set(goalIds).has(contribution.goalId)) errors.push('goal_unknown');
  return errors;
}

// --- What the goals add up to ---

// The goals that still put money aside: not removed, not completed.
export const activeGoals = (goals) => goals.filter((goal) => !goal.deleted && goal.status === 'active');

// Cents a goal has put aside: its contributions not removed.
const savedCentsOf = (goalId, contributions) => sumCents(contributions.filter((c) => !c.deleted && c.goalId === goalId));

// Euros a goal has put aside.
export const savedOf = (goalId, contributions) => fromCents(savedCentsOf(goalId, contributions));

// What the active goals put aside together, in euros.
export function totalSaved(goals, contributions) {
  return fromCents(activeGoals(goals).reduce((sum, goal) => sum + savedCentsOf(goal.id, contributions), 0));
}

// The TOTAL of the book minus what the goals put aside: what is left to
// spend if the goals are kept. Never shown as a balance.
export const available = (total, saved) => fromCents(toCents(total) - toCents(saved));

// Months left to fund a goal, counting the current one: every month whose
// first day comes before the target date. Today 2026-11-05, target
// 2027-03-01 → November to February, 4. 0 when the date has passed.
export function monthsLeft(today, targetDate) {
  if (targetDate < today) return 0;
  let month = monthOf(today);
  let count = 0;
  while (`${month}-01` < targetDate) {
    count += 1;
    month = shiftMonth(month, 1);
  }
  return Math.max(count, 1);
}

// Where a goal stands. today: YYYY-MM-DD.
// → { saved, remaining, progress (whole %, can pass 100), status
//   ('reached' | 'overdue' | 'onTrack'), monthsLeft, suggestedMonthly (euros
//   a month to reach it in time; null when reached or overdue) }
export function goalProgress(goal, contributions, today) {
  const target = toCents(goal.targetAmount);
  const saved = savedCentsOf(goal.id, contributions);
  const remaining = Math.max(target - saved, 0);
  const months = monthsLeft(today, goal.targetDate);
  let status = 'onTrack';
  if (remaining === 0) status = 'reached';
  else if (months === 0) status = 'overdue';
  return {
    saved: fromCents(saved),
    remaining: fromCents(remaining),
    progress: target > 0 ? Math.max(Math.floor((saved / target) * 100), 0) : 0,
    status,
    monthsLeft: months,
    suggestedMonthly: status === 'onTrack' ? fromCents(Math.ceil(remaining / months)) : null,
  };
}
