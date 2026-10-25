// Finds and loads the user's personal book, keeping a copy on the device.
// A book without active accounts counts as "none": onboarding then adds the
// first account to it instead of creating a second book.

import { listBooks, pickPersonalBook } from './drive.js';
import { addAccount, createBook, readBook } from './book.js';
import { getCurrentUser } from './auth.js';
import { loadBookCache, saveBookCache } from '../storage/book-cache.js';

const defaults = { storage: () => globalThis.localStorage };
let deps = defaults;

// Lets the tests swap localStorage for a fake.
export function configurePersonalBook(overrides = {}) {
  deps = { ...defaults, ...overrides };
}

const hasActiveAccounts = (book) => book.accounts.some((account) => !account.deleted);

// Device copy only, no network: lets the app paint at once and offline.
export function cachedPersonalBook() {
  const cache = loadBookCache(deps.storage(), getCurrentUser()?.sub);
  if (!cache || !hasActiveAccounts(cache.snapshot)) return null;
  return { status: 'ready', fileId: cache.fileId, book: cache.snapshot, savedAt: cache.savedAt };
}

function remember(fileId, book) {
  saveBookCache(deps.storage(), { sub: getCurrentUser()?.sub, fileId, snapshot: book });
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

// Onboarding: creates the book when there is none yet, adds the first
// account and returns the book ready for the Dashboard.
export async function setUpPersonalBook({ fileId = null, account }) {
  const id = fileId ?? (await createBook()).fileId;
  await addAccount(id, account);
  const book = await readBook(id);
  remember(id, book);
  return { status: 'ready', fileId: id, book };
}
