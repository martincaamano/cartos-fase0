// Diagnostic logs kept on the device (architecture §9). Best effort: iOS may
// wipe IndexedDB under storage pressure, and a failed write never breaks the app.
//
// The pure part (building entries) is separate from the IndexedDB part, which
// only runs when called, so this module can be imported from Node.

import { openDb, txDone } from './idb.js';

export const MAX_LOGS = 500;

export const LOG_TYPES = Object.freeze(['login', 'token', 'sync', 'api', 'error']);

// Only these fields ever reach storage. Anything else the caller passes
// (amounts, notes, category names...) is dropped on purpose.
export function buildLogEntry({ type, result, durationMs = null, ref = null }, now = new Date()) {
  if (!LOG_TYPES.includes(type)) throw new Error(`Unknown log type: ${type}`);
  return {
    at: now.toISOString(),
    type,
    result: String(result),
    durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    // An id (movement, account, file), never free text.
    ref: typeof ref === 'string' ? ref : null,
  };
}

export function countToDrop(total, max = MAX_LOGS) {
  return Math.max(0, total - max);
}

const DB_NAME = 'cartos';
const DB_VERSION = 1;
const STORE = 'logs';

const open = () => openDb(DB_NAME, DB_VERSION, (db) => db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true }));

async function addEntry(entry) {
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.add(entry);
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let toDrop = countToDrop(countRequest.result);
      if (toDrop === 0) return;
      // Keys grow with every insert, so the cursor starts at the oldest entry.
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || toDrop === 0) return;
        cursor.delete();
        toDrop -= 1;
        cursor.continue();
      };
    };
    await txDone(tx);
  } finally {
    db.close();
  }
}

const defaults = { write: addEntry };
let sink = defaults;

// Lets the tests capture the entries instead of writing to IndexedDB.
export function configureLogs(overrides = {}) {
  sink = { ...defaults, ...overrides };
}

export async function logEvent(fields) {
  try {
    const entry = buildLogEntry(fields);
    if (sink.write === addEntry && typeof indexedDB === 'undefined') return;
    await sink.write(entry);
  } catch (err) {
    console.warn('Log write failed', err);
  }
}

export async function readLogs() {
  const db = await open();
  try {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
