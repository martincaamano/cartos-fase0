import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMovement, validateMovement, markDeleted, isValidDate } from '../js/domain/movement.js';
import { accountBalance } from '../js/domain/balance.js';

const deps = { now: () => new Date('2026-10-25T10:00:00.000Z'), newId: () => 'm-1', userSub: 'user-1' };
const context = { accountIds: ['acc-1'], categoryIds: ['cat-1', 'transfer'] };
const valid = { accountId: 'acc-1', type: 'expense', amount: 12.5, date: '2026-10-25', categoryId: 'cat-1' };

test('createMovement fills every column with safe defaults', () => {
  assert.deepEqual(createMovement(valid, deps), {
    id: 'm-1',
    accountId: 'acc-1',
    type: 'expense',
    amount: 12.5,
    date: '2026-10-25',
    categoryId: 'cat-1',
    note: '',
    transferId: '',
    personId: '',
    createdBy: 'user-1',
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    deleted: false,
  });
});

test('a well-formed movement is valid', () => {
  assert.deepEqual(validateMovement(createMovement(valid, deps), context), []);
  assert.deepEqual(validateMovement({ ...valid, type: 'income', amount: 0.01 }, context), []);
});

test('amount must be positive with at most two decimals', () => {
  for (const amount of [0, -5, 1.005, NaN, '12.50']) {
    assert.deepEqual(validateMovement({ ...valid, amount }, context), ['amount_invalid'], String(amount));
  }
});

test('date must be a real YYYY-MM-DD day', () => {
  for (const date of ['2026-02-30', '25/10/2026', '2026-1-5', '2026-10-25T00:00', '', undefined]) {
    assert.deepEqual(validateMovement({ ...valid, date }, context), ['date_invalid'], String(date));
  }
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
});

test('unknown type, account or category are reported together', () => {
  assert.deepEqual(
    validateMovement({ ...valid, type: 'transfer', accountId: 'nope', categoryId: 'nope' }, context),
    ['type_invalid', 'account_unknown', 'category_unknown']
  );
});

test('markDeleted keeps the row and stamps updatedAt', () => {
  const movement = createMovement(valid, deps);
  const deleted = markDeleted(movement, new Date('2026-10-26T08:00:00.000Z'));
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.id, movement.id);
  assert.equal(deleted.updatedAt, '2026-10-26T08:00:00.000Z');
  assert.equal(movement.deleted, false, 'original is not mutated');
});

const account = { id: 'acc-1', initialBalance: 100 };
const move = (type, amount, extra = {}) => ({ accountId: 'acc-1', type, amount, deleted: false, ...extra });

test('balance is initial + income - expense', () => {
  assert.equal(accountBalance(account, [move('income', 1200), move('expense', 45.3), move('expense', 4.7)]), 1250);
});

test('balance adds 0,1 + 0,2 exactly', () => {
  assert.equal(accountBalance({ id: 'acc-1', initialBalance: 0 }, [move('income', 0.1), move('income', 0.2)]), 0.3);
});

test('deleted movements and other accounts do not count', () => {
  const movements = [move('expense', 30, { deleted: true }), move('income', 999, { accountId: 'acc-2' })];
  assert.equal(accountBalance(account, movements), 100);
});

test('an account without movements keeps its initial balance, even negative', () => {
  assert.equal(accountBalance(account, []), 100);
  assert.equal(accountBalance({ id: 'acc-1', initialBalance: -20.5 }, [move('expense', 0.5)]), -21);
});
