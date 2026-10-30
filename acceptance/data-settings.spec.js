// Ajustes → DATOS (tarea 16): adding movements from a CSV to the book, the
// CSV template and downloading the book. Invented data.
import { test, expect } from './fixtures.js';

const csv = (lines) => ({ name: 'movimientos.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
const HEADER = 'fecha;tipo;importe;cuenta;cuenta destino;categoría;nota';

// Downloads go through the share sheet where there is one; here, a plain download.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
});

test('a CSV adds movements to the book, reusing names and creating the rest', async ({ page, app, google }) => {
  await app.open('#/settings/data', '.settings-export');
  await page.click('.settings-data a.settings-link');
  await expect(page.locator('h1.form-title')).toHaveText('IMPORTAR MOVIMIENTOS');
  await app.settle();
  const before = google.calls.length;

  await page.setInputFiles('input[type=file]', csv([
    HEADER,
    '15/10/2026;gasto;20,50;abanca;;supermercado;pan',
    '2026-10-19;gasto;12,00;Revolut;;Libros;"novela; tapa blanda"',
    '2026-10-19;transferencia;100,00;Abanca;Revolut;;',
    ';saldo inicial;30,00;Revolut;;;',
  ]));

  // Abanca 2.434,50 − 20,50 − 100; Revolut 30 − 12 + 100; Efectivo untouched.
  expect(await app.lines('.import-accounts')).toEqual([
    ['🏦 Abanca', '2.314,00 €'],
    ['💶 Efectivo', '40,01 €'],
    ['Revolut', '118,00 €'],
    ['TOTAL', '2.472,01 €'],
  ]);
  await expect(page.locator('.import-new')).toHaveText('Se crearán 1 cuentas y 1 categorías nuevas.');
  // 15/10 Supermercado 20,50 in Abanca is already in the book.
  await expect(page.locator('.import-duplicates')).toContainText('1 movimientos parecen repetidos');
  expect(google.calls.slice(before).filter((call) => call.op !== 'drive.list' && call.op !== 'batchGet')).toEqual([]);

  await page.click('.import-confirm');
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.472,01 €');
  await app.settle();

  const appends = google.calls.filter((call) => call.op === 'append');
  expect(appends.map((call) => [call.tab, call.body.values.length, call.valueInputOption])).toEqual([
    ['Accounts', 1, 'RAW'], ['Categories', 1, 'RAW'], ['Movements', 4, 'RAW'],
  ]);
  expect(google.rows.Accounts.at(-1).slice(1, 4)).toEqual(['Revolut', '', 30]);
  expect(google.rows.Categories.at(-1).slice(1, 4)).toEqual(['Libros', '', 'expense']);
  const added = google.movements().slice(-4);
  expect(added.map((m) => [m.date, m.type, m.amount, m.note])).toEqual([
    ['2026-10-15', 'expense', 20.5, 'pan'],
    ['2026-10-19', 'expense', 12, 'novela; tapa blanda'],
    ['2026-10-19', 'expense', 100, ''],
    ['2026-10-19', 'income', 100, ''],
  ]);
  expect(added[0].accountId).toBe('acc-bank');
  expect(added[0].categoryId).toBe('cat-food');
  expect(added[2].transferId).toBe(added[3].transferId);
});

test('a CSV with mistakes points at its lines and writes nothing', async ({ page, app, google }) => {
  await app.open('#/settings/import', '.import-pick');
  await page.setInputFiles('input[type=file]', csv([
    HEADER,
    '2026-10-19;gasto;12,345;Abanca;;Supermercado;',
    '2026-10-19;compra;12;Abanca;;Supermercado;',
    '2026-10-19;ingreso;12;Abanca;;Supermercado;',
    ';saldo inicial;999;Abanca;;;',
  ]));
  await expect(page.locator('.import-error-list li')).toHaveText([
    'Línea 3: tipo no válido (gasto, ingreso, transferencia o saldo inicial)',
  ]);
  await page.setInputFiles('input[type=file]', csv([
    HEADER,
    '2026-10-19;gasto;12,345;Abanca;;Supermercado;',
    '2026-10-19;ingreso;12;Abanca;;Supermercado;',
    '2026-10-19;gasto;5;Abanca;;Transferencia;',
    ';saldo inicial;999;Abanca;;;',
  ]));
  await expect(page.locator('.import-error-list li')).toHaveText([
    'Línea 2: importe no válido',
    'Línea 3: la categoría no es de ese tipo',
    'Línea 4: Transferencia no es una categoría: usa el tipo transferencia',
    'Línea 5: el saldo inicial no coincide con el de la cuenta',
  ]);
  await expect(page.locator('.import-preview')).toBeHidden();
  expect(google.writes()).toEqual([]);

  await page.click('.back-link');
  await expect(page.locator('.settings-list')).toBeVisible();
});

test('the template downloads and imports as it is', async ({ page, app }) => {
  await app.open('#/settings/data', '.settings-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.settings-template')]);
  expect(download.suggestedFilename()).toBe('cartos-plantilla.csv');
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  expect(text.replace('﻿', '').split('\r\n')[0]).toBe(HEADER);

  await app.go('#/settings/import');
  await page.setInputFiles('input[type=file]', { name: 'cartos-plantilla.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  await expect(page.locator('.import-preview')).toBeVisible();
  await expect(page.locator('.import-new')).toHaveText('Se crearán 1 cuentas y 0 categorías nuevas.');
});

test('my data downloads as the CSV, saldo inicial first and oldest first', async ({ page, app }) => {
  await app.open('#/settings/data', '.settings-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.settings-export')]);
  expect(download.suggestedFilename()).toBe('cartos-2026-10-20.csv');
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  expect(text.replace('﻿', '').trim().split('\r\n')).toEqual([
    HEADER,
    ';saldo inicial;1000,00;Abanca;;;',
    ';saldo inicial;50,00;Efectivo;;;',
    '2026-09-15;gasto;9,99;Efectivo;;Supermercado;',
    '2026-10-01;ingreso;1500,00;Abanca;;Nómina;',
    '2026-10-15;gasto;20,50;Abanca;;Supermercado;',
    '2026-10-18;gasto;45,00;Abanca;;Restaurantes;cena',
  ]);
});
