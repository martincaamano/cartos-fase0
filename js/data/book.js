// A book is one Google Sheet with the tabs Accounts, Categories and Movements
// (architecture §2). Everything is validated with domain/ before it is written.

import { es } from '../../i18n/es.js';
import { createSpreadsheetFile } from './drive.js';
import { ValidationError } from './errors.js';
import { append, batchGet, batchUpdate, batchUpdateValues } from './sheets.js';
import { findRowById, HEADERS, SHEET_NAMES, toRow, rowsToObjects } from './rows.js';
import { createAccount, validateAccount } from '../domain/account.js';
import {
  buildDefaultCategories, canRemoveCategory, createCategory, validateCategory,
} from '../domain/category.js';

// A new spreadsheet always starts with one tab whose sheetId is 0.
const FIRST_SHEET_ID = 0;

export async function createBook({ name = 'Personal', bookType = 'personal', categoryNames = es.categories } = {}) {
  const bookId = crypto.randomUUID();
  const file = await createSpreadsheetFile(`Cartos · ${name}`, { app: 'cartos', bookId, bookType, name });

  await batchUpdate(file.id, [
    { updateSheetProperties: { properties: { sheetId: FIRST_SHEET_ID, title: 'Accounts' }, fields: 'title' } },
    { addSheet: { properties: { title: 'Categories' } } },
    { addSheet: { properties: { title: 'Movements' } } },
  ]);

  const categories = buildDefaultCategories(categoryNames);
  await batchUpdateValues(file.id, [
    { range: 'Accounts!A1', values: [HEADERS.Accounts] },
    { range: 'Categories!A1', values: [HEADERS.Categories, ...categories.map((c) => toRow('Categories', c))] },
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
