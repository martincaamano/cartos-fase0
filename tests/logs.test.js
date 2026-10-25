import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogEntry, countToDrop, MAX_LOGS } from '../js/storage/logs.js';

const now = new Date('2026-10-25T09:30:00.000Z');

test('log entry has date, event type, result and duration', () => {
  const entry = buildLogEntry({ type: 'token', result: 'ok', durationMs: 812.4 }, now);
  assert.deepEqual(entry, {
    at: '2026-10-25T09:30:00.000Z',
    type: 'token',
    result: 'ok',
    durationMs: 812,
    ref: null,
  });
});

test('log entry never carries amounts, notes or category names', () => {
  const entry = buildLogEntry(
    { type: 'api', result: 200, amount: 12.5, note: 'cena', category: 'Restaurantes', ref: 'abc-123' },
    now
  );
  assert.deepEqual(Object.keys(entry).sort(), ['at', 'durationMs', 'ref', 'result', 'type']);
  const serialized = JSON.stringify(entry);
  for (const leaked of ['12.5', 'cena', 'Restaurantes']) {
    assert.ok(!serialized.includes(leaked), `entry leaks "${leaked}"`);
  }
  assert.equal(entry.result, '200');
  assert.equal(entry.ref, 'abc-123');
});

test('log entry rejects unknown event types', () => {
  assert.throws(() => buildLogEntry({ type: 'note', result: 'ok' }, now));
});

test('missing or invalid duration is stored as null', () => {
  assert.equal(buildLogEntry({ type: 'login', result: 'ok' }, now).durationMs, null);
  assert.equal(buildLogEntry({ type: 'login', result: 'ok', durationMs: NaN }, now).durationMs, null);
});

test('only entries beyond the limit are dropped', () => {
  assert.equal(MAX_LOGS, 500);
  assert.equal(countToDrop(10), 0);
  assert.equal(countToDrop(500), 0);
  assert.equal(countToDrop(503), 3);
});
