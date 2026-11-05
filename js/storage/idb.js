// What the outbox and the logs share about IndexedDB: opening a database
// (creating its store on the first open) and waiting for a transaction to
// end. Not tested in Node (no IndexedDB).

// upgrade(db, tx, oldVersion): creates the stores the first time, or
// changes them when the version grows (tx: the upgrade's transaction).
export function openDb(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(request.result, request.transaction, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Resolves when the transaction is stored, rejects when it fails or aborts.
export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
