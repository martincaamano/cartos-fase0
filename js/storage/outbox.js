// Outbox in IndexedDB: a change is stored here the moment it is saved
// (js/data/movements.js, js/data/goals.js) and leaves once it is in the
// Sheet (js/data/sync.js). Its own database, so its schema never collides
// with the logs. Each entry is { fileId, sheet, record, sub }, keyed by the
// record's id: saving the same record twice keeps a single entry. Not
// tested in Node (no IndexedDB); the rules live in outbox-logic.js.

import { ownPending, upgradeEntry } from './outbox-logic.js';
import { openDb, txDone } from './idb.js';

const DB_NAME = 'cartos-outbox';
// 1: movements only, in the store `pending` keyed by movement.id. 2 (tarea
// 25): any tab, in the store `entries`; what version 1 held is moved there
// when the database is first opened as version 2.
const DB_VERSION = 2;
const STORE = 'entries';
const OLD_STORE = 'pending';

function upgrade(db, tx) {
  const entries = db.objectStoreNames.contains(STORE) ? tx.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'record.id' });
  if (!db.objectStoreNames.contains(OLD_STORE)) return;
  const request = tx.objectStore(OLD_STORE).getAll();
  request.onsuccess = () => {
    for (const entry of request.result) entries.put(upgradeEntry(entry));
    db.deleteObjectStore(OLD_STORE);
  };
}

async function withStore(mode, work) {
  const db = await openDb(DB_NAME, DB_VERSION, upgrade);
  try {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

// records: of the tab `sheet` of the book `fileId`; several (both halves of
// a transfer) are stored in one transaction: all or none. sub: who saved
// them, so another account signed in on the same device never uploads them.
export function addPending(fileId, records, sub = '', sheet = 'Movements') {
  return addPendingAcross(records.map((record) => ({ fileId, sheet, record })), sub);
}

// items: [{ fileId, sheet, record }], maybe in several books or tabs (the
// halves of a transfer to another book; a purchase and the goal it
// completes), in one transaction.
export function addPendingAcross(items, sub = '') {
  return withStore('readwrite', (store) => {
    for (const { fileId, sheet = 'Movements', record } of items) store.put({ fileId, sheet, record, sub });
  });
}

// Returns [{ fileId, sheet, record, sub }] of the user `sub` (entries saved
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

// records: the versions just uploaded. One that was edited again in the
// meantime (another updatedAt) stays queued for the next sync.
export function removePending(records) {
  if (records.length === 0) return Promise.resolve();
  return withStore('readwrite', (store) => {
    for (const record of records) {
      const request = store.get(record.id);
      request.onsuccess = () => {
        if (request.result?.record.updatedAt === record.updatedAt) store.delete(record.id);
      };
    }
  });
}
