// Finding, caching and setting up the personal book against a faked Google API.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configurePersonalBook, cachedPersonalBook, fetchPersonalBook, reloadPersonalBook, setUpPersonalBook,
  importPersonalBook, importIntoPersonalBook, startingBook,
} from '../js/data/personal-book.js';
import { ValidationError } from '../js/data/errors.js';
import { IMPORTED_BY } from '../js/domain/import.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi } from './helpers/fake-google.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const accountRow = ['acc-1', 'Banco', '🏦', 100, '', '', false];

// files: what Drive lists; accounts: rows of the Accounts tab.
function googleWith({ files, accounts }) {
  return setupGoogleApi((call) => {
    if (call.url.hostname === 'www.googleapis.com') {
      return call.method === 'GET' ? { body: { files } } : { body: { id: 'new-file' } };
    }
    if (call.url.pathname.endsWith('values:batchGet')) {
      return {
        body: {
          valueRanges: [
            { values: [HEADERS.Accounts, ...accounts] },
            { values: [HEADERS.Categories] },
            { values: [HEADERS.Movements] },
          ],
        },
      };
    }
    return {};
  });
}

const personalFile = { id: 'file-1', createdTime: '2026-10-25T00:00:00Z', appProperties: { bookType: 'personal' } };

let storage;
beforeEach(() => {
  storage = fakeStorage();
  configurePersonalBook({ storage: () => storage });
});

test('without a personal book in Drive the status is none', async () => {
  googleWith({ files: [], accounts: [] });
  assert.deepEqual(await fetchPersonalBook(), { status: 'none', fileId: null });
  assert.equal(cachedPersonalBook(), null);
});

test('a book with accounts is ready and leaves a device copy', async () => {
  googleWith({ files: [personalFile], accounts: [accountRow] });
  const result = await fetchPersonalBook();
  assert.equal(result.status, 'ready');
  assert.equal(result.book.accounts[0].name, 'Banco');

  const cached = cachedPersonalBook();
  assert.equal(cached.fileId, 'file-1');
  assert.equal(cached.book.accounts[0].initialBalance, 100);
});

test('a book whose accounts are all deleted counts as none, keeping its id', async () => {
  googleWith({ files: [personalFile], accounts: [['acc-1', 'Banco', '', 0, '', '', true]] });
  assert.deepEqual(await fetchPersonalBook(), { status: 'none', fileId: 'file-1' });
  assert.equal(cachedPersonalBook(), null);
});

test('onboarding creates the book when there is none', async () => {
  const calls = googleWith({ files: [], accounts: [accountRow] });
  const result = await setUpPersonalBook({ account: { name: 'Banco', emoji: '🏦', initialBalance: 100 } });
  assert.equal(result.fileId, 'new-file');
  assert.equal(calls.filter((c) => c.url.hostname === 'www.googleapis.com' && c.method === 'POST').length, 1);
  assert.equal(cachedPersonalBook().fileId, 'new-file');
});

test('onboarding reuses an existing empty book instead of creating another', async () => {
  const calls = googleWith({ files: [], accounts: [accountRow] });
  await setUpPersonalBook({ fileId: 'file-1', account: { name: 'Banco', emoji: '🏦', initialBalance: 100 } });
  assert.equal(calls.some((c) => c.url.hostname === 'www.googleapis.com'), false, 'no new Drive file');
  assert.ok(calls.some((c) => c.url.pathname === '/v4/spreadsheets/file-1/values/Accounts:append'));
});

// --- reloadPersonalBook: the book is read again by its file, no Drive search ---

const isDrive = (call) => call.url.hostname === 'www.googleapis.com';

test('reloadPersonalBook makes a single batchGet of that file and no Drive call', async () => {
  const calls = googleWith({ files: [personalFile], accounts: [accountRow] });
  const result = await reloadPersonalBook('file-1');
  assert.equal(calls.length, 1);
  assert.equal(calls.some(isDrive), false, 'no drive.list');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.pathname, '/v4/spreadsheets/file-1/values:batchGet');
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'file-1');
  assert.equal(result.book.accounts[0].name, 'Banco');
  assert.equal(result.book.accounts[0].initialBalance, 100);
});

test('reloadPersonalBook refreshes the device copy', async () => {
  googleWith({ files: [], accounts: [accountRow] });
  assert.equal(cachedPersonalBook(), null);
  await reloadPersonalBook('file-1');
  const cached = cachedPersonalBook();
  assert.equal(cached.status, 'ready');
  assert.equal(cached.fileId, 'file-1');
  assert.equal(cached.book.accounts[0].name, 'Banco');
});

test('reloadPersonalBook of a book without active accounts is none, keeping its id', async () => {
  const calls = googleWith({ files: [personalFile], accounts: [['acc-1', 'Banco', '', 0, '', '', true]] });
  assert.deepEqual(await reloadPersonalBook('file-1'), { status: 'none', fileId: 'file-1' });
  assert.equal(cachedPersonalBook(), null);
  assert.equal(calls.some(isDrive), false);
});

test('reloadPersonalBook and fetchPersonalBook agree on the same book', async () => {
  googleWith({ files: [personalFile], accounts: [accountRow] });
  const fetched = await fetchPersonalBook();
  const reloaded = await reloadPersonalBook('file-1');
  assert.deepEqual(reloaded, fetched);
});

// --- importPersonalBook (tarea 16), with invented data ---

const importData = {
  format: 'cartos-import',
  version: 1,
  accounts: [
    { key: 'bank', name: 'Banco Inventado', emoji: '🏦', initialBalance: 1000 },
    { key: 'cash', name: 'Hucha', emoji: '💶', initialBalance: 0 },
  ],
  categories: [{ key: 'food', name: 'Comida', emoji: '🛒', kind: 'expense' }],
  movements: [
    { date: '2026-10-01', account: 'bank', type: 'expense', amount: 12.5, category: 'food', note: '' },
    { date: '2026-10-02', transfer: { from: 'bank', to: 'cash' }, amount: 50, note: '' },
  ],
};

// An in-memory Sheet behind the fake API: Drive create, structure, header
// writes, batchClear, values:batchUpdate and batchGet all act on it.
function importGoogle() {
  const tabs = { Accounts: [], Categories: [], Movements: [] };
  const calls = setupGoogleApi((call) => {
    const path = call.url.pathname;
    if (isDrive(call)) return { body: { id: 'new-file' } };
    if (path.endsWith('values:batchClear')) {
      for (const range of call.body.ranges) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+):Z$/);
        tabs[sheet] = tabs[sheet].slice(0, Number(from) - 1);
      }
    } else if (path.endsWith('values:batchUpdate')) {
      for (const { range, values } of call.body.data) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+)$/);
        values.forEach((row, i) => { tabs[sheet][Number(from) - 1 + i] = row; });
      }
    } else if (path.endsWith(':append')) {
      const sheet = decodeURIComponent(path.match(/values\/(.+):append$/)[1]);
      tabs[sheet].push(...call.body.values);
    } else if (path.endsWith('values:batchGet')) {
      return { body: { valueRanges: call.url.searchParams.getAll('ranges').map((sheet) => ({ values: tabs[sheet] })) } };
    }
    return {};
  });
  return { calls, tabs };
}

test('importPersonalBook without fileId creates the book without default categories', async () => {
  const { calls } = importGoogle();
  const result = await importPersonalBook({ data: importData });

  assert.equal(result.fileId, 'new-file');
  assert.equal(calls.filter((c) => isDrive(c) && c.method === 'POST').length, 1, 'one Drive file created');
  assert.ok(calls.some((c) => c.url.pathname === '/v4/spreadsheets/new-file:batchUpdate'), 'tabs created');

  const headerWrite = calls.find((c) => c.body?.data?.some((d) => d.range === 'Categories!A1'));
  assert.deepEqual(headerWrite.body.data.find((d) => d.range === 'Categories!A1').values, [HEADERS.Categories]);
});

test('importPersonalBook clears and writes the three tabs in one RAW request', async () => {
  const { calls } = importGoogle();
  await importPersonalBook({ data: importData });
  const clears = calls.filter((c) => c.url.pathname === '/v4/spreadsheets/new-file/values:batchClear');
  assert.equal(clears.length, 1);
  const rowWrites = calls.filter((c) => c.body?.data?.some((d) => d.range.endsWith('!A2')));
  assert.equal(rowWrites.length, 1);
  assert.equal(rowWrites[0].body.valueInputOption, 'RAW');
  assert.deepEqual(rowWrites[0].body.data.map((d) => d.range), ['Accounts!A2', 'Categories!A2', 'Movements!A2']);
  assert.ok(calls.indexOf(clears[0]) < calls.indexOf(rowWrites[0]), 'clear before write');
});

test('importPersonalBook always adds Transferencia with id transfer', async () => {
  importGoogle();
  const { book } = await importPersonalBook({ data: importData });
  const transfer = book.categories.find((c) => c.id === 'transfer');
  assert.equal(transfer.name, 'Transferencia');
  assert.equal(transfer.kind, 'both');
  assert.deepEqual(book.categories.map((c) => c.name), ['Comida', 'Transferencia']);
});

test('importPersonalBook returns the book read back, ready', async () => {
  importGoogle();
  const result = await importPersonalBook({ data: importData });
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'new-file');
  assert.deepEqual(result.book.accounts.map((a) => [a.name, a.initialBalance]), [['Banco Inventado', 1000], ['Hucha', 0]]);
  assert.equal(result.book.movements.length, 3, '1 expense + 2 transfer halves');
  assert.deepEqual(result.book.movements.map((m) => m.amount), [12.5, 50, 50]);
  for (const m of result.book.movements) assert.equal(m.createdBy, IMPORTED_BY);
  const halves = result.book.movements.filter((m) => m.transferId);
  assert.equal(halves[0].transferId, halves[1].transferId);
});

test('importPersonalBook saves the device copy', async () => {
  importGoogle();
  assert.equal(cachedPersonalBook(), null);
  const result = await importPersonalBook({ data: importData });
  const cached = cachedPersonalBook();
  assert.equal(cached.status, 'ready');
  assert.equal(cached.fileId, 'new-file');
  assert.deepEqual(cached.book, result.book);
});

test('importPersonalBook with fileId writes over it and creates no new file', async () => {
  const { calls, tabs } = importGoogle();
  // An empty book left by an earlier try, with its default categories.
  tabs.Accounts = [HEADERS.Accounts];
  tabs.Categories = [HEADERS.Categories, ['old-cat', 'Vieja', '', 'expense', true, '', false]];
  tabs.Movements = [HEADERS.Movements];

  const result = await importPersonalBook({ fileId: 'file-1', data: importData });
  assert.equal(calls.some(isDrive), false, 'no Drive call');
  assert.equal(calls.some((c) => c.url.pathname === '/v4/spreadsheets/file-1:batchUpdate'), false, 'no tabs created');
  assert.equal(result.fileId, 'file-1');
  assert.equal(result.status, 'ready');
  assert.equal(result.book.categories.some((c) => c.id === 'old-cat'), false, 'old rows cleared');
  assert.equal(cachedPersonalBook().fileId, 'file-1');
});

test('repeating importPersonalBook on the same file does not duplicate rows', async () => {
  const { tabs } = importGoogle();
  tabs.Accounts = [HEADERS.Accounts];
  tabs.Categories = [HEADERS.Categories];
  tabs.Movements = [HEADERS.Movements];
  await importPersonalBook({ fileId: 'file-1', data: importData });
  const { book } = await importPersonalBook({ fileId: 'file-1', data: importData });
  assert.equal(book.accounts.length, 2);
  assert.equal(book.categories.length, 2);
  assert.equal(book.movements.length, 3);
});

test('importPersonalBook writes the file categories and then Transferencia', async () => {
  const { calls } = importGoogle();
  await importPersonalBook({ data: importData });
  const write = calls.find((c) => c.body?.data?.some((d) => d.range === 'Categories!A2'));
  const rows = write.body.data.find((d) => d.range === 'Categories!A2').values;
  assert.deepEqual(rows.map((r) => [r[1], r[3]]), [['Comida', 'expense'], ['Transferencia', 'both']]);
  assert.equal(rows.at(-1)[0], 'transfer');
  assert.equal(rows.filter((r) => r[0] === 'transfer').length, 1, 'Transferencia only once');
});

// --- startingBook ---

test('startingBook has only Transferencia, with id transfer', () => {
  const book = startingBook();
  assert.deepEqual(book.accounts, []);
  assert.deepEqual(book.movements, []);
  assert.equal(book.categories.length, 1);
  const [transfer] = book.categories;
  assert.equal(transfer.id, 'transfer');
  assert.equal(transfer.name, 'Transferencia');
  assert.equal(transfer.kind, 'both');
  assert.equal(transfer.deleted, false);
});

test('startingBook gives a new object each time', () => {
  const a = startingBook();
  a.accounts.push({ id: 'x' });
  assert.deepEqual(startingBook().accounts, []);
});

// --- importIntoPersonalBook: adding a file to a book with data ---

// A book with one account, Transferencia, one category and one movement.
function bookWithData({ bankBalance = 1000 } = {}) {
  const google = importGoogle();
  google.tabs.Accounts = [HEADERS.Accounts, ['acc-bank', 'Banco Inventado', '🏦', bankBalance, 't0', 't0', false]];
  google.tabs.Categories = [
    HEADERS.Categories,
    ['transfer', 'Transferencia', '🔁', 'both', true, 't0', false],
    ['cat-food', 'comida', '🛒', 'expense', false, 't0', false],
  ];
  google.tabs.Movements = [
    HEADERS.Movements,
    ['m-0', 'acc-bank', 'expense', 3, '2026-09-01', 'cat-food', '', '', '', 'user-1', 't0', 't0', false],
  ];
  return google;
}

const isAppend = (sheet) => (call) => call.url.pathname === `/v4/spreadsheets/file-1/values/${sheet}:append`;
const isRead = (call) => call.url.pathname === '/v4/spreadsheets/file-1/values:batchGet';

test('importIntoPersonalBook reads the book first, appends only what is new, reads again', async () => {
  const { calls } = bookWithData();
  await importIntoPersonalBook('file-1', importData);

  assert.equal(calls.some(isDrive), false, 'no Drive call');
  assert.ok(isRead(calls[0]), 'reads first');
  assert.ok(isRead(calls.at(-1)), 'reads again at the end');
  // Banco Inventado and Comida are in the book: only Hucha and the movements are added.
  assert.deepEqual(calls.slice(1, -1).map((c) => c.url.pathname.split('/').at(-1)), ['Accounts:append', 'Movements:append']);
  for (const call of calls.slice(1, -1)) assert.equal(call.url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(calls.find(isAppend('Accounts')).body.values.map((r) => r[1]), ['Hucha']);
  assert.equal(calls.find(isAppend('Movements')).body.values.length, 3);
  assert.equal(calls.some((c) => c.url.pathname.endsWith('batchClear')), false, 'nothing cleared');
});

test('importIntoPersonalBook returns the book read back, ready, and keeps the device copy', async () => {
  bookWithData();
  const result = await importIntoPersonalBook('file-1', importData);
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'file-1');
  const { book } = result;
  assert.deepEqual(book.accounts.map((a) => [a.id === 'acc-bank', a.name, a.initialBalance]), [
    [true, 'Banco Inventado', 1000],
    [false, 'Hucha', 0],
  ]);
  assert.deepEqual(book.categories.map((c) => c.id), ['transfer', 'cat-food']);
  assert.equal(book.movements.length, 4, '1 already there + 1 expense + 2 transfer halves');
  const [, expense, out, inc] = book.movements;
  assert.deepEqual([expense.accountId, expense.categoryId, expense.amount, expense.createdBy], ['acc-bank', 'cat-food', 12.5, IMPORTED_BY]);
  assert.deepEqual([out.accountId, out.categoryId, out.type], ['acc-bank', 'transfer', 'expense']);
  const hucha = book.accounts[1].id;
  assert.deepEqual([inc.accountId, inc.categoryId, inc.type], [hucha, 'transfer', 'income']);
  assert.equal(out.transferId, inc.transferId);

  const cached = cachedPersonalBook();
  assert.equal(cached.fileId, 'file-1');
  assert.deepEqual(cached.book, book);
});

test('importIntoPersonalBook with an invalid file throws ValidationError with the codes and writes nothing', async () => {
  const { calls, tabs } = bookWithData({ bankBalance: 500 });
  const before = structuredClone(tabs);
  await assert.rejects(importIntoPersonalBook('file-1', importData),
    (err) => err instanceof ValidationError && err.errors.length === 1 && err.errors[0] === 'initial_balance_conflict');
  assert.equal(calls.length, 1, 'only the first read');
  assert.ok(isRead(calls[0]));
  assert.deepEqual(tabs, before);
  assert.equal(cachedPersonalBook(), null);
});

test('importIntoPersonalBook rejects a file category named Transferencia', async () => {
  const { calls } = bookWithData();
  const data = structuredClone(importData);
  data.categories.push({ key: 'tr', name: 'TRANSFERENCIA', kind: 'both' });
  await assert.rejects(importIntoPersonalBook('file-1', data),
    (err) => err instanceof ValidationError && err.errors.includes('category_reserved'));
  assert.equal(calls.some((c) => c.url.pathname.endsWith(':append')), false);
});

test('importIntoPersonalBook with everything already in the book appends only movements', async () => {
  const { calls, tabs } = bookWithData();
  tabs.Accounts.push(['acc-cash', 'HUCHA', '', 0, 't0', 't0', false]);
  await importIntoPersonalBook('file-1', importData);
  assert.deepEqual(calls.filter((c) => c.url.pathname.endsWith(':append')).map((c) => c.url.pathname.split('/').at(-1)), ['Movements:append']);
});

test('importIntoPersonalBook with hasInitialBalance false ignores a different balance', async () => {
  bookWithData({ bankBalance: 500 });
  const data = structuredClone(importData);
  data.accounts[0].hasInitialBalance = false;
  const { book } = await importIntoPersonalBook('file-1', data);
  assert.equal(book.accounts[0].initialBalance, 500, 'the book keeps its own initial balance');
});
