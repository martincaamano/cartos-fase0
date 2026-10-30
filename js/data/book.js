// A book is one Google Sheet with the tabs Accounts, Categories and Movements
// (architecture §2). Everything is validated with domain/ before it is written.

import { es } from '../../i18n/es.js';
import { createSpreadsheetFile } from './drive.js';
import { ValidationError } from './errors.js';
import { append, batchClear, batchGet, batchUpdate, batchUpdateValues } from './sheets.js';
import { findRowById, HEADERS, SHEET_NAMES, toRow, rowsToObjects } from './rows.js';
import { createAccount, editAccount, validateAccount } from '../domain/account.js';
import {
  buildDefaultCategories, canRemoveCategory, createCategory, editCategory, validateCategory, validateCategoryEdit,
} from '../domain/category.js';

// A new spreadsheet always starts with one tab whose sheetId is 0.
const FIRST_SHEET_ID = 0;

// categories: the rows to start with; the defaults (named by i18n) when
// not given, as in the onboarding. An import passes its own.
export async function createBook({ name = 'Personal', bookType = 'personal', categoryNames = es.categories, categories = null } = {}) {
  const bookId = crypto.randomUUID();
  const file = await createSpreadsheetFile(`Cartos · ${name}`, { app: 'cartos', bookId, bookType, name });

  await batchUpdate(file.id, [
    { updateSheetProperties: { properties: { sheetId: FIRST_SHEET_ID, title: 'Accounts' }, fields: 'title' } },
    { addSheet: { properties: { title: 'Categories' } } },
    { addSheet: { properties: { title: 'Movements' } } },
  ]);

  const rows = categories ?? buildDefaultCategories(categoryNames);
  await batchUpdateValues(file.id, [
    { range: 'Accounts!A1', values: [HEADERS.Accounts] },
    { range: 'Categories!A1', values: [HEADERS.Categories, ...rows.map((c) => toRow('Categories', c))] },
    { range: 'Movements!A1', values: [HEADERS.Movements] },
  ]);

  return { fileId: file.id, bookId, name, bookType };
}

export async function readBook(fileId) {
  const [accounts, categories, movements] = await batchGet(fileId, SHEET_NAMES);
  return {
    accounts: rowsToObjects('Accounts', accounts),
    categories: rowsToObjects('Categories', categories),
    movements: rowsToObjects('Movements', movements),
  };
}

// Writes a whole book at once (an import): empties the data rows of the
// three tabs, then writes them in one request, RAW. Repeating it after a
// failure leaves the same rows, never duplicates.
export async function writeBookRows(fileId, { accounts, categories, movements }) {
  await batchClear(fileId, SHEET_NAMES.map((sheet) => `${sheet}!A2:Z`));
  await batchUpdateValues(fileId, [
    { range: 'Accounts!A2', values: accounts.map((a) => toRow('Accounts', a)) },
    { range: 'Categories!A2', values: categories.map((c) => toRow('Categories', c)) },
    { range: 'Movements!A2', values: movements.map((m) => toRow('Movements', m)) },
  ]);
}

// Adds rows at the end of each tab (an import into a book with data),
// accounts and categories before the movements that point at them.
export async function appendBookRows(fileId, { accounts, categories, movements }) {
  if (accounts.length) await append(fileId, 'Accounts', accounts.map((a) => toRow('Accounts', a)));
  if (categories.length) await append(fileId, 'Categories', categories.map((c) => toRow('Categories', c)));
  if (movements.length) await append(fileId, 'Movements', movements.map((m) => toRow('Movements', m)));
}

// existing: the accounts already in the book, to reject a repeated name.
export async function addAccount(fileId, fields, existing = []) {
  const account = createAccount(fields);
  const errors = validateAccount(account, existing);
  if (errors.length) throw new ValidationError(errors);
  await append(fileId, 'Accounts', [toRow('Accounts', account)]);
  return account;
}

// existing: the categories already in the book, to reject a repeated name.
export async function addCategory(fileId, fields, existing) {
  const category = createCategory(fields);
  const errors = validateCategory(category, existing);
  if (errors.length) throw new ValidationError(errors);
  await append(fileId, 'Categories', [toRow('Categories', category)]);
  return category;
}

const columnLetter = (sheet, column) => String.fromCharCode(65 + HEADERS[sheet].indexOf(column));
const lastColumn = (sheet) => String.fromCharCode(64 + HEADERS[sheet].length);

// Writes a whole row over the one with the same id, found by its id (never
// by a remembered row number), RAW.
async function writeRowById(fileId, sheet, item) {
  const [idColumn] = await batchGet(fileId, [`${sheet}!A:A`]);
  const row = findRowById(idColumn, item.id);
  if (row === null) throw new ValidationError([sheet === 'Accounts' ? 'account_unknown' : 'category_unknown']);
  await batchUpdateValues(fileId, [{ range: `${sheet}!A${row}:${lastColumn(sheet)}${row}`, values: [toRow(sheet, item)] }]);
}

// Ajustes → Cuentas, the card of an account: name, emoji and initial
// balance. existing: the book's accounts, to reject a repeated name.
export async function updateAccount(fileId, original, fields, existing = []) {
  const account = editAccount(original, fields);
  const errors = validateAccount(account, existing);
  if (errors.length) throw new ValidationError(errors);
  await writeRowById(fileId, 'Accounts', account);
  return account;
}

// Ajustes → Categorías, the card of a category: name, emoji and kind (the
// kind only while no movement uses it). book: { categories, movements }.
export async function updateCategory(fileId, original, fields, book) {
  const category = editCategory(original, fields);
  const errors = validateCategoryEdit(category, original, book);
  if (errors.length) throw new ValidationError(errors);
  await writeRowById(fileId, 'Categories', category);
  return category;
}

// Logical delete: finds the row by id (never by a remembered row number)
// and sets updatedAt and deleted. The row itself is never removed.
export async function removeCategory(fileId, category, now = new Date()) {
  if (!canRemoveCategory(category)) throw new ValidationError(['not_removable']);
  const [idColumn] = await batchGet(fileId, ['Categories!A:A']);
  const row = findRowById(idColumn, category.id);
  if (row === null) throw new ValidationError(['category_unknown']);
  const from = columnLetter('Categories', 'updatedAt');
  const to = columnLetter('Categories', 'deleted');
  await batchUpdateValues(fileId, [{ range: `Categories!${from}${row}:${to}${row}`, values: [[now.toISOString(), true]] }]);
}
