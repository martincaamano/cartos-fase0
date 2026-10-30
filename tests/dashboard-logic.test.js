import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput } from '../js/domain/money.js';
import { createAccount, validateAccount } from '../js/domain/account.js';
import { totalBalance } from '../js/domain/balance.js';
import { formatEuros, formatSums, formatShortDate, labelOf } from '../js/ui/format.js';

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

// --- formatSums (tarea 20b) ---

test('formatSums: negative net keeps the real minus and the euro sign', () => {
  assert.deepEqual(formatSums({ income: 1601.27, expense: 3547.58, net: -1946.31 }), {
    income: '+1.601,27',
    expense: '3.547,58',
    net: '−1.946,31 €',
  });
});

test('formatSums: positive net gets a plus sign', () => {
  assert.deepEqual(formatSums({ income: 500, expense: 87.7, net: 412.3 }), {
    income: '+500,00',
    expense: '87,70',
    net: '+412,30 €',
  });
});

test('formatSums: all zero has no sign on the net', () => {
  assert.deepEqual(formatSums({ income: 0, expense: 0, net: 0 }), { income: '+0,00', expense: '0,00', net: '0,00 €' });
});

test('formatSums: one cent and big amounts', () => {
  assert.deepEqual(formatSums({ income: 0.01, expense: 0, net: 0.01 }), { income: '+0,01', expense: '0,00', net: '+0,01 €' });
  assert.deepEqual(formatSums({ income: 0, expense: 0.01, net: -0.01 }), { income: '+0,00', expense: '0,01', net: '−0,01 €' });
  assert.deepEqual(formatSums({ income: 1234567.89, expense: 1000000, net: 234567.89 }), {
    income: '+1.234.567,89',
    expense: '1.000.000,00',
    net: '+234.567,89 €',
  });
});
