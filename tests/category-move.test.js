// Moving the movements of a category to another one (tarea 29), the pure
// part in js/domain/category.js: typesUsed, moveTargets, validateMove and
// moveCategory. Queueing and uploading are in category-move-data.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typesUsed, moveTargets, validateMove, moveCategory } from '../js/domain/category.js';

const toCents = (euros) => Math.round(euros * 100);

const OLD = '2026-10-01T08:00:00.000Z';
const NOW = new Date('2026-11-07T10:30:00.000Z');
const AT = '2026-11-07T10:30:00.000Z';

const cat = (id, kind, extra = {}) => ({
  id, name: id, emoji: '', kind, isDefault: false, updatedAt: OLD, deleted: false, ...extra,
});

const mv = (id, categoryId, type, amount, extra = {}) => ({
  id, accountId: 'bank', type, amount, date: '2026-10-25', categoryId, note: `note ${id}`,
  transferId: '', personId: '', createdBy: 'user-1', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});

const goal = (id, categoryId, extra = {}) => ({
  id, name: 'Tele', categoryId, targetAmount: 1000, targetDate: '2027-03-01', status: 'active',
  completedAt: '', movementId: '', createdBy: 'user-1', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});

const categories = [
  cat('food', 'expense'),
  cat('restaurants', 'expense'),
  cat('salary', 'income'),
  cat('bonus', 'income'),
  cat('mixed', 'both'),
  cat('mixed2', 'both'),
  cat('transfer', 'both', { isDefault: true }),
  cat('gone-exp', 'expense', { deleted: true }),
  cat('gone-both', 'both', { deleted: true }),
];
const byId = (id) => categories.find((c) => c.id === id);
const ids = (list) => list.map((c) => c.id);

// --- typesUsed ---

test('typesUsed lists the types of the active movements of that category only', () => {
  const movements = [
    mv('m1', 'food', 'expense', 10),
    mv('m2', 'food', 'expense', 5),
    mv('m3', 'food', 'income', 2, { deleted: true }),
    mv('m4', 'salary', 'income', 1000),
  ];
  assert.deepEqual(typesUsed('food', movements), ['expense']);
  assert.deepEqual(typesUsed('salary', movements), ['income']);
});

test('typesUsed lists both types once each when both are used', () => {
  const movements = [
    mv('m1', 'mixed', 'expense', 10),
    mv('m2', 'mixed', 'income', 20),
    mv('m3', 'mixed', 'expense', 30),
  ];
  assert.deepEqual([...typesUsed('mixed', movements)].sort(), ['expense', 'income']);
});

test('typesUsed is empty for an unused category, only deleted movements or no movements', () => {
  assert.deepEqual(typesUsed('food', []), []);
  assert.deepEqual(typesUsed('food', [mv('m1', 'food', 'expense', 1, { deleted: true })]), []);
  assert.deepEqual(typesUsed('food', [mv('m1', 'salary', 'income', 1)]), []);
});

// --- moveTargets ---

test('moveTargets of an expense-only origin: expense or both, never itself, transfer or deleted', () => {
  const movements = [mv('m1', 'food', 'expense', 10)];
  assert.deepEqual(ids(moveTargets(byId('food'), categories, movements)), ['restaurants', 'mixed', 'mixed2']);
});

test('moveTargets of an income-only origin: income or both', () => {
  const movements = [mv('m1', 'salary', 'income', 1000)];
  assert.deepEqual(ids(moveTargets(byId('salary'), categories, movements)), ['bonus', 'mixed', 'mixed2']);
});

test('moveTargets of an origin used with both types: only both categories', () => {
  const movements = [mv('m1', 'mixed', 'expense', 10), mv('m2', 'mixed', 'income', 20)];
  assert.deepEqual(ids(moveTargets(byId('mixed'), categories, movements)), ['mixed2']);
});

test('moveTargets of a both origin used only for expenses accepts expense categories', () => {
  const movements = [mv('m1', 'mixed', 'expense', 10)];
  assert.deepEqual(ids(moveTargets(byId('mixed'), categories, movements)), ['food', 'restaurants', 'mixed2']);
});

test('moveTargets of an origin without movements: every active category but itself and transfer', () => {
  assert.deepEqual(
    ids(moveTargets(byId('food'), categories, [])),
    ['restaurants', 'salary', 'bonus', 'mixed', 'mixed2'],
  );
});

test('moveTargets: deleted movements do not restrict the targets', () => {
  const movements = [mv('m1', 'food', 'expense', 10), mv('m2', 'food', 'income', 5, { deleted: true })];
  assert.deepEqual(ids(moveTargets(byId('food'), categories, movements)), ['restaurants', 'mixed', 'mixed2']);
});

test('moveTargets: movements of other categories do not restrict the targets', () => {
  const movements = [mv('m1', 'food', 'expense', 10), mv('m2', 'salary', 'income', 5)];
  assert.deepEqual(ids(moveTargets(byId('food'), categories, movements)), ['restaurants', 'mixed', 'mixed2']);
});

test('moveTargets is empty when no compatible category is left', () => {
  const few = [cat('food', 'expense'), cat('salary', 'income'), cat('transfer', 'both')];
  assert.deepEqual(moveTargets(few[0], few, [mv('m1', 'food', 'expense', 1)]), []);
});

// --- validateMove ---

const bookWith = (movements) => ({ categories, movements });

test('validateMove is [] for a compatible target', () => {
  const book = bookWith([mv('m1', 'food', 'expense', 10)]);
  assert.deepEqual(validateMove(byId('food'), byId('restaurants'), book), []);
  assert.deepEqual(validateMove(byId('food'), byId('mixed'), book), []);
});

test('validateMove: a missing or deleted origin is category_unknown', () => {
  const book = bookWith([]);
  assert.deepEqual(validateMove(undefined, byId('food'), book), ['category_unknown']);
  assert.deepEqual(validateMove(null, byId('food'), book), ['category_unknown']);
  assert.deepEqual(validateMove(byId('gone-exp'), byId('food'), book), ['category_unknown']);
});

test('validateMove: Transferencia as origin is not_removable', () => {
  assert.deepEqual(validateMove(byId('transfer'), byId('mixed'), bookWith([])), ['not_removable']);
});

test('validateMove: a missing target is target_unknown', () => {
  assert.deepEqual(validateMove(byId('food'), undefined, bookWith([])), ['target_unknown']);
  assert.deepEqual(validateMove(byId('food'), null, bookWith([])), ['target_unknown']);
});

test('validateMove: the origin as target is same_category', () => {
  assert.deepEqual(validateMove(byId('food'), byId('food'), bookWith([])), ['same_category']);
  assert.deepEqual(validateMove(byId('food'), { ...byId('food') }, bookWith([])), ['same_category']);
});

test('validateMove: an incompatible, transfer or deleted target is target_invalid', () => {
  const book = bookWith([mv('m1', 'food', 'expense', 10)]);
  assert.deepEqual(validateMove(byId('food'), byId('salary'), book), ['target_invalid']);
  assert.deepEqual(validateMove(byId('food'), byId('transfer'), book), ['target_invalid']);
  assert.deepEqual(validateMove(byId('food'), byId('gone-exp'), book), ['target_invalid']);
  assert.deepEqual(validateMove(byId('food'), byId('gone-both'), book), ['target_invalid']);
});

test('validateMove: an origin with both types cannot go to an expense or income category', () => {
  const book = bookWith([mv('m1', 'mixed', 'expense', 10), mv('m2', 'mixed', 'income', 20)]);
  assert.deepEqual(validateMove(byId('mixed'), byId('food'), book), ['target_invalid']);
  assert.deepEqual(validateMove(byId('mixed'), byId('salary'), book), ['target_invalid']);
  assert.deepEqual(validateMove(byId('mixed'), byId('mixed2'), book), []);
});

test('validateMove: a target that is not in the book is target_invalid', () => {
  assert.deepEqual(validateMove(byId('food'), cat('stranger', 'expense'), bookWith([])), ['target_invalid']);
});

// --- moveCategory ---

const movementsFixture = () => [
  mv('m1', 'food', 'expense', 12.5),
  mv('m2', 'food', 'expense', 0.01, { date: '2026-10-31' }),
  mv('m3', 'food', 'expense', 99, { deleted: true }),
  mv('m4', 'restaurants', 'expense', 30.1),
  mv('m5', 'salary', 'income', 1500),
  mv('m6', 'food', 'expense', 1_000_000.99, { date: '2026-02-28' }),
];
const goalsFixture = () => [
  goal('g1', 'food'),
  goal('g2', 'food', { deleted: true }),
  goal('g3', 'restaurants'),
];

test('moveCategory moves only the active movements and goals of the origin', () => {
  const changed = moveCategory(byId('food'), byId('restaurants'),
    { movements: movementsFixture(), goals: goalsFixture() }, { now: NOW });
  assert.deepEqual(ids(changed.movements), ['m1', 'm2', 'm6']);
  assert.deepEqual(ids(changed.goals), ['g1']);
  for (const item of [...changed.movements, ...changed.goals]) {
    assert.equal(item.categoryId, 'restaurants');
    assert.equal(item.updatedAt, AT);
  }
  assert.deepEqual(changed.categories, []);
});

test('moveCategory keeps every other field of the movements and goals', () => {
  const movements = movementsFixture();
  const goals = goalsFixture();
  const changed = moveCategory(byId('food'), byId('restaurants'), { movements, goals }, { now: NOW });
  assert.deepEqual(changed.movements[0], { ...movements[0], categoryId: 'restaurants', updatedAt: AT });
  assert.deepEqual(changed.movements[1], { ...movements[1], categoryId: 'restaurants', updatedAt: AT });
  assert.deepEqual(changed.movements[2], { ...movements[5], categoryId: 'restaurants', updatedAt: AT });
  assert.equal(changed.movements[1].amount, 0.01);
  assert.equal(changed.movements[1].note, 'note m2');
  assert.equal(changed.movements[2].date, '2026-02-28');
  assert.equal(changed.movements[2].amount, 1_000_000.99);
  assert.deepEqual(changed.goals[0], { ...goals[0], categoryId: 'restaurants', updatedAt: AT });
});

test('moveCategory with remove returns the origin deleted with the same updatedAt', () => {
  const changed = moveCategory(byId('food'), byId('restaurants'),
    { movements: movementsFixture(), goals: goalsFixture() }, { remove: true, now: NOW });
  assert.deepEqual(changed.categories, [{ ...byId('food'), deleted: true, updatedAt: AT }]);
});

test('moveCategory without remove leaves categories empty', () => {
  const changed = moveCategory(byId('food'), byId('restaurants'),
    { movements: movementsFixture() }, { remove: false, now: NOW });
  assert.deepEqual(changed.categories, []);
});

test('moveCategory without goals returns goals: []', () => {
  const changed = moveCategory(byId('food'), byId('restaurants'), { movements: movementsFixture() }, { now: NOW });
  assert.deepEqual(changed.goals, []);
});

test('moveCategory of an unused category changes nothing, but can still remove it', () => {
  const changed = moveCategory(byId('bonus'), byId('salary'),
    { movements: movementsFixture(), goals: goalsFixture() }, { remove: true, now: NOW });
  assert.deepEqual(changed.movements, []);
  assert.deepEqual(changed.goals, []);
  assert.deepEqual(ids(changed.categories), ['bonus']);
});

test('moveCategory does not mutate its inputs', () => {
  const movements = movementsFixture();
  const goals = goalsFixture();
  const origin = { ...byId('food') };
  const target = { ...byId('restaurants') };
  const before = JSON.stringify({ movements, goals, origin, target });
  moveCategory(origin, target, { movements, goals }, { remove: true, now: NOW });
  assert.equal(JSON.stringify({ movements, goals, origin, target }), before);
});

// The book after the move: the changed records replace their old versions.
const apply = (movements, changed) => movements.map((m) => changed.find((c) => c.id === m.id) ?? m);
const sumBy = (movements, pick) => {
  const totals = {};
  for (const m of movements) {
    if (m.deleted) continue;
    const key = pick(m);
    totals[key] = (totals[key] ?? 0) + toCents(m.amount);
  }
  return totals;
};

test('moveCategory leaves the totals per type unchanged and adds the origin total to the target', () => {
  const movements = movementsFixture();
  const changed = moveCategory(byId('food'), byId('restaurants'), { movements }, { remove: true, now: NOW });
  const after = apply(movements, changed.movements);
  assert.deepEqual(sumBy(after, (m) => m.type), sumBy(movements, (m) => m.type));
  const perCategoryBefore = sumBy(movements, (m) => m.categoryId);
  const perCategoryAfter = sumBy(after, (m) => m.categoryId);
  // food: 12,50 + 0,01 + 1.000.000,99 = 1.000.013,50; restaurants: 30,10.
  assert.equal(perCategoryBefore.food, 100_001_350);
  assert.equal(perCategoryBefore.restaurants, 3_010);
  assert.equal(perCategoryAfter.food, undefined);
  assert.equal(perCategoryAfter.restaurants, 100_004_360);
  assert.equal(perCategoryAfter.salary, perCategoryBefore.salary);
  // The deleted movement stays in the origin, untouched.
  assert.deepEqual(after.find((m) => m.id === 'm3'), movements[2]);
});
