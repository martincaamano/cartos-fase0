// The whole book flow against a faked Google API: no call reaches Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBook, readBook, addAccount, addCategory, removeCategory, writeBookRows, appendBookRows,
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

// --- Import (tarea 16): createBook with given categories, writeBookRows ---

const importedRows = {
  accounts: [
    { id: 'acc-a', name: 'Banco Inventado', emoji: '🏦', initialBalance: 1000, createdAt: 't0', updatedAt: 't0', deleted: false },
    { id: 'acc-b', name: 'Hucha', emoji: '', initialBalance: 0, createdAt: 't1', updatedAt: 't1', deleted: false },
  ],
  categories: [
    { id: 'cat-a', name: 'Comida', emoji: '🛒', kind: 'expense', isDefault: false, updatedAt: 't2', deleted: false },
    { id: 'transfer', name: 'Transferencia', emoji: '🔁', kind: 'both', isDefault: true, updatedAt: 't3', deleted: false },
  ],
  movements: [
    {
      id: 'mov-a', accountId: 'acc-a', type: 'expense', amount: 12.5, date: '2026-10-01', categoryId: 'cat-a',
      note: '', transferId: '', personId: '', createdBy: 'import', createdAt: 't4', updatedAt: 't4', deleted: false,
    },
  ],
};

test('createBook with categories [] writes only the Categories header', async () => {
  const calls = setupGoogleApi((call) => (call.url.hostname === 'www.googleapis.com' ? { body: { id: 'file-1' } } : {}));
  await createBook({ categories: [] });
  const values = calls[2];
  assert.equal(values.body.valueInputOption, 'RAW');
  const categories = values.body.data.find((d) => d.range === 'Categories!A1');
  assert.deepEqual(categories.values, [HEADERS.Categories]);
});

test('createBook with given categories writes exactly those', async () => {
  const calls = setupGoogleApi((call) => (call.url.hostname === 'www.googleapis.com' ? { body: { id: 'file-1' } } : {}));
  await createBook({ categories: importedRows.categories });
  const categories = calls[2].body.data.find((d) => d.range === 'Categories!A1');
  assert.deepEqual(categories.values, [HEADERS.Categories, ...importedRows.categories.map((c) => toRow('Categories', c))]);
});

test('writeBookRows clears the data rows, then writes the three tabs in one RAW request', async () => {
  const calls = setupGoogleApi();
  await writeBookRows('file-1', importedRows);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);

  const [clear, write] = calls;
  assert.equal(clear.method, 'POST');
  assert.equal(clear.url.pathname, '/v4/spreadsheets/file-1/values:batchClear');
  assert.deepEqual(clear.body.ranges, ['Accounts!A2:Z', 'Categories!A2:Z', 'Movements!A2:Z']);

  assert.equal(write.method, 'POST');
  assert.equal(write.url.pathname, '/v4/spreadsheets/file-1/values:batchUpdate');
  assert.equal(write.body.valueInputOption, 'RAW');
  assert.deepEqual(write.body.data, [
    { range: 'Accounts!A2', values: importedRows.accounts.map((a) => toRow('Accounts', a)) },
    { range: 'Categories!A2', values: importedRows.categories.map((c) => toRow('Categories', c)) },
    { range: 'Movements!A2', values: importedRows.movements.map((m) => toRow('Movements', m)) },
  ]);
  // Amounts travel as numbers, never formatted text.
  assert.equal(write.body.data[2].values[0][3], 12.5);
});

// A tiny in-memory Sheet that understands batchClear and values:batchUpdate.
function fakeSheet() {
  const tabs = { Accounts: [HEADERS.Accounts], Categories: [HEADERS.Categories], Movements: [HEADERS.Movements] };
  const calls = setupGoogleApi((call) => {
    if (call.url.pathname.endsWith('values:batchClear')) {
      for (const range of call.body.ranges) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+):Z$/);
        tabs[sheet] = tabs[sheet].slice(0, Number(from) - 1);
      }
    } else if (call.url.pathname.endsWith('values:batchUpdate')) {
      for (const { range, values } of call.body.data) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+)$/);
        values.forEach((row, i) => { tabs[sheet][Number(from) - 1 + i] = row; });
      }
    }
    return {};
  });
  return { tabs, calls };
}

test('writing the same rows twice leaves the same Sheet, no duplicates', async () => {
  const { tabs } = fakeSheet();
  await writeBookRows('file-1', importedRows);
  const once = structuredClone(tabs);
  assert.equal(once.Accounts.length, 3, 'header + 2 accounts');
  assert.equal(once.Movements.length, 2, 'header + 1 movement');

  await writeBookRows('file-1', importedRows);
  assert.deepEqual(tabs, once);
});

test('writing fewer rows over an earlier try leaves no rows behind', async () => {
  const { tabs } = fakeSheet();
  await writeBookRows('file-1', importedRows);
  await writeBookRows('file-1', { ...importedRows, accounts: importedRows.accounts.slice(0, 1), movements: [] });
  assert.equal(tabs.Accounts.length, 2);
  assert.deepEqual(tabs.Movements, [HEADERS.Movements]);
});

// --- appendBookRows: adding to a book that already has rows ---

const appendPath = (sheet) => `/v4/spreadsheets/file-1/values/${sheet}:append`;

test('appendBookRows appends Accounts, Categories and Movements, in that order, RAW', async () => {
  const calls = setupGoogleApi();
  await appendBookRows('file-1', importedRows);
  assert.deepEqual(calls.map((c) => c.url.pathname), [appendPath('Accounts'), appendPath('Categories'), appendPath('Movements')]);
  for (const call of calls) {
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(call.url.searchParams.get('valueInputOption'), 'RAW');
  }
  assert.deepEqual(calls[0].body.values, importedRows.accounts.map((a) => toRow('Accounts', a)));
  assert.deepEqual(calls[1].body.values, importedRows.categories.map((c) => toRow('Categories', c)));
  assert.deepEqual(calls[2].body.values, importedRows.movements.map((m) => toRow('Movements', m)));
  assert.equal(calls[2].body.values[0][3], 12.5, 'amount as a number');
});

test('appendBookRows makes no call for an empty list', async () => {
  const calls = setupGoogleApi();
  await appendBookRows('file-1', { accounts: [], categories: [], movements: importedRows.movements });
  assert.deepEqual(calls.map((c) => c.url.pathname), [appendPath('Movements')]);

  calls.length = 0;
  await appendBookRows('file-1', { accounts: importedRows.accounts, categories: [], movements: [] });
  assert.deepEqual(calls.map((c) => c.url.pathname), [appendPath('Accounts')]);

  calls.length = 0;
  await appendBookRows('file-1', { accounts: [], categories: [], movements: [] });
  assert.equal(calls.length, 0);
});

test('appendBookRows never clears or overwrites rows', async () => {
  const calls = setupGoogleApi();
  await appendBookRows('file-1', importedRows);
  assert.equal(calls.some((c) => c.url.pathname.endsWith('batchClear') || c.url.pathname.endsWith('batchUpdate')), false);
});

test('appendBookRows stops at the first failure: no movements without their account', async () => {
  const calls = setupGoogleApi((call) => (call.url.pathname === appendPath('Accounts') ? { status: 500 } : {}));
  await assert.rejects(appendBookRows('file-1', importedRows));
  assert.deepEqual(calls.map((c) => c.url.pathname).filter((p) => p !== appendPath('Accounts')), []);
});
