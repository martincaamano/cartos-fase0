// Uploads the outbox (filled by js/data/movements.js, goals.js,
// category-move.js and book-items.js) to the tabs of the book. Reads the
// ids already in those tabs first: new records are appended, edited or
// deleted ones are written over the row found by id, so a retry after a
// lost answer never duplicates a row. New rows go first, tab by tab in
// OUTBOX_SHEETS order (Accounts, Categories, Movements, Goals,
// Contributions), then all the edits in one write: a row never reaches the
// Sheet before the account, category or goal it points at. One run at a
// time per book: a call for the same book while one is running waits for
// it and gets one more run after it, so a change saved meanwhile is
// uploaded too.

import { currentUserSub } from './auth.js';

import { append, batchGet, batchUpdateValues } from './sheets.js';
import { GOAL_SHEETS, rowRange, rowsById, toRow } from './rows.js';
import { readWithGoalTabs } from './tabs.js';
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
// lack the goal tabs: when something goes to them, they are added first.
function readIds(fileId, sheets) {
  const ranges = sheets.map((sheet) => `${sheet}!A:A`);
  return sheets.some((sheet) => GOAL_SHEETS.includes(sheet)) ? readWithGoalTabs(fileId, ranges) : batchGet(fileId, ranges);
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
  for (const { sheet, toAppend } of plans) {
    if (toAppend.length > 0) await append(fileId, sheet, toAppend.map((record) => toRow(sheet, record)));
  }
  if (updates.length > 0) await batchUpdateValues(fileId, updates);
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
