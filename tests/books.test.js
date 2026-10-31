// Pure logic of the user's books (js/domain/books.js), with invented files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookFileName, bookOf, orderBooks, addBook, personalBookOf, chooseBook, validateBookName,
} from '../js/domain/books.js';

const file = (id, name, createdTime, appProperties = {}) => ({
  id, name: `Cartos · ${name}`, createdTime, appProperties: { app: 'cartos', ...appProperties },
});

// --- bookFileName / bookOf ---

test('bookFileName prefixes the name with "Cartos · "', () => {
  assert.equal(bookFileName('Personal'), 'Cartos · Personal');
  assert.equal(bookFileName('Casa do medio'), 'Cartos · Casa do medio');
});

test('bookOf takes the name from appProperties.name and keeps id and createdTime', () => {
  const f = { id: 'f-1', name: 'Cartos · Viejo', createdTime: '2026-10-01T00:00:00Z', appProperties: { name: 'Casa', bookType: 'shared' } };
  assert.deepEqual(bookOf(f), { fileId: 'f-1', name: 'Casa', bookType: 'shared', createdTime: '2026-10-01T00:00:00Z', canShare: true });
});

test('bookOf without appProperties.name uses the file name without the prefix', () => {
  assert.equal(bookOf({ id: 'f', name: 'Cartos · Casa do medio' }).name, 'Casa do medio');
  assert.equal(bookOf({ id: 'f', name: 'Cartos · Casa', appProperties: { name: '   ' } }).name, 'Casa');
  assert.equal(bookOf({ id: 'f', name: 'Otro', appProperties: {} }).name, 'Otro');
});

test('bookOf trims the name from appProperties', () => {
  assert.equal(bookOf({ id: 'f', name: 'x', appProperties: { name: '  Casa  ' } }).name, 'Casa');
});

test('bookOf is personal only when appProperties says so; anything else is shared', () => {
  assert.equal(bookOf({ id: 'a', name: 'n', appProperties: { bookType: 'personal' } }).bookType, 'personal');
  assert.equal(bookOf({ id: 'b', name: 'n', appProperties: { bookType: 'shared' } }).bookType, 'shared');
  assert.equal(bookOf({ id: 'c', name: 'n', appProperties: { bookType: 'PERSONAL' } }).bookType, 'shared');
  assert.equal(bookOf({ id: 'd', name: 'n' }).bookType, 'shared');
});

test('bookOf: canShare is false only when Drive says so (a book shared with me)', () => {
  assert.equal(bookOf({ id: 'f', capabilities: { canShare: false } }).canShare, false);
  assert.equal(bookOf({ id: 'f', capabilities: { canShare: true } }).canShare, true);
});

test('bookOf with no name nor createdTime gives empty strings', () => {
  assert.deepEqual(bookOf({ id: 'f' }), { fileId: 'f', name: '', bookType: 'shared', createdTime: '', canShare: true });
});

// --- orderBooks ---

test('orderBooks puts the personal book first marked isPersonal, then the rest by name', () => {
  const books = orderBooks([
    file('zeta', 'Zeta', '2026-01-03T00:00:00Z', { name: 'Zeta', bookType: 'shared' }),
    file('pers', 'Personal', '2026-01-05T00:00:00Z', { name: 'Personal', bookType: 'personal' }),
    file('casa', 'Casa', '2026-01-04T00:00:00Z', { name: 'Casa', bookType: 'shared' }),
  ]);
  assert.deepEqual(books.map((b) => [b.fileId, b.isPersonal === true]), [['pers', true], ['casa', false], ['zeta', false]]);
  assert.equal('isPersonal' in books[1], false);
});

test('orderBooks: the oldest personal file is the personal one; a newer one is just another book', () => {
  const books = orderBooks([
    file('newer', 'Personal', '2026-10-25T00:00:00Z', { name: 'Personal', bookType: 'personal' }),
    file('older', 'Personal', '2026-10-20T00:00:00Z', { name: 'Personal', bookType: 'personal' }),
    file('shared', 'Casa', '2026-01-01T00:00:00Z', { name: 'Casa', bookType: 'shared' }),
  ]);
  assert.deepEqual(books.map((b) => b.fileId), ['older', 'shared', 'newer']);
  assert.equal(books[0].isPersonal, true);
  assert.equal(books.filter((b) => b.isPersonal).length, 1);
  assert.equal(books[2].bookType, 'personal', 'keeps its bookType');
});

test('orderBooks without a personal book only sorts by name', () => {
  const books = orderBooks([
    file('b', 'Beta', '2026-01-01T00:00:00Z', { name: 'Beta' }),
    file('a', 'Alfa', '2026-01-02T00:00:00Z', { name: 'Alfa' }),
  ]);
  assert.deepEqual(books.map((b) => b.name), ['Alfa', 'Beta']);
  assert.equal(books.some((b) => b.isPersonal), false);
});

test('orderBooks uses Spanish collation (accents and ñ, case-insensitive)', () => {
  const names = ['Ñandú', 'zapato', 'Árbol', 'nube', 'Obra'];
  const books = orderBooks(names.map((n, i) => file(`f${i}`, n, `2026-01-0${i + 1}T00:00:00Z`, { name: n })));
  assert.deepEqual(books.map((b) => b.name), ['Árbol', 'nube', 'Ñandú', 'Obra', 'zapato']);
});

test('orderBooks of an empty list is empty', () => {
  assert.deepEqual(orderBooks([]), []);
});

// --- addBook ---

test('addBook keeps the personal one first and puts the new book in name order', () => {
  const books = [
    { fileId: 'p', name: 'Personal', bookType: 'personal', isPersonal: true },
    { fileId: 'a', name: 'Alfa', bookType: 'shared' },
    { fileId: 'z', name: 'Zeta', bookType: 'shared' },
  ];
  const next = addBook(books, { fileId: 'm', name: 'Medio', bookType: 'shared' });
  assert.deepEqual(next.map((b) => b.fileId), ['p', 'a', 'm', 'z']);
  assert.equal(books.length, 3, 'does not change the list given');
});

test('addBook to an empty list or a list without personal', () => {
  assert.deepEqual(addBook([], { fileId: 'x', name: 'X' }).map((b) => b.fileId), ['x']);
  const next = addBook([{ fileId: 'b', name: 'Beta' }], { fileId: 'a', name: 'alfa' });
  assert.deepEqual(next.map((b) => b.fileId), ['a', 'b']);
});

// --- personalBookOf / chooseBook ---

const listed = [
  { fileId: 'p', name: 'Personal', isPersonal: true },
  { fileId: 'c', name: 'Casa' },
];

test('personalBookOf returns the one marked isPersonal, or null', () => {
  assert.equal(personalBookOf(listed).fileId, 'p');
  assert.equal(personalBookOf([{ fileId: 'c', name: 'Casa' }]), null);
  assert.equal(personalBookOf([]), null);
});

test('chooseBook opens the last one when it is still listed', () => {
  assert.equal(chooseBook(listed, 'c').fileId, 'c');
  assert.equal(chooseBook(listed, 'p').fileId, 'p');
});

test('chooseBook falls back to the personal book when the last one is gone or unknown', () => {
  assert.equal(chooseBook(listed, 'deleted').fileId, 'p');
  assert.equal(chooseBook(listed, null).fileId, 'p');
  assert.equal(chooseBook(listed, undefined).fileId, 'p');
});

test('chooseBook without personal takes the first one; with no books, null', () => {
  const others = [{ fileId: 'a', name: 'Alfa' }, { fileId: 'b', name: 'Beta' }];
  assert.equal(chooseBook(others, 'gone').fileId, 'a');
  assert.equal(chooseBook([], 'x'), null);
  assert.equal(chooseBook([], null), null);
});

// --- validateBookName ---

test('validateBookName accepts a new name', () => {
  assert.deepEqual(validateBookName('Casa do medio', listed), []);
  assert.deepEqual(validateBookName('Viaje'), []);
});

test('validateBookName requires a name: empty, spaces, null and undefined', () => {
  for (const name of ['', '   ', '\t', null, undefined]) {
    assert.deepEqual(validateBookName(name, listed), ['name_required'], JSON.stringify(name));
  }
});

test('validateBookName: 40 characters after trim is fine, 41 is too long', () => {
  assert.deepEqual(validateBookName('a'.repeat(40)), []);
  assert.deepEqual(validateBookName(`  ${'a'.repeat(40)}  `), []);
  assert.deepEqual(validateBookName('a'.repeat(41)), ['name_too_long']);
  assert.deepEqual(validateBookName('a'), []);
});

test('validateBookName rejects a repeated name, ignoring case and spaces', () => {
  assert.deepEqual(validateBookName('Casa', listed), ['name_taken']);
  assert.deepEqual(validateBookName('  casa ', listed), ['name_taken']);
  assert.deepEqual(validateBookName('PERSONAL', listed), ['name_taken']);
  assert.deepEqual(validateBookName('Casas', listed), []);
});

test('validateBookName ignores the book being renamed', () => {
  assert.deepEqual(validateBookName('casa', listed, 'c'), [], 'renaming Casa to casa');
  assert.deepEqual(validateBookName('Personal', listed, 'c'), ['name_taken'], 'Casa cannot take Personal');
});

test('validateBookName gives one error at a time: required before taken', () => {
  assert.deepEqual(validateBookName('', [{ fileId: 'x', name: '' }]), ['name_required']);
});
