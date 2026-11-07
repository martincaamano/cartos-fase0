// Accounts and categories edited in Ajustes go through the outbox
// (js/data/book-items.js, tarea 30c): validation with domain/, new ones,
// edits and the logical delete of a category; then their upload by
// js/data/sync.js, before the movements that use them.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueAccount,
  queueAccountEdit,
  queueCategory,
  queueCategoryEdit,
  queueCategoryRemove,
} from '../js/data/book-items.js';
import { queueMovement } from '../js/data/movements.js';
import { syncOutbox } from '../js/data/sync.js';
import { ValidationError } from '../js/data/errors.js';
import { toRow } from '../js/data/rows.js';
import { configureLogs } from '../js/storage/logs.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';
import { memoryOutbox } from './helpers/memory-outbox.js';

const OLD = '2026-10-01T08:00:00.000Z';

const acc = (id, name, extra = {}) => ({
  id, name, emoji: '', initialBalance: 0, createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});
const cat = (id, name, kind, extra = {}) => ({
  id, name, emoji: '', kind, isDefault: false, updatedAt: OLD, deleted: false, ...extra,
});
const mv = (id, categoryId, extra = {}) => ({
  id, accountId: 'bank', type: 'expense', amount: 10, date: '2026-10-25', categoryId, note: '',
  transferId: '', personId: '', createdBy: 'user-1', createdAt: OLD, updatedAt: OLD, deleted: false, ...extra,
});

const bank = acc('bank', 'Banco', { initialBalance: 100 });
const cash = acc('cash', 'Efectivo');
const oldAcc = acc('old', 'Antigua', { deleted: true });
const accounts = [bank, cash, oldAcc];

const food = cat('food', 'Comida', 'expense');
const cafe = cat('cafe', 'Café', 'expense');
const salary = cat('salary', 'Nómina', 'income');
const transfer = cat('transfer', 'Transferencia', 'both', { isDefault: true });
const gone = cat('gone', 'Viajes', 'expense', { deleted: true });
const categories = [transfer, food, cafe, salary, gone];

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

// --- queueAccount ---

test('queueAccount queues a valid account into Accounts with a new id, no Google call', async () => {
  const created = await queueAccount('f1', { name: ' Ahorro ', emoji: '🐷', initialBalance: 1250.5 }, accounts);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(!accounts.some((a) => a.id === created.id));
  assert.equal(created.name, 'Ahorro');
  assert.equal(created.emoji, '🐷');
  assert.equal(created.initialBalance, 1250.5);
  assert.equal(created.deleted, false);
  assert.equal(created.createdAt, created.updatedAt);
  assert.deepEqual(queued(), [{ fileId: 'f1', sheet: 'Accounts', record: created }]);
  assert.equal(calls.length, 0, 'saving never calls Google');
});

test('queueAccount accepts 0, one cent, a negative and a large initial balance', async () => {
  for (const [i, initialBalance] of [0, 0.01, -350.75, 9_999_999.99].entries()) {
    const created = await queueAccount('f1', { name: `Cuenta ${i}`, initialBalance }, accounts);
    assert.equal(created.initialBalance, initialBalance);
  }
  assert.equal(items.size, 4);
});

test('queueAccount reuses the name of a deleted account', async () => {
  const created = await queueAccount('f1', { name: 'Antigua', initialBalance: 0 }, accounts);
  assert.equal(created.name, 'Antigua');
  assert.equal(items.size, 1);
});

test('queueAccount refuses a repeated name (any case), an empty name and a bad balance', async () => {
  await rejectsWith(queueAccount('f1', { name: 'banco', initialBalance: 0 }, accounts), 'name_taken');
  await rejectsWith(queueAccount('f1', { name: ' EFECTIVO ', initialBalance: 0 }, accounts), 'name_taken');
  await rejectsWith(queueAccount('f1', { name: '   ', initialBalance: 0 }, accounts), 'name_required');
  await rejectsWith(queueAccount('f1', { name: 'X', initialBalance: 10.001 }, accounts), 'initial_balance_invalid');
  await rejectsWith(queueAccount('f1', { name: 'X', initialBalance: '100' }, accounts), 'initial_balance_invalid');
  await rejectsWith(queueAccount('f1', { name: 'X', initialBalance: Number.NaN }, accounts), 'initial_balance_invalid');
  await rejectsWith(queueAccount('f1', { name: '', initialBalance: 0.005 }, accounts), 'name_required', 'initial_balance_invalid');
  assert.equal(items.size, 0);
  assert.equal(calls.length, 0);
});

// --- queueAccountEdit ---

test('queueAccountEdit keeps id and createdAt, sets a new updatedAt and queues it', async () => {
  const edited = await queueAccountEdit('f1', bank, { name: 'Banco Sabadell', emoji: '🏦', initialBalance: 0.01 }, accounts);
  assert.equal(edited.id, 'bank');
  assert.equal(edited.createdAt, OLD);
  assert.notEqual(edited.updatedAt, OLD);
  assert.equal(edited.name, 'Banco Sabadell');
  assert.equal(edited.initialBalance, 0.01);
  assert.equal(bank.name, 'Banco', 'the original is not changed');
  assert.deepEqual(queued(), [{ fileId: 'f1', sheet: 'Accounts', record: edited }]);
  assert.equal(calls.length, 0);
});

test('queueAccountEdit allows the account\'s own name, in another case too', async () => {
  const same = await queueAccountEdit('f1', bank, { name: 'Banco', initialBalance: 200 }, accounts);
  assert.equal(same.name, 'Banco');
  const upper = await queueAccountEdit('f1', bank, { name: 'BANCO', initialBalance: 200 }, accounts);
  assert.equal(upper.name, 'BANCO');
  assert.equal(items.size, 1, 'one entry per id');
});

test('queueAccountEdit refuses a name taken by another active account, allows a deleted one\'s', async () => {
  await rejectsWith(queueAccountEdit('f1', bank, { name: 'efectivo', initialBalance: 100 }, accounts), 'name_taken');
  await rejectsWith(queueAccountEdit('f1', bank, { name: '', initialBalance: 100 }, accounts), 'name_required');
  await rejectsWith(queueAccountEdit('f1', bank, { name: 'Banco', initialBalance: 1.999 }, accounts), 'initial_balance_invalid');
  assert.equal(items.size, 0);
  const edited = await queueAccountEdit('f1', bank, { name: 'Antigua', initialBalance: 100 }, accounts);
  assert.equal(edited.name, 'Antigua');
  assert.equal(items.size, 1);
});

// --- queueCategory ---

test('queueCategory queues a valid category into Categories with a new id', async () => {
  const created = await queueCategory('f1', { name: ' Mascotas ', emoji: '🐶', kind: 'expense' }, categories);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.equal(created.name, 'Mascotas');
  assert.equal(created.kind, 'expense');
  assert.equal(created.isDefault, false);
  assert.equal(created.deleted, false);
  assert.deepEqual(queued(), [{ fileId: 'f1', sheet: 'Categories', record: created }]);
  assert.equal(calls.length, 0);
});

test('queueCategory accepts every kind', async () => {
  for (const kind of ['expense', 'income', 'both']) {
    assert.equal((await queueCategory('f1', { name: `K ${kind}`, kind }, categories)).kind, kind);
  }
  assert.equal(items.size, 3);
});

test('queueCategory refuses a repeated name in any case; accents count, a deleted one\'s name is free', async () => {
  await rejectsWith(queueCategory('f1', { name: 'comida', kind: 'expense' }, categories), 'name_taken');
  await rejectsWith(queueCategory('f1', { name: ' CAFÉ ', kind: 'expense' }, categories), 'name_taken');
  await rejectsWith(queueCategory('f1', { name: 'transferencia', kind: 'both' }, categories), 'name_taken');
  assert.equal(items.size, 0);
  // validateCategory compares case-insensitively but keeps accents.
  assert.equal((await queueCategory('f1', { name: 'Cafe', kind: 'expense' }, categories)).name, 'Cafe');
  assert.equal((await queueCategory('f1', { name: 'viajes', kind: 'expense' }, categories)).name, 'viajes');
  assert.equal(items.size, 2);
});

test('queueCategory refuses an empty name and an unknown kind', async () => {
  await rejectsWith(queueCategory('f1', { name: '', kind: 'expense' }, categories), 'name_required');
  await rejectsWith(queueCategory('f1', { name: 'X', kind: 'transfer' }, categories), 'kind_invalid');
  await rejectsWith(queueCategory('f1', { name: 'X' }, categories), 'kind_invalid');
  await rejectsWith(queueCategory('f1', { name: ' ', kind: 'gasto' }, categories), 'name_required', 'kind_invalid');
  assert.equal(items.size, 0);
});

// --- queueCategoryEdit ---

test('queueCategoryEdit keeps the id, sets a new updatedAt and queues it', async () => {
  const edited = await queueCategoryEdit('f1', food, { name: 'Supermercado', emoji: '🛒', kind: 'expense' }, { categories, movements: [] });
  assert.equal(edited.id, 'food');
  assert.equal(edited.name, 'Supermercado');
  assert.notEqual(edited.updatedAt, OLD);
  assert.equal(food.name, 'Comida');
  assert.deepEqual(queued(), [{ fileId: 'f1', sheet: 'Categories', record: edited }]);
  assert.equal(calls.length, 0);
});

test('queueCategoryEdit refuses a kind change while an active movement uses it', async () => {
  const book = { categories, movements: [mv('m1', 'food'), mv('m2', 'food', { deleted: true })] };
  await rejectsWith(queueCategoryEdit('f1', food, { name: 'Comida', kind: 'income' }, book), 'kind_in_use');
  await rejectsWith(queueCategoryEdit('f1', food, { name: 'Comida', kind: 'both' }, book), 'kind_in_use');
  assert.equal(items.size, 0);
  // Same kind, only the name: allowed with movements.
  const renamed = await queueCategoryEdit('f1', food, { name: 'Comer', kind: 'expense' }, book);
  assert.equal(renamed.name, 'Comer');
  assert.equal(items.size, 1);
});

test('queueCategoryEdit allows a kind change when only deleted movements use it', async () => {
  const book = { categories, movements: [mv('m2', 'food', { deleted: true }), mv('m3', 'cafe')] };
  const edited = await queueCategoryEdit('f1', food, { name: 'Comida', kind: 'both' }, book);
  assert.equal(edited.kind, 'both');
  assert.equal(items.size, 1);
});

test('queueCategoryEdit refuses Transferencia, a taken name and an invalid kind', async () => {
  const book = { categories, movements: [] };
  await rejectsWith(queueCategoryEdit('f1', transfer, { name: 'Traspaso', kind: 'both' }, book), 'not_editable');
  await rejectsWith(queueCategoryEdit('f1', food, { name: 'café', kind: 'expense' }, book), 'name_taken');
  await rejectsWith(queueCategoryEdit('f1', food, { name: 'Comida', kind: 'other' }, book), 'kind_invalid');
  assert.equal(items.size, 0);
  // Its own name in another case is fine.
  assert.equal((await queueCategoryEdit('f1', food, { name: 'COMIDA', kind: 'expense' }, book)).name, 'COMIDA');
});

// --- queueCategoryRemove ---

test('queueCategoryRemove queues the category with deleted: true and a new updatedAt', async () => {
  const removed = await queueCategoryRemove('f1', cafe);
  assert.deepEqual(removed, { ...cafe, deleted: true, updatedAt: removed.updatedAt });
  assert.notEqual(removed.updatedAt, OLD);
  assert.equal(cafe.deleted, false, 'the original is not changed');
  assert.deepEqual(queued(), [{ fileId: 'f1', sheet: 'Categories', record: removed }]);
  assert.equal(calls.length, 0);
});

test('queueCategoryRemove refuses Transferencia and an already deleted category', async () => {
  await rejectsWith(queueCategoryRemove('f1', transfer), 'not_removable');
  await rejectsWith(queueCategoryRemove('f1', gone), 'not_removable');
  assert.equal(items.size, 0);
});

// --- upload ---

const isBatchGet = (call) => call.url.pathname.endsWith('values:batchGet');
const isBatchUpdate = (call) => call.url.pathname.endsWith('values:batchUpdate');
const isAppend = (call) => call.url.pathname.endsWith(':append');
const appendedTab = (call) => decodeURIComponent(call.url.pathname.split('/values/')[1]).replace(':append', '');

// A Sheet whose tabs hold these ids; an append adds its ids to the tab, so
// a second sync sees what the first one wrote.
function fakeSheet(tabs) {
  const state = structuredClone(tabs);
  calls = setupGoogleApi((call) => {
    if (isBatchGet(call)) {
      const sheets = call.url.searchParams.getAll('ranges').map((r) => r.split('!')[0]);
      return { body: { valueRanges: sheets.map((sheet) => ({ values: state[sheet].map((id) => [id]) })) } };
    }
    if (isAppend(call)) state[appendedTab(call)].push(...call.body.values.map((row) => row[0]));
    return {};
  });
  return state;
}

test('a new account and a movement using it upload Accounts first, then Movements', async () => {
  fakeSheet({ Accounts: ['id', 'bank'], Movements: ['id'] });
  const created = await queueAccount('f1', { name: 'Ahorro', initialBalance: 50 }, accounts);
  const movement = await queueMovement('f1', {
    accountId: created.id, type: 'expense', amount: 12.5, date: '2026-11-07', categoryId: 'food', note: '',
  }, { accounts: [...accounts, created], categories });
  // Put the account after the movement in the queue: the order comes from the tabs.
  const accountEntry = items.get(created.id);
  items.delete(created.id);
  items.set(created.id, accountEntry);
  assert.deepEqual(queued().map((e) => e.sheet), ['Movements', 'Accounts']);

  assert.deepEqual(await syncOutbox('f1'), { appended: 2, updated: 0, pending: 0 });

  const reads = calls.filter(isBatchGet);
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].url.searchParams.getAll('ranges'), ['Accounts!A:A', 'Movements!A:A']);
  const appends = calls.filter(isAppend);
  assert.deepEqual(appends.map(appendedTab), ['Accounts', 'Movements']);
  assert.ok(calls.indexOf(appends[0]) < calls.indexOf(appends[1]), 'the account row goes before the movement row');
  assert.deepEqual(appends[0].body.values, [toRow('Accounts', created)]);
  assert.deepEqual(appends[1].body.values, [toRow('Movements', movement)]);
  for (const a of appends) assert.equal(a.url.searchParams.get('valueInputOption'), 'RAW');
  assert.equal(calls.some(isBatchUpdate), false);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(items.size, 0);
});

test('an edited and a removed category already in the Sheet go in one values:batchUpdate', async () => {
  fakeSheet({ Categories: ['id', 'transfer', 'food', 'cafe', 'salary'] });
  const edited = await queueCategoryEdit('f1', food, { name: 'Supermercado', kind: 'expense' }, { categories, movements: [] });
  const removed = await queueCategoryRemove('f1', cafe);

  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 2, pending: 0 });

  assert.deepEqual(calls.filter(isBatchGet)[0].url.searchParams.getAll('ranges'), ['Categories!A:A']);
  const updates = calls.filter(isBatchUpdate);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].body.valueInputOption, 'RAW');
  assert.deepEqual(updates[0].body.data, [
    { range: 'Categories!A3:G3', values: [toRow('Categories', edited)] },
    { range: 'Categories!A4:G4', values: [toRow('Categories', removed)] },
  ]);
  assert.equal(calls.some(isAppend), false);
  assert.equal(calls.length, 2);
  assert.equal(items.size, 0);
});

test('retrying after a lost answer does not duplicate the new account', async () => {
  const created = await queueAccount('f1', { name: 'Ahorro', initialBalance: 50 }, accounts);
  const sheet = fakeSheet({ Accounts: ['id', 'bank'] });
  // The first upload reaches the Sheet but its answer is lost.
  calls = setupGoogleApi((call) => {
    if (isBatchGet(call)) return { body: { valueRanges: [{ values: sheet.Accounts.map((id) => [id]) }] } };
    if (isAppend(call)) {
      sheet.Accounts.push(...call.body.values.map((row) => row[0]));
      return { status: 503 };
    }
    return {};
  });
  await assert.rejects(syncOutbox('f1'));
  assert.equal(items.size, 1, 'still pending');
  assert.deepEqual(sheet.Accounts, ['id', 'bank', created.id]);

  calls = setupGoogleApi((call) => (isBatchGet(call)
    ? { body: { valueRanges: [{ values: sheet.Accounts.map((id) => [id]) }] } }
    : {}));
  assert.deepEqual(await syncOutbox('f1'), { appended: 0, updated: 1, pending: 0 });
  assert.equal(calls.some(isAppend), false);
  const updates = calls.filter(isBatchUpdate);
  assert.deepEqual(updates[0].body.data, [{ range: 'Accounts!A3:G3', values: [toRow('Accounts', created)] }]);
  assert.equal(sheet.Accounts.filter((id) => id === created.id).length, 1);
  assert.equal(items.size, 0);
});

test('syncing accounts and categories logs no names or amounts', async () => {
  const entries = [];
  configureLogs({ write: async (entry) => { entries.push(entry); } });
  try {
    fakeSheet({ Accounts: ['id', 'bank'], Categories: ['id', 'food'] });
    await queueAccount('f1', { name: 'CUENTA-SECRETA', initialBalance: 4321.09 }, accounts);
    await queueAccountEdit('f1', bank, { name: 'BANCO-SECRETO', initialBalance: 876.54 }, accounts);
    await queueCategory('f1', { name: 'CATEGORIA-SECRETA', kind: 'income' }, categories);
    await queueCategoryEdit('f1', food, { name: 'COMIDA-SECRETA', kind: 'expense' }, { categories, movements: [] });
    assert.deepEqual(await syncOutbox('f1'), { appended: 2, updated: 2, pending: 0 });

    const upload = JSON.stringify(calls.map((call) => call.body));
    assert.ok(upload.includes('4321.09') && upload.includes('CUENTA-SECRETA') && upload.includes('COMIDA-SECRETA'));

    assert.equal(entries.filter((entry) => entry.type === 'sync').length, 1);
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      for (const leaked of ['4321.09', '4321,09', '876.54', '876,54', 'CUENTA-SECRETA', 'BANCO-SECRETO',
        'CATEGORIA-SECRETA', 'COMIDA-SECRETA']) {
        assert.ok(!serialized.includes(leaked), `entry ${serialized} leaks "${leaked}"`);
      }
    }
  } finally {
    configureLogs();
  }
});
