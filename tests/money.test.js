import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countAmount, toCents, fromCents, hasAtMostTwoDecimals, incomeExpenseNet, parseAmountInput, sumCents,
} from '../js/domain/money.js';

test('0,1 + 0,2 is exactly 0,30 when added in cents', () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(fromCents(toCents(0.1) + toCents(0.2)), 0.3);
});

test('toCents rounds float noise to whole cents', () => {
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(1250.5), 125050);
  assert.equal(toCents(-12.34), -1234);
});

test('hasAtMostTwoDecimals accepts cents and rejects finer amounts', () => {
  for (const ok of [0, 1, 0.1, 0.29, 12.34, 1250.5, -3.5]) assert.equal(hasAtMostTwoDecimals(ok), true, String(ok));
  for (const bad of [1.005, 0.001, NaN, Infinity]) assert.equal(hasAtMostTwoDecimals(bad), false, String(bad));
});

// --- parseAmountInput: what the iPhone keypad makes easy to type (tarea 21) ---

test('parseAmountInput accepts a trailing or leading decimal separator', () => {
  const cases = [
    ['12,', 12], [',5', 0.5], ['12.', 12], ['-3,', -3],
    ['.5', 0.5], ['-,5', -0.5], ['0,', 0], [',01', 0.01], ['1.250,', 1250],
  ];
  for (const [text, expected] of cases) assert.equal(parseAmountInput(text), expected, text);
});

test('parseAmountInput: a separator alone or doubled is not a number', () => {
  for (const text of [',', '.', '-,', '-.', ',,', '..', '12,,', ',,5', '1,2,']) {
    assert.equal(parseAmountInput(text), null, text);
  }
});

test('parseAmountInput: the existing cases are unchanged', () => {
  const cases = [
    ['0', 0], ['12', 12], ['12.5', 12.5], ['12,50', 12.5], ['-3', -3], ['1250,5', 1250.5],
    ['1.250,50', 1250.5], ['12.500', 12500], ['1.234,56', 1234.56], ['−20,10', -20.1],
    ['12 €', 12], [' 1 250,00 ', 1250], ['0,01', 0.01],
    ['', null], ['   ', null], ['abc', null], ['12a', null], ['1,2,3', null], ['--5', null], [undefined, null],
  ];
  for (const [text, expected] of cases) assert.equal(parseAmountInput(text), expected, String(text));
});

// --- sumCents and incomeExpenseNet (tarea 22b) ---

test('sumCents adds amounts exactly, with an optional picker', () => {
  assert.equal(sumCents([{ amount: 0.1 }, { amount: 0.2 }]), 30);
  assert.equal(sumCents([{ expense: 1.5 }, { expense: 2 }], (item) => item.expense), 350);
  assert.equal(sumCents([]), 0);
});

test('incomeExpenseNet splits by type and nets in cents', () => {
  const movements = [
    { type: 'income', amount: 0.3 },
    { type: 'expense', amount: 0.1 },
    { type: 'expense', amount: 0.2 },
  ];
  assert.deepEqual(incomeExpenseNet(movements), { income: 0.3, expense: 0.3, net: 0 });
  assert.deepEqual(incomeExpenseNet([]), { income: 0, expense: 0, net: 0 });
});

// --- countAmount (tarea 23) ---

test('countAmount goes from one amount to the other, ending exactly on it', () => {
  assert.equal(countAmount(35159.92, 35147.42, 0), 35159.92);
  assert.equal(countAmount(35159.92, 35147.42, 1), 35147.42);
  assert.equal(countAmount(0.1, 0.3, 1), 0.3);
  // It eases out: past the middle well before half the time.
  assert.ok(countAmount(0, 100, 0.5) > 50);
  // Out of range progress is clamped.
  assert.equal(countAmount(10, 20, -1), 10);
  assert.equal(countAmount(10, 20, 2), 20);
});

test('countAmount moves in whole cents, also across zero', () => {
  for (const p of [0.1, 0.33, 0.5, 0.77, 0.9]) {
    const value = countAmount(-5.5, 7.25, p);
    assert.ok(hasAtMostTwoDecimals(value), `${value} has more than two decimals`);
    assert.ok(value >= -5.5 && value <= 7.25);
  }
});
