// Sheets API values and structure. Every write uses valueInputOption=RAW so
// a note starting with "=" is never read as a formula.

import { googleFetch } from './http.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const range = (text) => encodeURIComponent(text);

// Returns one array of rows per requested range. Numbers come back as
// numbers and booleans as booleans (UNFORMATTED_VALUE).
export async function batchGet(spreadsheetId, ranges) {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const r of ranges) params.append('ranges', r);
  const data = await googleFetch(`${BASE}/${spreadsheetId}/values:batchGet?${params}`, { op: 'sheets.batchGet' });
  return (data.valueRanges ?? []).map((valueRange) => valueRange.values ?? []);
}

export function append(spreadsheetId, sheet, rows) {
  const params = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  return googleFetch(`${BASE}/${spreadsheetId}/values/${range(sheet)}:append?${params}`, {
    method: 'POST',
    body: { values: rows },
    op: 'sheets.append',
  });
}

// data: [{ range: 'Accounts!A1', values: [[...], ...] }, ...]
export function batchUpdateValues(spreadsheetId, data) {
  return googleFetch(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'RAW', data },
    op: 'sheets.batchUpdateValues',
  });
}

// Structural changes (rename or add tabs).
export function batchUpdate(spreadsheetId, requests) {
  return googleFetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests },
    op: 'sheets.batchUpdate',
  });
}
