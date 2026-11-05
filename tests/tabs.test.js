// Adding tabs to an existing book (js/data/tabs.js): Goals and Contributions
// since tarea 25. A tab already there (Sheets answers 400) is harmless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTabs, writeHeaders } from '../js/data/tabs.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

const isAddSheet = (call) => call.url.pathname.endsWith(':batchUpdate') && !call.url.pathname.endsWith('values:batchUpdate');
const isValuesUpdate = (call) => call.url.pathname.endsWith('values:batchUpdate');
const titleOf = (call) => call.body.requests[0].addSheet.properties.title;

test('addTabs adds each tab, then writes every header in one RAW request', async () => {
  const calls = setupGoogleApi();
  await addTabs('file-1', ['Goals', 'Contributions']);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.filter(isAddSheet).map(titleOf), ['Goals', 'Contributions']);
  for (const call of calls) {
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(call.url.pathname.startsWith('/v4/spreadsheets/file-1'));
  }
  assert.ok(isValuesUpdate(calls[2]), 'headers after the tabs');
  assert.equal(calls[2].body.valueInputOption, 'RAW');
  assert.deepEqual(calls[2].body.data, [
    { range: 'Goals!A1', values: [HEADERS.Goals] },
    { range: 'Contributions!A1', values: [HEADERS.Contributions] },
  ]);
});

test('addTabs ignores a 400 on addSheet (tab already there) and goes on', async () => {
  const calls = setupGoogleApi((call) => (isAddSheet(call) && titleOf(call) === 'Goals' ? { status: 400 } : {}));
  await addTabs('file-1', ['Goals', 'Contributions']);
  assert.deepEqual(calls.filter(isAddSheet).map(titleOf), ['Goals', 'Contributions']);
  assert.equal(calls.filter(isValuesUpdate).length, 1, 'the headers are still written');
});

test('addTabs with every tab already there still rewrites the same headers', async () => {
  const calls = setupGoogleApi((call) => (isAddSheet(call) ? { status: 400 } : {}));
  await addTabs('file-1', ['Goals', 'Contributions']);
  assert.deepEqual(calls.filter(isValuesUpdate)[0].body.data.map((d) => d.range), ['Goals!A1', 'Contributions!A1']);
});

test('addTabs rethrows any other error (403) and writes no header', async () => {
  const calls = setupGoogleApi((call) => (isAddSheet(call) ? { status: 403 } : {}));
  await assert.rejects(addTabs('file-1', ['Goals', 'Contributions']), (err) => err.status === 403);
  assert.equal(calls.length, 1, 'stops at the first tab');
  assert.equal(calls.some(isValuesUpdate), false);
});

test('addTabs rethrows a 500 on the second tab after adding the first', async () => {
  const calls = setupGoogleApi((call) => (isAddSheet(call) && titleOf(call) === 'Contributions' ? { status: 500 } : {}));
  await assert.rejects(addTabs('file-1', ['Goals', 'Contributions']), (err) => err.status === 500);
  assert.deepEqual(calls.map((c) => (isAddSheet(c) ? titleOf(c) : 'values')), ['Goals', 'Contributions']);
});

test('writeHeaders writes only the tabs given, RAW', async () => {
  const calls = setupGoogleApi();
  await writeHeaders('file-1', ['Contributions']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.valueInputOption, 'RAW');
  assert.deepEqual(calls[0].body.data, [{ range: 'Contributions!A1', values: [HEADERS.Contributions] }]);
});
