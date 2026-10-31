// Outbox in IndexedDB: a movement is stored here the moment it is saved
// (js/data/movements.js) and leaves once it is in the Sheet
// (js/data/sync.js). Its own database, so its schema never collides with
// the logs. Keyed by movement id: saving the same
// movement twice keeps a single entry. Not tested in Node (no IndexedDB);
// the rules live in outbox-logic.js.

import { ownPending } from './outbox-logic.js';
import { openDb, txDone } from './idb.js';

const DB_NAME = 'cartos-outbox';
const DB_VERSION = 1;
const STORE = 'pending';

async function withStore(mode, work) {
  const db = await openDb(DB_NAME, DB_VERSION, (created) => created.createObjectStore(STORE, { keyPath: 'movement.id' }));
  try {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

// fileId: the book the movements belong to. Several movements (both halves
// of a transfer) are stored in one transaction: all or none. sub: who saved
// them, so another account signed in on the same device never uploads them.
export function addPending(fileId, movements, sub = '') {
  return addPendingAcross(movements.map((movement) => ({ fileId, movement })), sub);
}

// items: [{ fileId, movement }] in several books (the halves of a transfer
// to another book), in one transaction.
export function addPendingAcross(items, sub = '') {
  return withStore('readwrite', (store) => {
    for (const { fileId, movement } of items) store.put({ fileId, movement, sub });
  });
}

// Returns [{ fileId, movement, sub }] of the user `sub` (entries saved
// before tarea 21 have no sub and count for anyone). Empty where IndexedDB
// does not exist.
export async function listPending(sub = null) {
  if (typeof indexedDB === 'undefined') return [];
  const holder = {};
  await withStore('readonly', (store) => {
    const request = store.getAll();
    request.onsuccess = () => { holder.items = request.result; };
  });
  return ownPending(holder.items ?? [], sub);
}

// movements: the versions just uploaded. One that was edited again in the
// meantime (another updatedAt) stays queued for the next sync.
export function removePending(movements) {
  if (movements.length === 0) return Promise.resolve();
  return withStore('readwrite', (store) => {
    for (const movement of movements) {
      const request = store.get(movement.id);
      request.onsuccess = () => {
        if (request.result?.movement.updatedAt === movement.updatedAt) store.delete(movement.id);
      };
    }
  });
}
