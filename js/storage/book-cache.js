// Last copy of the personal book read from Drive, kept on the device so the
// Dashboard opens instantly and works offline. It never leaves the device.
// Bound to the user (sub): another account never sees it.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.book';

export function parseBookCache(raw, sub) {
  if (!raw || !sub) return null;
  try {
    const data = JSON.parse(raw);
    if (data.sub !== sub || typeof data.fileId !== 'string' || !data.snapshot) return null;
    const { accounts, categories, movements } = data.snapshot;
    if (![accounts, categories, movements].every(Array.isArray)) return null;
    return { fileId: data.fileId, snapshot: { accounts, categories, movements }, savedAt: data.savedAt ?? null };
  } catch {
    return null;
  }
}

export function loadBookCache(storage, sub) {
  try {
    return parseBookCache(storage.getItem(KEY), sub);
  } catch {
    return null;
  }
}

export function saveBookCache(storage, { sub, fileId, snapshot }, now = new Date()) {
  try {
    storage.setItem(KEY, JSON.stringify({ sub, fileId, snapshot, savedAt: now.toISOString() }));
  } catch (err) {
    console.warn('Book cache write failed', err);
  }
}

export function clearBookCache(storage) {
  try {
    storage.removeItem(KEY);
  } catch (err) {
    console.warn('Book cache clear failed', err);
  }
}
