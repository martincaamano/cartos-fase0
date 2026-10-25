// The whole book flow against a faked Google API: no call reaches Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBook, readBook, addAccount, addMovement, ValidationError } from '../js/data/book.js';
import { HEADERS, toRow } from '../js/data/rows.js';
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

test('addMovement checks account and category before appending', async () => {
  const calls = setupGoogleApi(bookResponse);
  const book = await readBook('file-1');

  const movement = await addMovement('file-1', { accountId: 'acc-1', type: 'income', amount: 0.3, date: '2026-10-25', categoryId: 'cat-1', note: '=1+1' }, book);
  assert.equal(movement.createdBy, 'user-1');
  const write = calls.at(-1);
  assert.ok(isWrite(write));
  assert.equal(write.url.searchParams.get('valueInputOption'), 'RAW');
  assert.equal(write.body.values[0][HEADERS.Movements.indexOf('note')], '=1+1');

  const before = calls.length;
  await assert.rejects(
    addMovement('file-1', { accountId: 'acc-old', type: 'expense', amount: 5, date: '2026-10-25', categoryId: 'cat-1' }, book),
    (err) => err instanceof ValidationError && err.errors.includes('account_unknown')
  );
  assert.equal(calls.length, before, 'nothing written for a deleted account');
});

test('addMovement reads the book first when it is not given', async () => {
  const calls = setupGoogleApi(bookResponse);
  await addMovement('file-1', { accountId: 'acc-1', type: 'expense', amount: 1, date: '2026-10-25', categoryId: 'cat-1' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
});
