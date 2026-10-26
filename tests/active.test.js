import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActive, activeOnly, activeIds } from '../js/domain/active.js';

const items = () => [
  { id: 'a', deleted: false },
  { id: 'b', deleted: true },
  { id: 'c' },
  { id: 'd', deleted: true },
  { id: 'e', deleted: false },
];

test('isActive: only deleted = true is out', () => {
  assert.equal(isActive({ id: 'a', deleted: false }), true);
  assert.equal(isActive({ id: 'a' }), true);
  assert.equal(isActive({ id: 'a', deleted: true }), false);
});

test('activeOnly drops deleted items and keeps the order', () => {
  assert.deepEqual(activeOnly(items()).map((x) => x.id), ['a', 'c', 'e']);
});

test('activeIds lists the ids of active items in order', () => {
  assert.deepEqual(activeIds(items()), ['a', 'c', 'e']);
});

test('activeOnly and activeIds do not mutate the input', () => {
  const input = items();
  const copy = structuredClone(input);
  const result = activeOnly(input);
  activeIds(input);
  assert.deepEqual(input, copy);
  assert.notEqual(result, input);
  assert.equal(result[0], input[0], 'same objects, not copies');
});

test('empty, all deleted and all active lists', () => {
  assert.deepEqual(activeOnly([]), []);
  assert.deepEqual(activeIds([]), []);
  assert.deepEqual(activeIds([{ id: 'x', deleted: true }]), []);
  assert.deepEqual(activeIds([{ id: 'x' }, { id: 'y' }]), ['x', 'y']);
});
