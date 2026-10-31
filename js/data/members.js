// The people of a shared book (architecture §5): the tab Members, and
// sharing the book with someone. Books made before tarea 18 have no Members
// tab; it is added the first time someone joins.

import { getCurrentUser } from './auth.js';
import { disableResharing, shareFile } from './drive.js';
import { ApiError, ValidationError } from './errors.js';
import { append, batchGet, batchUpdate, batchUpdateValues } from './sheets.js';
import { HEADERS, rowsToObjects, toRow } from './rows.js';
import { createMember, isMember, validateShareEmail } from '../domain/members.js';

// The people of a book, or null when the book has no Members tab yet
// (Sheets answers 400 for a tab that does not exist).
async function readMembersTab(fileId) {
  try {
    const [rows] = await batchGet(fileId, ['Members']);
    return rowsToObjects('Members', rows);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return null;
    throw err;
  }
}

// The people of a book ([] when nobody has joined yet).
export async function readMembers(fileId) {
  return (await readMembersTab(fileId)) ?? [];
}

// The signed-in person joins the book: the tab is added when missing and
// their row written when not there. Returns the people of the book.
export async function joinBook(fileId, user = getCurrentUser()) {
  let members = await readMembersTab(fileId);
  if (members === null) {
    await batchUpdate(fileId, [{ addSheet: { properties: { title: 'Members' } } }]);
    await batchUpdateValues(fileId, [{ range: 'Members!A1', values: [HEADERS.Members] }]);
    members = [];
  }
  if (isMember(members, user.email)) return members;
  const member = createMember(user);
  await append(fileId, 'Members', [toRow('Members', member)]);
  return [...members, member];
}

// Shares the book as Editor with `email`. Whoever shares joins first, so the
// book lists both people. Returns the people of the book.
export async function shareBook(fileId, email, user = getCurrentUser()) {
  const errors = validateShareEmail(email, user.email);
  if (errors.length) throw new ValidationError(errors);
  const members = await joinBook(fileId, user);
  await shareFile(fileId, email.trim());
  await disableResharing(fileId);
  return members;
}
