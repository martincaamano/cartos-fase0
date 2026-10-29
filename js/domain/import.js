// Importing a whole book from a file (docs/tareas/tarea-16.md): the
// Cartos import format, its validation, the rows it becomes and a summary
// to show before writing anything. Pure: the file is read by the screen and
// written by data/.
//
// Format (version 1):
//   { format: 'cartos-import', version: 1,
//     accounts:   [{ key, name, emoji, initialBalance }],
//     categories: [{ key, name, emoji, kind }],
//     movements:  [{ date, account, type, amount, category, note }
//                | { date, transfer: { from, to }, amount, note }] }
// Keys only link things inside the file; every row gets a new id.
//
// The rows go into a book that may already have some (Ajustes): an account
// or category of the file whose name is already in the book is that one,
// not a new one. An account may say hasInitialBalance: false (a CSV with no
// "saldo inicial" line for it); otherwise its initialBalance must match the
// one in the book.

import { createAccount, validateAccount } from './account.js';
import { createCategory, validateCategory, TRANSFER_CATEGORY_ID } from './category.js';
import { createMovement, isValidDate, MOVEMENT_TYPES } from './movement.js';
import { buildTransfer } from './transfer.js';
import { accountBalance, totalBalance } from './balance.js';
import { hasAtMostTwoDecimals, toCents } from './money.js';
import { activeOnly } from './active.js';

export const IMPORT_FORMAT = 'cartos-import';
export const IMPORT_VERSION = 1;

// Who appears as author of imported rows (createdBy), so they can be told
// apart from the ones saved in the app.
export const IMPORTED_BY = 'import';

const isPositiveAmount = (amount) => typeof amount === 'number' && amount > 0 && hasAtMostTwoDecimals(amount);
const isKey = (key) => typeof key === 'string' && key.trim() !== '';

const EMPTY_BOOK = Object.freeze({ accounts: [], categories: [], movements: [] });

const sameName = (a, b) => String(a ?? '').trim().toLocaleLowerCase('es') === String(b ?? '').trim().toLocaleLowerCase('es');

// The active row of the book with that name, or undefined.
const findByName = (items, name) => activeOnly(items).find((item) => sameName(item.name, name));

// Text of the file → { data } or { errors: [{ at: 'file', code }] }.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { errors: [{ at: 'file', code: 'not_json' }] };
  }
  if (!data || data.format !== IMPORT_FORMAT) return { errors: [{ at: 'file', code: 'not_cartos' }] };
  if (data.version !== IMPORT_VERSION) return { errors: [{ at: 'file', code: 'version_unknown' }] };
  return { data };
}

function validateAccounts(accounts, existing, errors) {
  const keys = new Set();
  const seen = [];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    errors.push({ at: 'accounts', code: 'accounts_missing' });
    return keys;
  }
  accounts.forEach((fields, i) => {
    const at = `accounts[${i}]`;
    if (!isKey(fields?.key) || keys.has(fields.key)) errors.push({ at, code: 'key_invalid' });
    else keys.add(fields.key);
    const account = createAccount(fields ?? {});
    for (const code of validateAccount(account, seen)) errors.push({ at, code });
    seen.push(account);
    const match = findByName(existing, account.name);
    if (match && fields.hasInitialBalance !== false && typeof account.initialBalance === 'number'
      && toCents(account.initialBalance) !== toCents(match.initialBalance)) {
      errors.push({ at, code: 'initial_balance_conflict' });
    }
  });
  return keys;
}

function validateCategories(categories, existing, errors) {
  const kinds = new Map();
  const seen = [];
  if (!Array.isArray(categories)) {
    errors.push({ at: 'categories', code: 'categories_missing' });
    return kinds;
  }
  categories.forEach((fields, i) => {
    const at = `categories[${i}]`;
    const category = createCategory(fields ?? {});
    const match = findByName(existing, category.name);
    if (!isKey(fields?.key) || kinds.has(fields.key) || fields.key === TRANSFER_CATEGORY_ID) {
      errors.push({ at, code: 'key_invalid' });
    } else {
      // A category already in the book keeps its kind.
      kinds.set(fields.key, match ? match.kind : fields.kind);
    }
    if (match?.id === TRANSFER_CATEGORY_ID) errors.push({ at, code: 'category_reserved' });
    for (const code of validateCategory(category, seen)) errors.push({ at, code });
    seen.push(category);
  });
  return kinds;
}

function validateMovementEntry(entry, at, { accountKeys, categoryKinds }, errors) {
  const add = (code) => errors.push({ at, code });
  if (!isValidDate(entry?.date)) add('date_invalid');
  if (!isPositiveAmount(entry?.amount)) add('amount_invalid');
  if (entry?.note !== undefined && typeof entry.note !== 'string') add('note_invalid');
  if (entry?.transfer) {
    const { from, to } = entry.transfer;
    if (!accountKeys.has(from) || !accountKeys.has(to)) add('account_unknown');
    else if (from === to) add('same_account');
    return;
  }
  if (!accountKeys.has(entry?.account)) add('account_unknown');
  if (!MOVEMENT_TYPES.includes(entry?.type)) add('type_invalid');
  const kind = categoryKinds.get(entry?.category);
  if (kind === undefined) add('category_unknown');
  else if (kind !== 'both' && kind !== entry.type) add('category_kind_mismatch');
}

// Returns every problem as { at, code }: at is 'file', 'accounts[i]',
// 'categories[i]' or 'movements[i]' (0-based). Empty means valid.
// book: the rows already there ({ accounts, categories }); none by default.
export function validateImport(data, book = EMPTY_BOOK) {
  const errors = [];
  const accountKeys = validateAccounts(data.accounts, book.accounts, errors);
  const categoryKinds = validateCategories(data.categories, book.categories, errors);
  if (!Array.isArray(data.movements)) {
    errors.push({ at: 'movements', code: 'movements_missing' });
    return errors;
  }
  data.movements.forEach((entry, i) => validateMovementEntry(entry, `movements[${i}]`, { accountKeys, categoryKinds }, errors));
  return errors;
}

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// A valid file (validateImport against the same book) → the rows to add:
// the new accounts and categories and every movement, pointing at the rows
// already in the book where the names match. Rows are stamped a millisecond
// apart, so movements of the same day keep the order of the file.
export function buildImport(data, book = EMPTY_BOOK, deps = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const base = now().getTime();
  let tick = 0;
  const stamp = () => new Date(base + tick++);

  const accountIds = new Map();
  const accounts = [];
  for (const fields of data.accounts) {
    const match = findByName(book.accounts, fields.name);
    const account = match ?? createAccount(fields, { now: stamp, newId });
    if (!match) accounts.push(account);
    accountIds.set(fields.key, account.id);
  }

  const categoryIds = new Map();
  const categories = [];
  for (const fields of data.categories) {
    const match = findByName(book.categories, fields.name);
    const category = match ?? createCategory(fields, { now: stamp, newId });
    if (!match) categories.push(category);
    categoryIds.set(fields.key, category.id);
  }

  const author = { userSub: IMPORTED_BY, newId };
  const movements = data.movements.flatMap((entry) => {
    const shared = { amount: entry.amount, date: entry.date, note: entry.note ?? '' };
    if (entry.transfer) {
      const at = stamp();
      return buildTransfer({
        ...shared,
        fromAccountId: accountIds.get(entry.transfer.from),
        toAccountId: accountIds.get(entry.transfer.to),
      }, { ...author, now: () => at });
    }
    return [createMovement({
      ...shared,
      accountId: accountIds.get(entry.account),
      type: entry.type,
      categoryId: categoryIds.get(entry.category),
    }, { ...author, now: stamp })];
  });

  return { accounts, categories, movements };
}

// How many of the new movements look like one already in the book: same
// day, account, direction and amount. Each one in the book answers for a
// single new one, so two equal coffees on the same day count right.
export function countDuplicates(existing, added) {
  const keyOf = (m) => `${m.date}|${m.accountId}|${m.type}|${toCents(m.amount)}`;
  const left = new Map();
  for (const movement of activeOnly(existing)) left.set(keyOf(movement), (left.get(keyOf(movement)) ?? 0) + 1);
  let count = 0;
  for (const movement of added) {
    const key = keyOf(movement);
    if (left.get(key) > 0) {
      left.set(key, left.get(key) - 1);
      count += 1;
    }
  }
  return count;
}

// What the screen shows before importing: each account with its balance
// once everything is in, the total, how many lines of the file are
// movements and the dates they span.
// accounts and movements: the whole book once imported.
export function summarizeImport({ accounts, movements }, entries) {
  const dates = entries.map((entry) => entry.date).sort();
  return {
    accounts: activeOnly(accounts).map((account) => ({ ...account, balance: accountBalance(account, movements) })),
    total: totalBalance(accounts, movements),
    count: entries.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}
