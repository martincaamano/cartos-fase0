// Maps domain objects to Sheet rows and back. The first row of every tab is
// the header; columns are matched by position, so the header order here is
// the contract with the Sheet.

export const HEADERS = Object.freeze({
  Accounts: ['id', 'name', 'emoji', 'initialBalance', 'createdAt', 'updatedAt', 'deleted'],
  Categories: ['id', 'name', 'emoji', 'kind', 'isDefault', 'updatedAt', 'deleted'],
  Movements: [
    'id', 'accountId', 'type', 'amount', 'date', 'categoryId', 'note', 'transferId',
    'personId', 'createdBy', 'createdAt', 'updatedAt', 'deleted',
  ],
});

export const SHEET_NAMES = Object.freeze(Object.keys(HEADERS));

const NUMBER_COLUMNS = new Set(['initialBalance', 'amount']);
const BOOLEAN_COLUMNS = new Set(['deleted', 'isDefault']);

export class SheetFormatError extends Error {
  constructor(sheet) {
    super(`Unexpected headers in sheet ${sheet}`);
    this.sheet = sheet;
  }
}

export function toRow(sheet, object) {
  return HEADERS[sheet].map((column) => object[column] ?? '');
}

export function fromRow(sheet, row) {
  const object = {};
  HEADERS[sheet].forEach((column, i) => {
    const value = row[i];
    if (NUMBER_COLUMNS.has(column)) object[column] = value === '' || value === undefined ? 0 : Number(value);
    else if (BOOLEAN_COLUMNS.has(column)) object[column] = value === true || value === 'TRUE';
    else object[column] = value === undefined || value === null ? '' : String(value);
  });
  return object;
}

// values: what the Sheets API returns for a whole tab (header included).
// Refuses to guess if someone reordered the columns by hand.
export function rowsToObjects(sheet, values = []) {
  const [header = [], ...rows] = values;
  const expected = HEADERS[sheet];
  if (expected.some((column, i) => header[i] !== column)) throw new SheetFormatError(sheet);
  return rows.filter((row) => row.length > 0 && row[0] !== '').map((row) => fromRow(sheet, row));
}

// idColumn: column A of a tab as the Sheets API returns it (header
// included). Maps each id to its 1-based row number; the first row wins if
// an id were repeated. Rows are always found by id, never remembered.
export function rowsById(idColumn = []) {
  const rows = new Map();
  idColumn.forEach((row, index) => {
    const id = String(row?.[0] ?? '');
    if (index > 0 && id && !rows.has(id)) rows.set(id, index + 1);
  });
  return rows;
}

export function findRowById(idColumn, id) {
  return rowsById(idColumn).get(id) ?? null;
}
