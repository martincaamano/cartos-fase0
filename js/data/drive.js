// Drive API: create a book file and find the books of the user
// (architecture §4). Under drive.file, listing only returns files the app
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

export async function listBooks() {
  const params = new URLSearchParams({
    q: "appProperties has { key='app' and value='cartos' } and trashed=false",
    fields: 'files(id,name,appProperties,owners,capabilities)',
  });
  const data = await googleFetch(`${FILES}?${params}`, { op: 'drive.list' });
  return data.files ?? [];
}
