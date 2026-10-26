import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, validateAccount } from '../js/domain/account.js';

// Static import: it would throw here if the module touched `document` on load.
import { accountErrorText } from '../js/ui/components.js';

const texts = { nameRequired: 'A', nameTaken: 'B', balanceInvalid: 'C' };

let counter = 0;
const deps = { now: () => new Date('2026-10-25T10:00:00.000Z'), newId: () => `acc-${++counter}` };
const existing = [createAccount({ name: 'Abanca', emoji: '🏦', initialBalance: 100 }, deps)];
const errorFor = (fields) => accountErrorText(validateAccount(createAccount(fields, deps), existing), texts);

test('importing js/ui/components.js in Node does not touch document', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof accountErrorText, 'function');
});

test('no errors gives null', () => {
  assert.equal(accountErrorText([], texts), null);
});

test('each error code maps to its text', () => {
  assert.equal(accountErrorText(['name_required'], texts), 'A');
  assert.equal(accountErrorText(['name_taken'], texts), 'B');
  assert.equal(accountErrorText(['initial_balance_invalid'], texts), 'C');
});

test('name errors go before the balance error', () => {
  assert.equal(accountErrorText(['name_required', 'initial_balance_invalid'], texts), 'A');
  assert.equal(accountErrorText(['initial_balance_invalid', 'name_required'], texts), 'A');
  assert.equal(accountErrorText(['initial_balance_invalid', 'name_taken'], texts), 'B');
});

test('with validateAccount: valid account gives null', () => {
  assert.equal(errorFor({ name: 'Efectivo', initialBalance: 50.25 }), null);
  assert.equal(errorFor({ name: 'Efectivo', initialBalance: 0 }), null);
  assert.equal(errorFor({ name: 'Efectivo', initialBalance: -0.01 }), null);
});

test('with validateAccount: empty or blank name', () => {
  assert.equal(errorFor({ name: '' }), 'A');
  assert.equal(errorFor({ name: '   ' }), 'A');
});

test('with validateAccount: repeated name, case-insensitive', () => {
  assert.equal(errorFor({ name: 'Abanca' }), 'B');
  assert.equal(errorFor({ name: 'ABANCA' }), 'B');
  assert.equal(errorFor({ name: '  abanca  ' }), 'B');
});

test('with validateAccount: deleted account name can be reused', () => {
  const deleted = [{ ...existing[0], deleted: true }];
  assert.equal(accountErrorText(validateAccount(createAccount({ name: 'Abanca' }, deps), deleted), texts), null);
});

test('with validateAccount: balance with 3 decimals', () => {
  assert.equal(errorFor({ name: 'Efectivo', initialBalance: 10.005 }), 'C');
});

test('with validateAccount: empty name and bad balance shows the name first', () => {
  assert.equal(errorFor({ name: '', initialBalance: 10.005 }), 'A');
});
