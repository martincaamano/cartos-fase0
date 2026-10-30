// Importing a book from a file in the onboarding (tarea 16). Invented data.
import { test, expect } from './fixtures.js';

test.use({ withBook: false });

const FILE = {
  format: 'cartos-import',
  version: 1,
  accounts: [
    { key: 'bank', name: 'Banco Prueba', emoji: '🏦', initialBalance: 1000 },
    { key: 'savings', name: 'Ahorro Prueba', emoji: '🐷', initialBalance: 5000 },
  ],
  categories: [
    { key: 'food', name: 'Comida', emoji: '🛒', kind: 'expense' },
    { key: 'pay', name: 'Sueldo', emoji: '💼', kind: 'income' },
  ],
  movements: [
    { date: '2026-09-01', account: 'bank', type: 'income', amount: 1500, category: 'pay', note: 'Nómina septiembre' },
    { date: '2026-09-15', account: 'bank', type: 'expense', amount: 20.5, category: 'food', note: '=1+1' },
    { date: '2026-10-02', transfer: { from: 'bank', to: 'savings' }, amount: 300, note: 'Ahorro' },
  ],
};
const asFile = (data, name = 'cartos.json') =>
  ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

async function openImport(page, app) {
  await app.open('#/', '.import-link');
  await page.click('.import-link');
  await expect(page.locator('h1.form-title')).toHaveText('Importar un libro');
}

test('a file is previewed, imported into a new book and the Dashboard adds up', async ({ page, app, google }) => {
  await openImport(page, app);
  await page.setInputFiles('input[type=file]', asFile(FILE));

  expect(await app.lines('.import-accounts')).toEqual([
    ['🏦 Banco Prueba', '2.179,50 €'],
    ['🐷 Ahorro Prueba', '5.300,00 €'],
    ['TOTAL', '7.479,50 €'],
  ]);
  await expect(page.locator('.import-span')).toHaveText('3 movimientos, del 01/09/2026 al 02/10/2026.');
  expect(google.calls.filter((call) => call.op !== 'drive.list')).toEqual([]);

  await page.click('.import-confirm');
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('7.479,50 €');
  await app.settle();

  // One clear and one RAW write after the book is created.
  const ops = google.calls.map((call) => call.op).filter((op) => op !== 'drive.list' && op !== 'batchGet');
  expect(ops).toEqual(['drive.create', 'structure', 'update', 'clear', 'update']);
  const write = google.calls.filter((call) => call.op === 'update').at(-1);
  expect(write.valueInputOption).toBe('RAW');
  expect(google.rows.Accounts).toHaveLength(3);
  expect(google.rows.Categories.map((row) => row[1])).toEqual(['name', 'Comida', 'Sueldo', 'Transferencia']);
  const movements = google.movements();
  expect(movements).toHaveLength(4);
  expect(movements.map((m) => m.note)).toEqual(['Nómina septiembre', '=1+1', 'Ahorro', 'Ahorro']);
  expect(new Set(movements.map((m) => m.createdBy))).toEqual(new Set(['import']));
  const [out, into] = movements.slice(2);
  expect([out.type, into.type, out.transferId === into.transferId]).toEqual(['expense', 'income', true]);
});

test('a file with mistakes lists them and writes nothing', async ({ page, app, google }) => {
  await openImport(page, app);
  const broken = structuredClone(FILE);
  broken.movements[1].amount = 1.234;
  broken.movements[2].transfer.to = 'bank';
  await page.setInputFiles('input[type=file]', asFile(broken));

  await expect(page.locator('.import-error-list li')).toHaveText([
    'Movimiento 2: importe no válido',
    'Movimiento 3: transferencia a la misma cuenta',
  ]);
  await expect(page.locator('.import-preview')).toBeHidden();

  await page.setInputFiles('input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{hola') });
  await expect(page.locator('.import-errors .form-error')).toHaveText('El archivo no se puede importar:');
  await expect(page.locator('.import-error-list li')).toHaveText(['no es un archivo JSON']);

  await page.setInputFiles('input[type=file]', { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('hola;adiós') });
  await expect(page.locator('.import-error-list li')).toHaveText(['no tiene las columnas de la plantilla de Cartos (revisa la primera línea)']);
  expect(google.calls.filter((call) => call.op !== 'drive.list')).toEqual([]);
});

test('going back shows the manual onboarding form', async ({ page, app }) => {
  await openImport(page, app);
  await page.click('.back-link');
  await expect(page.locator('h1.form-title')).toHaveText('Primera cuenta');
  await expect(page.locator('input[name=name]')).toBeVisible();
});
