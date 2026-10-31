// js/ui/format.js: what the amount field shows when editing (and that it
// reads back the same with parseAmountInput), month names and whole euros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmountInput, formatMonth, formatMonthRange, formatShortMonth, formatWholeEuros } from '../js/ui/format.js';
import { parseAmountInput } from '../js/domain/money.js';

const cases = [
  [-10.5, '-10,50'],
  [-0.01, '-0,01'],
  [0, '0,00'],
  [1250.5, '1250,50'],
  [0.01, '0,01'],
  [12, '12,00'],
  [999999999.99, '999999999,99'],
];

test('formatAmountInput: comma decimals, two of them, no thousands dot, ASCII minus', () => {
  for (const [amount, text] of cases) assert.equal(formatAmountInput(amount), text, String(amount));
});

test('formatAmountInput rounds float noise to the cent', () => {
  assert.equal(formatAmountInput(0.1 + 0.2), '0,30');
  assert.equal(formatAmountInput(19.999), '20,00');
  assert.equal(formatAmountInput(-0.004), '0,00', 'rounds to zero cents: no minus');
});

test('formatAmountInput of -0 has no sign', () => {
  assert.equal(formatAmountInput(-0), '0,00');
});

test('formatAmountInput reads back the same with parseAmountInput', () => {
  for (const [amount] of cases) {
    const back = parseAmountInput(formatAmountInput(amount));
    assert.equal(back, amount, String(amount));
  }
});

// --- months and whole euros (tarea 22a) ---

test('formatMonth and formatShortMonth name a YYYY-MM month', () => {
  assert.equal(formatMonth('2026-10'), 'OCTUBRE 2026');
  assert.equal(formatMonth('2027-01'), 'ENERO 2027');
  assert.equal(formatShortMonth('2026-12'), 'Dic');
});

test('formatMonthRange says the year once when both ends share it', () => {
  assert.equal(formatMonthRange({ from: '2026-10', to: '2026-10' }), 'Oct 2026');
  assert.equal(formatMonthRange({ from: '2026-09', to: '2026-10' }), 'Sep – Oct 2026');
  assert.equal(formatMonthRange({ from: '2025-12', to: '2026-01' }), 'Dic 2025 – Ene 2026');
});

test('formatWholeEuros rounds to whole euros for the big figures', () => {
  assert.equal(formatWholeEuros(1684.4), '1.684 €');
  assert.equal(formatWholeEuros(-0.6), '−1 €');
  assert.equal(formatWholeEuros(0), '0 €');
});
