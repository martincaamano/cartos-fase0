// The whole book flow against a faked Google API: no call reaches Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBook, readBook, addAccount, addCategory, removeCategory,
} from '../js/data/book.js';
import { HEADERS, toRow } from '../js/data/rows.js';
import { ValidationError } from '../js/data/errors.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

const isWrite = (call) => call.method === 'POST' && call.url.hostname === 'sheets.googleapis.com'
  && call.url.pathname.includes('/values');

test('createBook creates the file, the three tabs, headers and default categories', async () => {
  const calls = setupGoogleApi((call) => (call.url.hostname === 'www.googleapis.com' ? { body: { id: 'file-1' } } : {}));
  const book = await createBook();

  assert.equal(book.fileId, 'file-1');
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);

  const [create, structure, values] = calls;
  assert.equal(create.body.name, 'Cartos · Personal');
  assert.deepEqual(create.body.appProperties, { app: 'cartos', bookId: book.bookId, bookType: 'personal', name: 'Personal' });

  assert.deepEqual(
    structure.body.requests.map((r) => r.updateSheetProperties?.properties.title ?? r.addSheet.properties.title),
    ['Accounts', 'Categories', 'Movements']
  );

  assert.equal(values.body.valueInputOption, 'RAW');
  const [accounts, categories, movements] = values.body.data;
  assert.deepEqual(accounts.values, [HEADERS.Accounts]);
  assert.deepEqual(movements.values, [HEADERS.Movements]);
  assert.deepEqual(categories.values[0], HEADERS.Categories);
  assert.ok(categories.values.some((row) => row[0] === 'transfer' && row[1] === 'Transferencia'));
  assert.equal(categories.values.length, 14, 'header + 13 default categories');
});

function bookResponse() {
  return {
    body: {
      valueRanges: [
        { values: [HEADERS.Accounts, ['acc-1', 'Banco', '🏦', 100, '', '', false], ['acc-old', 'Vieja', '', 0, '', '', true]] },
        { values: [HEADERS.Categories, ['cat-1', 'Ocio', '🎉', 'expense', true, '', false]] },
        { values: [HEADERS.Movements, ['m-1', 'acc-1', 'expense', 12.5, '2026-10-25', 'cat-1', '', '', '', 'user-1', '', '', false]] },
      ],
    },
  };
}

test('readBook returns typed accounts, categories and movements', async () => {
  const calls = setupGoogleApi(bookResponse);
  const book = await readBook('file-1');
  assert.deepEqual(calls[0].url.searchParams.getAll('ranges'), ['Accounts', 'Categories', 'Movements']);
  assert.deepEqual(book.accounts.map((a) => [a.id, a.initialBalance, a.deleted]), [['acc-1', 100, false], ['acc-old', 0, true]]);
  assert.equal(book.categories[0].isDefault, true);
  assert.equal(book.movements[0].amount, 12.5);
});

test('addAccount appends a valid account and rejects an invalid one', async () => {
  const calls = setupGoogleApi();
  const account = await addAccount('file-1', { name: 'Efectivo', emoji: '💶', initialBalance: 50 });
  assert.equal(calls.length, 1);
  assert.ok(isWrite(calls[0]));
  assert.equal(calls[0].url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(calls[0].body.values, [toRow('Accounts', account)]);

  await assert.rejects(addAccount('file-1', { name: '' }), (err) => err instanceof ValidationError);
  assert.equal(calls.length, 1, 'nothing written for an invalid account');
});

test('addCategory appends a valid own category and rejects a repeated name', async () => {
  const calls = setupGoogleApi();
  const existing = [{ id: 'cat-1', name: 'Ocio', kind: 'expense', deleted: false }];
  const category = await addCategory('file-1', { name: 'Gimnasio', emoji: '🏋️', kind: 'expense' }, existing);
  assert.equal(category.isDefault, false);
  assert.ok(isWrite(calls[0]));
  assert.equal(calls[0].url.pathname, '/v4/spreadsheets/file-1/values/Categories:append');

  await assert.rejects(addCategory('file-1', { name: 'ocio', kind: 'expense' }, existing),
    (err) => err instanceof ValidationError && err.errors.includes('name_taken'));
  assert.equal(calls.length, 1);
});

test('removeCategory marks the row found by id as deleted, never removes it', async () => {
  const calls = setupGoogleApi((call) => (call.method === 'GET'
    ? { body: { valueRanges: [{ values: [['id'], ['transfer'], ['cat-1'], ['cat-2']] }] } }
    : {}));
  await removeCategory('file-1', { id: 'cat-2', deleted: false }, new Date('2026-10-25T10:00:00Z'));
  const write = calls[1];
  assert.equal(write.body.valueInputOption, 'RAW');
  assert.deepEqual(write.body.data, [{ range: 'Categories!F4:G4', values: [['2026-10-25T10:00:00.000Z', true]] }]);
});

test('removeCategory refuses Transfer and unknown ids', async () => {
  const calls = setupGoogleApi(() => ({ body: { valueRanges: [{ values: [['id']] }] } }));
  await assert.rejects(removeCategory('file-1', { id: 'transfer', deleted: false }), (err) => err.errors.includes('not_removable'));
  assert.equal(calls.length, 0);
  await assert.rejects(removeCategory('file-1', { id: 'nope', deleted: false }), (err) => err.errors.includes('category_unknown'));
});
