import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput } from '../js/domain/money.js';
import { quickDates } from '../js/domain/movement.js';
import {
  createCategory, validateCategory, canRemoveCategory, rankCategories, TRANSFER_CATEGORY_ID,
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
