// Finds and loads the user's personal book, keeping a copy on the device.
// A book without active accounts counts as "none": onboarding then adds the
// first account to it instead of creating a second book.

import { listBooks, pickPersonalBook } from './drive.js';
import { es } from '../../i18n/es.js';
import { addAccount, appendBookRows, createBook, readBook, writeBookRows } from './book.js';
import { ValidationError } from './errors.js';
import { currentUserSub } from './auth.js';
import { loadBookCache, saveBookCache } from '../storage/book-cache.js';
import { isActive } from '../domain/active.js';
import { buildDefaultCategories, TRANSFER_CATEGORY_ID } from '../domain/category.js';
import { buildImport, validateImport } from '../domain/import.js';

const defaults = { storage: () => globalThis.localStorage };
let deps = defaults;

// Lets the tests swap localStorage for a fake.
export function configurePersonalBook(overrides = {}) {
  deps = { ...defaults, ...overrides };
}

const hasActiveAccounts = (book) => book.accounts.some(isActive);

// Device copy only, no network: lets the app paint at once and offline.
export function cachedPersonalBook() {
  const cache = loadBookCache(deps.storage(), currentUserSub());
  if (!cache || !hasActiveAccounts(cache.snapshot)) return null;
  return { status: 'ready', fileId: cache.fileId, book: cache.snapshot, savedAt: cache.savedAt };
}

function remember(fileId, book) {
  saveBookCache(deps.storage(), { sub: currentUserSub(), fileId, snapshot: book });
}

// Reads the personal book from Drive and refreshes the device copy.
// Returns { status: 'ready', fileId, book } or { status: 'none', fileId }.
export async function fetchPersonalBook() {
  const file = pickPersonalBook(await listBooks());
  if (!file) return { status: 'none', fileId: null };
  const book = await readBook(file.id);
  remember(file.id, book);
  return hasActiveAccounts(book) ? { status: 'ready', fileId: file.id, book } : { status: 'none', fileId: file.id };
}

// Reads again a book already found, by its file: no Drive search. Used after
// a sync or a change in Ajustes; the search (fetchPersonalBook) stays for
// opening the app, coming back to it and signing in.
export async function reloadPersonalBook(fileId) {
  const book = await readBook(fileId);
  remember(fileId, book);
  return hasActiveAccounts(book) ? { status: 'ready', fileId, book } : { status: 'none', fileId };
}

// Onboarding: creates the book when there is none yet, adds the first
// account and returns the book ready for the Dashboard.
export async function setUpPersonalBook({ fileId = null, account }) {
  const id = fileId ?? (await createBook()).fileId;
  await addAccount(id, account);
  const book = await readBook(id);
  remember(id, book);
  return { status: 'ready', fileId: id, book };
}

// What an import into a new book starts from: only Transferencia, named by
// i18n. The importer checks the file against it.
export function startingBook() {
  const transfer = buildDefaultCategories(es.categories).find((c) => c.id === TRANSFER_CATEGORY_ID);
  return { accounts: [], categories: [transfer], movements: [] };
}

// Onboarding, from a file (domain/import.js, already validated): creates the
// book when there is none, writes everything in it and returns it ready.
// With fileId (an empty book from an earlier try) it is written over.
export async function importPersonalBook({ fileId = null, data }) {
  const base = startingBook();
  const rows = buildImport(data, base);
  const id = fileId ?? (await createBook({ categories: [] })).fileId;
  await writeBookRows(id, { ...rows, categories: [...rows.categories, ...base.categories] });
  const book = await readBook(id);
  remember(id, book);
  return { status: 'ready', fileId: id, book };
}

// Ajustes, from a file: adds its movements (and any new account or
// category) to the book. The book is read again first, so the names are
// matched against what is in the Sheet now.
export async function importIntoPersonalBook(fileId, data) {
  const current = await readBook(fileId);
  const errors = validateImport(data, current);
  if (errors.length) throw new ValidationError(errors.map((error) => error.code));
  await appendBookRows(fileId, buildImport(data, current));
  const book = await readBook(fileId);
  remember(fileId, book);
  return { status: 'ready', fileId, book };
}
