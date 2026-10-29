// Plain CSV reading and writing (js/domain/csv.js). All data here is invented.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSeparator, parseCsv, toCsv } from '../js/domain/csv.js';

const BOM = '﻿';
const cellsOf = (text, separator) => parseCsv(text, separator).map((row) => row.cells);

describe('detectSeparator', () => {
  test('semicolon when the first line has one, comma otherwise', () => {
    assert.equal(detectSeparator('fecha;tipo;importe'), ';');
    assert.equal(detectSeparator('fecha,tipo,importe'), ',');
    assert.equal(detectSeparator('fecha'), ',');
    assert.equal(detectSeparator(''), ',');
  });

  test('only the first line counts', () => {
    assert.equal(detectSeparator('a,b\nc;d'), ',');
    assert.equal(detectSeparator('a;b\r\nc,d'), ';');
  });

  test('a BOM at the start does not get in the way', () => {
    assert.equal(detectSeparator(`${BOM}a;b`), ';');
  });
});

describe('parseCsv', () => {
  test('plain cells with the separator detected', () => {
    assert.deepEqual(parseCsv('a;b;c\n1;2;3'), [
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['1', '2', '3'] },
    ]);
    assert.deepEqual(cellsOf('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  test('an explicit separator wins', () => {
    assert.deepEqual(cellsOf('a;b,c', ','), [['a;b', 'c']]);
  });

  test('empty cells are kept', () => {
    assert.deepEqual(cellsOf(';;x;'), [['', '', 'x', '']]);
  });

  test('quoted cells, with doubled quotes inside', () => {
    assert.deepEqual(cellsOf('"a";"dijo ""hola""";""'), [['a', 'dijo "hola"', '']]);
  });

  test('separator inside quotes is part of the cell', () => {
    assert.deepEqual(cellsOf('"12,50";"a;b"\nx;y'), [['12,50', 'a;b'], ['x', 'y']]);
  });

  test('a line break inside quotes is part of the cell', () => {
    assert.deepEqual(cellsOf('"línea 1\nlínea 2";z', ';'), [['línea 1\nlínea 2', 'z']]);
  });

  test('a quote in the middle of an unquoted cell stays as it is', () => {
    assert.deepEqual(cellsOf('pulgada 3";b'), [['pulgada 3"', 'b']]);
  });

  test('CRLF line ends', () => {
    assert.deepEqual(parseCsv('a;b\r\nc;d\r\n'), [
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ]);
  });

  test('BOM is removed from the first cell', () => {
    assert.deepEqual(cellsOf(`${BOM}fecha;tipo\n1;2`), [['fecha', 'tipo'], ['1', '2']]);
  });

  test('blank lines are skipped but still counted', () => {
    assert.deepEqual(parseCsv('a;b\n\n   \nc;d\n\n'), [
      { line: 1, cells: ['a', 'b'] },
      { line: 4, cells: ['c', 'd'] },
    ]);
  });

  test('a line of only separators is not blank', () => {
    assert.deepEqual(parseCsv(';;'), [{ line: 1, cells: ['', '', ''] }]);
  });

  test('line is where the row starts, also after a multi-line quoted cell', () => {
    const text = 'h1;h2\n"uno\ndos\ntres";x\nfin;y\r\n"a\r\nb";c\núltima;z';
    assert.deepEqual(parseCsv(text).map((row) => row.line), [1, 2, 5, 6, 8]);
    assert.deepEqual(parseCsv(text)[1].cells, ['uno\ndos\ntres', 'x']);
  });

  test('no final line break: the last row is read', () => {
    assert.deepEqual(cellsOf('a;b\nc;d'), [['a', 'b'], ['c', 'd']]);
  });

  test('empty text gives no rows', () => {
    assert.deepEqual(parseCsv(''), []);
    assert.deepEqual(parseCsv(BOM), []);
    assert.deepEqual(parseCsv('\n\r\n'), []);
  });
});

describe('toCsv', () => {
  test('BOM at the start, CRLF after every line, ";" by default', () => {
    assert.equal(toCsv([['a', 'b'], ['1', '2']]), `${BOM}a;b\r\n1;2\r\n`);
  });

  test('another separator', () => {
    assert.equal(toCsv([['a', 'b']], ','), `${BOM}a,b\r\n`);
  });

  test('numbers, null and undefined', () => {
    assert.equal(toCsv([[12.5, null, undefined, 0]]), `${BOM}12.5;;;0\r\n`);
  });

  test('quotes only when needed', () => {
    assert.equal(toCsv([['12,50', 'x;y']]), `${BOM}12,50;"x;y"\r\n`);
    assert.equal(toCsv([['12,50']], ','), `${BOM}"12,50"\r\n`);
    assert.equal(toCsv([['dijo "hola"']]), `${BOM}"dijo ""hola"""\r\n`);
    assert.equal(toCsv([['a\nb', 'c\rd']]), `${BOM}"a\nb";"c\rd"\r\n`);
  });

  test('leading or trailing spaces are quoted so they survive', () => {
    assert.equal(toCsv([[' a', 'b ', 'c d']]), `${BOM}" a";"b ";c d\r\n`);
  });

  test('round trip with parseCsv', () => {
    const rows = [
      ['fecha', 'tipo', 'importe', 'cuenta', 'cuenta destino', 'categoría', 'nota'],
      ['2026-10-31', 'gasto', '1.250,50', 'Banco; principal', '', 'Ocio', 'dijo "hola"\ny se fue'],
      ['', 'saldo inicial', '-20,00', '  Hucha  ', '', '', ''],
      ['2026-02-28', 'transferencia', '0,01', 'A', 'B', '', ' '],
    ];
    assert.deepEqual(cellsOf(toCsv(rows)), rows);
    assert.deepEqual(cellsOf(toCsv(rows, ','), ','), rows);
    // The separator is detected again on the way back.
    assert.deepEqual(cellsOf(toCsv(rows, ',')), rows);
  });
});
