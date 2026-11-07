import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput } from '../js/domain/money.js';
import { quickDates } from '../js/domain/movement.js';
import {
  createCategory, validateCategory, canRemoveCategory, rankCategories, rankAllCategories,
  TRANSFER_CATEGORY_ID, RANK_MONTHS,
} from '../js/domain/category.js';

test('amount text from the Add form', () => {
  const cases = [
    ['12', 12], ['12.5', 12.5], ['12,50', 12.5], ['0', 0], ['-3', -3],
    ['1.234,56', 1234.56], ['12.345', 12345], ['', null],
  ];
  for (const [text, expected] of cases) assert.equal(parseAmountInput(text), expected, text);
});

test('quick dates on a normal day', () => {
  assert.deepEqual(quickDates(new Date(2026, 9, 25, 23, 59)), {
    today: '2026-10-25', yesterday: '2026-10-24', dayBefore: '2026-10-23',
  });
});

test('quick dates across month, leap year and year boundaries', () => {
  assert.deepEqual(quickDates(new Date(2024, 2, 1)), {
    today: '2024-03-01', yesterday: '2024-02-29', dayBefore: '2024-02-28',
  });
  assert.deepEqual(quickDates(new Date(2026, 2, 1)), {
    today: '2026-03-01', yesterday: '2026-02-28', dayBefore: '2026-02-27',
  });
  assert.deepEqual(quickDates(new Date(2027, 0, 1, 0, 5)), {
    today: '2027-01-01', yesterday: '2026-12-31', dayBefore: '2026-12-30',
  });
});

const deps = { now: () => new Date('2026-10-25T10:00:00Z'), newId: () => 'new' };
const existing = [
  { id: 'a', name: 'Ocio', kind: 'expense', deleted: false },
  { id: 'b', name: 'Mascotas', kind: 'expense', deleted: true },
];

test('own category: empty or repeated name is rejected, case-insensitive', () => {
  assert.deepEqual(validateCategory(createCategory({ name: '  ', kind: 'expense' }, deps), existing), ['name_required']);
  assert.deepEqual(validateCategory(createCategory({ name: ' ocio ', kind: 'expense' }, deps), existing), ['name_taken']);
  assert.deepEqual(validateCategory(createCategory({ name: 'Gimnasio', kind: 'gift' }, deps), existing), ['kind_invalid']);
});

test('own category: a deleted name can be reused and the new one is valid', () => {
  const category = createCategory({ name: 'Mascotas', emoji: '🐶', kind: 'expense' }, deps);
  assert.deepEqual(validateCategory(category, existing), []);
  assert.equal(category.isDefault, false);
});

test('Transfer can never be removed', () => {
  assert.equal(canRemoveCategory({ id: TRANSFER_CATEGORY_ID, deleted: false }), false);
  assert.equal(canRemoveCategory({ id: 'a', deleted: false }), true);
  assert.equal(canRemoveCategory({ id: 'a', deleted: true }), false);
});

test('rankCategories puts the most used of that type first and hides transfer', () => {
  const categories = [
    { id: 'g', kind: 'expense', deleted: false },
    { id: 'r', kind: 'expense', deleted: false },
    { id: 'old', kind: 'expense', deleted: true },
    { id: 's', kind: 'income', deleted: false },
    { id: TRANSFER_CATEGORY_ID, kind: 'both', deleted: false },
  ];
  const movements = [
    { type: 'expense', categoryId: 'r', deleted: false },
    { type: 'expense', categoryId: 'r', deleted: false },
    { type: 'expense', categoryId: 'g', deleted: true },
  ];
  assert.deepEqual(rankCategories(categories, movements, 'expense').map((c) => c.id), ['r', 'g']);
  assert.deepEqual(rankCategories(categories, movements, 'income').map((c) => c.id), ['s']);
});

const spend = (categoryId, date, extra = {}) => ({ type: 'expense', categoryId, date, deleted: false, ...extra });
const ids = (list) => list.map((c) => c.id);
const rankCats = [
  { id: 'a', kind: 'expense', deleted: false },
  { id: 'b', kind: 'expense', deleted: false },
  { id: 'c', kind: 'expense', deleted: false },
];

test('rankCategories window is RANK_MONTHS months back, starting that same day', () => {
  assert.equal(RANK_MONTHS, 6);
  const today = '2026-11-07';
  assert.deepEqual(ids(rankCategories(rankCats, [spend('b', '2026-05-07')], 'expense', today)), ['b', 'a', 'c']);
  assert.deepEqual(ids(rankCategories(rankCats, [spend('b', '2026-05-06')], 'expense', today)), ['a', 'b', 'c']);
});

test('rankCategories: used twice last month beats used ten times a year ago', () => {
  const movements = [
    ...Array.from({ length: 10 }, () => spend('a', '2025-11-07')),
    spend('c', '2026-10-01'), spend('c', '2026-10-15'),
  ];
  assert.deepEqual(ids(rankCategories(rankCats, movements, 'expense', '2026-11-07')), ['c', 'a', 'b']);
});

test('rankCategories window across a year boundary', () => {
  const today = '2026-03-15';
  const movements = [spend('c', '2025-09-15'), spend('b', '2025-09-14'), spend('b', '2025-09-14')];
  assert.deepEqual(ids(rankCategories(rankCats, movements, 'expense', today)), ['c', 'a', 'b']);
});

test('rankCategories window from day 31 compares as text (2026-02-31)', () => {
  const today = '2026-08-31';
  assert.deepEqual(ids(rankCategories(rankCats, [spend('b', '2026-03-01')], 'expense', today)), ['b', 'a', 'c']);
  assert.deepEqual(ids(rankCategories(rankCats, [spend('b', '2026-02-28')], 'expense', today)), ['a', 'b', 'c']);
});

test('rankCategories ties: most recent first, then book order', () => {
  const today = '2026-11-07';
  const recent = [spend('b', '2026-10-01'), spend('c', '2026-11-07'), spend('b', '2026-09-01'), spend('c', '2026-06-01')];
  assert.deepEqual(ids(rankCategories(rankCats, recent, 'expense', today)), ['c', 'b', 'a']);
  const same = [spend('c', '2026-10-01'), spend('b', '2026-10-01')];
  assert.deepEqual(ids(rankCategories(rankCats, same, 'expense', today)), ['b', 'c', 'a']);
});

test('rankCategories ignores deleted movements, other types, transfer and deleted categories', () => {
  const today = '2026-11-07';
  const categories = [
    { id: 'g', kind: 'expense', deleted: false },
    { id: 'gone', kind: 'expense', deleted: true },
    { id: 'gift', kind: 'both', deleted: false },
    { id: 's', kind: 'income', deleted: false },
    { id: TRANSFER_CATEGORY_ID, kind: 'both', deleted: false },
  ];
  const movements = [
    spend('g', '2026-10-01', { deleted: true }),
    spend('g', '2026-10-02', { deleted: true }),
    spend('gift', '2026-10-01'),
    spend('gone', '2026-10-01'),
    spend('gone', '2026-10-02'),
    spend(TRANSFER_CATEGORY_ID, '2026-10-01'),
    spend(TRANSFER_CATEGORY_ID, '2026-10-02'),
    { type: 'income', categoryId: 's', date: '2026-10-01', deleted: false },
    { type: 'income', categoryId: 's', date: '2026-10-02', deleted: false },
    { type: 'income', categoryId: 's', date: '2026-10-03', deleted: false },
  ];
  assert.deepEqual(ids(rankCategories(categories, movements, 'expense', today)), ['gift', 'g']);
  assert.deepEqual(ids(rankCategories(categories, movements, 'income', today)), ['s', 'gift']);
});

test('rankCategories keeps book order when nothing falls in the window', () => {
  const categories = [
    { id: 'def1', kind: 'expense', isDefault: true, deleted: false },
    { id: 'def2', kind: 'expense', isDefault: true, deleted: false },
    { id: 'own', kind: 'expense', isDefault: false, deleted: false },
  ];
  const movements = [spend('own', '2025-01-01'), spend('own', '2025-02-01')];
  assert.deepEqual(ids(rankCategories(categories, movements, 'expense', '2026-11-07')), ['def1', 'def2', 'own']);
  assert.deepEqual(ids(rankCategories(categories, [], 'expense', '2026-11-07')), ['def1', 'def2', 'own']);
});

test('rankCategories without today counts every movement', () => {
  const movements = [
    ...Array.from({ length: 10 }, () => spend('a', '2020-01-01')),
    spend('c', '2026-10-01'), spend('c', '2026-10-15'),
  ];
  assert.deepEqual(ids(rankCategories(rankCats, movements, 'expense', null)), ['a', 'c', 'b']);
  assert.deepEqual(ids(rankCategories(rankCats, movements, 'expense')), ['a', 'c', 'b']);
});

test('rankAllCategories passes today through', () => {
  const categories = [
    { id: 'e1', kind: 'expense', deleted: false },
    { id: 'e2', kind: 'expense', deleted: false },
    { id: 'i1', kind: 'income', deleted: false },
    { id: 'i2', kind: 'income', deleted: false },
    { id: TRANSFER_CATEGORY_ID, kind: 'both', deleted: false },
  ];
  const movements = [
    spend('e2', '2025-01-01'), spend('e2', '2025-01-02'), spend('e1', '2026-10-01'),
    { type: 'income', categoryId: 'i2', date: '2025-01-01', deleted: false },
  ];
  assert.deepEqual(ids(rankAllCategories(categories, movements)), ['e2', 'e1', 'i2', 'i1']);
  assert.deepEqual(ids(rankAllCategories(categories, movements, '2026-11-07')), ['e1', 'e2', 'i1', 'i2']);
});
