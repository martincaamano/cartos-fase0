// Queueing a category move (js/data/category-move.js) with the in-memory
// outbox, and its upload by js/data/sync.js: one read of the id columns,
// one values:batchUpdate for Categories, Movements and Goals, no append.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { queueCategoryMove } from '../js/data/category-move.js';
import { syncOutbox } from '../js/data/sync.js';
import { ValidationError } from '../js/data/errors.js';
import { toRow } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';
import { memoryOutbox } from './helpers/memory-outbox.js';

const OLD = '2026-10-01T08:00:00.000Z';

const cat = (id, kind, extra = {}) => ({
  id, name: id, emoji: '', kind, isDefault: false, updatedAt: OLD, deleted: false, ...extra,
});
const mv = (id, categoryId, type, amount, extra = {}) => ({
  id, accountId: 'bank', type, amount, date: '2026-10-25', categoryId, note: '',
  transferId: '', personId: '', createdBy: 'user-1', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});
const goal = (id, categoryId, extra = {}) => ({
  id, name: 'Tele', categoryId, targetAmount: 1000, targetDate: '2027-03-01', status: 'active',
  completedAt: '', movementId: '', createdBy: 'user-1', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});

const food = cat('food', 'expense');
const restaurants = cat('restaurants', 'expense');
const salary = cat('salary', 'income');
const transfer = cat('transfer', 'both', { isDefault: true });
const gone = cat('gone', 'expense', { deleted: true });

const book = () => ({
  categories: [transfer, salary, food, restaurants, gone],
  movements: [
    mv('m1', 'food', 'expense', 12.5),
    mv('m2', 'food', 'expense', 0.01),
    mv('m3', 'food', 'expense', 99, { deleted: true }),
    mv('m4', 'restaurants', 'expense', 30),
  ],
  goals: [goal('g1', 'food'), goal('g2', 'food', { deleted: true }), goal('g3', 'restaurants')],
});

let items;
let calls;
beforeEach(() => {
  calls = setupGoogleApi();
  items = memoryOutbox();
});

const queued = () => [...items.values()];
const rejectsWith = (promise, ...codes) => assert.rejects(
  promise,
  (err) => err instanceof ValidationError && codes.every((code) => err.errors.includes(code)),
);

// --- queueCategoryMove ---

test('queueCategoryMove with remove queues the deleted category, its movements and goals', async () => {
  const b = book();
  const changed = await queueCategoryMove('f1', b, food, restaurants, { remove: true });
  const entries = queued();
  assert.deepEqual(entries.map((e) => [e.fileId, e.sheet, e.record.id]), [
    ['f1', 'Categories', 'food'],
    ['f1', 'Movements', 'm1'],
    ['f1', 'Movements', 'm2'],
    ['f1', 'Goals', 'g1'],
  ]);
  const at = entries[0].record.updatedAt;
  assert.notEqual(at, OLD);
  assert.deepEqual(entries[0].record, { ...food, deleted: true, updatedAt: at });
  assert.deepEqual(entries[1].record, { ...b.movements[0], categoryId: 'restaurants', updatedAt: at });
  assert.deepEqual(entries[2].record, { ...b.movements[1], categoryId: 'restaurants', updatedAt: at });
  assert.deepEqual(entries[3].record, { ...b.goals[0], categoryId: 'restaurants', updatedAt: at });
  assert.deepEqual(changed, {
    categories: [entries[0].record],
    movements: [entries[1].record, entries[2].record],
    goals: [entries[3].record],
  });
});

test('queueCategoryMove without remove queues only the movements and goals', async () => {
  await queueCategoryMove('f1', book(), food, restaurants);
  assert.deepEqual(queued().map((e) => [e.sheet, e.record.id]), [
    ['Movements', 'm1'], ['Movements', 'm2'], ['Goals', 'g1'],
  ]);
});

test('queueCategoryMove makes no call to Google', async () => {
  await queueCategoryMove('f1', book(), food, restaurants, { remove: true });
  assert.equal(calls.length, 0);
});

test('queueCategoryMove of an invalid move throws ValidationError and queues nothing', async () => {
  const b = book();
  await rejectsWith(queueCategoryMove('f1', b, food, salary, { remove: true }), 'target_invalid');
  await rejectsWith(queueCategoryMove('f1', b, food, transfer, { remove: true }), 'target_invalid');
  await rejectsWith(queueCategoryMove('f1', b, food, gone, { remove: true }), 'target_invalid');
  await rejectsWith(queueCategoryMove('f1', b, food, food, { remove: true }), 'same_category');
  await rejectsWith(queueCategoryMove('f1', b, food, undefined, { remove: true }), 'target_unknown');
  await rejectsWith(queueCategoryMove('f1', b, gone, food, { remove: true }), 'category_unknown');
  await rejectsWith(queueCategoryMove('f1', b, transfer, food, { remove: true }), 'not_removable');
  assert.equal(items.size, 0);
  assert.equal(calls.length, 0);
});

test('queueCategoryMove does not change the book it is given', async () => {
  const b = book();
  const before = JSON.stringify(b);
  await queueCategoryMove('f1', b, food, restaurants, { remove: true });
  assert.equal(JSON.stringify(b), before);
});

// --- upload of a queued move ---

const isBatchGet = (call) => call.url.pathname.endsWith('values:batchGet');
const isBatchUpdate = (call) => call.url.pathname.endsWith('values:batchUpdate');
const isAppend = (call) => call.url.pathname.endsWith(':append');

test('a queued move uploads with one batchGet and one batchUpdate, no append', async () => {
  const b = book();
  await queueCategoryMove('f1', b, food, restaurants, { remove: true });
  // Another book's pending entry is left alone.
  items.set('other-m', { fileId: 'other', sheet: 'Movements', record: mv('other-m', 'x', 'expense', 1) });
  const tabs = {
    Categories: ['id', 'transfer', 'food', 'restaurants'],
    Movements: ['id', 'm1', 'm4', 'm2'],
    Goals: ['id', 'g1'],
  };
  calls = setupGoogleApi((call) => {
    if (isBatchGet(call)) {
      const sheets = call.url.searchParams.getAll('ranges').map((r) => r.split('!')[0]);
      return { body: { valueRanges: sheets.map((sheet) => ({ values: tabs[sheet].map((id) => [id]) })) } };
    }
    return {};
  });
  const entries = queued().filter((e) => e.fileId === 'f1');

  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 4, pending: 0 });

  const reads = calls.filter(isBatchGet);
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].url.searchParams.getAll('ranges'), ['Categories!A:A', 'Movements!A:A', 'Goals!A:A']);

  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1, 'the whole move in one request');
  assert.equal(updates[0].body.valueInputOption, 'RAW');
  assert.deepEqual(updates[0].body.data, [
    { range: 'Categories!A3:G3', values: [toRow('Categories', entries[0].record)] },
    { range: 'Movements!A2:M2', values: [toRow('Movements', entries[1].record)] },
    { range: 'Movements!A4:M4', values: [toRow('Movements', entries[2].record)] },
    { range: 'Goals!A2:L2', values: [toRow('Goals', entries[3].record)] },
  ]);
  assert.equal(calls.some(isAppend), false);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls.some((call) => call.url.pathname.includes('/other')), false);
  assert.deepEqual(queued().map((e) => e.record.id), ['other-m']);
});
