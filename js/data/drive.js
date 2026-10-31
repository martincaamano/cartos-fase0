// Drive API: create a book file, find the books of the user (architecture
// §4) and share one (§5). Under drive.file, listing only returns files the app
// already has access to.

import { googleFetch } from './http.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';

export const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export function createSpreadsheetFile(name, appProperties) {
  return googleFetch(`${FILES}?fields=id,name`, {
    method: 'POST',
    body: { name, mimeType: SPREADSHEET_MIME, appProperties },
    op: 'drive.create',
  });
}

// Renames a book: the file in Drive and the name the app reads.
export function renameFile(fileId, name, appName) {
  return googleFetch(`${FILES}/${encodeURIComponent(fileId)}?fields=id,name`, {
    method: 'PATCH',
    body: { name, appProperties: { name: appName } },
    op: 'drive.rename',
  });
}

const FILE_FIELDS = 'id,name,createdTime,appProperties,capabilities(canShare)';

export async function listBooks() {
  const params = new URLSearchParams({
    q: "appProperties has { key='app' and value='cartos' } and trashed=false",
    fields: `files(${FILE_FIELDS})`,
  });
  const data = await googleFetch(`${FILES}?${params}`, { op: 'drive.list' });
  return data.files ?? [];
}

// One file by id: a book picked in the Picker, now reachable under drive.file.
export function getFile(fileId) {
  return googleFetch(`${FILES}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`, { op: 'drive.get' });
}

// Shares a book as Editor with `email`; Drive emails that person itself.
export function shareFile(fileId, email) {
  return googleFetch(`${FILES}/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`, {
    method: 'POST',
    body: { type: 'user', role: 'writer', emailAddress: email },
    op: 'drive.share',
  });
}

// Editors cannot share the book further (architecture §5).
export function disableResharing(fileId) {
  return googleFetch(`${FILES}/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH',
    body: { writersCanShare: false },
    op: 'drive.noReshare',
  });
}
