// Plain CSV as spreadsheets write it (RFC 4180): cells may be quoted, a
// quote inside is doubled, and a quoted cell may hold the separator or a
// line break. Spanish spreadsheets use ";" (the comma is the decimal mark),
// others ","; the separator is guessed from the first line.

const BOM = '﻿';

export function detectSeparator(text) {
  const firstLine = text.replace(BOM, '').split(/\r?\n/, 1)[0];
  return firstLine.includes(';') ? ';' : ',';
}

// Text → rows of cells. Blank lines are skipped. Each row carries the line
// of the file where it starts (1-based), to point at it in errors.
export function parseCsv(text, separator = detectSeparator(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const source = text.startsWith(BOM) ? text.slice(1) : text;

  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0].trim() !== '') rows.push({ line: rowLine, cells: row });
    row = [];
    cell = '';
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

const needsQuotes = (cell, separator) => cell.includes(separator) || /["\r\n]/.test(cell) || cell !== cell.trim();

// Rows of cells → text, with a BOM so Excel reads it as UTF-8 and CRLF line
// ends, as the standard asks.
export function toCsv(rows, separator = ';') {
  const lines = rows.map((cells) => cells.map((value) => {
    const cell = String(value ?? '');
    return needsQuotes(cell, separator) ? `"${cell.replace(/"/g, '""')}"` : cell;
  }).join(separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
