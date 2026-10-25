import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, hasAtMostTwoDecimals } from '../js/domain/money.js';

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
