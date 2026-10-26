import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput } from '../js/domain/money.js';
import { createAccount, validateAccount } from '../js/domain/account.js';
import { totalBalance } from '../js/domain/balance.js';
import { formatEuros, formatShortDate, labelOf } from '../js/ui/format.js';

test('parseAmountInput reads Spanish-style amounts', () => {
  const cases = [
    ['0', 0], ['100', 100], ['1250,5', 1250.5], ['1.250,50', 1250.5], ['12.500', 12500],
    ['12.5', 12.5], ['-20', -20], ['−20,10', -20.1], ['12 €', 12], [' 1 250,00 ', 1250],
  ];
  for (const [text, expected] of cases) assert.equal(parseAmountInput(text), expected, text);
});

test('parseAmountInput returns null for anything that is not a number', () => {
  for (const text of ['', '   ', 'abc', '12a', '1,2,3', '--5', ',', undefined]) {
    assert.equal(parseAmountInput(text), null, String(text));
  }
});

test('first-account form: empty name, non-numeric, three decimals and zero', () => {
  const check = (name, balanceText) =>
    validateAccount(createAccount({ name, initialBalance: parseAmountInput(balanceText) }));
  assert.deepEqual(check('', '10'), ['name_required']);
  assert.deepEqual(check('Banco', 'abc'), ['initial_balance_invalid']);
  assert.deepEqual(check('Banco', '1,005'), ['initial_balance_invalid']);
  assert.deepEqual(check('Banco', '0'), []);
});

const move = (accountId, type, amount, extra = {}) => ({ accountId, type, amount, deleted: false, ...extra });

test('totalBalance adds several accounts, one without movements', () => {
  const accounts = [
    { id: 'a', initialBalance: 100, deleted: false },
    { id: 'b', initialBalance: 0.1, deleted: false },
    { id: 'c', initialBalance: 0.2, deleted: false },
  ];
  const movements = [move('a', 'expense', 12.5), move('b', 'income', 50)];
  assert.equal(totalBalance(accounts, movements), 137.8);
});

test('totalBalance ignores deleted accounts and is 0 with none', () => {
  assert.equal(totalBalance([{ id: 'a', initialBalance: 100, deleted: true }], []), 0);
  assert.equal(totalBalance([], []), 0);
});

test('formatEuros uses dot thousands, comma decimals and a real minus', () => {
  assert.equal(formatEuros(0), '0,00 €');
  assert.equal(formatEuros(1250.5), '1.250,50 €');
  assert.equal(formatEuros(1234567.89), '1.234.567,89 €');
  assert.equal(formatEuros(999), '999,00 €');
  assert.equal(formatEuros(-20.1), '−20,10 €');
  assert.equal(formatEuros(0.1 + 0.2), '0,30 €');
});

test('formatShortDate shows day and month', () => {
  assert.equal(formatShortDate('2026-10-05'), '05/10');
});

test('labelOf joins emoji and name, without a stray space when one is missing', () => {
  assert.equal(labelOf({ emoji: '🏦', name: 'Abanca' }), '🏦 Abanca');
  assert.equal(labelOf({ name: 'Abanca' }), 'Abanca');
  assert.equal(labelOf({ emoji: '', name: 'Abanca' }), 'Abanca');
  assert.equal(labelOf({ emoji: '🏦' }), '🏦');
  assert.equal(labelOf({}), '');
  assert.equal(labelOf(undefined), '');
  assert.equal(labelOf(null), '');
});
