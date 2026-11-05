// What the app knows about the books (the one open and the list) and the
// outbox, and the cycle that keeps them fresh: paint from the device copy at
// once, read Drive, upload the outbox of every book, read again. No DOM: it tells the app what happened
// through events, and app.js decides what to show.
//
// Events: 'route' (the screen to show may have changed: re-decide it),
// 'data' (fresh data for the screen on view), 'loadFailed' (no book and
// Drive could not be read).

import { TokenExpiredError } from './data/auth.js';
import { ApiError } from './data/errors.js';
import { enqueue, mergePending, recordsOf } from './storage/outbox-logic.js';

const UNKNOWN = Object.freeze({ status: 'unknown', fileId: null, book: null });

// deps: { cachedBooks, fetchBooks, reloadBook, openBook, syncOutbox, listPending,
// getAuthState, isOnline, logEvent }. app.js passes the real ones; the tests
// pass fakes.
export function createBookState(deps) {
  // The book open: unknown, none (no personal book with accounts) or ready.
  let current = UNKNOWN;
  // The user's books (domain/books.js), the personal one first.
  let books = [];
  // Changes of the book open saved on the device, not in the Sheet yet:
  // [{ sheet, record }], one per record id.
  let pending = [];
  let fetching = false;
  // Grows each time another book is opened: a Drive read that started
  // before is then stale.
  let switches = 0;
  // Grows on sign out: a Drive read that started before belongs to someone
  // else and is dropped.
  let generation = 0;
  // Books whose outbox Drive refuses (403/404: access removed, file gone).
  const blocked = new Set();
  // Movements waiting in those books.
  let blockedCount = 0;
  const listeners = new Set();
  const emit = (event) => { for (const listener of listeners) listener(event); };

  const canReachDrive = () => {
    const { hasSession, hasDriveAccess, tokenExpired } = deps.getAuthState();
    return hasSession && hasDriveAccess && !tokenExpired && deps.isOnline();
  };

  async function loadPending() {
    try {
      pending = (await deps.listPending())
        .filter((item) => item.fileId === current.fileId)
        .map(({ sheet, record }) => ({ sheet, record }));
    } catch (err) {
      console.warn('Outbox read failed', err);
    }
  }

  // Reads the book again by its file (after a sync or a change in Ajustes),
  // without searching Drive for it.
  async function reloadBook() {
    if (!canReachDrive() || !current.fileId) return;
    const { fileId } = current;
    try {
      const fresh = await deps.reloadBook(fileId);
      // Another book was opened meanwhile: this one is not on view.
      if (current.fileId !== fileId) return;
      current = fresh;
      await loadPending();
      emit('data');
    } catch (err) {
      if (err instanceof TokenExpiredError) emit('route');
      else console.warn('Book reload failed', err);
    }
  }

  const logSyncError = (err) => {
    // Only the error name and code: never the data being synced.
    deps.logEvent({ type: 'error', result: `sync:${err?.name ?? 'Error'}${err?.status ? `:${err.status}` : ''}` });
    console.warn('Sync failed', err);
  };

  // Uploads the outbox of every book with changes waiting, then reads the
  // book open again if any of them were its own, so the Sheet is the truth.
  // A book that fails does not stop the others.
  async function sync() {
    if (current.status !== 'ready' || !canReachDrive()) return;
    try {
      const queued = await deps.listPending();
      const fileIds = new Set(queued.map((item) => item.fileId));
      let changed = false;
      for (const fileId of fileIds) {
        try {
          const { appended, updated } = await deps.syncOutbox(fileId);
          blocked.delete(fileId);
          if (fileId === current.fileId && appended + updated > 0) changed = true;
        } catch (err) {
          if (err instanceof TokenExpiredError) throw err;
          if (err instanceof ApiError && (err.status === 403 || err.status === 404)) blocked.add(fileId);
          logSyncError(err);
        }
      }
      blockedCount = queued.filter((item) => blocked.has(item.fileId)).length;
      await loadPending();
      if (changed) await reloadBook();
      else emit('data');
    } catch (err) {
      if (err instanceof TokenExpiredError) emit('route');
      else logSyncError(err);
    }
  }

  // Paints from the device copy at once, then reads Drive and syncs when it can.
  async function refresh() {
    if (current.status === 'unknown') {
      const cached = deps.cachedBooks();
      if (cached) ({ books, ...current } = cached);
      if (current.status === 'ready') await loadPending();
    }
    emit('route');

    if (!canReachDrive() || fetching) return;
    fetching = true;
    const started = switches;
    const mine = generation;
    try {
      const fresh = await deps.fetchBooks();
      if (mine !== generation) return;
      books = fresh.books;
      // Another book was opened meanwhile: keep it, only the list is new.
      if (started === switches) {
        ({ books, ...current } = fresh);
      }
      await loadPending();
      emit('data');
      await sync();
    } catch (err) {
      if (mine !== generation) return;
      if (err instanceof TokenExpiredError) emit('route');
      else if (current.status !== 'ready') emit('loadFailed');
    } finally {
      if (mine === generation) fetching = false;
    }
  }

  return {
    on: (listener) => listeners.add(listener),
    get status() { return current.status; },
    get fileId() { return current.fileId; },
    get books() { return books; },
    // The entry of the book open in `books` (its name), or null.
    get bookInfo() { return books.find((book) => book.fileId === current.fileId) ?? null; },
    // The book as read from Drive, without the pending changes.
    get savedBook() { return current.book; },
    // The book with the pending changes on top, as every screen shows it.
    get book() {
      const merged = (sheet, records = []) => mergePending(records, recordsOf(pending, sheet));
      return {
        ...current.book,
        movements: merged('Movements', current.book.movements),
        goals: merged('Goals', current.book.goals),
        contributions: merged('Contributions', current.book.contributions),
      };
    },
    get pendingCount() { return pending.length; },
    // Their ids, to mark them on screen.
    get pendingIds() { return new Set(pending.map(({ record }) => record.id)); },
    // Movements that cannot be uploaded: their book refuses them (403/404).
    get blockedCount() { return blockedCount; },
    refresh,
    reloadBook,
    sync,
    // What was saved (a movement, both halves of a transfer, a goal or a
    // contribution: records of the tab `sheet`) is counted at once; the
    // upload follows.
    saved(records, sheet = 'Movements') {
      for (const record of [records].flat()) pending = enqueue(pending, { sheet, record });
      sync();
    },
    // Onboarding created the personal book, or Ajustes → Libros a new one
    // (with the new list of books).
    setUp(result) {
      const { books: list, ...book } = result;
      if (list) books = list;
      current = book;
      emit('route');
    },
    // Ajustes → Libros: another book is open now. Its device copy shows at
    // once when there is one; then it is read from Drive.
    async switchBook(fileId) {
      if (fileId === current.fileId) return;
      switches += 1;
      current = deps.openBook(fileId) ?? { status: 'unknown', fileId, book: null };
      await loadPending();
      emit('route');
      await reloadBook();
      emit('route');
    },
    // Ajustes → Libros renamed a book.
    renamed(list) {
      books = list;
      emit('data');
    },
    // Signed out, or signed in as someone else: forget everything in memory.
    reset() {
      generation += 1;
      fetching = false;
      current = UNKNOWN;
      books = [];
      pending = [];
      blocked.clear();
      blockedCount = 0;
    },
  };
}
