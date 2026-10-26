// What the app knows about the personal book and the outbox, and the cycle
// that keeps them fresh: paint from the device copy at once, read Drive,
// upload the outbox, read again. No DOM: it tells the app what happened
// through events, and app.js decides what to show.
//
// Events: 'route' (the screen to show may have changed: re-decide it),
// 'data' (fresh data for the screen on view), 'loadFailed' (no book and
// Drive could not be read).

import { TokenExpiredError } from './data/auth.js';
import { enqueue, mergePending } from './storage/outbox-logic.js';

const UNKNOWN = Object.freeze({ status: 'unknown', fileId: null, book: null });

// deps: { cachedPersonalBook, fetchPersonalBook, syncOutbox, listPending,
// getAuthState, isOnline, logEvent }. app.js passes the real ones; the tests
// pass fakes.
export function createBookState(deps) {
  // unknown, none (no personal book with accounts) or ready.
  let personal = UNKNOWN;
  // Movements of the personal book saved on the device, not in the Sheet yet.
  let pending = [];
  let fetching = false;
  const listeners = new Set();
  const emit = (event) => { for (const listener of listeners) listener(event); };

  const canReachDrive = () => {
    const { hasSession, hasDriveAccess, tokenExpired } = deps.getAuthState();
    return hasSession && hasDriveAccess && !tokenExpired && deps.isOnline();
  };

  async function loadPending() {
    try {
      pending = (await deps.listPending())
        .filter((item) => item.fileId === personal.fileId)
        .map((item) => item.movement);
    } catch (err) {
      console.warn('Outbox read failed', err);
    }
  }

  // Reads the book again from Drive (after a sync or a change in Ajustes).
  async function reloadBook() {
    if (!canReachDrive()) return;
    try {
      personal = await deps.fetchPersonalBook();
      await loadPending();
      emit('data');
    } catch (err) {
      if (err instanceof TokenExpiredError) emit('route');
      else console.warn('Book reload failed', err);
    }
  }

  // Uploads the outbox, then reads the book so the Sheet is the truth.
  async function sync() {
    if (personal.status !== 'ready' || !canReachDrive()) return;
    try {
      const { appended, updated } = await deps.syncOutbox(personal.fileId);
      await loadPending();
      if (appended + updated > 0) await reloadBook();
      else emit('data');
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        emit('route');
      } else {
        // Only the error name and code: never the data being synced.
        deps.logEvent({ type: 'error', result: `sync:${err?.name ?? 'Error'}${err?.status ? `:${err.status}` : ''}` });
        console.warn('Sync failed', err);
      }
    }
  }

  // Paints from the device copy at once, then reads Drive and syncs when it can.
  async function refresh() {
    if (personal.status === 'unknown') {
      personal = deps.cachedPersonalBook() ?? UNKNOWN;
      if (personal.status === 'ready') await loadPending();
    }
    emit('route');

    if (!canReachDrive() || fetching) return;
    fetching = true;
    try {
      personal = await deps.fetchPersonalBook();
      await loadPending();
      emit('data');
      await sync();
    } catch (err) {
      if (err instanceof TokenExpiredError) emit('route');
      else if (personal.status !== 'ready') emit('loadFailed');
    } finally {
      fetching = false;
    }
  }

  return {
    on: (listener) => listeners.add(listener),
    get status() { return personal.status; },
    get fileId() { return personal.fileId; },
    // The book as read from Drive, without the pending changes.
    get savedBook() { return personal.book; },
    // The book with the pending changes on top, as every screen shows it.
    get book() {
      return { ...personal.book, movements: mergePending(personal.book.movements, pending) };
    },
    get pendingCount() { return pending.length; },
    refresh,
    reloadBook,
    sync,
    // What the Add form saved (a movement or both halves of a transfer) is
    // counted at once; the upload follows.
    saved(movements) {
      for (const movement of [movements].flat()) pending = enqueue(pending, movement);
      sync();
    },
    // Onboarding created the book.
    setUp(result) {
      personal = result;
      emit('route');
    },
    // Signed out, or signed in as someone else: forget everything in memory.
    reset() {
      personal = UNKNOWN;
      pending = [];
    },
  };
}
