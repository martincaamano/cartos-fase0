import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransfer, validateTransfer, latestEntries } from '../js/domain/transfer.js';
import { accountBalance } from '../js/domain/balance.js';
import { TRANSFER_CATEGORY_ID } from '../js/domain/category.js';

let n = 0;
const deps = { now: () => new Date('2026-10-25T10:00:00Z'), newId: () => `id-${++n}`, userSub: 'user-1' };
const fields = { fromAccountId: 'bank', toAccountId: 'cash', amount: 50, date: '2026-10-25', note: 'cajero' };
const context = { accountIds: ['bank', 'cash'] };

test('buildTransfer returns an outgoing and an incoming half', () => {
  const [out, inc] = buildTransfer(fields, deps);
  assert.notEqual(out.id, inc.id);
  assert.equal(out.transferId, inc.transferId);
  assert.notEqual(out.transferId, out.id);
  for (const half of [out, inc]) {
    assert.equal(half.amount, 50);
    assert.equal(half.date, '2026-10-25');
    assert.equal(half.categoryId, TRANSFER_CATEGORY_ID);
    assert.equal(half.createdBy, 'user-1');
  }
  assert.deepEqual([out.accountId, out.type], ['bank', 'expense']);
  assert.deepEqual([inc.accountId, inc.type], ['cash', 'income']);
});

test('a transfer leaves the sum of both balances unchanged', () => {
  const bank = { id: 'bank', initialBalance: 1000.1 };
  const cash = { id: 'cash', initialBalance: 0.2 };
  const halves = buildTransfer({ ...fields, amount: 0.3 }, deps);
  const before = accountBalance(bank, []) + accountBalance(cash, []);
  assert.equal(accountBalance(bank, halves), 999.8);
  assert.equal(accountBalance(cash, halves), 0.5);
  assert.equal(Math.round((accountBalance(bank, halves) + accountBalance(cash, halves)) * 100), Math.round(before * 100));
});

test('validateTransfer accepts a correct transfer', () => {
  assert.deepEqual(validateTransfer(fields, context), []);
});

test('validateTransfer rejects same account, bad amounts, unknown accounts and bad dates', () => {
  assert.deepEqual(validateTransfer({ ...fields, toAccountId: 'bank' }, context), ['same_account']);
  for (const amount of [0, -5, 1.005, null]) {
    assert.deepEqual(validateTransfer({ ...fields, amount }, context), ['amount_invalid'], String(amount));
  }
  assert.deepEqual(validateTransfer({ ...fields, toAccountId: 'nope' }, context), ['account_unknown']);
  assert.deepEqual(validateTransfer({ ...fields, date: '2026-02-30' }, context), ['date_invalid']);
});

const movement = (extra) => ({ deleted: false, transferId: '', createdAt: '2026-10-25T09:00:00Z', ...extra });

test('latestEntries joins both halves of a transfer into one line', () => {
  const [out, inc] = buildTransfer(fields, deps);
  const groceries = movement({ id: 'g', accountId: 'bank', type: 'expense', amount: 10, date: '2026-10-24' });
  const entries = latestEntries([groceries, out, inc], 5);
  assert.deepEqual(entries.map((e) => e.kind), ['transfer', 'movement']);
  assert.deepEqual(
    { from: entries[0].from, to: entries[0].to, amount: entries[0].amount },
    { from: 'bank', to: 'cash', amount: 50 }
  );
});

test('a half without its pair shows as an ordinary movement', () => {
  const [out, inc] = buildTransfer(fields, deps);
  assert.deepEqual(latestEntries([out], 5).map((e) => e.kind), ['movement']);
  assert.deepEqual(latestEntries([out, { ...inc, deleted: true }], 5).map((e) => e.kind), ['movement']);
});

test('latestEntries keeps newest first and the requested count', () => {
  const older = movement({ id: 'a', date: '2026-10-01' });
  const newer = movement({ id: 'b', date: '2026-10-20' });
  assert.deepEqual(latestEntries([older, newer], 1).map((e) => e.id), ['b']);
});
