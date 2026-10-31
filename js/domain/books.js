// The books of a user (architecture §4): each one a Sheet in Drive, found
// by its appProperties. The personal book is the oldest one with
// bookType=personal; the others (Casa do medio...) are shared books.

const FILE_PREFIX = 'Cartos · ';

// The longest book name.
export const BOOK_NAME_MAX = 40;

// Name of the file in Drive for a book called `name`.
export const bookFileName = (name) => `${FILE_PREFIX}${name}`;

// A Drive file → { fileId, name, bookType, createdTime, canShare }.
// canShare is false for someone the book was shared with (tarea 18).
export function bookOf(file) {
  const fallback = String(file.name ?? '').replace(FILE_PREFIX, '');
  return {
    fileId: file.id,
    name: String(file.appProperties?.name ?? fallback).trim() || fallback,
    bookType: file.appProperties?.bookType === 'personal' ? 'personal' : 'shared',
    createdTime: String(file.createdTime ?? ''),
    canShare: file.capabilities?.canShare !== false,
  };
}

const byName = (a, b) => a.name.localeCompare(b.name, 'es');

// Drive files → books: the personal one first (the oldest, so a duplicate
// made by mistake never replaces it), then the rest by name.
export function orderBooks(files) {
  const books = files.map(bookOf).sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  const personal = books.find((book) => book.bookType === 'personal') ?? null;
  const others = books.filter((book) => book !== personal).sort(byName);
  return personal ? [{ ...personal, isPersonal: true }, ...others] : others;
}

// The list once `book` (just created) is in it, in the same order.
export function addBook(books, book) {
  const personal = books.filter((item) => item.isPersonal);
  const others = [...books.filter((item) => !item.isPersonal), book].sort(byName);
  return [...personal, ...others];
}

export const personalBookOf = (books) => books.find((book) => book.isPersonal) ?? null;

// The book to open: the one opened last when it still exists, the
// personal one otherwise.
export function chooseBook(books, lastFileId) {
  return books.find((book) => book.fileId === lastFileId) ?? personalBookOf(books) ?? books[0] ?? null;
}

const sameName = (a, b) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

// Error codes for a book name; empty means valid. books: the user's books
// (the one being renamed, `fileId`, is left out).
export function validateBookName(name, books = [], fileId = null) {
  const value = String(name ?? '').trim();
  if (!value) return ['name_required'];
  if (value.length > BOOK_NAME_MAX) return ['name_too_long'];
  if (books.some((book) => book.fileId !== fileId && sameName(book.name, value))) return ['name_taken'];
  return [];
}
