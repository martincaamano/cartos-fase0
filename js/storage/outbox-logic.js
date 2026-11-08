// Pure rules of the outbox (changes saved on the device, not in the Sheet
// yet). Each entry is { fileId, sheet, record, sub }: the record goes to
// that tab of that book. A record's id is what makes a retry safe: the
// queue holds one version per id (the newest), a new id is appended to the
// Sheet once, and an id already there has its row rewritten, which is
// harmless to repeat.

// The tabs the outbox writes to, in the order a sync uploads them (a goal
// before the contributions to it). Accounts and categories (tareas 29 and
// 30c): edited in Ajustes, offline too; first, so a movement never goes up
// before the account or category it uses.
export const OUTBOX_SHEETS = Object.freeze(['Accounts', 'Categories', 'Movements', 'Goals', 'Contributions']);

// An entry as stored before tarea 25 ({ fileId, movement, sub }) in the
// shape of today's; today's are returned as they are.
export function upgradeEntry(entry) {
  if (entry.record) return entry;
  const { movement, ...rest } = entry;
  return { ...rest, sheet: 'Movements', record: movement };
}

// The records of `sheet` among some entries.
export const recordsOf = (entries, sheet) => entries.filter((entry) => entry.sheet === sheet).map((entry) => entry.record);

// queue, entry: { sheet, record }. One entry per record id, the newest.
export function enqueue(queue, entry) {
  return [...queue.filter((pending) => pending.record.id !== entry.record.id), entry];
}

// queue: the records of one tab. rowById: the rows already in that tab,
// id → row number (rowsById in data/rows.js), read right before writing,
// never remembered. Returns the new records to append and the edited or
// deleted ones to write over their row.
export function planSync(queue, rowById) {
  const latest = new Map();
  for (const record of queue) latest.set(record.id, record);

  const toAppend = [];
  const toUpdate = [];
  for (const record of latest.values()) {
    const row = rowById.get(record.id);
    if (row) toUpdate.push({ record, row });
    else toAppend.push(record);
  }
  return { toAppend, toUpdate };
}

// The records of a tab with the pending versions on top, each id once, so
// every screen counts a change as soon as it is saved.
export function mergePending(records, queue) {
  const latest = new Map();
  for (const record of queue) latest.set(record.id, record);
  const merged = records.map((record) => latest.get(record.id) ?? record);
  const ids = new Set(records.map((record) => record.id));
  for (const record of latest.values()) {
    if (!ids.has(record.id)) merged.push(record);
  }
  return merged;
}

// The entries of the outbox that belong to `sub` (tarea 21): another account
// signed in on the same device neither sees nor uploads them. Entries saved
// before tarea 21 have no sub and belong to whoever is signed in. sub null:
// every entry.
export function ownPending(items, sub) {
  return items.filter((item) => sub === null || !item.sub || item.sub === sub);
}
