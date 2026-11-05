// Savings goals (js/domain/goals.js): creating and validating goals and
// contributions, what they put aside and where a goal stands. Pure: every
// figure here can be checked by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_STATUSES,
  activeGoals,
  completeGoal,
  completedGoals,
  available,
  createContribution,
  createGoal,
  editContribution,
  editGoal,
  goalProgress,
  monthsLeft,
  savedOf,
  totalSaved,
  validateContribution,
  validateGoal,
} from '../js/domain/goals.js';

const AT = new Date('2026-11-05T09:00:00.000Z');
const LATER = new Date('2026-11-06T10:00:00.000Z');
const deps = { now: () => AT, newId: () => 'id-1' };

const goal = (id, extra = {}) => ({
  id,
  name: 'Tele',
  categoryId: 'cat-1',
  targetAmount: 1000,
  targetDate: '2027-03-01',
  status: 'active',
  completedAt: '',
  movementId: '',
  createdBy: 'user-1',
  createdAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
  deleted: false,
  ...extra,
});

const c = (id, goalId, amount, extra = {}) => ({
  id,
  goalId,
  amount,
  date: '2026-11-05',
  createdBy: 'user-1',
  createdAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
  deleted: false,
  ...extra,
});

const fields = { name: 'Tele', categoryId: 'cat-1', targetAmount: 1000, targetDate: '2027-03-01' };
const okGoal = { categoryIds: ['cat-1'] };

test('GOAL_STATUSES are active and completed', () => {
  assert.deepEqual(GOAL_STATUSES, ['active', 'completed']);
});

// --- createGoal / editGoal ---

test('createGoal builds an active goal with id, timestamps and author', () => {
  const created = createGoal({ ...fields, name: '  Tele  ' }, { userSub: 'user-1', ...deps });
  assert.deepEqual(created, goal('id-1'));
});

test('createGoal without a user leaves createdBy empty', () => {
  assert.equal(createGoal(fields, deps).createdBy, '');
});

test('editGoal changes only the editable fields and updatedAt', () => {
  const original = goal('g-1', { status: 'active', createdBy: 'user-2' });
  const edited = editGoal(original, {
    name: ' Sofá ', categoryId: 'cat-2', targetAmount: 600.5, targetDate: '2027-01-31', status: 'completed', id: 'x',
  }, LATER);
  assert.deepEqual(edited, {
    ...original,
    name: 'Sofá',
    categoryId: 'cat-2',
    targetAmount: 600.5,
    targetDate: '2027-01-31',
    updatedAt: LATER.toISOString(),
  });
  assert.equal(original.name, 'Tele', 'the original is not changed');
});

// --- validateGoal ---

test('a complete goal is valid', () => {
  assert.deepEqual(validateGoal(goal('g'), okGoal), []);
});

test('a goal of one cent and a large one are valid', () => {
  assert.deepEqual(validateGoal(goal('g', { targetAmount: 0.01 }), okGoal), []);
  assert.deepEqual(validateGoal(goal('g', { targetAmount: 9999999.99 }), okGoal), []);
});

test('a goal without a name (or only spaces) is name_required', () => {
  assert.deepEqual(validateGoal(goal('g', { name: '' }), okGoal), ['name_required']);
  assert.deepEqual(validateGoal(createGoal({ ...fields, name: '   ' }, deps), okGoal), ['name_required']);
});

test('targetAmount 0, negative, 3 decimals or not a number is amount_invalid', () => {
  for (const targetAmount of [0, -1, -0.01, 10.555, '1000', NaN, Infinity, null, undefined]) {
    assert.deepEqual(validateGoal(goal('g', { targetAmount }), okGoal), ['amount_invalid'], `targetAmount ${targetAmount}`);
  }
});

test('an impossible or malformed target date is date_invalid', () => {
  for (const targetDate of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-11-5', '05/11/2026', '', undefined]) {
    assert.deepEqual(validateGoal(goal('g', { targetDate }), okGoal), ['date_invalid'], `targetDate ${targetDate}`);
  }
  assert.deepEqual(validateGoal(goal('g', { targetDate: '2028-02-29' }), okGoal), [], 'leap day is valid');
});

test('a category not in the list is category_unknown', () => {
  assert.deepEqual(validateGoal(goal('g', { categoryId: 'other' }), okGoal), ['category_unknown']);
  assert.deepEqual(validateGoal(goal('g'), { categoryIds: [] }), ['category_unknown']);
});

test('validateGoal reports every error at once', () => {
  const bad = goal('g', { name: '', targetAmount: 0, targetDate: '2026-02-30', categoryId: 'x' });
  assert.deepEqual(validateGoal(bad, okGoal), ['name_required', 'amount_invalid', 'date_invalid', 'category_unknown']);
});

// --- createContribution / editContribution / validateContribution ---

const okContribution = { goalIds: ['g-1'] };

test('createContribution builds a contribution with id, timestamps and author', () => {
  const created = createContribution({ goalId: 'g-1', amount: 250, date: '2026-11-05' }, { userSub: 'user-1', ...deps });
  assert.deepEqual(created, c('id-1', 'g-1', 250));
});

test('editContribution changes amount, date and updatedAt only', () => {
  const original = c('c-1', 'g-1', 250);
  const edited = editContribution(original, { amount: -20, date: '2026-11-30', goalId: 'g-2' }, LATER);
  assert.deepEqual(edited, { ...original, amount: -20, date: '2026-11-30', updatedAt: LATER.toISOString() });
});

test('a positive contribution, one cent or a negative one (taking money back) is valid', () => {
  for (const amount of [250, 0.01, -0.01, -100, 9999999.99]) {
    assert.deepEqual(validateContribution(c('c', 'g-1', amount), okContribution), [], `amount ${amount}`);
  }
});

test('a contribution of 0, 3 decimals or not a number is amount_invalid', () => {
  for (const amount of [0, -0, 1.001, -0.005, '10', NaN, null, undefined]) {
    assert.deepEqual(validateContribution(c('c', 'g-1', amount), okContribution), ['amount_invalid'], `amount ${amount}`);
  }
});

test('a contribution to a goal not in the list is goal_unknown', () => {
  assert.deepEqual(validateContribution(c('c', 'g-2', 10), okContribution), ['goal_unknown']);
  assert.deepEqual(validateContribution(c('c', 'g-1', 10), { goalIds: [] }), ['goal_unknown']);
});

test('a contribution with an impossible date is date_invalid', () => {
  assert.deepEqual(validateContribution(c('c', 'g-1', 10, { date: '2026-02-30' }), okContribution), ['date_invalid']);
  assert.deepEqual(validateContribution(c('c', 'g-1', 10, { date: '' }), okContribution), ['date_invalid']);
});

// --- activeGoals ---

test('activeGoals drops deleted and completed goals', () => {
  const goals = [goal('a'), goal('b', { deleted: true }), goal('c', { status: 'completed' }), goal('d')];
  assert.deepEqual(activeGoals(goals).map((g) => g.id), ['a', 'd']);
  assert.deepEqual(activeGoals([]), []);
});

// --- savedOf / totalSaved / available ---

test('savedOf sums the contributions of one goal, ignoring deleted ones and other goals', () => {
  const contributions = [
    c('1', 'g-1', 100),
    c('2', 'g-1', 50.25),
    c('3', 'g-1', 999, { deleted: true }),
    c('4', 'g-2', 70),
    c('5', 'g-1', -20),
  ];
  assert.equal(savedOf('g-1', contributions), 130.25);
  assert.equal(savedOf('g-2', contributions), 70);
  assert.equal(savedOf('none', contributions), 0);
  assert.equal(savedOf('g-1', []), 0);
});

test('savedOf is exact in cents: 0.1 + 0.2 is 0.3', () => {
  assert.equal(savedOf('g', [c('1', 'g', 0.1), c('2', 'g', 0.2)]), 0.3);
  assert.equal(savedOf('g', [c('1', 'g', 0.01), c('2', 'g', 0.01), c('3', 'g', 0.01)]), 0.03);
});

test('totalSaved counts only active goals', () => {
  const goals = [goal('a'), goal('b', { status: 'completed' }), goal('c', { deleted: true }), goal('d')];
  const contributions = [c('1', 'a', 100.1), c('2', 'b', 500), c('3', 'c', 300), c('4', 'd', 0.2), c('5', 'x', 9)];
  assert.equal(totalSaved(goals, contributions), 100.3);
  assert.equal(totalSaved([], contributions), 0);
});

test('available is TOTAL minus saved, exact in cents, and can go negative', () => {
  assert.equal(available(1000, 250), 750);
  assert.equal(available(0.3, 0.1), 0.2);
  assert.equal(available(1250.5, 1250.49), 0.01);
  assert.equal(available(100, 150.75), -50.75);
  assert.equal(available(0, 0), 0);
  assert.equal(available(-10, 5), -15);
});

// --- monthsLeft (today 2026-11-05) ---

const TODAY = '2026-11-05';

test('monthsLeft counts the months whose first day comes before the target', () => {
  assert.equal(monthsLeft(TODAY, '2027-03-01'), 4, 'November to February');
  assert.equal(monthsLeft(TODAY, '2027-03-15'), 5, 'March counts too');
  assert.equal(monthsLeft(TODAY, '2026-12-01'), 1);
  assert.equal(monthsLeft(TODAY, '2026-12-02'), 2);
});

test('monthsLeft is 1 for a target later this month or today, 0 for yesterday', () => {
  assert.equal(monthsLeft(TODAY, '2026-11-30'), 1);
  assert.equal(monthsLeft(TODAY, TODAY), 1);
  assert.equal(monthsLeft(TODAY, '2026-11-04'), 0);
  assert.equal(monthsLeft(TODAY, '2025-01-01'), 0);
});

test('monthsLeft on the first of the month and at the end of a month', () => {
  assert.equal(monthsLeft('2026-11-01', '2026-11-01'), 1);
  assert.equal(monthsLeft('2026-11-30', '2026-12-01'), 1);
  assert.equal(monthsLeft('2026-12-31', '2027-01-01'), 1, 'across the year');
  assert.equal(monthsLeft('2026-12-31', '2027-01-02'), 2);
});

// --- goalProgress (today 2026-11-05, target 1000 € on 2027-03-01: 4 months) ---

test('goalProgress with nothing saved: 0 %, on track, the whole target over 4 months', () => {
  assert.deepEqual(goalProgress(goal('g'), [], TODAY), {
    saved: 0, remaining: 1000, progress: 0, status: 'onTrack', monthsLeft: 4, suggestedMonthly: 250,
  });
});

test('goalProgress partial: 1000 − 250 over 4 months is 187.5 a month', () => {
  assert.deepEqual(goalProgress(goal('g'), [c('1', 'g', 200), c('2', 'g', 50), c('3', 'other', 900)], TODAY), {
    saved: 250, remaining: 750, progress: 25, status: 'onTrack', monthsLeft: 4, suggestedMonthly: 187.5,
  });
});

test('goalProgress rounds the monthly suggestion up to the cent', () => {
  // 1000 € over 3 months (Nov, Dec, Jan): 333.333… → 333.34.
  const p = goalProgress(goal('g', { targetDate: '2027-02-01' }), [], TODAY);
  assert.equal(p.monthsLeft, 3);
  assert.equal(p.suggestedMonthly, 333.34);
  // 100 € − 0.01 over 3 months: 9999 / 3 = 3333 cents exactly, no rounding.
  assert.equal(goalProgress(goal('g', { targetAmount: 100, targetDate: '2027-02-01' }), [c('1', 'g', 0.01)], TODAY).suggestedMonthly, 33.33);
});

test('goalProgress progress is a whole percentage, rounded down', () => {
  assert.equal(goalProgress(goal('g'), [c('1', 'g', 333.33)], TODAY).progress, 33);
  assert.equal(goalProgress(goal('g'), [c('1', 'g', 999.99)], TODAY).progress, 99, 'not reached until 100 %');
});

test('goalProgress at exactly 100 % is reached with no suggestion', () => {
  assert.deepEqual(goalProgress(goal('g'), [c('1', 'g', 0.1), c('2', 'g', 999.9)], TODAY), {
    saved: 1000, remaining: 0, progress: 100, status: 'reached', monthsLeft: 4, suggestedMonthly: null,
  });
});

test('goalProgress over 100 % passes 100 and stays reached', () => {
  const p = goalProgress(goal('g'), [c('1', 'g', 1200)], TODAY);
  assert.equal(p.progress, 120);
  assert.equal(p.remaining, 0);
  assert.equal(p.status, 'reached');
  assert.equal(p.suggestedMonthly, null);
});

test('goalProgress with a negative saved shows 0 % and the target plus the debt remaining', () => {
  const p = goalProgress(goal('g'), [c('1', 'g', -50)], TODAY);
  assert.equal(p.saved, -50);
  assert.equal(p.progress, 0);
  assert.equal(p.remaining, 1050);
  assert.equal(p.status, 'onTrack');
});

test('goalProgress ignores deleted contributions', () => {
  const p = goalProgress(goal('g'), [c('1', 'g', 1000, { deleted: true }), c('2', 'g', 250)], TODAY);
  assert.equal(p.saved, 250);
  assert.equal(p.status, 'onTrack');
});

test('goalProgress past the target date and not reached is overdue with no suggestion', () => {
  assert.deepEqual(goalProgress(goal('g', { targetDate: '2026-11-04' }), [c('1', 'g', 100)], TODAY), {
    saved: 100, remaining: 900, progress: 10, status: 'overdue', monthsLeft: 0, suggestedMonthly: null,
  });
});

test('goalProgress past the target date but reached is reached, not overdue', () => {
  assert.equal(goalProgress(goal('g', { targetDate: '2026-10-01' }), [c('1', 'g', 1000)], TODAY).status, 'reached');
});

test('goalProgress with the target today: one month left, the whole remaining', () => {
  const p = goalProgress(goal('g', { targetDate: TODAY, targetAmount: 0.01 }), [], TODAY);
  assert.equal(p.status, 'onTrack');
  assert.equal(p.monthsLeft, 1);
  assert.equal(p.suggestedMonthly, 0.01);
});

// --- completeGoal / completedGoals (tarea 25d) ---

test('completeGoal marks the goal completed with its movement and the time', () => {
  const g = createGoal({ name: 'Tele', categoryId: 'c', targetAmount: 1000, targetDate: '2027-03-01' }, { now: () => new Date('2026-10-01T00:00:00Z'), newId: () => 'g' });
  const done = completeGoal(g, 'm-1', new Date('2026-11-05T10:00:00Z'));
  assert.deepEqual([done.status, done.movementId, done.completedAt, done.updatedAt, done.createdAt],
    ['completed', 'm-1', '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z', '2026-10-01T00:00:00.000Z']);
  assert.deepEqual(activeGoals([done]), []);
});

test('completedGoals lists the completed ones, latest first, not removed ones', () => {
  const goals = [
    { id: 'a', status: 'completed', completedAt: '2026-10-01T00:00:00Z', deleted: false },
    { id: 'b', status: 'active', completedAt: '', deleted: false },
    { id: 'c', status: 'completed', completedAt: '2026-11-01T00:00:00Z', deleted: false },
    { id: 'd', status: 'completed', completedAt: '2026-11-02T00:00:00Z', deleted: true },
  ];
  assert.deepEqual(completedGoals(goals).map((g) => g.id), ['c', 'a']);
});
