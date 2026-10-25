// Outbox in IndexedDB: a movement is stored here the moment it is saved and
// leaves once it is in the Sheet (js/data/sync.js). Its own database, so its
// schema never collides with the logs. Keyed by movement id: saving the same
// movement twice keeps a single entry. Not tested in Node (no IndexedDB);
// the rules live in outbox-logic.js.

const DB_NAME = 'cartos-outbox';
const DB_VERSION = 1;
const STORE = 'pending';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'movement.id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, work) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

// fileId: the book the movements belong to. Several movements (both halves
// of a transfer) are stored in one transaction: all or none.
export function addPending(fileId, movements) {
  return withStore('readwrite', (store) => {
    for (const movement of movements) store.put({ fileId, movement });
  });
}

// Returns [{ fileId, movement }]. Empty where IndexedDB does not exist.
export async function listPending() {
  if (typeof indexedDB === 'undefined') return [];
  const holder = {};
  await withStore('readonly', (store) => {
    const request = store.getAll();
    request.onsuccess = () => { holder.items = request.result; };
  });
  return holder.items ?? [];
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
