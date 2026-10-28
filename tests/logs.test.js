import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogEntry, countToDrop, configureLogs, MAX_LOGS } from '../js/storage/logs.js';
import { configureSync, syncOutbox } from '../js/data/sync.js';
import { configureMovements, queueMovement } from '../js/data/movements.js';
import { setupGoogleApi } from './helpers/fake-google.js';

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

test('the buffer keeps at most 500 entries and drops the oldest surplus', () => {
  assert.equal(countToDrop(0), 0);
  assert.equal(countToDrop(499), 0);
  assert.equal(countToDrop(500), 0);
  assert.equal(countToDrop(501), 1);
  assert.equal(countToDrop(1000), 500);
  assert.equal(countToDrop(5, 3), 2);
});

// --- end to end: a movement with recognisable values never reaches the logs ---

test('queueing and syncing a movement logs no amount, note or category name', async () => {
  const entries = [];
  configureLogs({ write: async (entry) => { entries.push(entry); } });
  // One in-memory outbox: movements.js saves into it, sync.js uploads from it.
  const queued = [];
  configureMovements({
    add: async (fileId, movements) => { for (const movement of movements) queued.push({ fileId, movement }); },
  });
  configureSync({
    list: async () => queued,
    remove: async (movements) => {
      for (const done of movements) {
        const i = queued.findIndex((item) => item.movement.id === done.id);
        if (i >= 0) queued.splice(i, 1);
      }
    },
  });
  try {
    const calls = setupGoogleApi((call) => (call.url.pathname.endsWith('values:batchGet')
      ? { body: { valueRanges: [{ values: [['id']] }] } }
      : {}));
    const book = {
      accounts: [{ id: 'acc-1', name: 'Banco', deleted: false }],
      categories: [{ id: 'cat-x', name: 'CATEGORIA-SECRETA', deleted: false }],
    };
    await queueMovement('f1', {
      accountId: 'acc-1', type: 'expense', amount: 1234.56, date: '2026-10-25', categoryId: 'cat-x', note: 'NOTA-SECRETA',
    }, book);
    assert.deepEqual(await syncOutbox('f1'), { appended: 1, updated: 0, pending: 0 });

    // The movement did travel to the Sheet, so the logs had a chance to leak it.
    const upload = JSON.stringify(calls.map((c) => c.body));
    assert.ok(upload.includes('1234.56') && upload.includes('NOTA-SECRETA'));

    const types = entries.map((e) => e.type);
    assert.ok(types.includes('api'), `types: ${types}`);
    assert.ok(types.includes('sync'), `types: ${types}`);
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      for (const leaked of ['1234.56', '1234,56', 'NOTA-SECRETA', 'CATEGORIA-SECRETA']) {
        assert.ok(!serialized.includes(leaked), `entry ${serialized} leaks "${leaked}"`);
      }
    }
  } finally {
    configureLogs();
    configureMovements();
    configureSync();
  }
});
