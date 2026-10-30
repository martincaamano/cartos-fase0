// Editing a saved account or category (tarea 20c): pure domain, no mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editAccount, validateAccount } from '../js/domain/account.js';
import {
  canEditCategory, categoryUses, editCategory, validateCategoryEdit, TRANSFER_CATEGORY_ID,
} from '../js/domain/category.js';

const NOW = new Date('2026-10-30T09:15:00.000Z');

const account = Object.freeze({
  id: 'acc-1', name: 'Banco Inventado', emoji: '🏦', initialBalance: 100,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deleted: false,
});

// --- editAccount ---

test('editAccount keeps id and createdAt, trims name and emoji, stamps updatedAt', () => {
  assert.deepEqual(editAccount(account, { name: '  Hucha  ', emoji: ' 🐷 ', initialBalance: 250.75 }, NOW), {
    id: 'acc-1', name: 'Hucha', emoji: '🐷', initialBalance: 250.75,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-30T09:15:00.000Z', deleted: false,
  });
});

test('editAccount does not mutate the original and keeps deleted as it was', () => {
  const deleted = { ...account, deleted: true };
  const edited = editAccount(deleted, { name: 'X', initialBalance: 0 }, NOW);
  assert.equal(edited.deleted, true);
  assert.equal(deleted.name, 'Banco Inventado');
  assert.equal(account.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('editAccount: missing emoji or name become empty strings', () => {
  const edited = editAccount(account, { initialBalance: 0 }, NOW);
  assert.equal(edited.emoji, '');
  assert.equal(edited.name, '');
  assert.equal(editAccount(account, { name: null, emoji: null, initialBalance: 0 }, NOW).emoji, '');
});

test('editAccount limit balances: zero, one cent, negative and large', () => {
  for (const initialBalance of [0, 0.01, -0.01, -1250.5, 1_000_000_000.99]) {
    const edited = editAccount(account, { name: 'Banco', initialBalance }, NOW);
    assert.equal(edited.initialBalance, initialBalance);
    assert.deepEqual(validateAccount(edited, [account]), [], String(initialBalance));
  }
});

test('an edited account keeps its own name without "taken", but not another one', () => {
  const others = [account, { ...account, id: 'acc-2', name: 'Efectivo' }, { ...account, id: 'acc-3', name: 'Vieja', deleted: true }];
  assert.deepEqual(validateAccount(editAccount(account, { name: 'banco inventado', initialBalance: 100 }, NOW), others), []);
  assert.deepEqual(validateAccount(editAccount(account, { name: ' EFECTIVO ', initialBalance: 100 }, NOW), others), ['name_taken']);
  assert.deepEqual(validateAccount(editAccount(account, { name: 'Vieja', initialBalance: 100 }, NOW), others), []);
});

test('an edited account with an empty name or sub-cent balance is invalid', () => {
  assert.deepEqual(validateAccount(editAccount(account, { name: '   ', initialBalance: 1.005 }, NOW), [account]),
    ['name_required', 'initial_balance_invalid']);
  assert.deepEqual(validateAccount(editAccount(account, { name: 'B', initialBalance: '10' }, NOW), []), ['initial_balance_invalid']);
  assert.deepEqual(validateAccount(editAccount(account, { name: 'B', initialBalance: Number.NaN }, NOW), []), ['initial_balance_invalid']);
});

// --- categories ---

const leisure = Object.freeze({
  id: 'cat-1', name: 'Ocio', emoji: '🎉', kind: 'expense', isDefault: true, updatedAt: 't0', deleted: false,
});
const gym = Object.freeze({
  id: 'cat-2', name: 'Gimnasio', emoji: '🏋️', kind: 'expense', isDefault: false, updatedAt: 't0', deleted: false,
});
const oldOne = Object.freeze({
  id: 'cat-3', name: 'Antigua', emoji: '', kind: 'income', isDefault: false, updatedAt: 't0', deleted: true,
});
const transfer = Object.freeze({
  id: TRANSFER_CATEGORY_ID, name: 'Transferencia', emoji: '🔁', kind: 'both', isDefault: true, updatedAt: 't0', deleted: false,
});
const categories = [leisure, gym, oldOne, transfer];

const movement = (id, categoryId, deleted = false) => ({ id, categoryId, deleted, amount: 12.5, type: 'expense' });

test('canEditCategory: false for Transferencia and deleted categories', () => {
  assert.equal(canEditCategory(leisure), true);
  assert.equal(canEditCategory(gym), true);
  assert.equal(canEditCategory(transfer), false);
  assert.equal(canEditCategory(oldOne), false);
});

test('categoryUses counts only active movements of that category', () => {
  const movements = [movement('m1', 'cat-1'), movement('m2', 'cat-1', true), movement('m3', 'cat-2'), movement('m4', 'cat-1')];
  assert.equal(categoryUses(leisure, movements), 2);
  assert.equal(categoryUses(gym, movements), 1);
  assert.equal(categoryUses(oldOne, movements), 0);
  assert.equal(categoryUses(leisure, []), 0);
  assert.equal(categoryUses(gym, [movement('m5', 'cat-2', true)]), 0);
});

test('editCategory keeps id, isDefault and deleted, trims and stamps updatedAt', () => {
  assert.deepEqual(editCategory(leisure, { name: '  Fiestas ', emoji: ' 🥳 ', kind: 'both' }, NOW), {
    id: 'cat-1', name: 'Fiestas', emoji: '🥳', kind: 'both', isDefault: true,
    updatedAt: '2026-10-30T09:15:00.000Z', deleted: false,
  });
  assert.equal(editCategory(oldOne, { name: 'X', kind: 'income' }, NOW).deleted, true);
  assert.equal(editCategory(gym, { name: 'X', kind: 'expense' }, NOW).emoji, '');
  assert.equal(leisure.name, 'Ocio', 'original untouched');
});

test('validateCategoryEdit: Transferencia and deleted categories are not editable', () => {
  const book = { categories, movements: [] };
  assert.deepEqual(validateCategoryEdit(editCategory(transfer, { name: 'Transferencia', kind: 'both' }, NOW), transfer, book), ['not_editable']);
  assert.deepEqual(validateCategoryEdit(editCategory(transfer, { name: '', kind: 'nope' }, NOW), transfer, book), ['not_editable']);
  assert.deepEqual(validateCategoryEdit(editCategory(oldOne, { name: 'Nueva', kind: 'income' }, NOW), oldOne, book), ['not_editable']);
});

test('validateCategoryEdit: own name is not taken, another active one is, a deleted one is free', () => {
  const book = { categories, movements: [] };
  const edit = (fields) => validateCategoryEdit(editCategory(gym, { kind: 'expense', ...fields }, NOW), gym, book);
  assert.deepEqual(edit({ name: 'Gimnasio' }), []);
  assert.deepEqual(edit({ name: 'GIMNASIO ' }), []);
  assert.deepEqual(edit({ name: 'ocio' }), ['name_taken']);
  assert.deepEqual(edit({ name: 'transferencia' }), ['name_taken']);
  assert.deepEqual(edit({ name: 'Antigua' }), []);
  assert.deepEqual(edit({ name: '  ' }), ['name_required']);
  assert.deepEqual(edit({ name: 'Gimnasio', kind: 'other' }), ['kind_invalid']);
});

test('validateCategoryEdit: the kind changes only while no active movement uses it', () => {
  const used = { categories, movements: [movement('m1', 'cat-2')] };
  const onlyDeleted = { categories, movements: [movement('m1', 'cat-2', true), movement('m2', 'cat-1')] };
  const toBoth = editCategory(gym, { name: 'Gimnasio', kind: 'both' }, NOW);
  assert.deepEqual(validateCategoryEdit(toBoth, gym, used), ['kind_in_use']);
  assert.deepEqual(validateCategoryEdit(toBoth, gym, onlyDeleted), []);
  assert.deepEqual(validateCategoryEdit(toBoth, gym, { categories, movements: [] }), []);
  // Same kind with movements: only name and emoji change, always allowed.
  assert.deepEqual(validateCategoryEdit(editCategory(gym, { name: 'Gym', emoji: '💪', kind: 'expense' }, NOW), gym, used), []);
  // Both problems at once are reported together.
  assert.deepEqual(validateCategoryEdit(editCategory(gym, { name: 'Ocio', kind: 'income' }, NOW), gym, used), ['name_taken', 'kind_in_use']);
});

test('validateCategoryEdit without a book argument checks only the category', () => {
  assert.deepEqual(validateCategoryEdit(editCategory(gym, { name: 'Gym', kind: 'income' }, NOW), gym), []);
  assert.deepEqual(validateCategoryEdit(editCategory(gym, { name: '', kind: 'income' }, NOW), gym), ['name_required']);
});
