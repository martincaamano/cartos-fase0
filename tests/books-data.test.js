// Finding, caching, opening, creating and renaming books (js/data/books.js)
// against a faked Google API with several files. Invented data only.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureBooks, cachedBooks, cachedBook, fetchBooks, reloadBook, openBook, createNewBook, renameBook,
  setUpPersonalBook, importPersonalBook, importIntoBook, startingBook,
} from '../js/data/books.js';
import { loadBooksCache, saveBookCache, saveBookList, saveCurrentBook } from '../js/storage/book-cache.js';
import { ValidationError, ApiError } from '../js/data/errors.js';
import { IMPORTED_BY } from '../js/domain/import.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const SUB = 'user-1'; // the user of the fake session (helpers/fake-google.js)
const accountRow = (id, name, balance = 0, deleted = false) => [id, name, '🏦', balance, 't0', 't0', deleted];
const emptyTabs = () => ({ Accounts: [HEADERS.Accounts], Categories: [HEADERS.Categories], Movements: [HEADERS.Movements] });

const isDrive = (call) => call.url.hostname === 'www.googleapis.com';
const isList = (call) => isDrive(call) && call.method === 'GET';
const isCreate = (call) => isDrive(call) && call.method === 'POST';
const isRename = (call) => isDrive(call) && call.method === 'PATCH';
const readOf = (fileId) => (call) => call.url.pathname === `/v4/spreadsheets/${fileId}/values:batchGet`;
const isAnyRead = (call) => call.url.pathname.endsWith('values:batchGet');
const fileOfCall = (call) => call.url.pathname.split('/')[3]?.split(':')[0];

// An in-memory Drive with several Cartos files, each a Sheet with three
// tabs. Drive list/create/rename and the Sheets calls used by the app act on it.
// files: [{ id, name, createdTime, appProperties, tabs? }]
function fakeDrive(files = [], { failRename = false } = {}) {
  const drive = {
    files: files.map(({ tabs, ...meta }) => meta),
    tabs: Object.fromEntries(files.map((f) => [f.id, f.tabs ?? emptyTabs()])),
    created: 0,
  };
  drive.calls = setupGoogleApi((call) => {
    const path = call.url.pathname;
    if (isList(call)) return { body: { files: drive.files } };
    if (isCreate(call)) {
      drive.created += 1;
      const id = `new-file-${drive.created}`;
      drive.files.push({ id, name: call.body.name, createdTime: `2026-10-29T00:00:0${drive.created}Z`, appProperties: call.body.appProperties });
      drive.tabs[id] = { Accounts: [], Categories: [], Movements: [] };
      return { body: { id, name: call.body.name } };
    }
    if (isRename(call)) {
      if (failRename) return { status: 500 };
      const id = decodeURIComponent(path.split('/').at(-1));
      const meta = drive.files.find((f) => f.id === id);
      meta.name = call.body.name;
      meta.appProperties = { ...meta.appProperties, ...call.body.appProperties };
      return { body: { id, name: meta.name } };
    }
    const tabs = drive.tabs[fileOfCall(call)];
    if (path.endsWith('values:batchClear')) {
      for (const range of call.body.ranges) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+):Z$/);
        tabs[sheet] = tabs[sheet].slice(0, Number(from) - 1);
      }
    } else if (path.endsWith('values:batchUpdate')) {
      for (const { range, values } of call.body.data) {
        const [, sheet, from] = range.match(/^(\w+)!A(\d+)/);
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
  return drive;
}

const personalFile = (tabs) => ({
  id: 'file-p', name: 'Cartos · Personal', createdTime: '2026-10-01T00:00:00Z',
  appProperties: { app: 'cartos', bookType: 'personal', name: 'Personal' }, tabs,
});
const casaFile = (tabs) => ({
  id: 'file-c', name: 'Cartos · Casa do medio', createdTime: '2026-10-20T00:00:00Z',
  appProperties: { app: 'cartos', bookType: 'shared', name: 'Casa do medio' }, tabs,
});
const withAccounts = (...rows) => ({ ...emptyTabs(), Accounts: [HEADERS.Accounts, ...rows] });

const personalTabs = () => withAccounts(accountRow('acc-1', 'Banco', 100));
const casaTabs = () => withAccounts(accountRow('acc-c', 'Cuenta común', 250));

let storage;
beforeEach(() => {
  storage = fakeStorage();
  configureBooks({ storage: () => storage });
});

// --- fetchBooks ---

test('fetchBooks without books in Drive: status none, no book, one Drive search only', async () => {
  const { calls } = fakeDrive([]);
  assert.deepEqual(await fetchBooks(), { status: 'none', fileId: null, book: null, books: [] });
  assert.equal(calls.length, 1);
  assert.ok(isList(calls[0]));
  assert.equal(cachedBooks(), null);
  assert.deepEqual(loadBooksCache(storage, SUB).books, []);
});

test('fetchBooks opens the personal book the first time: one drive.list and one read of that file', async () => {
  const { calls } = fakeDrive([casaFile(casaTabs()), personalFile(personalTabs())]);
  const result = await fetchBooks();
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'file-p');
  assert.equal(result.book.accounts[0].name, 'Banco');
  assert.equal(result.book.accounts[0].initialBalance, 100);
  assert.deepEqual(result.books.map((b) => [b.fileId, b.name, b.bookType, b.isPersonal === true]), [
    ['file-p', 'Personal', 'personal', true],
    ['file-c', 'Casa do medio', 'shared', false],
  ]);
  assert.equal(calls.filter(isList).length, 1);
  assert.equal(calls.length, 2);
  assert.ok(readOf('file-p')(calls[1]));
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
});

test('fetchBooks saves the list, the copy of the book opened and makes it current', async () => {
  fakeDrive([personalFile(personalTabs()), casaFile(casaTabs())]);
  const result = await fetchBooks();
  const cache = loadBooksCache(storage, SUB);
  assert.equal(cache.current, 'file-p');
  assert.deepEqual(cache.books, result.books);
  assert.deepEqual(Object.keys(cache.snapshots), ['file-p'], 'only the book read');

  const cached = cachedBooks();
  assert.equal(cached.status, 'ready');
  assert.equal(cached.fileId, 'file-p');
  assert.deepEqual(cached.book, result.book);
  assert.deepEqual(cached.books, result.books);
  assert.match(cached.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('fetchBooks opens the last book open when it is still in Drive', async () => {
  const { calls } = fakeDrive([personalFile(personalTabs()), casaFile(casaTabs())]);
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-c' });
  const result = await fetchBooks();
  assert.equal(result.fileId, 'file-c');
  assert.equal(result.book.accounts[0].name, 'Cuenta común');
  assert.equal(calls.filter(isAnyRead).length, 1);
  assert.ok(calls.some(readOf('file-c')));
  assert.equal(calls.some(readOf('file-p')), false, 'the personal book is not read');
  assert.equal(loadBooksCache(storage, SUB).current, 'file-c');
});

test('fetchBooks with a last book that is gone opens the personal one and drops the old copy', async () => {
  fakeDrive([personalFile(personalTabs())]);
  saveBookCache(storage, { sub: SUB, fileId: 'file-gone', snapshot: { accounts: [], categories: [], movements: [] } });
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-gone' });
  const result = await fetchBooks();
  assert.equal(result.fileId, 'file-p');
  const cache = loadBooksCache(storage, SUB);
  assert.equal(cache.current, 'file-p');
  assert.equal(cache.snapshots['file-gone'], undefined);
});

test('fetchBooks without a personal book opens the first by name', async () => {
  fakeDrive([
    { ...casaFile(casaTabs()), id: 'file-z', appProperties: { app: 'cartos', bookType: 'shared', name: 'Zeta' } },
    casaFile(casaTabs()),
  ]);
  const result = await fetchBooks();
  assert.equal(result.fileId, 'file-c');
  assert.equal(result.status, 'ready');
});

test('fetchBooks: the open book whose accounts are all deleted is none, keeping its id, book and list', async () => {
  fakeDrive([personalFile(withAccounts(accountRow('acc-1', 'Banco', 0, true))), casaFile(casaTabs())]);
  const result = await fetchBooks();
  assert.equal(result.status, 'none');
  assert.equal(result.fileId, 'file-p');
  assert.equal(result.book.accounts.length, 1);
  assert.equal(result.books.length, 2);
  assert.equal(cachedBooks(), null, 'a copy without active accounts does not open the app');
});

test('fetchBooks: an empty personal book (no accounts) is none', async () => {
  fakeDrive([personalFile(emptyTabs())]);
  const result = await fetchBooks();
  assert.equal(result.status, 'none');
  assert.equal(result.fileId, 'file-p');
});

test('fetchBooks: a Drive error rejects and leaves the device copy untouched', async () => {
  setupGoogleApi(() => ({ status: 503 }));
  saveBookCache(storage, { sub: SUB, fileId: 'file-p', snapshot: { accounts: [{ id: 'a', deleted: false }], categories: [], movements: [] } });
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-p' });
  await assert.rejects(fetchBooks(), (err) => err instanceof ApiError && err.op === 'drive.list');
  assert.equal(cachedBooks().fileId, 'file-p');
});

// --- cachedBooks / cachedBook ---

test('cachedBooks with nothing on the device is null', () => {
  assert.equal(cachedBooks(), null);
});

test('cachedBook returns the copy of any book, open or not, or null', async () => {
  fakeDrive([personalFile(personalTabs()), casaFile(casaTabs())]);
  await fetchBooks();
  await reloadBook('file-c');
  assert.equal(cachedBook('file-c').accounts[0].name, 'Cuenta común');
  assert.equal(cachedBook('file-p').accounts[0].name, 'Banco');
  assert.equal(cachedBook('nope'), null);
  assert.equal(cachedBooks().fileId, 'file-p', 'reading another book does not open it');
});

// --- reloadBook: the book is read again by its file, no Drive search ---

test('reloadBook makes a single batchGet of that file and no Drive call', async () => {
  const { calls } = fakeDrive([personalFile(personalTabs())]);
  const result = await reloadBook('file-p');
  assert.equal(calls.length, 1);
  assert.equal(calls.some(isDrive), false, 'no drive.list');
  assert.equal(calls[0].method, 'GET');
  assert.ok(readOf('file-p')(calls[0]));
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'file-p');
  assert.equal(result.book.accounts[0].name, 'Banco');
  assert.equal(result.book.accounts[0].initialBalance, 100);
});

test('reloadBook refreshes that copy and does not change the book open', async () => {
  fakeDrive([personalFile(personalTabs()), casaFile(casaTabs())]);
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-p' });
  await reloadBook('file-c');
  assert.equal(loadBooksCache(storage, SUB).current, 'file-p');
  assert.equal(cachedBook('file-c').accounts[0].initialBalance, 250);
});

test('reloadBook of a book without active accounts is none, keeping its id', async () => {
  const { calls } = fakeDrive([personalFile(withAccounts(accountRow('acc-1', 'Banco', 0, true)))]);
  const result = await reloadBook('file-p');
  assert.equal(result.status, 'none');
  assert.equal(result.fileId, 'file-p');
  assert.equal(calls.some(isDrive), false);
});

test('reloadBook and fetchBooks agree on the same book', async () => {
  fakeDrive([personalFile(personalTabs())]);
  const { books, ...fetched } = await fetchBooks();
  assert.deepEqual(await reloadBook('file-p'), fetched);
});

// --- openBook: device only ---

test('openBook sets the book open and returns its copy, without any call', async () => {
  const drive = fakeDrive([personalFile(personalTabs()), casaFile(casaTabs())]);
  await fetchBooks();
  await reloadBook('file-c');
  drive.calls.length = 0;
  const result = openBook('file-c');
  assert.deepEqual(result, { status: 'ready', fileId: 'file-c', book: cachedBook('file-c') });
  assert.equal(drive.calls.length, 0);
  assert.equal(loadBooksCache(storage, SUB).current, 'file-c');
  assert.equal(cachedBooks().fileId, 'file-c');
});

test('openBook without a copy returns null but still remembers the book open', () => {
  const { calls } = fakeDrive([]);
  assert.equal(openBook('file-c'), null);
  assert.equal(calls.length, 0);
  assert.equal(loadBooksCache(storage, SUB).current, 'file-c');
});

test('openBook of a copy without active accounts has status none', () => {
  saveBookCache(storage, { sub: SUB, fileId: 'file-c', snapshot: { accounts: [{ id: 'a', deleted: true }], categories: [], movements: [] } });
  assert.equal(openBook('file-c').status, 'none');
});

// --- createNewBook ---

const books = [
  { fileId: 'file-p', name: 'Personal', bookType: 'personal', createdTime: '2026-10-01T00:00:00Z', isPersonal: true },
  { fileId: 'file-z', name: 'Zeta', bookType: 'shared', createdTime: '2026-10-02T00:00:00Z' },
];
const account = { name: 'Cuenta común', emoji: '🏠', initialBalance: 0.01 };

test('createNewBook rejects a bad name before any call', async () => {
  const { calls } = fakeDrive([]);
  for (const [name, code] of [['', 'name_required'], ['   ', 'name_required'], ['a'.repeat(41), 'name_too_long'], [' personal ', 'name_taken']]) {
    await assert.rejects(createNewBook({ name, account }, books),
      (err) => err instanceof ValidationError && err.errors.length === 1 && err.errors[0] === code, JSON.stringify(name));
  }
  assert.equal(calls.length, 0);
  assert.equal(loadBooksCache(storage, SUB), null, 'nothing saved');
});

test('createNewBook creates a shared Sheet named "Cartos · <name>" with the name trimmed', async () => {
  const { calls } = fakeDrive([]);
  await createNewBook({ name: '  Casa do medio ', account }, books);
  const creates = calls.filter(isCreate);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.name, 'Cartos · Casa do medio');
  assert.equal(creates[0].body.appProperties.app, 'cartos');
  assert.equal(creates[0].body.appProperties.bookType, 'shared');
  assert.equal(creates[0].body.appProperties.name, 'Casa do medio');
  assert.equal(calls.some(isList), false, 'no Drive search');
});

test('createNewBook adds the first account RAW, reads the book back and returns it ready', async () => {
  const { calls } = fakeDrive([]);
  const result = await createNewBook({ name: 'Casa do medio', account }, books);
  assert.equal(result.status, 'ready');
  assert.equal(result.fileId, 'new-file-1');
  assert.deepEqual(result.book.accounts.map((a) => [a.name, a.emoji, a.initialBalance]), [['Cuenta común', '🏠', 0.01]]);
  assert.ok(result.book.categories.length > 1, 'starts with the default categories');
  assert.ok(result.book.categories.some((c) => c.id === 'transfer'));

  const append = calls.find((c) => c.url.pathname === '/v4/spreadsheets/new-file-1/values/Accounts:append');
  assert.equal(append.url.searchParams.get('valueInputOption'), 'RAW');
  assert.ok(readOf('new-file-1')(calls.at(-1)), 'the last call reads the new book');
});

test('createNewBook returns and saves the list with the new book in name order, and opens it', async () => {
  fakeDrive([]);
  const result = await createNewBook({ name: 'Casa do medio', account }, books);
  assert.deepEqual(result.books.map((b) => b.fileId), ['file-p', 'new-file-1', 'file-z']);
  assert.deepEqual(result.books[1], { fileId: 'new-file-1', name: 'Casa do medio', bookType: 'shared', createdTime: '' });
  const cache = loadBooksCache(storage, SUB);
  assert.deepEqual(cache.books, result.books);
  assert.equal(cache.current, 'new-file-1');
  assert.deepEqual(cachedBooks().book, result.book);
  assert.equal(books.length, 2, 'the list given is not changed');
});

test('createNewBook with an invalid account rejects before any call: no empty file left in Drive', async () => {
  const drive = fakeDrive([]);
  await assert.rejects(createNewBook({ name: 'Casa', account: { name: '', initialBalance: 0 } }, []),
    (err) => err instanceof ValidationError && err.errors.includes('name_required'));
  await assert.rejects(createNewBook({ name: 'Casa', account: { name: 'Común', initialBalance: 0.001 } }, []),
    (err) => err instanceof ValidationError && err.errors.includes('initial_balance_invalid'));
  assert.equal(drive.calls.length, 0);
  assert.deepEqual(drive.files, []);
  assert.equal(loadBooksCache(storage, SUB), null, 'the book is neither listed nor opened');
});

test('createNewBook with a bad name and a bad account reports both, without calls', async () => {
  const { calls } = fakeDrive([]);
  await assert.rejects(createNewBook({ name: 'Personal', account: { name: 'Común', initialBalance: 'cien' } }, books),
    (err) => err instanceof ValidationError
      && err.errors.includes('name_taken') && err.errors.includes('initial_balance_invalid'));
  assert.equal(calls.length, 0);
});

// --- renameBook ---

test('renameBook rejects a bad name before any call', async () => {
  const { calls } = fakeDrive([]);
  await assert.rejects(renameBook('file-z', 'PERSONAL', books), (err) => err instanceof ValidationError && err.errors[0] === 'name_taken');
  await assert.rejects(renameBook('file-z', ' ', books), (err) => err instanceof ValidationError && err.errors[0] === 'name_required');
  await assert.rejects(renameBook('file-z', 'b'.repeat(41), books), (err) => err instanceof ValidationError && err.errors[0] === 'name_too_long');
  assert.equal(calls.length, 0);
});

test('renameBook makes one drive.rename with the file name and appProperties.name', async () => {
  const { calls } = fakeDrive([{ ...casaFile(casaTabs()), id: 'file-z' }]);
  await renameBook('file-z', '  Casa nueva ', books);
  assert.equal(calls.length, 1);
  assert.ok(isRename(calls[0]));
  assert.equal(calls[0].url.pathname, '/drive/v3/files/file-z');
  assert.deepEqual(calls[0].body, { name: 'Cartos · Casa nueva', appProperties: { name: 'Casa nueva' } });
});

test('renameBook returns and saves the list with the new name, keeping the copies', async () => {
  fakeDrive([{ ...casaFile(casaTabs()), id: 'file-z' }]);
  saveBookList(storage, { sub: SUB, books });
  saveBookCache(storage, { sub: SUB, fileId: 'file-z', snapshot: { accounts: [], categories: [], movements: [] } });
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-z' });
  const renamed = await renameBook('file-z', 'Alfa', books);
  assert.deepEqual(renamed.map((b) => [b.fileId, b.name]), [['file-p', 'Personal'], ['file-z', 'Alfa']]);
  assert.equal(renamed[0], books[0], 'other books untouched');
  assert.equal(books[1].name, 'Zeta', 'the list given is not changed');
  const cache = loadBooksCache(storage, SUB);
  assert.deepEqual(cache.books, renamed);
  assert.ok(cache.snapshots['file-z'], 'its copy is kept');
  assert.equal(cache.current, 'file-z');
});

test('renameBook may change only the case of its own name', async () => {
  const { calls } = fakeDrive([{ ...casaFile(casaTabs()), id: 'file-z' }]);
  const renamed = await renameBook('file-z', 'ZETA', books);
  assert.equal(renamed[1].name, 'ZETA');
  assert.equal(calls.length, 1);
});

test('renameBook: when Drive fails nothing is saved', async () => {
  fakeDrive([{ ...casaFile(casaTabs()), id: 'file-z' }], { failRename: true });
  saveBookList(storage, { sub: SUB, books });
  await assert.rejects(renameBook('file-z', 'Alfa', books), (err) => err instanceof ApiError && err.op === 'drive.rename');
  assert.deepEqual(loadBooksCache(storage, SUB).books, books);
});

// --- setUpPersonalBook (onboarding) ---

const firstAccount = { name: 'Banco', emoji: '🏦', initialBalance: 100 };

test('onboarding creates the personal book when there is none and opens it', async () => {
  const { calls } = fakeDrive([]);
  const result = await setUpPersonalBook({ account: firstAccount });
  assert.equal(result.fileId, 'new-file-1');
  assert.equal(result.status, 'ready');
  const creates = calls.filter(isCreate);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.appProperties.bookType, 'personal');
  assert.equal(creates[0].body.name, 'Cartos · Personal');
  assert.equal(cachedBooks().fileId, 'new-file-1');
});

test('onboarding reuses an existing empty book instead of creating another', async () => {
  const { calls } = fakeDrive([personalFile(emptyTabs())]);
  const result = await setUpPersonalBook({ fileId: 'file-p', account: firstAccount });
  assert.equal(calls.some(isDrive), false, 'no new Drive file');
  assert.ok(calls.some((c) => c.url.pathname === '/v4/spreadsheets/file-p/values/Accounts:append'));
  assert.equal(result.fileId, 'file-p');
  assert.equal(loadBooksCache(storage, SUB).current, 'file-p');
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

test('importPersonalBook without fileId creates the book without default categories', async () => {
  const { calls } = fakeDrive([]);
  const result = await importPersonalBook({ data: importData });

  assert.equal(result.fileId, 'new-file-1');
  assert.equal(calls.filter(isCreate).length, 1, 'one Drive file created');
  assert.ok(calls.some((c) => c.url.pathname === '/v4/spreadsheets/new-file-1:batchUpdate'), 'tabs created');

  const headerWrite = calls.find((c) => c.body?.data?.some((d) => d.range === 'Categories!A1'));
  assert.deepEqual(headerWrite.body.data.find((d) => d.range === 'Categories!A1').values, [HEADERS.Categories]);
});

test('importPersonalBook clears and writes the three tabs in one RAW request', async () => {
  const { calls } = fakeDrive([]);
  await importPersonalBook({ data: importData });
  const clears = calls.filter((c) => c.url.pathname === '/v4/spreadsheets/new-file-1/values:batchClear');
  assert.equal(clears.length, 1);
  const rowWrites = calls.filter((c) => c.body?.data?.some((d) => d.range.endsWith('!A2')));
  assert.equal(rowWrites.length, 1);
  assert.equal(rowWrites[0].body.valueInputOption, 'RAW');
  assert.deepEqual(rowWrites[0].body.data.map((d) => d.range), ['Accounts!A2', 'Categories!A2', 'Movements!A2']);
  assert.ok(calls.indexOf(clears[0]) < calls.indexOf(rowWrites[0]), 'clear before write');
});

test('importPersonalBook always adds Transferencia with id transfer', async () => {
  fakeDrive([]);
  const { book } = await importPersonalBook({ data: importData });
  const transfer = book.categories.find((c) => c.id === 'transfer');
  assert.equal(transfer.name, 'Transferencia');
  assert.equal(transfer.kind, 'both');
  assert.deepEqual(book.categories.map((c) => c.name), ['Comida', 'Transferencia']);
});

test('importPersonalBook returns the book read back, ready', async () => {
  fakeDrive([]);
  const result = await importPersonalBook({ data: importData });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.book.accounts.map((a) => [a.name, a.initialBalance]), [['Banco Inventado', 1000], ['Hucha', 0]]);
  assert.equal(result.book.movements.length, 3, '1 expense + 2 transfer halves');
  assert.deepEqual(result.book.movements.map((m) => m.amount), [12.5, 50, 50]);
  for (const m of result.book.movements) assert.equal(m.createdBy, IMPORTED_BY);
  const halves = result.book.movements.filter((m) => m.transferId);
  assert.equal(halves[0].transferId, halves[1].transferId);
});

test('importPersonalBook saves the device copy and opens the book', async () => {
  fakeDrive([]);
  assert.equal(cachedBooks(), null);
  const result = await importPersonalBook({ data: importData });
  const cached = cachedBooks();
  assert.equal(cached.status, 'ready');
  assert.equal(cached.fileId, 'new-file-1');
  assert.deepEqual(cached.book, result.book);
});

test('importPersonalBook with fileId writes over it and creates no new file', async () => {
  const { calls } = fakeDrive([personalFile({
    ...emptyTabs(),
    Categories: [HEADERS.Categories, ['old-cat', 'Vieja', '', 'expense', true, '', false]],
  })]);
  const result = await importPersonalBook({ fileId: 'file-p', data: importData });
  assert.equal(calls.some(isDrive), false, 'no Drive call');
  assert.equal(calls.some((c) => c.url.pathname === '/v4/spreadsheets/file-p:batchUpdate'), false, 'no tabs created');
  assert.equal(result.fileId, 'file-p');
  assert.equal(result.status, 'ready');
  assert.equal(result.book.categories.some((c) => c.id === 'old-cat'), false, 'old rows cleared');
  assert.equal(cachedBooks().fileId, 'file-p');
});

test('repeating importPersonalBook on the same file does not duplicate rows', async () => {
  fakeDrive([personalFile(emptyTabs())]);
  await importPersonalBook({ fileId: 'file-p', data: importData });
  const { book } = await importPersonalBook({ fileId: 'file-p', data: importData });
  assert.equal(book.accounts.length, 2);
  assert.equal(book.categories.length, 2);
  assert.equal(book.movements.length, 3);
});

test('importPersonalBook writes the file categories and then Transferencia', async () => {
  const { calls } = fakeDrive([]);
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

// --- importIntoBook: adding a file to a book with data ---

// A book (file-1) with one account, Transferencia, one category and one movement.
function bookWithData({ bankBalance = 1000, fileId = 'file-1' } = {}) {
  return fakeDrive([{
    id: fileId,
    name: 'Cartos · Casa do medio',
    createdTime: '2026-10-20T00:00:00Z',
    appProperties: { app: 'cartos', bookType: 'shared', name: 'Casa do medio' },
    tabs: {
      Accounts: [HEADERS.Accounts, ['acc-bank', 'Banco Inventado', '🏦', bankBalance, 't0', 't0', false]],
      Categories: [
        HEADERS.Categories,
        ['transfer', 'Transferencia', '🔁', 'both', true, 't0', false],
        ['cat-food', 'comida', '🛒', 'expense', false, 't0', false],
      ],
      Movements: [
        HEADERS.Movements,
        ['m-0', 'acc-bank', 'expense', 3, '2026-09-01', 'cat-food', '', '', '', 'user-1', 't0', 't0', false],
      ],
    },
  }]);
}

const isAppend = (sheet) => (call) => call.url.pathname === `/v4/spreadsheets/file-1/values/${sheet}:append`;
const isRead = readOf('file-1');

test('importIntoBook reads the book first, appends only what is new, reads again', async () => {
  const { calls } = bookWithData();
  await importIntoBook('file-1', importData);

  assert.equal(calls.some(isDrive), false, 'no Drive call');
  assert.ok(isRead(calls[0]), 'reads first');
  assert.ok(isRead(calls.at(-1)), 'reads again at the end');
  assert.deepEqual(calls.slice(1, -1).map((c) => c.url.pathname.split('/').at(-1)), ['Accounts:append', 'Movements:append']);
  for (const call of calls.slice(1, -1)) assert.equal(call.url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(calls.find(isAppend('Accounts')).body.values.map((r) => r[1]), ['Hucha']);
  assert.equal(calls.find(isAppend('Movements')).body.values.length, 3);
  assert.equal(calls.some((c) => c.url.pathname.endsWith('batchClear')), false, 'nothing cleared');
});

test('importIntoBook returns the book read back, ready, and keeps its device copy', async () => {
  bookWithData();
  const result = await importIntoBook('file-1', importData);
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

  assert.deepEqual(cachedBook('file-1'), book);
});

test('importIntoBook into a book that is not open does not change the book open', async () => {
  bookWithData();
  saveCurrentBook(storage, { sub: SUB, fileId: 'file-p' });
  await importIntoBook('file-1', importData);
  assert.equal(loadBooksCache(storage, SUB).current, 'file-p');
});

test('importIntoBook with an invalid file throws ValidationError with the codes and writes nothing', async () => {
  const drive = bookWithData({ bankBalance: 500 });
  const before = structuredClone(drive.tabs);
  await assert.rejects(importIntoBook('file-1', importData),
    (err) => err instanceof ValidationError && err.errors.length === 1 && err.errors[0] === 'initial_balance_conflict');
  assert.equal(drive.calls.length, 1, 'only the first read');
  assert.ok(isRead(drive.calls[0]));
  assert.deepEqual(drive.tabs, before);
  assert.equal(cachedBook('file-1'), null);
});

test('importIntoBook rejects a file category named Transferencia', async () => {
  const { calls } = bookWithData();
  const data = structuredClone(importData);
  data.categories.push({ key: 'tr', name: 'TRANSFERENCIA', kind: 'both' });
  await assert.rejects(importIntoBook('file-1', data),
    (err) => err instanceof ValidationError && err.errors.includes('category_reserved'));
  assert.equal(calls.some((c) => c.url.pathname.endsWith(':append')), false);
});

test('importIntoBook with everything already in the book appends only movements', async () => {
  const drive = bookWithData();
  drive.tabs['file-1'].Accounts.push(['acc-cash', 'HUCHA', '', 0, 't0', 't0', false]);
  await importIntoBook('file-1', importData);
  assert.deepEqual(drive.calls.filter((c) => c.url.pathname.endsWith(':append')).map((c) => c.url.pathname.split('/').at(-1)), ['Movements:append']);
});

test('importIntoBook with hasInitialBalance false ignores a different balance', async () => {
  bookWithData({ bankBalance: 500 });
  const data = structuredClone(importData);
  data.accounts[0].hasInitialBalance = false;
  const { book } = await importIntoBook('file-1', data);
  assert.equal(book.accounts[0].initialBalance, 500, 'the book keeps its own initial balance');
});
