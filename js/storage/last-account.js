// The account used last in each book, so Añadir starts with it (tarea 20).
// Kept on the device; only ids.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.lastAccount';

function read(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// → the account id, or null.
export function loadLastAccount(storage, fileId) {
  const id = read(storage)[fileId];
  return typeof id === 'string' ? id : null;
}

export function saveLastAccount(storage, fileId, accountId) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...read(storage), [fileId]: accountId }));
  } catch (err) {
    console.warn('Last account write failed', err);
  }
}
