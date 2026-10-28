// An in-memory outbox keyed by movement id, like the IndexedDB store, shared
// by js/data/movements.js (saves) and js/data/sync.js (uploads): what one
// test queues is what the next sync reads.
import { configureMovements } from '../../js/data/movements.js';
import { configureSync } from '../../js/data/sync.js';

export function memoryOutbox() {
  const items = new Map();
  configureMovements({
    add: async (fileId, movements) => { for (const movement of movements) items.set(movement.id, { fileId, movement }); },
  });
  configureSync({
    list: async () => [...items.values()],
    // Same rule as IndexedDB: only the version that was uploaded is removed.
    remove: async (movements) => {
      for (const movement of movements) {
        if (items.get(movement.id)?.movement.updatedAt === movement.updatedAt) items.delete(movement.id);
      }
    },
  });
  return items;
}
