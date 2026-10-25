// Finding, caching and setting up the personal book against a faked Google API.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configurePersonalBook, cachedPersonalBook, fetchPersonalBook, setUpPersonalBook,
} from '../js/data/personal-book.js';
import { HEADERS } from '../js/data/rows.js';
import { setupGoogleApi } from './helpers/fake-google.js';

function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const accountRow = ['acc-1', 'Banco', '🏦', 100, '', '', false];

// files: what Drive lists; accounts: rows of the Accounts tab.
function googleWith({ files, accounts }) {
  return setupGoogleApi((call) => {
    if (call.url.hostname === 'www.googleapis.com') {
      return call.method === 'GET' ? { body: { files } } : { body: { id: 'new-file' } };
    }
    if (call.url.pathname.endsWith('values:batchGet')) {
      return {
        body: {
          valueRanges: [
            { values: [HEADERS.Accounts, ...accounts] },
            { values: [HEADERS.Categories] },
            { values: [HEADERS.Movements] },
          ],
        },
      };
    }
    return {};
  });
}

const personalFile = { id: 'file-1', createdTime: '2026-10-25T00:00:00Z', appProperties: { bookType: 'personal' } };

let storage;
beforeEach(() => {
  storage = fakeStorage();
  configurePersonalBook({ storage: () => storage });
});

test('without a personal book in Drive the status is none', async () => {
  googleWith({ files: [], accounts: [] });
  assert.deepEqual(await fetchPersonalBook(), { status: 'none', fileId: null });
  assert.equal(cachedPersonalBook(), null);
});

test('a book with accounts is ready and leaves a device copy', async () => {
  googleWith({ files: [personalFile], accounts: [accountRow] });
  const result = await fetchPersonalBook();
  assert.equal(result.status, 'ready');
  assert.equal(result.book.accounts[0].name, 'Banco');

  const cached = cachedPersonalBook();
  assert.equal(cached.fileId, 'file-1');
  assert.equal(cached.book.accounts[0].initialBalance, 100);
});

test('a book whose accounts are all deleted counts as none, keeping its id', async () => {
  googleWith({ files: [personalFile], accounts: [['acc-1', 'Banco', '', 0, '', '', true]] });
  assert.deepEqual(await fetchPersonalBook(), { status: 'none', fileId: 'file-1' });
  assert.equal(cachedPersonalBook(), null);
});

test('onboarding creates the book when there is none', async () => {
  const calls = googleWith({ files: [], accounts: [accountRow] });
  const result = await setUpPersonalBook({ account: { name: 'Banco', emoji: '🏦', initialBalance: 100 } });
  assert.equal(result.fileId, 'new-file');
  assert.equal(calls.filter((c) => c.url.hostname === 'www.googleapis.com' && c.method === 'POST').length, 1);
  assert.equal(cachedPersonalBook().fileId, 'new-file');
});

test('onboarding reuses an existing empty book instead of creating another', async () => {
  const calls = googleWith({ files: [], accounts: [accountRow] });
  await setUpPersonalBook({ fileId: 'file-1', account: { name: 'Banco', emoji: '🏦', initialBalance: 100 } });
  assert.equal(calls.some((c) => c.url.hostname === 'www.googleapis.com'), false, 'no new Drive file');
  assert.ok(calls.some((c) => c.url.pathname === '/v4/spreadsheets/file-1/values/Accounts:append'));
});
