import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransfer, buildCrossBookTransfer, validateTransfer, latestEntries } from '../js/domain/transfer.js';
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

// --- buildCrossBookTransfer (transfer to an account of another book) ---

const crossFields = {
  fromAccountId: 'my-bank', toAccountId: 'house-bank', amount: 300, date: '2026-10-31',
  note: 'aportación', expenseCategoryId: 'cat-house', incomeCategoryId: 'cat-contribution',
};

function crossDeps() {
  let ids = 0;
  let clock = 0;
  const times = ['2026-10-30T08:00:00.000Z', '2026-10-30T09:00:00.000Z'];
  return {
    userSub: 'user-7',
    newId: () => `x-${++ids}`,
    now: () => new Date(times[clock++] ?? '2099-01-01T00:00:00.000Z'),
    get nowCalls() { return clock; },
  };
}

test('buildCrossBookTransfer returns an expense here and an income there with their own categories', () => {
  const [out, inc] = buildCrossBookTransfer(crossFields, crossDeps());
  assert.deepEqual([out.accountId, out.type, out.categoryId], ['my-bank', 'expense', 'cat-house']);
  assert.deepEqual([inc.accountId, inc.type, inc.categoryId], ['house-bank', 'income', 'cat-contribution']);
  for (const half of [out, inc]) {
    assert.equal(half.amount, 300);
    assert.equal(half.date, '2026-10-31');
    assert.equal(half.note, 'aportación');
    assert.equal(half.transferId, '');
    assert.equal(half.createdBy, 'user-7');
    assert.equal(half.deleted, false);
  }
});

test('buildCrossBookTransfer gives distinct ids and one shared createdAt from a single now()', () => {
  const deps = crossDeps();
  const [out, inc] = buildCrossBookTransfer(crossFields, deps);
  assert.deepEqual([out.id, inc.id], ['x-1', 'x-2']);
  assert.equal(deps.nowCalls, 1);
  assert.equal(out.createdAt, '2026-10-30T08:00:00.000Z');
  assert.equal(inc.createdAt, '2026-10-30T08:00:00.000Z');
  assert.equal(out.updatedAt, out.createdAt);
  assert.equal(inc.updatedAt, inc.createdAt);
});

test('buildCrossBookTransfer defaults the note to an empty string', () => {
  const { note, ...withoutNote } = crossFields;
  const halves = buildCrossBookTransfer(withoutNote, crossDeps());
  assert.deepEqual(halves.map((h) => h.note), ['', '']);
});

test('buildCrossBookTransfer keeps edge amounts and end-of-month dates as given', () => {
  for (const amount of [0.01, 999999999.99]) {
    const halves = buildCrossBookTransfer({ ...crossFields, amount, date: '2028-02-29' }, crossDeps());
    assert.deepEqual(halves.map((h) => h.amount), [amount, amount]);
    assert.deepEqual(halves.map((h) => h.date), ['2028-02-29', '2028-02-29']);
  }
});

test('buildCrossBookTransfer without userSub leaves createdBy empty', () => {
  const { userSub, ...deps } = crossDeps();
  const halves = buildCrossBookTransfer(crossFields, deps);
  assert.deepEqual(halves.map((h) => h.createdBy), ['', '']);
});

test('the cross-book halves move each balance by the amount, in cents', () => {
  const [out, inc] = buildCrossBookTransfer({ ...crossFields, amount: 0.3 }, crossDeps());
  assert.equal(accountBalance({ id: 'my-bank', initialBalance: 0.1 }, [out]), -0.2);
  assert.equal(accountBalance({ id: 'house-bank', initialBalance: 0.2 }, [inc]), 0.5);
});
