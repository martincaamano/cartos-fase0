// The tab Members and sharing a book (js/data/members.js) against a faked
// Google API. Invented people only; nothing reaches Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMembers, joinBook, shareBook } from '../js/data/members.js';
import { ApiError, ValidationError } from '../js/data/errors.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

const FILE = 'file-c';
const user = { sub: 'user-1', email: 'martin@example.com', name: 'Martín Caamaño' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isMembersRead = (call) => call.method === 'GET'
  && call.url.pathname === `/v4/spreadsheets/${FILE}/values:batchGet`
  && call.url.searchParams.getAll('ranges').join() === 'Members';
const isAddSheet = (call) => call.method === 'POST' && call.url.pathname === `/v4/spreadsheets/${FILE}:batchUpdate`;
const isValuesUpdate = (call) => call.method === 'POST' && call.url.pathname === `/v4/spreadsheets/${FILE}/values:batchUpdate`;
const isAppend = (call) => call.method === 'POST' && call.url.pathname === `/v4/spreadsheets/${FILE}/values/Members:append`;
const isShare = (call) => call.method === 'POST' && call.url.pathname === `/drive/v3/files/${FILE}/permissions`;
const isNoReshare = (call) => call.method === 'PATCH' && call.url.pathname === `/drive/v3/files/${FILE}`;

// A book whose Members tab is `rows` (header included), or missing when null.
// Answers 400 to a read of a tab that does not exist, like Sheets.
function fakeBook(rows, { readStatus, shareStatus } = {}) {
  const state = { rows: rows === null ? null : [...rows] };
  state.calls = setupGoogleApi((call) => {
    if (isMembersRead(call)) {
      if (readStatus) return { status: readStatus };
      if (state.rows === null) return { status: 400 };
      return { body: { valueRanges: [{ values: state.rows }] } };
    }
    if (isAddSheet(call)) {
      state.rows = [];
      return { body: {} };
    }
    if (isValuesUpdate(call)) {
      for (const { range, values } of call.body.data) if (range === 'Members!A1') state.rows[0] = values[0];
      return { body: {} };
    }
    if (isAppend(call)) {
      state.rows.push(...call.body.values);
      return { body: {} };
    }
    if (isShare(call)) return shareStatus ? { status: shareStatus } : { body: { id: 'perm-1' } };
    if (isNoReshare(call)) return { body: { id: FILE } };
    return { status: 404 };
  });
  return state;
}

const header = HEADERS.Members;
const martinRow = ['m-1', 'martin@example.com', 'Martín Caamaño', '2026-10-01T10:00:00.000Z'];
const anaRow = ['m-2', 'ana@example.com', 'Ana', '2026-10-02T10:00:00.000Z'];

// --- readMembers ---

test('readMembers is [] when the book has no Members tab (Sheets answers 400)', async () => {
  const { calls } = fakeBook(null);
  assert.deepEqual(await readMembers(FILE), []);
  assert.equal(calls.length, 1);
  assert.ok(isMembersRead(calls[0]));
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
});

test('readMembers parses the rows of the tab', async () => {
  fakeBook([header, martinRow, anaRow]);
  assert.deepEqual(await readMembers(FILE), [
    { id: 'm-1', email: 'martin@example.com', name: 'Martín Caamaño', createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'm-2', email: 'ana@example.com', name: 'Ana', createdAt: '2026-10-02T10:00:00.000Z' },
  ]);
});

test('readMembers of a tab with only the header is []', async () => {
  fakeBook([header]);
  assert.deepEqual(await readMembers(FILE), []);
});

test('readMembers: other errors are not swallowed', async () => {
  for (const status of [403, 404, 500, 503]) {
    fakeBook([header], { readStatus: status });
    await assert.rejects(readMembers(FILE),
      (err) => err instanceof ApiError && err.status === status && err.op === 'sheets.batchGet', String(status));
  }
});

// --- joinBook ---

test('joinBook on a book without the tab adds it, writes the header RAW and appends the user', async () => {
  const book = fakeBook(null);
  const members = await joinBook(FILE, user);
  const { calls } = book;

  assert.equal(calls.length, 4);
  assert.ok(isMembersRead(calls[0]), 'reads first');
  assert.ok(isAddSheet(calls[1]));
  assert.deepEqual(calls[1].body, { requests: [{ addSheet: { properties: { title: 'Members' } } }] });
  assert.ok(isValuesUpdate(calls[2]));
  assert.deepEqual(calls[2].body, { valueInputOption: 'RAW', data: [{ range: 'Members!A1', values: [header] }] });
  assert.ok(isAppend(calls[3]));
  assert.equal(calls[3].url.searchParams.get('valueInputOption'), 'RAW');

  const [row] = calls[3].body.values;
  assert.equal(calls[3].body.values.length, 1);
  assert.match(row[0], UUID);
  assert.deepEqual(row.slice(1, 3), ['martin@example.com', 'Martín Caamaño']);
  assert.match(row[3], /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(members.length, 1);
  assert.deepEqual(members[0], { id: row[0], email: row[1], name: row[2], createdAt: row[3] });
  assert.deepEqual(book.rows, [header, row]);
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
});

test('joinBook normalizes the user email and trims the name in the row', async () => {
  const { calls } = fakeBook([header]);
  await joinBook(FILE, { email: ' Martin@Example.COM ', name: '  Martín  ' });
  const [row] = calls.find(isAppend).body.values;
  assert.deepEqual(row.slice(1, 3), ['martin@example.com', 'Martín']);
});

test('joinBook when the user is already a member (any case) writes nothing', async () => {
  const { calls } = fakeBook([header, ['m-1', 'MARTIN@Example.com', 'Martín', 't0'], anaRow]);
  const members = await joinBook(FILE, user);
  assert.equal(calls.length, 1, 'only the read');
  assert.ok(isMembersRead(calls[0]));
  assert.deepEqual(members.map((m) => m.id), ['m-1', 'm-2']);
});

test('joinBook when the tab exists without the user only appends their row', async () => {
  const { calls } = fakeBook([header, anaRow]);
  const members = await joinBook(FILE, user);
  assert.equal(calls.length, 2);
  assert.ok(isMembersRead(calls[0]));
  assert.ok(isAppend(calls[1]));
  assert.equal(calls.some(isAddSheet) || calls.some(isValuesUpdate), false, 'neither tab nor header written');
  assert.deepEqual(members.map((m) => m.email), ['ana@example.com', 'martin@example.com']);
});

test('joinBook without a user uses the signed-in person', async () => {
  const { calls } = fakeBook([header]);
  await joinBook(FILE);
  // helpers/fake-google.js signs in martin@example.com, named Martín.
  assert.deepEqual(calls.find(isAppend).body.values[0].slice(1, 3), ['martin@example.com', 'Martín']);
});

test('joinBook: a failing read writes nothing', async () => {
  const { calls } = fakeBook(null, { readStatus: 500 });
  await assert.rejects(joinBook(FILE, user), (err) => err instanceof ApiError && err.status === 500);
  assert.equal(calls.length, 1);
});

// --- shareBook ---

test('shareBook rejects a bad email with ValidationError before any request', async () => {
  const cases = [
    ['', 'email_required'],
    ['   ', 'email_required'],
    ['ana', 'email_invalid'],
    ['ana@example', 'email_invalid'],
    ['martin@example.com', 'email_own'],
    ['  MARTIN@Example.com ', 'email_own'],
  ];
  for (const [email, code] of cases) {
    const { calls } = fakeBook([header]);
    await assert.rejects(shareBook(FILE, email, user),
      (err) => err instanceof ValidationError && err.errors.length === 1 && err.errors[0] === code, JSON.stringify(email));
    assert.equal(calls.length, 0, JSON.stringify(email));
  }
});

test('shareBook: join, then share as writer with notification, then disable resharing', async () => {
  const { calls } = fakeBook(null);
  const members = await shareBook(FILE, 'ana@example.com', user);

  const share = calls.findIndex(isShare);
  const noReshare = calls.findIndex(isNoReshare);
  const lastJoin = calls.findIndex(isAppend);
  assert.equal(calls.length, 6);
  assert.ok(isMembersRead(calls[0]), 'joins first');
  assert.ok(lastJoin < share, 'the user joins before sharing');
  assert.equal(share, 4);
  assert.equal(noReshare, 5);

  assert.equal(calls[share].url.searchParams.get('sendNotificationEmail'), 'true');
  assert.deepEqual(calls[share].body, { type: 'user', role: 'writer', emailAddress: 'ana@example.com' });
  assert.deepEqual(calls[noReshare].body, { writersCanShare: false });
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);

  assert.deepEqual(members.map((m) => m.email), ['martin@example.com'], 'returns the people of the book');
});

test('shareBook when the user is already a member: read, share, disable resharing', async () => {
  const { calls } = fakeBook([header, martinRow]);
  await shareBook(FILE, 'ana@example.com', user);
  assert.equal(calls.length, 3);
  assert.ok(isMembersRead(calls[0]));
  assert.ok(isShare(calls[1]));
  assert.ok(isNoReshare(calls[2]));
});

test('shareBook sends the email trimmed', async () => {
  const { calls } = fakeBook([header, martinRow]);
  await shareBook(FILE, '  ana@example.com  ', user);
  assert.equal(calls.find(isShare).body.emailAddress, 'ana@example.com');
});

test('shareBook: when Drive refuses to share, resharing is not touched', async () => {
  const { calls } = fakeBook([header, martinRow], { shareStatus: 403 });
  await assert.rejects(shareBook(FILE, 'ana@example.com', user),
    (err) => err instanceof ApiError && err.status === 403 && err.op === 'drive.share');
  assert.equal(calls.some(isNoReshare), false);
});

// --- a Members tab that exists but is empty (tarea 21) ---

test('readMembers of an existing but empty tab is [] and does not throw', async () => {
  const { calls } = fakeBook([]);
  assert.deepEqual(await readMembers(FILE), []);
  assert.equal(calls.length, 1);
});

test('readMembers of an empty tab answered without "values", as Sheets does, is []', async () => {
  setupGoogleApi(() => ({ body: { valueRanges: [{ range: 'Members!A1:Z1000', majorDimension: 'ROWS' }] } }));
  assert.deepEqual(await readMembers(FILE), []);
});

test('joinBook on an empty tab writes the header RAW and appends the user, without addSheet', async () => {
  const book = fakeBook([]);
  const members = await joinBook(FILE, user);
  const { calls } = book;
  assert.equal(calls.length, 3);
  assert.ok(isMembersRead(calls[0]));
  assert.equal(calls.some(isAddSheet), false, 'the tab is not added again');
  assert.ok(isValuesUpdate(calls[1]));
  assert.deepEqual(calls[1].body, { valueInputOption: 'RAW', data: [{ range: 'Members!A1', values: [header] }] });
  assert.ok(isAppend(calls[2]));
  assert.equal(calls[2].url.searchParams.get('valueInputOption'), 'RAW');
  const [row] = calls[2].body.values;
  assert.deepEqual(row.slice(1, 3), ['martin@example.com', 'Martín Caamaño']);
  assert.deepEqual(members.map((m) => m.email), ['martin@example.com']);
  assert.deepEqual(book.rows, [header, row]);
});

test('joinBook on a missing tab (400) still adds the sheet before the header', async () => {
  const { calls } = fakeBook(null);
  await joinBook(FILE, user);
  const add = calls.findIndex(isAddSheet);
  const head = calls.findIndex(isValuesUpdate);
  assert.equal(calls.filter(isAddSheet).length, 1);
  assert.ok(add > 0 && add < head);
});
