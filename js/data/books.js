// Finds the user's books (one Drive search), loads the one open and keeps a
// copy of each on the device. The personal book without active accounts
// counts as "none": onboarding then adds the first account to it instead of
// creating a second file.
//
// Every function that loads a book returns
// { status: 'ready' | 'none', fileId, book, books? }; books is the list of
// the user's books (domain/books.js) when it was read too.

import { getFile, listBooks, renameFile } from './drive.js';
import { es } from '../../i18n/es.js';
import { addAccount, appendBookRows, createBook, readBook, writeBookRows } from './book.js';
import { currentUserSub } from './auth.js';
import { joinBook } from './members.js';
import { ValidationError } from './errors.js';
import {
  loadBookCache, loadBooksCache, saveBookCache, saveBookList, saveCurrentBook,
} from '../storage/book-cache.js';
import { isActive } from '../domain/active.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { addBook, bookFileName, bookOf, chooseBook, orderBooks, validateBookName } from '../domain/books.js';
import { isSharedBookFile } from '../domain/members.js';
import { buildDefaultCategories, TRANSFER_CATEGORY_ID } from '../domain/category.js';
import { buildImport, validateImport } from '../domain/import.js';

const defaults = { storage: () => globalThis.localStorage };
let deps = defaults;

// Lets the tests swap localStorage for a fake.
export function configureBooks(overrides = {}) {
  deps = { ...defaults, ...overrides };
}

const sub = () => currentUserSub();
const hasActiveAccounts = (book) => book.accounts.some(isActive);
const statusOf = (book) => (hasActiveAccounts(book) ? 'ready' : 'none');

function remember(fileId, book) {
  saveBookCache(deps.storage(), { sub: sub(), fileId, snapshot: book });
}

function open(fileId) {
  saveCurrentBook(deps.storage(), { sub: sub(), fileId });
}

// Device copy only, no network: lets the app paint at once and offline.
export function cachedBooks() {
  const cache = loadBooksCache(deps.storage(), sub());
  const copy = loadBookCache(deps.storage(), sub());
  if (!copy || !hasActiveAccounts(copy.snapshot)) return null;
  return { status: 'ready', fileId: copy.fileId, book: copy.snapshot, books: cache.books, savedAt: copy.savedAt };
}

// The device copy of any book (its accounts and categories for a transfer
// to another book), or null.
export function cachedBook(fileId) {
  return loadBookCache(deps.storage(), sub(), fileId)?.snapshot ?? null;
}

// Searches Drive for the books, reads the one to open (the last one open,
// or the personal one) and refreshes the device copies.
export async function fetchBooks() {
  const books = orderBooks(await listBooks());
  saveBookList(deps.storage(), { sub: sub(), books });
  const chosen = chooseBook(books, loadBooksCache(deps.storage(), sub())?.current);
  if (!chosen) return { status: 'none', fileId: null, book: null, books };
  const book = await readBook(chosen.fileId);
  remember(chosen.fileId, book);
  open(chosen.fileId);
  return { status: statusOf(book), fileId: chosen.fileId, book, books };
}

// Reads again a book already found, by its file: no Drive search. Used after
// a sync, a change in Ajustes or switching books.
export async function reloadBook(fileId) {
  const book = await readBook(fileId);
  remember(fileId, book);
  return { status: statusOf(book), fileId, book };
}

// Ajustes → Libros: opens another book. Returns its device copy at once
// when there is one (null otherwise); reloadBook follows.
export function openBook(fileId) {
  open(fileId);
  const book = cachedBook(fileId);
  return book ? { status: statusOf(book), fileId, book } : null;
}

// Ajustes → Libros: a new book (a shared one, shared in tarea 18) with its
// first account, opened at once. books: the user's books, to reject a
// repeated name.
export async function createNewBook({ name, account }, books) {
  // Both checked before anything is created in Drive.
  const errors = [...validateBookName(name, books), ...validateAccount(createAccount(account))];
  if (errors.length) throw new ValidationError(errors);
  const created = await createBook({ name: name.trim(), bookType: 'shared' });
  await addAccount(created.fileId, account);
  const book = await readBook(created.fileId);
  const ordered = addBook(books, { fileId: created.fileId, name: created.name, bookType: 'shared', createdTime: '' });
  saveBookList(deps.storage(), { sub: sub(), books: ordered });
  remember(created.fileId, book);
  open(created.fileId);
  return { status: 'ready', fileId: created.fileId, book, books: ordered };
}

// Ajustes → Libros → «Abrir un libro compartido conmigo»: the file picked
// in the Picker (data/picker.js) becomes one of the user's books, opened at
// once. Only a shared Cartos book is accepted. The signed-in person joins
// it (tab Members).
export async function openSharedBook(fileId, books) {
  const file = await getFile(fileId);
  if (!isSharedBookFile(file)) throw new ValidationError(['not_shared_book']);
  await joinBook(fileId);
  const book = await readBook(fileId);
  const list = addBook(books.filter((item) => item.fileId !== fileId), bookOf(file));
  saveBookList(deps.storage(), { sub: sub(), books: list });
  remember(fileId, book);
  open(fileId);
  return { status: statusOf(book), fileId, book, books: list };
}

// Ajustes → Libros: renames a book (its file in Drive too). Returns the
// list of books with the new name.
export async function renameBook(fileId, name, books) {
  const errors = validateBookName(name, books, fileId);
  if (errors.length) throw new ValidationError(errors);
  const value = name.trim();
  await renameFile(fileId, bookFileName(value), value);
  const renamed = books.map((book) => (book.fileId === fileId ? { ...book, name: value } : book));
  saveBookList(deps.storage(), { sub: sub(), books: renamed });
  return renamed;
}

// Onboarding: creates the personal book when there is none yet, adds the
// first account and returns the book ready for the Dashboard.
export async function setUpPersonalBook({ fileId = null, account }) {
  const id = fileId ?? (await createBook()).fileId;
  await addAccount(id, account);
  const book = await readBook(id);
  remember(id, book);
  open(id);
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
  open(id);
  return { status: 'ready', fileId: id, book };
}

// Ajustes, from a file: adds its movements (and any new account or
// category) to the book open. The book is read again first, so the names
// are matched against what is in the Sheet now.
export async function importIntoBook(fileId, data) {
  const current = await readBook(fileId);
  const errors = validateImport(data, current);
  if (errors.length) throw new ValidationError(errors.map((error) => error.code));
  await appendBookRows(fileId, buildImport(data, current));
  const book = await readBook(fileId);
  remember(fileId, book);
  return { status: 'ready', fileId, book };
}
