// A book is one Google Sheet with the tabs Accounts, Categories and Movements
// (architecture §2), and Goals and Contributions since tarea 25. Everything
// is validated with domain/ before it is written. Accounts and categories
// edited in Ajustes go through the outbox (data/book-items.js, tarea 30c).

import { es } from '../../i18n/es.js';
import { createSpreadsheetFile } from './drive.js';
import { assertValid } from './errors.js';
import { append, batchClear, batchUpdate, batchUpdateValues } from './sheets.js';
import { GOAL_SHEETS, HEADERS, SHEET_NAMES, toRow, rowsToObjects } from './rows.js';
import { readWithGoalTabs, writeHeaders } from './tabs.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { buildDefaultCategories } from '../domain/category.js';

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
    ...GOAL_SHEETS.map((title) => ({ addSheet: { properties: { title } } })),
  ]);

  const rows = categories ?? buildDefaultCategories(categoryNames);
  await batchUpdateValues(file.id, [
    { range: 'Accounts!A1', values: [HEADERS.Accounts] },
    { range: 'Categories!A1', values: [HEADERS.Categories, ...rows.map((c) => toRow('Categories', c))] },
    { range: 'Movements!A1', values: [HEADERS.Movements] },
    ...GOAL_SHEETS.map((sheet) => ({ range: `${sheet}!A1`, values: [HEADERS[sheet]] })),
  ]);

  return { fileId: file.id, bookId, name, bookType };
}

export async function readBook(fileId) {
  // All the tabs in one request (the goal tabs added to an older book).
  const [accounts, categories, movements, goals, contributions] = await readWithGoalTabs(fileId, [...SHEET_NAMES, ...GOAL_SHEETS]);
  // A goal tab cut off before its header was written gets it now.
  const headless = GOAL_SHEETS.filter((sheet, i) => [goals, contributions][i].length === 0);
  if (headless.length > 0) await writeHeaders(fileId, headless);
  return {
    accounts: rowsToObjects('Accounts', accounts),
    categories: rowsToObjects('Categories', categories),
    movements: rowsToObjects('Movements', movements),
    goals: goals.length ? rowsToObjects('Goals', goals) : [],
    contributions: contributions.length ? rowsToObjects('Contributions', contributions) : [],
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
  assertValid(errors);
  await append(fileId, 'Accounts', [toRow('Accounts', account)]);
  return account;
}

