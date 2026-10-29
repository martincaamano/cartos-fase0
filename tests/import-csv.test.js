// The Cartos CSV (js/domain/import-csv.js). All data here is invented.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSV_COLUMNS, csvToImport, locateErrors, parseImportFile, bookToCsv, templateCsv,
} from '../js/domain/import-csv.js';
import { parseCsv } from '../js/domain/csv.js';
import {
  IMPORT_FORMAT, IMPORT_VERSION, validateImport, buildImport, summarizeImport,
} from '../js/domain/import.js';
import { buildDefaultCategories, TRANSFER_CATEGORY_ID } from '../js/domain/category.js';
import { accountBalance } from '../js/domain/balance.js';
import { es } from '../i18n/es.js';

const HEADER = 'fecha;tipo;importe;cuenta;cuenta destino;categoría;nota';
const csv = (...lines) => [HEADER, ...lines].join('\n');
const dataOf = (text) => {
  const result = csvToImport(text);
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data;
};

// A book that has only Transferencia, as a new book does.
const onlyTransfer = () => ({
  accounts: [],
  categories: buildDefaultCategories(es.categories, { now: () => new Date('2026-01-01T00:00:00Z'), newId: () => 'x' })
    .filter((c) => c.id === TRANSFER_CATEGORY_ID),
  movements: [],
});

function counterIds() {
  let n = 0;
  return () => `id-${++n}`;
}
const deps = () => ({ now: () => new Date('2026-10-28T10:00:00.000Z'), newId: counterIds() });

// CSV → rows into a book → { name: balance } and total.
function importedBalances(text, book = onlyTransfer()) {
  const data = dataOf(text);
  assert.deepEqual(validateImport(data, book), []);
  const rows = buildImport(data, book, deps());
  const summary = summarizeImport({ accounts: rows.accounts, movements: rows.movements }, data.movements);
  return { balances: Object.fromEntries(summary.accounts.map((a) => [a.name, a.balance])), total: summary.total, rows };
}

describe('CSV_COLUMNS', () => {
  test('the seven columns, in order', () => {
    assert.deepEqual(CSV_COLUMNS, ['fecha', 'tipo', 'importe', 'cuenta', 'cuenta destino', 'categoría', 'nota']);
  });
});

describe('csvToImport: header', () => {
  test('the exact header and no rows gives empty data', () => {
    const data = dataOf(HEADER);
    assert.equal(data.format, IMPORT_FORMAT);
    assert.equal(data.version, IMPORT_VERSION);
    assert.deepEqual(data.accounts, []);
    assert.deepEqual(data.categories, []);
    assert.deepEqual(data.movements, []);
    assert.deepEqual(data.lines, { accounts: [], categories: [], movements: [] });
  });

  test('case, accents and spaces in the header do not matter', () => {
    assert.ok(csvToImport('FECHA;Tipo;IMPORTE; Cuenta ;Cuenta  Destino;CATEGORIA;Nota').data);
    assert.ok(csvToImport('fecha,tipo,importe,cuenta,cuenta destino,categoria,nota').data, 'comma separator');
  });

  test('the last column nota may be missing', () => {
    const data = dataOf('fecha;tipo;importe;cuenta;cuenta destino;categoría\n2026-10-01;gasto;5;Banco;;Ocio');
    assert.equal(data.movements[0].note, '');
  });

  test('anything else is not_template', () => {
    const notTemplate = { errors: [{ at: 'file', code: 'not_template' }] };
    for (const text of [
      '',
      '\n\n',
      'fecha;tipo;importe;cuenta;cuenta destino',
      'tipo;fecha;importe;cuenta;cuenta destino;categoría;nota',
      'date;type;amount;account;to;category;note',
      'fecha;tipo;importe;cuenta;cuenta destino;categoría;nota;extra',
      '2026-10-01;gasto;5;Banco;;Ocio;',
    ]) {
      assert.deepEqual(csvToImport(text), notTemplate, JSON.stringify(text));
    }
  });

  test('a BOM and CRLF (as Excel saves it) are fine', () => {
    const data = dataOf(`﻿${HEADER}\r\n2026-10-01;gasto;5;Banco;;Ocio;\r\n`);
    assert.equal(data.movements.length, 1);
  });
});

describe('csvToImport: types', () => {
  test('gasto and ingreso become movements of an account with a category', () => {
    const data = dataOf(csv('2026-10-01;gasto;12,50;Banco;;Ocio;cine', '2026-10-02;ingreso;1500;Banco;;Nómina;'));
    assert.deepEqual(data.movements, [
      { date: '2026-10-01', amount: 12.5, note: 'cine', account: 'banco', type: 'expense', category: 'ocio' },
      { date: '2026-10-02', amount: 1500, note: '', account: 'banco', type: 'income', category: 'nomina' },
    ]);
  });

  test('transferencia goes from cuenta to cuenta destino, its categoría is ignored', () => {
    const data = dataOf(csv('2026-10-05;transferencia;200;Banco;Hucha;Ocio;ahorro'));
    assert.deepEqual(data.movements, [
      { date: '2026-10-05', amount: 200, note: 'ahorro', transfer: { from: 'banco', to: 'hucha' } },
    ]);
    assert.deepEqual(data.categories, []);
    assert.deepEqual(data.accounts.map((a) => a.name), ['Banco', 'Hucha']);
  });

  test('type words ignore case, accents and extra spaces', () => {
    const data = dataOf(csv(
      '2026-10-01; GASTO ;1;Banco;;Ocio;',
      '2026-10-01;Ingreso;1;Banco;;Varios;',
      '2026-10-01;Transferéncia;1;Banco;Hucha;;',
      ';Saldo  Inicial;10;Hucha;;;',
    ));
    assert.deepEqual(data.movements.map((m) => m.type ?? 'transfer'), ['expense', 'income', 'transfer']);
    assert.equal(data.accounts.find((a) => a.name === 'Hucha').initialBalance, 10);
  });

  test('an unknown type is type_invalid at its line', () => {
    assert.deepEqual(csvToImport(csv('2026-10-01;gasto;1;Banco;;Ocio;', '2026-10-01;compra;1;Banco;;Ocio;')),
      { errors: [{ at: 'lines[2]', code: 'type_invalid' }] });
    assert.deepEqual(csvToImport(csv('2026-10-01;;1;Banco;;Ocio;')), { errors: [{ at: 'lines[1]', code: 'type_invalid' }] });
  });
});

describe('csvToImport: dates and amounts', () => {
  const firstMovement = (line) => dataOf(csv(line)).movements[0];

  test('YYYY-MM-DD is kept', () => {
    assert.equal(firstMovement('2026-10-31;gasto;1;Banco;;Ocio;').date, '2026-10-31');
  });

  test('D/M/YYYY becomes YYYY-MM-DD', () => {
    assert.equal(firstMovement('25/10/2026;gasto;1;Banco;;Ocio;').date, '2026-10-25');
    assert.equal(firstMovement('5/1/2026;gasto;1;Banco;;Ocio;').date, '2026-01-05');
    assert.equal(firstMovement(' 29/02/2028 ;gasto;1;Banco;;Ocio;').date, '2028-02-29');
  });

  test('a date that does not exist is left for validateImport', () => {
    const data = dataOf(csv('31/02/2026;gasto;1;Banco;;Ocio;', '2026/10/25;gasto;1;Banco;;Ocio;'));
    assert.deepEqual(data.movements.map((m) => m.date), ['2026-02-31', '2026/10/25']);
    assert.deepEqual(validateImport(data), [
      { at: 'movements[0]', code: 'date_invalid' },
      { at: 'movements[1]', code: 'date_invalid' },
    ]);
  });

  test('Spanish amounts', () => {
    assert.equal(firstMovement('2026-10-01;gasto;"1.250,50";Banco;;Ocio;').amount, 1250.5);
    assert.equal(firstMovement('2026-10-01;gasto;12,5;Banco;;Ocio;').amount, 12.5);
    assert.equal(firstMovement('2026-10-01;gasto;12.50;Banco;;Ocio;').amount, 12.5);
    assert.equal(firstMovement('2026-10-01;gasto;0,01;Banco;;Ocio;').amount, 0.01);
    assert.equal(firstMovement('2026-10-01;gasto;1.000.000;Banco;;Ocio;').amount, 1_000_000);
  });

  test('an amount that is not a number is left for validateImport (amount_invalid)', () => {
    const data = dataOf(csv('2026-10-01;gasto;doce;Banco;;Ocio;', '2026-10-01;gasto;;Banco;;Ocio;', '2026-10-01;gasto;0;Banco;;Ocio;'));
    assert.ok(Number.isNaN(data.movements[0].amount));
    assert.deepEqual(validateImport(data).map((e) => [e.at, e.code]), [
      ['movements[0]', 'amount_invalid'],
      ['movements[1]', 'amount_invalid'],
      ['movements[2]', 'amount_invalid'],
    ]);
  });
});

describe('csvToImport: saldo inicial', () => {
  test('sets the initial balance and hasInitialBalance; may be negative or zero', () => {
    const data = dataOf(csv(';saldo inicial;"1.000,00";Banco;;;', ';saldo inicial;-20,50;Hucha;;;', ';saldo inicial;0;Caja;;;'));
    assert.deepEqual(data.accounts, [
      { key: 'banco', name: 'Banco', emoji: '', initialBalance: 1000, hasInitialBalance: true },
      { key: 'hucha', name: 'Hucha', emoji: '', initialBalance: -20.5, hasInitialBalance: true },
      { key: 'caja', name: 'Caja', emoji: '', initialBalance: 0, hasInitialBalance: true },
    ]);
    assert.deepEqual(data.movements, []);
  });

  test('an account without saldo inicial starts at 0 with hasInitialBalance false', () => {
    const data = dataOf(csv('2026-10-01;gasto;1;Banco;;Ocio;'));
    assert.deepEqual(data.accounts, [{ key: 'banco', name: 'Banco', emoji: '', initialBalance: 0, hasInitialBalance: false }]);
  });

  test('saldo inicial may come after the movements of its account', () => {
    const data = dataOf(csv('2026-10-01;gasto;1;Banco;;Ocio;', ';saldo inicial;50;banco;;;'));
    assert.equal(data.accounts.length, 1);
    assert.equal(data.accounts[0].initialBalance, 50);
    assert.equal(data.accounts[0].hasInitialBalance, true);
  });

  test('without account: account_unknown', () => {
    assert.deepEqual(csvToImport(csv(';saldo inicial;50;;;;')), { errors: [{ at: 'lines[1]', code: 'account_unknown' }] });
    assert.deepEqual(csvToImport(csv(';saldo inicial;50;   ;;;')), { errors: [{ at: 'lines[1]', code: 'account_unknown' }] });
  });

  test('twice for the same account (any case): initial_balance_repeated at the second', () => {
    assert.deepEqual(csvToImport(csv(';saldo inicial;50;Banco;;;', '2026-10-01;gasto;1;Banco;;Ocio;', ';saldo inicial;50;BANCO;;;')),
      { errors: [{ at: 'lines[3]', code: 'initial_balance_repeated' }] });
  });

  test('not a number: initial_balance_invalid', () => {
    assert.deepEqual(csvToImport(csv(';saldo inicial;mucho;Banco;;;')), { errors: [{ at: 'lines[1]', code: 'initial_balance_invalid' }] });
    assert.deepEqual(csvToImport(csv(';saldo inicial;;Banco;;;')), { errors: [{ at: 'lines[1]', code: 'initial_balance_invalid' }] });
  });

  test('three decimals are left for validateImport', () => {
    const data = dataOf(csv(';saldo inicial;10,005;Banco;;;'));
    assert.deepEqual(validateImport(data), [{ at: 'accounts[0]', code: 'initial_balance_invalid' }]);
  });
});

describe('csvToImport: errors and lines', () => {
  test('more than seven cells: columns_invalid', () => {
    assert.deepEqual(csvToImport(csv('2026-10-01;gasto;1;Banco;;Ocio;nota;de más')), { errors: [{ at: 'lines[1]', code: 'columns_invalid' }] });
  });

  test('every error keeps the file line, counting blank lines and multi-line notes', () => {
    const text = csv(
      '2026-10-01;gasto;1;Banco;;Ocio;"nota\nen dos líneas"', // line 2-3
      '',                                                    // line 4
      '2026-10-01;regalo;1;Banco;;Ocio;',                    // line 5
      ';saldo inicial;x;Banco;;;',                           // line 6
      '1;2;3;4;5;6;7;8',                                     // line 7
    );
    assert.deepEqual(csvToImport(text), {
      errors: [
        { at: 'lines[4]', code: 'type_invalid' },
        { at: 'lines[5]', code: 'initial_balance_invalid' },
        { at: 'lines[6]', code: 'columns_invalid' },
      ],
    });
  });

  test('with errors no data is returned', () => {
    const result = csvToImport(csv('2026-10-01;regalo;1;Banco;;Ocio;'));
    assert.equal(result.data, undefined);
  });
});

describe('csvToImport: accounts and categories by name', () => {
  test('deduped by normalized name; the first spelling is kept', () => {
    const data = dataOf(csv(
      '2026-10-01;gasto;1; Banco ;;Café;',
      '2026-10-02;gasto;1;BANCO;;cafe;',
      '2026-10-03;gasto;1;banco;;  CAFÉ ;',
    ));
    assert.deepEqual(data.accounts.map((a) => [a.key, a.name]), [['banco', 'Banco']]);
    assert.deepEqual(data.categories.map((c) => [c.key, c.name]), [['cafe', 'Café']]);
    assert.deepEqual(data.movements.map((m) => [m.account, m.category]), [['banco', 'cafe'], ['banco', 'cafe'], ['banco', 'cafe']]);
  });

  test('a category gets the kind of its first use', () => {
    const data = dataOf(csv('2026-10-01;gasto;1;Banco;;Varios;', '2026-10-02;ingreso;1;Banco;;Varios;'));
    assert.deepEqual(data.categories, [{ key: 'varios', name: 'Varios', emoji: '', kind: 'expense' }]);
    assert.deepEqual(validateImport(data), [{ at: 'movements[1]', code: 'category_kind_mismatch' }]);
  });

  test('empty account or category is left for validateImport as unknown', () => {
    const data = dataOf(csv('2026-10-01;gasto;1;;;Ocio;', '2026-10-01;gasto;1;Banco;;;', '2026-10-01;transferencia;1;Banco;;;'));
    assert.deepEqual(data.accounts.map((a) => a.name), ['Banco']);
    assert.deepEqual(data.categories.map((c) => c.name), ['Ocio']);
    assert.deepEqual(validateImport(data), [
      { at: 'movements[0]', code: 'account_unknown' },
      { at: 'movements[1]', code: 'category_unknown' },
      { at: 'movements[2]', code: 'account_unknown' },
    ]);
  });

  test('notes are trimmed', () => {
    assert.equal(dataOf(csv('2026-10-01;gasto;1;Banco;;Ocio;"  con espacios  "')).movements[0].note, 'con espacios');
  });

  test('lines maps each account, category and movement to its file line', () => {
    const data = dataOf(csv(
      ';saldo inicial;100;Banco;;;',               // 2
      '',                                          // 3
      '2026-10-01;gasto;1;Banco;;Ocio;',           // 4
      '2026-10-02;transferencia;5;Banco;Hucha;;',  // 5
      '2026-10-03;ingreso;7;Hucha;;Nómina;',       // 6
      '2026-10-04;gasto;2;Hucha;;ocio;',           // 7
    ));
    assert.deepEqual(data.lines, { accounts: [2, 5], categories: [4, 6], movements: [4, 5, 6, 7] });
  });

  test('a saldo inicial after the first use moves the account line there', () => {
    const data = dataOf(csv(
      '2026-10-02;transferencia;5;Banco;Hucha;;',  // 2
      ';saldo inicial;100;Hucha;;;',               // 3
      '2026-10-03;gasto;1;Caja;;Ocio;',            // 4
    ));
    assert.deepEqual(data.lines.accounts, [2, 3, 4]);
    assert.deepEqual(data.lines.movements, [2, 4]);
  });
});

describe('locateErrors', () => {
  const lines = { accounts: [2, 5], categories: [4], movements: [4, 5, 9] };

  test('without lines (a JSON file) errors are returned as they are', () => {
    const errors = [{ at: 'movements[0]', code: 'amount_invalid' }];
    assert.equal(locateErrors(errors, undefined), errors);
  });

  test('accounts, categories and movements point at their file line', () => {
    assert.deepEqual(locateErrors([
      { at: 'accounts[1]', code: 'initial_balance_conflict' },
      { at: 'categories[0]', code: 'category_reserved' },
      { at: 'movements[2]', code: 'date_invalid' },
    ], lines), [
      { at: 'lines[3]', code: 'category_reserved' },
      { at: 'lines[4]', code: 'initial_balance_conflict' },
      { at: 'lines[8]', code: 'date_invalid' },
    ]);
  });

  test('sorted by file line, stable; errors without a line go first', () => {
    assert.deepEqual(locateErrors([
      { at: 'movements[2]', code: 'date_invalid' },
      { at: 'movements[0]', code: 'amount_invalid' },
      { at: 'categories[0]', code: 'kind_invalid' },
      { at: 'file', code: 'x' },
      { at: 'movements[0]', code: 'category_unknown' },
      { at: 'movements', code: 'movements_missing' },
      { at: 'accounts[0]', code: 'initial_balance_conflict' },
    ], lines), [
      { at: 'file', code: 'x' },
      { at: 'movements', code: 'movements_missing' },
      { at: 'lines[1]', code: 'initial_balance_conflict' },
      // Same line 4: kept in the order given.
      { at: 'lines[3]', code: 'amount_invalid' },
      { at: 'lines[3]', code: 'kind_invalid' },
      { at: 'lines[3]', code: 'category_unknown' },
      { at: 'lines[8]', code: 'date_invalid' },
    ]);
  });

  test('the errors given are not changed', () => {
    const errors = [{ at: 'movements[2]', code: 'date_invalid' }, { at: 'movements[0]', code: 'amount_invalid' }];
    const before = structuredClone(errors);
    locateErrors(errors, lines);
    assert.deepEqual(errors, before);
  });

  test('an account with saldo inicial points at that line', () => {
    const data = dataOf(csv(
      '2026-10-01;gasto;1;Banco;;Ocio;',     // 2: Banco first shows up
      '2026-10-01;gasto;1;Hucha;;Ocio;',     // 3: Hucha first shows up
      ';saldo inicial;10;banco;;;',          // 4: saldo inicial of Banco
    ));
    assert.deepEqual(data.lines.accounts, [4, 3]);
    const book = { accounts: [{ id: 'b', name: 'Banco', initialBalance: 99, deleted: false }], categories: [], movements: [] };
    assert.deepEqual(locateErrors(validateImport(data, book), data.lines), [{ at: 'lines[3]', code: 'initial_balance_conflict' }]);
  });

  test('errors without an index or without a known line stay as they are', () => {
    const errors = [
      { at: 'file', code: 'not_template' },
      { at: 'accounts', code: 'accounts_missing' },
      { at: 'movements[7]', code: 'date_invalid' },
    ];
    assert.deepEqual(locateErrors(errors, lines), errors);
  });

  test('csvToImport + validateImport + locateErrors give the CSV line', () => {
    const data = dataOf(csv(';saldo inicial;1;Banco;;;', '', '2026-04-31;gasto;1;Banco;;Ocio;'));
    assert.deepEqual(locateErrors(validateImport(data), data.lines), [{ at: 'lines[3]', code: 'date_invalid' }]);
  });
});

describe('parseImportFile', () => {
  test('JSON goes to parseImport', () => {
    const json = { format: 'cartos-import', version: 1, accounts: [], categories: [], movements: [] };
    assert.deepEqual(parseImportFile(`  \n${JSON.stringify(json)}`), { data: json });
    assert.deepEqual(parseImportFile('{ roto'), { errors: [{ at: 'file', code: 'not_json' }] });
    assert.deepEqual(parseImportFile('{"format":"otro"}'), { errors: [{ at: 'file', code: 'not_cartos' }] });
  });

  test('anything else goes to csvToImport', () => {
    assert.equal(parseImportFile(csv('2026-10-01;gasto;1;Banco;;Ocio;')).data.movements.length, 1);
    assert.deepEqual(parseImportFile('hola'), { errors: [{ at: 'file', code: 'not_template' }] });
    assert.deepEqual(parseImportFile(''), { errors: [{ at: 'file', code: 'not_template' }] });
  });
});

// A small invented book, as readBook returns it.
function sampleBook() {
  const at = (n) => `2026-10-28T10:00:00.00${n}Z`;
  const mov = (fields) => ({
    note: '', transferId: '', personId: '', createdBy: 'user-1', deleted: false, ...fields, updatedAt: fields.createdAt,
  });
  return {
    accounts: [
      { id: 'acc-1', name: 'Banco', emoji: '🏦', initialBalance: 1000, deleted: false },
      { id: 'acc-2', name: 'Hucha', emoji: '', initialBalance: -20.5, deleted: false },
      { id: 'acc-3', name: 'Vieja', emoji: '', initialBalance: 5, deleted: true },
      { id: 'acc-4', name: 'Cerrada', emoji: '', initialBalance: 7, deleted: true },
    ],
    categories: [
      { id: TRANSFER_CATEGORY_ID, name: 'Transferencia', kind: 'both', deleted: false },
      { id: 'cat-food', name: 'Comida', kind: 'expense', deleted: false },
      { id: 'cat-pay', name: 'Nómina', kind: 'income', deleted: false },
    ],
    movements: [
      mov({ id: 'm5', accountId: 'acc-2', type: 'expense', amount: 12.5, date: '2026-01-05', categoryId: 'cat-food', createdAt: at(9) }),
      mov({ id: 'm1', accountId: 'acc-1', type: 'income', amount: 1500, date: '2026-01-02', categoryId: 'cat-pay', note: 'Enero', createdAt: at(1) }),
      mov({ id: 'm2', accountId: 'acc-1', type: 'expense', amount: 45.2, date: '2026-01-03', categoryId: 'cat-food', createdAt: at(2) }),
      mov({ id: 't-out', accountId: 'acc-1', type: 'expense', amount: 200, date: '2026-01-05', categoryId: TRANSFER_CATEGORY_ID, transferId: 'tr-1', note: 'ahorro', createdAt: at(3) }),
      mov({ id: 't-in', accountId: 'acc-2', type: 'income', amount: 200, date: '2026-01-05', categoryId: TRANSFER_CATEGORY_ID, transferId: 'tr-1', note: 'ahorro', createdAt: at(3) }),
      mov({ id: 'm3', accountId: 'acc-3', type: 'expense', amount: 3, date: '2026-01-01', categoryId: 'cat-food', createdAt: at(4) }),
      mov({ id: 'm4', accountId: 'acc-1', type: 'expense', amount: 99, date: '2026-01-04', categoryId: 'cat-food', createdAt: at(5), deleted: true }),
    ],
  };
}

describe('bookToCsv', () => {
  test('BOM, CRLF and the header first', () => {
    const text = bookToCsv(sampleBook());
    assert.ok(text.startsWith(`﻿${HEADER}\r\n`));
    assert.ok(text.endsWith('\r\n'));
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF');
  });

  test('saldo inicial lines first, then movements oldest first; a transfer is one line', () => {
    const rows = parseCsv(bookToCsv(sampleBook())).map((row) => row.cells);
    assert.deepEqual(rows, [
      [...CSV_COLUMNS],
      ['', 'saldo inicial', '1000,00', 'Banco', '', '', ''],
      ['', 'saldo inicial', '-20,50', 'Hucha', '', '', ''],
      ['', 'saldo inicial', '5,00', 'Vieja', '', '', ''],
      ['2026-01-01', 'gasto', '3,00', 'Vieja', '', 'Comida', ''],
      ['2026-01-02', 'ingreso', '1500,00', 'Banco', '', 'Nómina', 'Enero'],
      ['2026-01-03', 'gasto', '45,20', 'Banco', '', 'Comida', ''],
      ['2026-01-05', 'transferencia', '200,00', 'Banco', 'Hucha', '', 'ahorro'],
      ['2026-01-05', 'gasto', '12,50', 'Hucha', '', 'Comida', ''],
    ]);
  });

  test('deleted movements are left out; a deleted account only if a movement uses it', () => {
    const text = bookToCsv(sampleBook());
    assert.equal(text.includes('99,00'), false);
    assert.equal(text.includes('Cerrada'), false);
    assert.equal(text.includes('Vieja'), true);
  });

  test('amounts always with two decimals and a comma, large ones exact', () => {
    const book = sampleBook();
    book.accounts[0].initialBalance = 1_234_567.89;
    book.movements[1].amount = 0.01;
    const rows = parseCsv(bookToCsv(book)).map((row) => row.cells);
    assert.equal(rows[1][2], '1234567,89');
    assert.equal(rows.find((r) => r[6] === 'Enero')[2], '0,01');
  });

  test('a book with no movements gives only the saldo inicial lines', () => {
    const book = sampleBook();
    book.movements = [];
    assert.deepEqual(parseCsv(bookToCsv(book)).map((row) => row.cells.slice(1, 4)), [
      ['tipo', 'importe', 'cuenta'],
      ['saldo inicial', '1000,00', 'Banco'],
      ['saldo inicial', '-20,50', 'Hucha'],
    ]);
  });
});

describe('round trip: book → bookToCsv → csvToImport → buildImport', () => {
  function roundTripBook() {
    const book = sampleBook();
    // Only active accounts, so the totals compare one to one.
    book.accounts = book.accounts.slice(0, 2);
    book.movements = book.movements.filter((m) => m.accountId !== 'acc-3');
    book.movements[1].note = 'dijo "hola"; luego\nse fue';
    return book;
  }

  test('same balance per account and same total', () => {
    const book = roundTripBook();
    const { balances, total } = importedBalances(bookToCsv(book));
    // Banco: 1000 + 1500 - 45,20 - 200 = 2254,80. Hucha: -20,50 + 200 - 12,50 = 167.
    assert.deepEqual(balances, { Banco: 2254.8, Hucha: 167 });
    for (const account of book.accounts) assert.equal(balances[account.name], accountBalance(account, book.movements));
    assert.equal(total, 2421.8);
  });

  test('same movements: dates, types, amounts, notes and categories', () => {
    const { rows } = importedBalances(bookToCsv(roundTripBook()));
    const names = new Map([...rows.accounts, ...rows.categories].map((r) => [r.id, r.name]));
    names.set(TRANSFER_CATEGORY_ID, 'Transferencia');
    assert.deepEqual(rows.movements.map((m) => [m.date, names.get(m.accountId), m.type, m.amount, names.get(m.categoryId), m.note]), [
      ['2026-01-02', 'Banco', 'income', 1500, 'Nómina', 'dijo "hola"; luego\nse fue'],
      ['2026-01-03', 'Banco', 'expense', 45.2, 'Comida', ''],
      ['2026-01-05', 'Banco', 'expense', 200, 'Transferencia', 'ahorro'],
      ['2026-01-05', 'Hucha', 'income', 200, 'Transferencia', 'ahorro'],
      ['2026-01-05', 'Hucha', 'expense', 12.5, 'Comida', ''],
    ]);
    // Transferencia comes from the book, never as a new category.
    assert.deepEqual(rows.categories.map((c) => c.name), ['Nómina', 'Comida']);
  });

  test('every account has hasInitialBalance', () => {
    const data = dataOf(bookToCsv(roundTripBook()));
    for (const account of data.accounts) assert.equal(account.hasInitialBalance, true);
  });

  test('importing the CSV back into the same book: no conflicts, nothing new but the movements', () => {
    const book = roundTripBook();
    const data = dataOf(bookToCsv(book));
    assert.deepEqual(validateImport(data, book), []);
    const rows = buildImport(data, book, deps());
    assert.deepEqual(rows.accounts, []);
    assert.deepEqual(rows.categories, []);
    assert.equal(rows.movements.length, 5);
  });
});

describe('templateCsv', () => {
  test('header first, then the example rows', () => {
    const rows = parseCsv(templateCsv(es.importer.templateRows)).map((row) => row.cells);
    assert.deepEqual(rows, [[...CSV_COLUMNS], ...es.importer.templateRows]);
  });

  test('the i18n template imports with no errors and the expected balances', () => {
    const { balances, total } = importedBalances(templateCsv(es.importer.templateRows));
    // Banco: 1000 + 1500 - 45,20 - 200 = 2254,80. Efectivo: 50 + 200 - 12,50 = 237,50.
    assert.deepEqual(balances, { Banco: 2254.8, Efectivo: 237.5 });
    assert.equal(total, 2492.3);
  });

  test('an empty template is just the header', () => {
    assert.equal(templateCsv([]), `﻿${HEADER}\r\n`);
  });
});
