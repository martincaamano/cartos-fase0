// An in-memory outbox keyed by record id, like the IndexedDB store, shared
// by js/data/movements.js and js/data/goals.js (saves) and js/data/sync.js
// (uploads): what one test queues is what the next sync reads. Entries are
// { fileId, sheet, record }.
import { configureBookItems } from '../../js/data/book-items.js';
import { configureCategoryMove } from '../../js/data/category-move.js';
import { configureGoals } from '../../js/data/goals.js';
import { configureMovements } from '../../js/data/movements.js';
import { configureSync } from '../../js/data/sync.js';

export function memoryOutbox() {
  const items = new Map();
  const add = async ({ fileId, records, sheet = 'Movements' }) => {
    for (const record of records) items.set(record.id, { fileId, sheet, record });
  };
  configureMovements({ add });
  configureGoals({ add });
  configureCategoryMove({ add });
  configureBookItems({ add });
  configureSync({
    list: async () => [...items.values()],
    // Same rule as IndexedDB: only the version that was uploaded is removed.
    remove: async (records) => {
      for (const record of records) {
        if (items.get(record.id)?.record.updatedAt === record.updatedAt) items.delete(record.id);
      }
    },
  });
  return items;
}
