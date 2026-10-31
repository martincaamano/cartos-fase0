// Last copy of each book read from Drive, the list of books and the one
// open, kept on the device so the app opens instantly and works offline
// with any book. It never leaves the device. Bound to the user (sub):
// another account never sees it.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.books';
// Before tarea 17 there was a single book under this key; it is converted
// the first time it is read.
const OLD_KEY = 'cartos.book';

const isSnapshot = (snapshot) => Boolean(snapshot)
  && ['accounts', 'categories', 'movements'].every((list) => Array.isArray(snapshot[list]));

// members: the people of a shared book (tarea 18b); a copy saved before
// has none.
const pick = ({ accounts, categories, movements, members }) =>
  ({ accounts, categories, movements, members: Array.isArray(members) ? members : [] });

const empty = (sub) => ({ sub, current: null, books: [], snapshots: {} });

// raw: the stored text → { sub, current, books, snapshots } or null.
export function parseBooksCache(raw, sub) {
  if (!raw || !sub) return null;
  try {
    const data = JSON.parse(raw);
    if (data.sub !== sub || typeof data.snapshots !== 'object' || data.snapshots === null) return null;
    const snapshots = {};
    for (const [fileId, entry] of Object.entries(data.snapshots)) {
      if (isSnapshot(entry?.snapshot)) snapshots[fileId] = { snapshot: pick(entry.snapshot), savedAt: entry.savedAt ?? null };
    }
    return {
      sub,
      current: typeof data.current === 'string' ? data.current : null,
      books: Array.isArray(data.books) ? data.books : [],
      snapshots,
    };
  } catch {
    return null;
  }
}

// The copy of a single book stored before tarea 17, as the new shape.
function parseOldCache(raw, sub) {
  if (!raw || !sub) return null;
  try {
    const data = JSON.parse(raw);
    if (data.sub !== sub || typeof data.fileId !== 'string' || !isSnapshot(data.snapshot)) return null;
    return {
      ...empty(sub),
      current: data.fileId,
      snapshots: { [data.fileId]: { snapshot: pick(data.snapshot), savedAt: data.savedAt ?? null } },
    };
  } catch {
    return null;
  }
}

export function loadBooksCache(storage, sub) {
  try {
    return parseBooksCache(storage.getItem(KEY), sub) ?? parseOldCache(storage.getItem(OLD_KEY), sub);
  } catch {
    return null;
  }
}

function update(storage, sub, change) {
  try {
    const cache = loadBooksCache(storage, sub) ?? empty(sub);
    storage.setItem(KEY, JSON.stringify(change(cache)));
    storage.removeItem(OLD_KEY);
  } catch (err) {
    console.warn('Book cache write failed', err);
  }
}

// The copy of one book: { fileId, snapshot, savedAt } or null. Without
// fileId, the book open.
export function loadBookCache(storage, sub, fileId = null) {
  const cache = loadBooksCache(storage, sub);
  const id = fileId ?? cache?.current;
  const entry = id ? cache?.snapshots[id] : null;
  return entry ? { fileId: id, ...entry } : null;
}

export function saveBookCache(storage, { sub, fileId, snapshot }, now = new Date()) {
  update(storage, sub, (cache) => ({
    ...cache,
    snapshots: { ...cache.snapshots, [fileId]: { snapshot: pick(snapshot), savedAt: now.toISOString() } },
  }));
}

// books: [{ fileId, name, bookType, isPersonal }]. Copies of books no
// longer listed are dropped.
export function saveBookList(storage, { sub, books }) {
  update(storage, sub, (cache) => ({
    ...cache,
    books,
    snapshots: Object.fromEntries(Object.entries(cache.snapshots)
      .filter(([fileId]) => books.some((book) => book.fileId === fileId))),
  }));
}

export function saveCurrentBook(storage, { sub, fileId }) {
  update(storage, sub, (cache) => ({ ...cache, current: fileId }));
}

export function clearBookCache(storage) {
  try {
    storage.removeItem(KEY);
    storage.removeItem(OLD_KEY);
  } catch (err) {
    console.warn('Book cache clear failed', err);
  }
}
