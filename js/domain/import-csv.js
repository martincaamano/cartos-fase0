// The Cartos CSV (docs/tareas/tarea-16.md): the template, the download from
// Ajustes and the file the importer reads all share these columns:
//
//   fecha;tipo;importe;cuenta;cuenta destino;categoría;nota
//
// tipo is gasto, ingreso, transferencia (from cuenta to cuenta destino, no
// categoría) or saldo inicial (cuenta and importe, which may be negative).
// Accounts and categories go by name: one already in the book is that one,
// a new one is created (a category gets the type of its first movement).
// The CSV becomes the cartos-import data of import.js, so both formats are
// checked and written the same way.

import { parseCsv, toCsv } from './csv.js';
import { IMPORT_FORMAT, IMPORT_VERSION, parseImport } from './import.js';
import { parseAmountInput, toCents } from './money.js';
import { groupEntries, newestFirst } from './transfer.js';

export const CSV_COLUMNS = Object.freeze(['fecha', 'tipo', 'importe', 'cuenta', 'cuenta destino', 'categoría', 'nota']);

const TYPE_BY_WORD = { gasto: 'expense', ingreso: 'income', transferencia: 'transfer', 'saldo inicial': 'initial' };
const WORD_BY_TYPE = { expense: 'gasto', income: 'ingreso' };

// "  Categoría " and "categoria" are the same word.
const normalize = (text) => String(text ?? '').trim().toLocaleLowerCase('es')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');

const isHeader = (cells) => cells.length >= CSV_COLUMNS.length - 1
  && cells.every((cell, i) => normalize(cell) === normalize(CSV_COLUMNS[i]));

// 2026-10-25 stays; 25/10/2026 (how Spanish spreadsheets save dates) becomes
// 2026-10-25. Anything else is left for the validation to reject.
function readDate(text) {
  const value = text.trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : value;
}

const readAmount = (text) => parseAmountInput(text) ?? Number.NaN;

const lineAt = (line) => `lines[${line - 1}]`;

// Text of a CSV → { data } (cartos-import, plus `lines`: the file line of
// each account, category and movement) or { errors }.
export function csvToImport(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header || !isHeader(header.cells)) return { errors: [{ at: 'file', code: 'not_template' }] };

  const accounts = new Map();
  const categories = new Map();
  const movements = [];
  const lines = { accounts: [], categories: [], movements: [] };
  const errors = [];

  // A named account or category, created the first time it shows up. ''
  // for an empty name, which the validation reports as unknown.
  const accountKey = (name, line) => {
    const key = normalize(name);
    if (key && !accounts.has(key)) {
      accounts.set(key, { key, name: name.trim(), emoji: '', initialBalance: 0, hasInitialBalance: false });
      lines.accounts.push(line);
    }
    return key;
  };
  const categoryKey = (name, kind, line) => {
    const key = normalize(name);
    if (key && !categories.has(key)) {
      categories.set(key, { key, name: name.trim(), emoji: '', kind });
      lines.categories.push(line);
    }
    return key;
  };

  for (const { line, cells } of rows) {
    const add = (code) => errors.push({ at: lineAt(line), code });
    if (cells.length > CSV_COLUMNS.length) {
      add('columns_invalid');
      continue;
    }
    const [date = '', word = '', amountText = '', from = '', to = '', category = '', note = ''] = cells;
    const type = TYPE_BY_WORD[normalize(word)];
    const amount = readAmount(amountText);
    if (!type) {
      add('type_invalid');
    } else if (type === 'initial') {
      const key = accountKey(from, line);
      const account = accounts.get(key);
      if (!account) add('account_unknown');
      else if (account.hasInitialBalance) add('initial_balance_repeated');
      else if (Number.isNaN(amount)) add('initial_balance_invalid');
      else {
        Object.assign(account, { initialBalance: amount, hasInitialBalance: true });
        // A problem with the account is about its saldo inicial line.
        lines.accounts[[...accounts.keys()].indexOf(key)] = line;
      }
    } else {
      const shared = { date: readDate(date), amount, note: note.trim() };
      movements.push(type === 'transfer'
        ? { ...shared, transfer: { from: accountKey(from, line), to: accountKey(to, line) } }
        : { ...shared, account: accountKey(from, line), type, category: categoryKey(category, type, line) });
      lines.movements.push(line);
    }
  }
  if (errors.length) return { errors };
  return {
    data: {
      format: IMPORT_FORMAT,
      version: IMPORT_VERSION,
      accounts: [...accounts.values()],
      categories: [...categories.values()],
      movements,
      lines,
    },
  };
}

// Errors of validateImport on a CSV point at lines of the file:
// movements[3] → the line that movement came from (an account: its saldo
// inicial line, or else where it first shows up). Sorted by line.
export function locateErrors(errors, lines) {
  if (!lines) return errors;
  const located = errors.map((error) => {
    const [, list, index] = error.at.match(/^(\w+)\[(\d+)\]$/) ?? [];
    const line = list && lines[list]?.[Number(index)];
    return { error: line ? { ...error, at: lineAt(line) } : error, line: line || 0 };
  });
  return located.sort((a, b) => a.line - b.line).map(({ error }) => error);
}

// Either format: JSON (a cartos-import file) or the CSV.
// A BOM (Windows editors add one) is not part of either.
export function parseImportFile(text) {
  const clean = text.replace(/^\uFEFF/, '');
  return clean.trimStart().startsWith('{') ? parseImport(clean) : csvToImport(clean);
}

const amountText = (amount) => (toCents(amount) / 100).toFixed(2).replace('.', ',');

// The whole book as the CSV, oldest first: a saldo inicial line per account,
// then one line per movement (a transfer is one line). Importing it into an
// empty book gives the same balances.
export function bookToCsv({ accounts, categories, movements }) {
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const entries = groupEntries(movements).sort((a, b) => newestFirst(b, a));
  const used = new Set(entries.flatMap((entry) => (entry.kind === 'transfer'
    ? [entry.from, entry.to]
    : [entry.movement.accountId])));

  const rows = [CSV_COLUMNS];
  for (const account of accounts) {
    if (!account.deleted || used.has(account.id)) {
      rows.push(['', 'saldo inicial', amountText(account.initialBalance), account.name, '', '', '']);
    }
  }
  for (const entry of entries) {
    if (entry.kind === 'transfer') {
      rows.push([entry.date, 'transferencia', amountText(entry.amount),
        accountName.get(entry.from), accountName.get(entry.to), '', entry.halves[0].note]);
    } else {
      const { movement } = entry;
      rows.push([movement.date, WORD_BY_TYPE[movement.type], amountText(movement.amount),
        accountName.get(movement.accountId), '', categoryName.get(movement.categoryId), movement.note]);
    }
  }
  return toCsv(rows);
}

// examples: rows to show how it is filled in (from i18n).
export function templateCsv(examples) {
  return toCsv([CSV_COLUMNS, ...examples]);
}
