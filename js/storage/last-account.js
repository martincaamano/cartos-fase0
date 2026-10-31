// The account used last in each book, so Añadir starts with it (tarea 20).
// Kept on the device; only ids.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

import { readMap, writeEntry } from './json-map.js';

const KEY = 'cartos.lastAccount';

// → the account id, or null.
export function loadLastAccount(storage, fileId) {
  const id = readMap(storage, KEY)[fileId];
  return typeof id === 'string' ? id : null;
}

export function saveLastAccount(storage, fileId, accountId) {
  writeEntry(storage, KEY, fileId, accountId);
}
