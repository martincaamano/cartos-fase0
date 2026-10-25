// Pure rules of the outbox (pending movements not yet in the Sheet).
// A movement's id is what makes a retry safe: the same id is never queued
// twice and never appended to the Sheet if it is already there.

export function enqueue(queue, movement) {
  return queue.some((pending) => pending.id === movement.id) ? queue : [...queue, movement];
}

// existingIds: the ids already in the Movements tab. Returns what still has
// to be appended and what is already there (an earlier upload whose answer
// was lost) and can leave the queue.
export function planSync(queue, existingIds) {
  const existing = new Set(existingIds);
  const seen = new Set();
  const toAppend = [];
  const done = [];
  for (const movement of queue) {
    if (seen.has(movement.id)) continue;
    seen.add(movement.id);
    (existing.has(movement.id) ? done : toAppend).push(movement);
  }
  return { toAppend, done };
}

// The book's movements plus the pending ones, each id once, so the
// Dashboard counts a movement as soon as it is saved.
export function mergePending(movements, queue) {
  const ids = new Set(movements.map((movement) => movement.id));
  const merged = [...movements];
  for (const movement of queue) {
    if (ids.has(movement.id)) continue;
    ids.add(movement.id);
    merged.push(movement);
  }
  return merged;
}
