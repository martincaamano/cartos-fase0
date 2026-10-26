// Pure rules of the outbox (movements saved on the device, not in the Sheet
// yet). A movement's id is what makes a retry safe: the queue holds one
// version per id (the newest), a new id is appended to the Sheet once, and
// an id already there has its row rewritten, which is harmless to repeat.

export function enqueue(queue, movement) {
  return [...queue.filter((pending) => pending.id !== movement.id), movement];
}

// rowById: the Movements rows already in the Sheet, id → row number
// (rowsById in data/rows.js), read right before writing, never remembered.
// Returns the new movements to append and the edited or deleted ones to
// write over their row.
export function planSync(queue, rowById) {
  const latest = new Map();
  for (const movement of queue) latest.set(movement.id, movement);

  const toAppend = [];
  const toUpdate = [];
  for (const movement of latest.values()) {
    const row = rowById.get(movement.id);
    if (row) toUpdate.push({ movement, row });
    else toAppend.push(movement);
  }
  return { toAppend, toUpdate };
}

// The book's movements with the pending versions on top, each id once, so
// every screen counts a change as soon as it is saved.
export function mergePending(movements, queue) {
  const latest = new Map();
  for (const movement of queue) latest.set(movement.id, movement);
  const merged = movements.map((movement) => latest.get(movement.id) ?? movement);
  const ids = new Set(movements.map((movement) => movement.id));
  for (const movement of latest.values()) {
    if (!ids.has(movement.id)) merged.push(movement);
  }
  return merged;
}
