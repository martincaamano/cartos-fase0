// Uploads the outbox (filled by js/data/movements.js and js/data/goals.js)
// to the tabs of the book: Movements, Goals, Contributions, in that order.
// Reads the ids already in those tabs first: new records are appended,
// edited or deleted ones are written over the row found by id, so a retry
// after a lost answer never duplicates a row. One run at a time per book: a
// call for the same book while one is running waits for it and gets one
// more run after it, so a change saved meanwhile is uploaded too.

import { currentUserSub } from './auth.js';

import { ApiError } from './errors.js';
import { append, batchGet, batchUpdateValues } from './sheets.js';
import { GOAL_SHEETS, rowRange, rowsById, toRow } from './rows.js';
import { addTabs } from './tabs.js';
import { OUTBOX_SHEETS, planSync, recordsOf } from '../storage/outbox-logic.js';
import { listPending, removePending } from '../storage/outbox.js';
import { logEvent } from '../storage/logs.js';

const defaults = { list: listPending, remove: removePending };
let store = defaults;
// fileId → { promise, again } of the run in progress for that book.
const running = new Map();

// Lets the tests swap the IndexedDB outbox for an in-memory one.
export function configureSync(overrides = {}) {
  store = { ...defaults, ...overrides };
  running.clear();
}

// Column A of each tab. A book read before tarea 25 by another device may
// lack the goal tabs (Sheets answers 400): they are added, then read again.
async function readIds(fileId, sheets) {
  const ranges = sheets.map((sheet) => `${sheet}!A:A`);
  try {
    return await batchGet(fileId, ranges);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 400) || !sheets.some((sheet) => GOAL_SHEETS.includes(sheet))) throw err;
    await addTabs(fileId, GOAL_SHEETS);
    return batchGet(fileId, ranges);
  }
}

async function run(fileId) {
  const entries = (await store.list(currentUserSub())).filter((item) => item.fileId === fileId);
  const sheets = OUTBOX_SHEETS.filter((sheet) => entries.some((entry) => entry.sheet === sheet));
  if (sheets.length === 0) return { appended: 0, updated: 0, pending: 0 };

  const idColumns = await readIds(fileId, sheets);
  const plans = sheets.map((sheet, i) => ({ sheet, ...planSync(recordsOf(entries, sheet), rowsById(idColumns[i])) }));
  const updates = plans.flatMap(({ sheet, toUpdate }) => toUpdate.map(({ record, row }) => ({
    range: rowRange(sheet, row),
    values: [toRow(sheet, record)],
  })));
  if (updates.length > 0) await batchUpdateValues(fileId, updates);
  for (const { sheet, toAppend } of plans) {
    if (toAppend.length > 0) await append(fileId, sheet, toAppend.map((record) => toRow(sheet, record)));
  }
  const appended = plans.reduce((sum, plan) => sum + plan.toAppend.length, 0);
  await store.remove(plans.flatMap(({ toAppend, toUpdate }) => [...toUpdate.map(({ record }) => record), ...toAppend]));
  logEvent({ type: 'sync', result: `ok:${appended}:${updates.length}` });
  return { appended, updated: updates.length, pending: 0 };
}

// Resolves with what all the runs did together: { appended, updated, pending }.
export function syncOutbox(fileId) {
  const busy = running.get(fileId);
  if (busy) {
    busy.again = true;
    return busy.promise;
  }
  const entry = { again: false };
  entry.promise = (async () => {
    const total = { appended: 0, updated: 0, pending: 0 };
    do {
      entry.again = false;
      const result = await run(fileId);
      total.appended += result.appended;
      total.updated += result.updated;
      total.pending = result.pending;
    } while (entry.again);
    return total;
  })().finally(() => running.delete(fileId));
  running.set(fileId, entry);
  return entry.promise;
}
