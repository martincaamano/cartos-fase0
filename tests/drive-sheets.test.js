import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpreadsheetFile, listBooks, renameFile, SPREADSHEET_MIME } from '../js/data/drive.js';
import { ApiError } from '../js/data/errors.js';
import { configureLogs } from '../js/storage/logs.js';
import { batchGet, append, batchUpdateValues, batchUpdate, batchClear } from '../js/data/sheets.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

test('createSpreadsheetFile posts a Sheet with the app properties', async () => {
  const calls = setupGoogleApi(() => ({ body: { id: 'file-1', name: 'Cartos · Personal' } }));
  const file = await createSpreadsheetFile('Cartos · Personal', { app: 'cartos', bookId: 'b-1' });
  assert.deepEqual(file, { id: 'file-1', name: 'Cartos · Personal' });
  const [call] = calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.origin + call.url.pathname, 'https://www.googleapis.com/drive/v3/files');
  assert.deepEqual(call.body, {
    name: 'Cartos · Personal',
    mimeType: SPREADSHEET_MIME,
    appProperties: { app: 'cartos', bookId: 'b-1' },
  });
});

test('listBooks queries only Cartos files that are not in the trash', async () => {
  const calls = setupGoogleApi(() => ({ body: { files: [{ id: 'file-1' }] } }));
  assert.deepEqual(await listBooks(), [{ id: 'file-1' }]);
  assert.equal(
    calls[0].url.searchParams.get('q'),
    "appProperties has { key='app' and value='cartos' } and trashed=false"
  );
  setupGoogleApi(() => ({ body: {} }));
  assert.deepEqual(await listBooks(), []);
});

test('batchGet asks for raw values and returns rows per range', async () => {
  const calls = setupGoogleApi(() => ({ body: { valueRanges: [{ values: [['id']] }, {}] } }));
  assert.deepEqual(await batchGet('file-1', ['Accounts', 'Movements']), [[['id']], []]);
  const params = calls[0].url.searchParams;
  assert.deepEqual(params.getAll('ranges'), ['Accounts', 'Movements']);
  assert.equal(params.get('valueRenderOption'), 'UNFORMATTED_VALUE');
  assert.equal(calls[0].url.pathname, '/v4/spreadsheets/file-1/values:batchGet');
});

test('every write uses valueInputOption=RAW', async () => {
  const calls = setupGoogleApi();
  await append('file-1', 'Movements', [['m-1', '=SUM(A1)']]);
  await batchUpdateValues('file-1', [{ range: 'Accounts!A1', values: [['id']] }]);

  assert.equal(calls[0].url.pathname, '/v4/spreadsheets/file-1/values/Movements:append');
  assert.equal(calls[0].url.searchParams.get('valueInputOption'), 'RAW');
  assert.deepEqual(calls[0].body, { values: [['m-1', '=SUM(A1)']] });

  assert.equal(calls[1].url.pathname, '/v4/spreadsheets/file-1/values:batchUpdate');
  assert.equal(calls[1].body.valueInputOption, 'RAW');
});

test('batchUpdate sends structural requests', async () => {
  const calls = setupGoogleApi();
  await batchUpdate('file-1', [{ addSheet: { properties: { title: 'Movements' } } }]);
  assert.equal(calls[0].url.pathname, '/v4/spreadsheets/file-1:batchUpdate');
  assert.deepEqual(calls[0].body, { requests: [{ addSheet: { properties: { title: 'Movements' } } }] });
});

test('batchClear posts the ranges to values:batchClear with the token', async () => {
  const calls = setupGoogleApi();
  await batchClear('file-1', ['Accounts!A2:Z', 'Movements!A2:Z']);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.origin + call.url.pathname, 'https://sheets.googleapis.com/v4/spreadsheets/file-1/values:batchClear');
  assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(call.body, { ranges: ['Accounts!A2:Z', 'Movements!A2:Z'] });
});

// --- renameFile (tarea 17) ---

test('renameFile patches the file name and appProperties.name with the token', async () => {
  const calls = setupGoogleApi(() => ({ body: { id: 'file-2', name: 'Cartos · Casa do medio' } }));
  const result = await renameFile('file-2', 'Cartos · Casa do medio', 'Casa do medio');
  assert.deepEqual(result, { id: 'file-2', name: 'Cartos · Casa do medio' });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.method, 'PATCH');
  assert.equal(call.url.origin + call.url.pathname, 'https://www.googleapis.com/drive/v3/files/file-2');
  assert.equal(call.url.searchParams.get('fields'), 'id,name');
  assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.deepEqual(call.body, { name: 'Cartos · Casa do medio', appProperties: { name: 'Casa do medio' } });
});

test('renameFile encodes the file id in the path', async () => {
  const calls = setupGoogleApi(() => ({ body: {} }));
  await renameFile('a/b?c', 'Cartos · X', 'X');
  assert.equal(calls[0].url.pathname, '/drive/v3/files/a%2Fb%3Fc');
  assert.equal(calls[0].url.searchParams.get('fields'), 'id,name');
});

test('renameFile logs and fails as drive.rename, without the name in the log', async () => {
  const logged = [];
  configureLogs({ write: async (entry) => { logged.push(entry); } });
  try {
    setupGoogleApi(() => ({ status: 404, body: {} }));
    await assert.rejects(renameFile('file-2', 'Cartos · Secreto', 'Secreto'),
      (err) => err instanceof ApiError && err.status === 404 && err.op === 'drive.rename');
    assert.deepEqual(logged.map((e) => e.result), ['drive.rename:404']);
    assert.equal(JSON.stringify(logged).includes('Secreto'), false);
  } finally {
    configureLogs();
  }
});
