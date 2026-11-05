// Tabs a book gets after it was created: Members (tarea 18), Goals and
// Contributions (tarea 25). A tab is added with its header; adding one that
// is already there (two devices at once, a retry) is harmless.

import { ApiError } from './errors.js';
import { batchUpdate, batchUpdateValues } from './sheets.js';
import { HEADERS } from './rows.js';

// sheets: the tab names, maybe some already there. Writes every header row
// (the same text, so rewriting one that was there changes nothing).
export async function addTabs(fileId, sheets) {
  for (const sheet of sheets) {
    try {
      await batchUpdate(fileId, [{ addSheet: { properties: { title: sheet } } }]);
    } catch (err) {
      // Sheets answers 400 when a tab with that name already exists.
      if (!(err instanceof ApiError && err.status === 400)) throw err;
    }
  }
  await writeHeaders(fileId, sheets);
}

// The header row of tabs that are there but empty (cut off between adding
// one and writing its header).
export function writeHeaders(fileId, sheets) {
  return batchUpdateValues(fileId, sheets.map((sheet) => ({ range: `${sheet}!A1`, values: [HEADERS[sheet]] })));
}
