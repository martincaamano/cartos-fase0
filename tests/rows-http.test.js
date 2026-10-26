import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, toRow, fromRow, rowsToObjects, SheetFormatError, rowsById, findRowById } from '../js/data/rows.js';
import { googleFetch } from '../js/data/http.js';
import { ApiError } from '../js/data/errors.js';
import { TokenExpiredError, getAuthState } from '../js/data/auth.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

const movement = {
  id: 'm-1', accountId: 'acc-1', type: 'expense', amount: 12.5, date: '2026-10-25', categoryId: 'cat-1',
  note: 'cena', transferId: '', personId: '', createdBy: 'user-1',
  createdAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z', deleted: false,
};

test('a movement survives a round trip through a Sheet row', () => {
  const row = toRow('Movements', movement);
  assert.equal(row.length, HEADERS.Movements.length);
  assert.equal(row[HEADERS.Movements.indexOf('amount')], 12.5, 'amount stays a number');
  assert.deepEqual(fromRow('Movements', row), movement);
});

test('fromRow restores numbers and booleans from what Sheets returns', () => {
  const account = fromRow('Accounts', ['acc-1', 'Banco', '🏦', '100.5', '', '', 'TRUE']);
  assert.equal(account.initialBalance, 100.5);
  assert.equal(account.deleted, true);
  // Sheets drops trailing empty cells.
  assert.equal(fromRow('Accounts', ['acc-2', 'Efectivo']).deleted, false);
});

test('rowsToObjects skips the header and blank rows', () => {
  const values = [HEADERS.Accounts, ['acc-1', 'Banco', '', 0], [], ['', '']];
  assert.deepEqual(rowsToObjects('Accounts', values).map((a) => a.id), ['acc-1']);
  assert.deepEqual(rowsToObjects('Accounts', [HEADERS.Accounts]), []);
});

test('rowsToObjects refuses a tab whose columns were reordered', () => {
  const header = [...HEADERS.Accounts].reverse();
  assert.throws(() => rowsToObjects('Accounts', [header]), SheetFormatError);
});

test('googleFetch sends the Bearer token and JSON body', async () => {
  const calls = setupGoogleApi(() => ({ status: 200, body: { ok: 1 } }));
  const result = await googleFetch('https://example.test/x', { method: 'POST', body: { a: 1 }, op: 'test.op' });
  assert.deepEqual(result, { ok: 1 });
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, { a: 1 });
});

test('googleFetch maps 401 to an expired token and other errors to ApiError', async () => {
  setupGoogleApi(() => ({ status: 401 }));
  await assert.rejects(googleFetch('https://example.test/x', { op: 'test.op' }), TokenExpiredError);
  assert.equal(getAuthState().tokenExpired, true, 'a rejected token is dropped');
  setupGoogleApi(() => ({ status: 403 }));
  await assert.rejects(
    googleFetch('https://example.test/x', { op: 'test.op' }),
    (err) => err instanceof ApiError && err.status === 403 && err.op === 'test.op'
  );
});

// --- rowsById / findRowById ---

test('rowsById maps each id to its 1-based row number, skipping the header', () => {
  const rows = rowsById([['id'], ['a'], ['b']]);
  assert.deepEqual([...rows.entries()], [['a', 2], ['b', 3]]);
});

test('rowsById: an id equal to the header text only counts below the header', () => {
  assert.equal(rowsById([['id'], ['a']]).has('id'), false);
  assert.equal(findRowById([['id'], ['a']], 'id'), null);
  assert.equal(findRowById([['id'], ['a'], ['id']], 'id'), 3);
});

test('rowsById keeps the first row when an id is repeated', () => {
  const column = [['id'], ['a'], ['b'], ['a']];
  assert.equal(rowsById(column).get('a'), 2);
  assert.equal(rowsById(column).size, 2);
  assert.equal(findRowById(column, 'a'), 2);
});

test('rowsById ignores empty rows but keeps counting them', () => {
  const column = [['id'], [], ['a'], [''], ['b']];
  assert.deepEqual([...rowsById(column).entries()], [['a', 3], ['b', 5]]);
  assert.equal(findRowById(column, ''), null);
});

test('findRowById returns the row of an id and null when it is missing', () => {
  const column = [['id'], ['x'], ['b'], ['y'], ['c']];
  assert.equal(findRowById(column, 'x'), 2);
  assert.equal(findRowById(column, 'c'), 5);
  assert.equal(findRowById(column, 'zzz'), null);
});

test('rowsById and findRowById with an empty or missing column', () => {
  assert.equal(rowsById([]).size, 0);
  assert.equal(rowsById([['id']]).size, 0);
  assert.equal(rowsById(undefined).size, 0);
  assert.equal(rowsById().size, 0);
  assert.ok(rowsById() instanceof Map);
  assert.equal(findRowById([], 'a'), null);
  assert.equal(findRowById(undefined, 'a'), null);
});

test('rowsById handles a long column (row 10001 for the 10000th id)', () => {
  const column = [['id'], ...Array.from({ length: 10000 }, (_, i) => [`id-${i + 1}`])];
  assert.equal(findRowById(column, 'id-10000'), 10001);
  assert.equal(rowsById(column).size, 10000);
});
