// The people of a shared book (architecture §5): the tab Members, and
// sharing the book with someone. Books made before tarea 18 have no Members
// tab; it is added the first time someone joins.

import { getCurrentUser } from './auth.js';
import { disableResharing, shareFile } from './drive.js';
import { ApiError, assertValid } from './errors.js';
import { append, batchGet, batchUpdate, batchUpdateValues } from './sheets.js';
import { HEADERS, rowsToObjects, toRow } from './rows.js';
import { createMember, isMember, validateShareEmail } from '../domain/members.js';

// The tab Members: { tab: 'missing' } when the book has none yet (Sheets
// answers 400 for a tab that does not exist), { tab: 'empty' } when it has
// no header (cut off between adding it and writing it), otherwise
// { tab: 'ok', members }.
async function readMembersTab(fileId) {
  try {
    const [rows] = await batchGet(fileId, ['Members']);
    return rows.length === 0 ? { tab: 'empty' } : { tab: 'ok', members: rowsToObjects('Members', rows) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return { tab: 'missing' };
    throw err;
  }
}

// The people of a book ([] when nobody has joined yet).
export async function readMembers(fileId) {
  return (await readMembersTab(fileId)).members ?? [];
}

// The signed-in person joins the book: the tab is added when missing and
// their row written when not there. Returns the people of the book.
export async function joinBook(fileId, user = getCurrentUser()) {
  const read = await readMembersTab(fileId);
  if (read.tab === 'missing') await batchUpdate(fileId, [{ addSheet: { properties: { title: 'Members' } } }]);
  if (read.tab !== 'ok') await batchUpdateValues(fileId, [{ range: 'Members!A1', values: [HEADERS.Members] }]);
  const members = read.members ?? [];
  if (isMember(members, user.email)) return members;
  const member = createMember(user);
  await append(fileId, 'Members', [toRow('Members', member)]);
  return [...members, member];
}

// Shares the book as Editor with `email`. Whoever shares joins first, so the
// book lists both people. Returns the people of the book.
export async function shareBook(fileId, email, user = getCurrentUser()) {
  const errors = validateShareEmail(email, user.email);
  assertValid(errors);
  const members = await joinBook(fileId, user);
  await shareFile(fileId, email.trim());
  await disableResharing(fileId);
  return members;
}
