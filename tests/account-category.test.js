import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, validateAccount } from '../js/domain/account.js';
import {
  buildDefaultCategories, validateCategory, DEFAULT_CATEGORIES, TRANSFER_CATEGORY_ID,
} from '../js/domain/category.js';
import { es } from '../i18n/es.js';

const deps = { now: () => new Date('2026-10-25T10:00:00.000Z'), newId: () => 'id-1' };

test('createAccount fills id, timestamps and trims the name', () => {
  assert.deepEqual(createAccount({ name: '  Banco ', emoji: '🏦', initialBalance: 100.5 }, deps), {
    id: 'id-1',
    name: 'Banco',
    emoji: '🏦',
    initialBalance: 100.5,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    deleted: false,
  });
});

test('validateAccount accepts a negative initial balance', () => {
  assert.deepEqual(validateAccount(createAccount({ name: 'Tarjeta', initialBalance: -20 }, deps)), []);
});

test('validateAccount rejects an empty name and sub-cent balances', () => {
  assert.deepEqual(validateAccount(createAccount({ name: '   ', initialBalance: 1.005 }, deps)), [
    'name_required',
    'initial_balance_invalid',
  ]);
  assert.deepEqual(validateAccount({ name: 'X', initialBalance: '10' }), ['initial_balance_invalid']);
});

test('default categories come with a name each and a fixed transfer id', () => {
  let n = 0;
  const categories = buildDefaultCategories(es.categories, { ...deps, newId: () => `c${++n}` });
  assert.equal(categories.length, DEFAULT_CATEGORIES.length);
  const transfer = categories.find((c) => c.id === TRANSFER_CATEGORY_ID);
  assert.equal(transfer.name, 'Transferencia');
  assert.equal(transfer.kind, 'both');
  assert.equal(new Set(categories.map((c) => c.id)).size, categories.length, 'ids must be unique');
  for (const category of categories) {
    assert.deepEqual(validateCategory(category), []);
    assert.equal(category.isDefault, true);
  }
});

test('building defaults fails loudly when a name is missing', () => {
  assert.throws(() => buildDefaultCategories({ groceries: 'Supermercado' }, deps), /Missing name/);
});

test('validateCategory rejects an empty name and an unknown kind', () => {
  assert.deepEqual(validateCategory({ name: ' ', kind: 'gift' }), ['name_required', 'kind_invalid']);
});

test('validateAccount rejects a repeated name, ignoring case and deleted accounts', () => {
  const existing = [{ id: 'a', name: 'Abanca', deleted: false }, { id: 'b', name: 'Efectivo', deleted: true }];
  assert.deepEqual(validateAccount(createAccount({ name: ' abanca ', initialBalance: 0 }, deps), existing), ['name_taken']);
  assert.deepEqual(validateAccount(createAccount({ name: 'Efectivo', initialBalance: 0 }, deps), existing), []);
});
