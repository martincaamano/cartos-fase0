// Import from a Cartos file (js/domain/import.js). All data here is invented.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImport, validateImport, buildImport, summarizeImport, countDuplicates,
  IMPORT_FORMAT, IMPORT_VERSION, IMPORTED_BY,
} from '../js/domain/import.js';
import { TRANSFER_CATEGORY_ID } from '../js/domain/category.js';

const transferCategory = {
  id: TRANSFER_CATEGORY_ID, name: 'Transferencia', emoji: '🔁', kind: 'both',
  isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z', deleted: false,
};

// A small invented book: two accounts, three categories, four lines.
function sampleData() {
  return {
    format: IMPORT_FORMAT,
    version: IMPORT_VERSION,
    accounts: [
      { key: 'bank', name: 'Banco Inventado', emoji: '🏦', initialBalance: 1000 },
      { key: 'cash', name: 'Hucha', emoji: '💶', initialBalance: 20.5 },
    ],
    categories: [
      { key: 'food', name: 'Comida', emoji: '🛒', kind: 'expense' },
      { key: 'pay', name: 'Nómina', emoji: '💼', kind: 'income' },
      { key: 'misc', name: 'Varios', emoji: '📦', kind: 'both' },
    ],
    movements: [
      { date: '2026-10-01', account: 'bank', type: 'expense', amount: 12.5, category: 'food', note: 'pan' },
      { date: '2026-10-02', transfer: { from: 'bank', to: 'cash' }, amount: 50, note: '' },
      { date: '2026-09-30', account: 'bank', type: 'income', amount: 1500, category: 'pay', note: '' },
      { date: '2026-10-03', account: 'cash', type: 'expense', amount: 3.2, category: 'misc' },
    ],
  };
}

function counterIds() {
  let n = 0;
  return () => `id-${++n}`;
}

const fixedNow = () => new Date('2026-10-28T10:00:00.000Z');

const errorsOf = (mutate) => {
  const data = sampleData();
  mutate(data);
  return validateImport(data);
};

describe('constants', () => {
  test('format, version and author', () => {
    assert.equal(IMPORT_FORMAT, 'cartos-import');
    assert.equal(IMPORT_VERSION, 1);
    assert.equal(IMPORTED_BY, 'import');
  });
});

describe('parseImport', () => {
  test('text that is not JSON', () => {
    assert.deepEqual(parseImport('{ not json'), { errors: [{ at: 'file', code: 'not_json' }] });
    assert.deepEqual(parseImport(''), { errors: [{ at: 'file', code: 'not_json' }] });
  });

  test('JSON of another format', () => {
    assert.deepEqual(parseImport(JSON.stringify({ format: 'other', version: 1 })), { errors: [{ at: 'file', code: 'not_cartos' }] });
    assert.deepEqual(parseImport('{}'), { errors: [{ at: 'file', code: 'not_cartos' }] });
    assert.deepEqual(parseImport('null'), { errors: [{ at: 'file', code: 'not_cartos' }] });
    assert.deepEqual(parseImport('[]'), { errors: [{ at: 'file', code: 'not_cartos' }] });
  });

  test('unknown version', () => {
    for (const version of [2, 0, '1', undefined]) {
      assert.deepEqual(
        parseImport(JSON.stringify({ format: 'cartos-import', version })),
        { errors: [{ at: 'file', code: 'version_unknown' }] },
        `version ${version}`,
      );
    }
  });

  test('a valid file returns its data', () => {
    const data = sampleData();
    assert.deepEqual(parseImport(JSON.stringify(data)), { data });
  });
});

describe('validateImport', () => {
  test('a valid file has no errors', () => {
    assert.deepEqual(validateImport(sampleData()), []);
  });

  test('a file without movements but with accounts is valid', () => {
    assert.deepEqual(errorsOf((d) => { d.movements = []; d.categories = []; }), []);
  });

  test('no accounts', () => {
    assert.deepEqual(
      errorsOf((d) => { d.accounts = []; d.movements = []; }),
      [{ at: 'accounts', code: 'accounts_missing' }],
    );
    assert.deepEqual(
      errorsOf((d) => { delete d.accounts; d.movements = []; }),
      [{ at: 'accounts', code: 'accounts_missing' }],
    );
  });

  test('categories or movements missing', () => {
    assert.ok(errorsOf((d) => { delete d.categories; }).some((e) => e.at === 'categories' && e.code === 'categories_missing'));
    assert.deepEqual(errorsOf((d) => { delete d.movements; }), [{ at: 'movements', code: 'movements_missing' }]);
  });

  test('repeated account key', () => {
    const errors = errorsOf((d) => { d.accounts[1].key = 'bank'; d.movements = []; });
    assert.deepEqual(errors, [{ at: 'accounts[1]', code: 'key_invalid' }]);
  });

  test('empty or missing account key', () => {
    assert.deepEqual(errorsOf((d) => { d.accounts[0].key = '  '; d.movements = []; }), [{ at: 'accounts[0]', code: 'key_invalid' }]);
    assert.deepEqual(errorsOf((d) => { delete d.accounts[0].key; d.movements = []; }), [{ at: 'accounts[0]', code: 'key_invalid' }]);
  });

  test('repeated account name, case-insensitive', () => {
    const errors = errorsOf((d) => { d.accounts[1].name = 'BANCO inventado'; });
    assert.deepEqual(errors, [{ at: 'accounts[1]', code: 'name_taken' }]);
  });

  test('account without name', () => {
    assert.deepEqual(errorsOf((d) => { d.accounts[0].name = ''; }), [{ at: 'accounts[0]', code: 'name_required' }]);
  });

  test('initial balance with three decimals', () => {
    assert.deepEqual(errorsOf((d) => { d.accounts[0].initialBalance = 10.005; }), [{ at: 'accounts[0]', code: 'initial_balance_invalid' }]);
  });

  test('initial balance as text is invalid; negative or zero is allowed', () => {
    assert.deepEqual(errorsOf((d) => { d.accounts[0].initialBalance = '100'; }), [{ at: 'accounts[0]', code: 'initial_balance_invalid' }]);
    assert.deepEqual(errorsOf((d) => { d.accounts[0].initialBalance = -250.75; }), []);
    assert.deepEqual(errorsOf((d) => { d.accounts[0].initialBalance = 0; }), []);
    assert.deepEqual(errorsOf((d) => { d.accounts[0].initialBalance = 1_234_567.89; }), []);
  });

  test('category with an invalid kind', () => {
    const errors = errorsOf((d) => { d.categories[2].kind = 'savings'; d.movements = []; });
    assert.deepEqual(errors, [{ at: 'categories[2]', code: 'kind_invalid' }]);
  });

  test('category with key transfer', () => {
    const errors = errorsOf((d) => { d.categories[2].key = 'transfer'; d.movements = []; });
    assert.deepEqual(errors, [{ at: 'categories[2]', code: 'key_invalid' }]);
  });

  test('repeated category key and repeated category name', () => {
    assert.deepEqual(errorsOf((d) => { d.categories[1].key = 'food'; d.movements = []; }), [{ at: 'categories[1]', code: 'key_invalid' }]);
    assert.deepEqual(errorsOf((d) => { d.categories[1].name = 'COMIDA'; }), [{ at: 'categories[1]', code: 'name_taken' }]);
  });

  test('date that does not exist (2026-02-30)', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '2026-02-30'; }), [{ at: 'movements[0]', code: 'date_invalid' }]);
  });

  test('end of month and bad date formats', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '2026-02-28'; }), []);
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '2028-02-29'; }), []);
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '2026-12-31'; }), []);
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '2026-04-31'; }), [{ at: 'movements[0]', code: 'date_invalid' }]);
    assert.deepEqual(errorsOf((d) => { d.movements[0].date = '01/10/2026'; }), [{ at: 'movements[0]', code: 'date_invalid' }]);
    assert.deepEqual(errorsOf((d) => { delete d.movements[0].date; }), [{ at: 'movements[0]', code: 'date_invalid' }]);
  });

  test('amount zero, negative or with three decimals', () => {
    for (const amount of [0, -5, 12.345, '12.5', Number.NaN]) {
      assert.deepEqual(
        errorsOf((d) => { d.movements[0].amount = amount; }),
        [{ at: 'movements[0]', code: 'amount_invalid' }],
        `amount ${amount}`,
      );
    }
  });

  test('amount of one cent and a large amount are valid', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].amount = 0.01; }), []);
    assert.deepEqual(errorsOf((d) => { d.movements[0].amount = 999_999_999.99; }), []);
  });

  test('a transfer with a bad amount reports it at its line', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[1].amount = 0; }), [{ at: 'movements[1]', code: 'amount_invalid' }]);
  });

  test('unknown account', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].account = 'savings'; }), [{ at: 'movements[0]', code: 'account_unknown' }]);
    assert.deepEqual(errorsOf((d) => { d.movements[1].transfer.to = 'savings'; }), [{ at: 'movements[1]', code: 'account_unknown' }]);
  });

  test('unknown category', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].category = 'travel'; }), [{ at: 'movements[0]', code: 'category_unknown' }]);
    // Transferencia is added by the app, never usable by hand from the file.
    assert.deepEqual(errorsOf((d) => { d.movements[0].category = 'transfer'; }), [{ at: 'movements[0]', code: 'category_unknown' }]);
  });

  test('invalid movement type', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].type = 'refund'; }), [
      { at: 'movements[0]', code: 'type_invalid' },
      { at: 'movements[0]', code: 'category_kind_mismatch' },
    ]);
  });

  test('expense category in an income and income category in an expense', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[2].category = 'food'; }), [{ at: 'movements[2]', code: 'category_kind_mismatch' }]);
    assert.deepEqual(errorsOf((d) => { d.movements[0].category = 'pay'; }), [{ at: 'movements[0]', code: 'category_kind_mismatch' }]);
  });

  test('a both category is valid for income and expense', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].category = 'misc'; }), []);
    assert.deepEqual(errorsOf((d) => { d.movements[2].category = 'misc'; }), []);
  });

  test('transfer to the same account', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[1].transfer.to = 'bank'; }), [{ at: 'movements[1]', code: 'same_account' }]);
  });

  test('note that is not text', () => {
    assert.deepEqual(errorsOf((d) => { d.movements[0].note = 42; }), [{ at: 'movements[0]', code: 'note_invalid' }]);
    assert.deepEqual(errorsOf((d) => { d.movements[1].note = null; }), [{ at: 'movements[1]', code: 'note_invalid' }]);
  });

  test('several errors keep their line', () => {
    const errors = errorsOf((d) => {
      d.movements[0].amount = 0;
      d.movements[3].date = '2026-13-01';
    });
    assert.deepEqual(errors, [
      { at: 'movements[0]', code: 'amount_invalid' },
      { at: 'movements[3]', code: 'date_invalid' },
    ]);
  });
});

describe('buildImport', () => {
  const build = (data = sampleData()) => buildImport(data, undefined, { now: fixedNow, newId: counterIds() });

  test('every row gets a new id, deterministic with a fake newId', () => {
    const a = build();
    const b = build();
    assert.deepEqual(a, b);
    const ids = [...a.accounts, ...a.categories.filter((c) => c.id !== 'transfer'), ...a.movements].map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^id-\d+$/);
    // Keys never become ids.
    for (const key of ['bank', 'cash', 'food', 'pay', 'misc']) assert.equal(ids.includes(key), false);
  });

  test('accounts keep name, emoji and initial balance', () => {
    const { accounts } = build();
    assert.deepEqual(accounts.map((a) => [a.name, a.emoji, a.initialBalance, a.deleted]), [
      ['Banco Inventado', '🏦', 1000, false],
      ['Hucha', '💶', 20.5, false],
    ]);
  });

  test('movements link to accounts and categories by key', () => {
    const { accounts, categories, movements } = build();
    const [bank, cash] = accounts;
    const [food, pay, misc] = categories;
    const plain = movements.filter((m) => !m.transferId);
    assert.deepEqual(plain.map((m) => [m.accountId, m.type, m.categoryId]), [
      [bank.id, 'expense', food.id],
      [bank.id, 'income', pay.id],
      [cash.id, 'expense', misc.id],
    ]);
  });

  test('categories are only the ones of the file: buildImport never adds Transferencia', () => {
    const { categories } = build();
    assert.equal(categories.length, 3);
    assert.equal(categories.some((c) => c.id === TRANSFER_CATEGORY_ID || c.name === 'Transferencia'), false);
    assert.deepEqual(categories.map((c) => [c.name, c.kind, c.isDefault]), [
      ['Comida', 'expense', false],
      ['Nómina', 'income', false],
      ['Varios', 'both', false],
    ]);
  });

  test('against a book with only Transferencia, it is not repeated', () => {
    const { categories } = buildImport(sampleData(), { accounts: [], categories: [transferCategory], movements: [] }, { now: fixedNow, newId: counterIds() });
    assert.deepEqual(categories.map((c) => c.name), ['Comida', 'Nómina', 'Varios']);
  });

  test('a transfer becomes two halves with the same transferId', () => {
    const { accounts, movements } = build();
    const [bank, cash] = accounts;
    const halves = movements.filter((m) => m.transferId);
    assert.equal(movements.length, 5, '3 plain + 2 halves');
    assert.equal(halves.length, 2);
    const [out, inc] = halves;
    assert.equal(out.transferId, inc.transferId);
    assert.notEqual(out.transferId, '');
    assert.equal(out.type, 'expense');
    assert.equal(out.accountId, bank.id);
    assert.equal(inc.type, 'income');
    assert.equal(inc.accountId, cash.id);
    for (const half of halves) {
      assert.equal(half.categoryId, TRANSFER_CATEGORY_ID);
      assert.equal(half.amount, 50);
      assert.equal(half.date, '2026-10-02');
    }
    assert.notEqual(out.id, inc.id);
  });

  test('every movement is authored by IMPORTED_BY', () => {
    for (const movement of build().movements) assert.equal(movement.createdBy, IMPORTED_BY);
  });

  test('notes are kept as they are, empty included', () => {
    const notes = build().movements.map((m) => m.note);
    // pan, transfer (2 halves) '', '', missing note → ''.
    assert.deepEqual(notes, ['pan', '', '', '', '']);
    const data = sampleData();
    data.movements[0].note = '  con espacios  ';
    assert.equal(build(data).movements[0].note, '  con espacios  ');
  });

  test('createdAt grows in the order of the file, with a fixed now', () => {
    const { accounts, categories, movements } = build();
    // Rows are stamped a millisecond apart: accounts, categories, movements.
    assert.deepEqual(accounts.map((a) => a.createdAt), ['2026-10-28T10:00:00.000Z', '2026-10-28T10:00:00.001Z']);
    assert.equal(categories[0].updatedAt, '2026-10-28T10:00:00.002Z');
    const stamps = movements.map((m) => m.createdAt);
    assert.deepEqual(stamps, [
      '2026-10-28T10:00:00.005Z',
      '2026-10-28T10:00:00.006Z', // both halves of the transfer
      '2026-10-28T10:00:00.006Z',
      '2026-10-28T10:00:00.007Z',
      '2026-10-28T10:00:00.008Z',
    ]);
    for (const m of movements) assert.equal(m.updatedAt, m.createdAt);
    // Same order as the file even though the file is not sorted by date.
    assert.deepEqual(movements.map((m) => m.date), ['2026-10-01', '2026-10-02', '2026-10-02', '2026-09-30', '2026-10-03']);
  });

  test('amounts are the same as in the file', () => {
    assert.deepEqual(build().movements.map((m) => m.amount), [12.5, 50, 50, 1500, 3.2]);
  });

});

describe('summarizeImport', () => {
  const summarize = (data) => summarizeImport(
    buildImport(data, undefined, { now: fixedNow, newId: counterIds() }),
    data.movements,
  );

  test('balance per account is initial plus movements, total adds them', () => {
    const summary = summarize(sampleData());
    // Banco: 1000 - 12.5 - 50 + 1500 = 2437.5. Hucha: 20.5 + 50 - 3.2 = 67.3.
    assert.deepEqual(summary.accounts.map((a) => [a.name, a.balance]), [['Banco Inventado', 2437.5], ['Hucha', 67.3]]);
    assert.equal(summary.total, 2504.8);
  });

  test('sums in cents: 0.1 + 0.2 is exactly 0.3', () => {
    const data = sampleData();
    data.accounts = [{ key: 'bank', name: 'Banco Inventado', initialBalance: 0 }];
    data.categories = [{ key: 'pay', name: 'Nómina', kind: 'income' }];
    data.movements = [
      { date: '2026-10-01', account: 'bank', type: 'income', amount: 0.1, category: 'pay' },
      { date: '2026-10-01', account: 'bank', type: 'income', amount: 0.2, category: 'pay' },
    ];
    const summary = summarize(data);
    assert.equal(summary.accounts[0].balance, 0.3);
    assert.equal(summary.total, 0.3);
  });

  test('a transfer moves money between accounts without changing the total', () => {
    const data = sampleData();
    data.movements = [{ date: '2026-10-02', transfer: { from: 'bank', to: 'cash' }, amount: 0.01 }];
    const summary = summarize(data);
    assert.deepEqual(summary.accounts.map((a) => a.balance), [999.99, 20.51]);
    assert.equal(summary.total, 1020.5);
  });

  test('count is lines of the file: a transfer counts once', () => {
    assert.equal(summarize(sampleData()).count, 4);
  });

  test('first and last date regardless of the file order', () => {
    const summary = summarize(sampleData());
    assert.equal(summary.firstDate, '2026-09-30');
    assert.equal(summary.lastDate, '2026-10-03');
  });

  test('without movements: initial balances, count 0 and no dates', () => {
    const data = sampleData();
    data.movements = [];
    const summary = summarize(data);
    assert.deepEqual(summary.accounts.map((a) => a.balance), [1000, 20.5]);
    assert.equal(summary.total, 1020.5);
    assert.equal(summary.count, 0);
    assert.equal(summary.firstDate, null);
    assert.equal(summary.lastDate, null);
  });

  test('large amounts stay exact', () => {
    const data = sampleData();
    data.accounts = [{ key: 'bank', name: 'Banco Inventado', initialBalance: 9_999_999.99 }];
    data.categories = [{ key: 'pay', name: 'Nómina', kind: 'income' }];
    data.movements = [{ date: '2026-12-31', account: 'bank', type: 'income', amount: 0.01, category: 'pay' }];
    assert.equal(summarize(data).total, 10_000_000);
  });
});

// --- Importing into a book that already has rows (invented data) ---

const deps = () => ({ now: fixedNow, newId: counterIds() });

function existingBook() {
  return {
    accounts: [
      { id: 'acc-bank', name: '  BANCO inventado ', emoji: '🏦', initialBalance: 1000, deleted: false },
      { id: 'acc-gone', name: 'Hucha', emoji: '', initialBalance: 5, deleted: true },
    ],
    categories: [
      transferCategory,
      { id: 'cat-food', name: 'COMIDA', emoji: '', kind: 'expense', deleted: false },
      { id: 'cat-old', name: 'Varios', emoji: '', kind: 'expense', deleted: true },
    ],
    movements: [],
  };
}

describe('validateImport against a book', () => {
  test('book defaults to empty: same result as before', () => {
    assert.deepEqual(validateImport(sampleData(), undefined), []);
    assert.deepEqual(validateImport(sampleData(), { accounts: [], categories: [], movements: [] }), []);
  });

  test('names already in the book are not name_taken: they are reused', () => {
    assert.deepEqual(validateImport(sampleData(), existingBook()), []);
  });

  test('initial_balance_conflict when a matched account has another initial balance', () => {
    const data = sampleData();
    data.accounts[0].initialBalance = 1000.01;
    assert.deepEqual(validateImport(data, existingBook()), [{ at: 'accounts[0]', code: 'initial_balance_conflict' }]);
    data.accounts[0].initialBalance = 0;
    assert.deepEqual(validateImport(data, existingBook()), [{ at: 'accounts[0]', code: 'initial_balance_conflict' }]);
  });

  test('no conflict with hasInitialBalance: false', () => {
    const data = sampleData();
    data.accounts[0].initialBalance = 0;
    data.accounts[0].hasInitialBalance = false;
    assert.deepEqual(validateImport(data, existingBook()), []);
  });

  test('initial balances are compared in cents: 0.1 + 0.2 equals 0.3', () => {
    const book = existingBook();
    book.accounts[0].initialBalance = 0.3;
    const data = sampleData();
    data.accounts[0].initialBalance = 0.1 + 0.2;
    assert.deepEqual(validateImport(data, book), []);
  });

  test('a deleted account of the book is not matched: no conflict', () => {
    // Hucha is deleted in the book with 5; the file says 20.5.
    assert.deepEqual(validateImport(sampleData(), existingBook()).filter((e) => e.at === 'accounts[1]'), []);
  });

  test('a file category named like the book Transferencia is category_reserved', () => {
    const data = sampleData();
    data.categories.push({ key: 'tr', name: '  transferencia ', kind: 'both' });
    assert.deepEqual(validateImport(data, existingBook()), [{ at: 'categories[3]', code: 'category_reserved' }]);
  });

  test('without Transferencia in the book the same name is just a new category', () => {
    const data = sampleData();
    data.categories.push({ key: 'tr', name: 'Transferencia', kind: 'both' });
    assert.deepEqual(validateImport(data), []);
  });

  test('a matched category keeps the kind of the book', () => {
    const book = existingBook();
    book.categories.push({ id: 'cat-pay', name: 'nómina', emoji: '', kind: 'expense', deleted: false });
    // The file says Nómina is income; the book says expense.
    assert.deepEqual(validateImport(sampleData(), book), [{ at: 'movements[2]', code: 'category_kind_mismatch' }]);
    // An expense with it is then fine.
    const data = sampleData();
    data.movements[0].category = 'pay';
    assert.deepEqual(validateImport(data, book), [{ at: 'movements[2]', code: 'category_kind_mismatch' }]);
  });

  test('a deleted category of the book is not matched: the file kind counts', () => {
    // Varios is deleted (expense) in the book; the file says both, so an income with it is fine.
    const data = sampleData();
    data.movements[2].category = 'misc';
    assert.deepEqual(validateImport(data, existingBook()), []);
  });
});

describe('buildImport against a book', () => {
  test('matched accounts and categories are not returned; movements point at the book ids', () => {
    const { accounts, categories, movements } = buildImport(sampleData(), existingBook(), deps());
    // Banco matches (trimmed, case-insensitive); Hucha is deleted in the book, so it is new.
    assert.deepEqual(accounts.map((a) => a.name), ['Hucha']);
    assert.notEqual(accounts[0].id, 'acc-gone');
    // Comida matches; Varios is deleted in the book, so it is new; Nómina is new.
    assert.deepEqual(categories.map((c) => c.name), ['Nómina', 'Varios']);
    assert.notEqual(categories[1].id, 'cat-old');

    const [cash] = accounts;
    const [pay, misc] = categories;
    const plain = movements.filter((m) => !m.transferId);
    assert.deepEqual(plain.map((m) => [m.accountId, m.categoryId]), [
      ['acc-bank', 'cat-food'],
      ['acc-bank', pay.id],
      [cash.id, misc.id],
    ]);
    const halves = movements.filter((m) => m.transferId);
    assert.deepEqual(halves.map((m) => [m.accountId, m.type, m.categoryId]), [
      ['acc-bank', 'expense', TRANSFER_CATEGORY_ID],
      [cash.id, 'income', TRANSFER_CATEGORY_ID],
    ]);
  });

  test('everything matched: only movements are returned', () => {
    const book = existingBook();
    book.accounts.push({ id: 'acc-cash', name: 'hucha', initialBalance: 20.5, deleted: false });
    book.categories.push(
      { id: 'cat-pay', name: 'Nómina', kind: 'income', deleted: false },
      { id: 'cat-misc', name: 'varios', kind: 'both', deleted: false },
    );
    assert.deepEqual(validateImport(sampleData(), book), []);
    const rows = buildImport(sampleData(), book, deps());
    assert.deepEqual(rows.accounts, []);
    assert.deepEqual(rows.categories, []);
    assert.equal(rows.movements.length, 5);
    assert.deepEqual(rows.movements.filter((m) => !m.transferId).map((m) => m.categoryId), ['cat-food', 'cat-pay', 'cat-misc']);
  });

  test('the book is not changed', () => {
    const book = existingBook();
    const before = structuredClone(book);
    buildImport(sampleData(), book, deps());
    assert.deepEqual(book, before);
  });
});

describe('countDuplicates', () => {
  const m = (fields) => ({ date: '2026-10-01', accountId: 'acc-1', type: 'expense', amount: 2.5, deleted: false, ...fields });

  test('nothing in the book or nothing added is 0', () => {
    assert.equal(countDuplicates([], [m()]), 0);
    assert.equal(countDuplicates([m()], []), 0);
  });

  test('same date, account, type and amount is a duplicate', () => {
    assert.equal(countDuplicates([m()], [m()]), 1);
  });

  test('a different date, account, type or amount is not', () => {
    for (const change of [{ date: '2026-10-02' }, { accountId: 'acc-2' }, { type: 'income' }, { amount: 2.51 }]) {
      assert.equal(countDuplicates([m()], [m(change)]), 0, JSON.stringify(change));
    }
  });

  test('amounts compared in cents: 0.1 + 0.2 matches 0.3', () => {
    assert.equal(countDuplicates([m({ amount: 0.3 })], [m({ amount: 0.1 + 0.2 })]), 1);
  });

  test('a deleted movement of the book is ignored', () => {
    assert.equal(countDuplicates([m({ deleted: true })], [m()]), 0);
  });

  test('each one in the book answers for one added', () => {
    // Two equal coffees new, one in the book: 1.
    assert.equal(countDuplicates([m()], [m(), m()]), 1);
    assert.equal(countDuplicates([m(), m()], [m(), m(), m()]), 2);
    assert.equal(countDuplicates([m(), m(), m()], [m()]), 1);
  });

  test('note and category do not matter', () => {
    assert.equal(countDuplicates([m({ note: 'café', categoryId: 'c1' })], [m({ note: '', categoryId: 'c2' })]), 1);
  });
});

describe('summarizeImport with a book', () => {
  test('lists only active accounts and the total leaves out deleted ones', () => {
    const accounts = [
      { id: 'a', name: 'Banco', initialBalance: 100, deleted: false },
      { id: 'b', name: 'Vieja', initialBalance: 999, deleted: true },
    ];
    const movements = [{ id: 'm', accountId: 'a', type: 'expense', amount: 0.01, date: '2026-10-31', deleted: false }];
    const summary = summarizeImport({ accounts, movements }, [{ date: '2026-10-31' }]);
    assert.deepEqual(summary.accounts.map((a) => [a.name, a.balance]), [['Banco', 99.99]]);
    assert.equal(summary.total, 99.99);
    assert.equal(summary.count, 1);
    assert.equal(summary.firstDate, '2026-10-31');
  });
});
