// Several books (tarea 17): opening in Añadir, creating a book, switching,
// renaming, the outbox of a book that is not open and transfers to an
// account of another book. Invented data.
import { test, expect } from './fixtures.js';

const NEW_BOOK = 'form:not(.book-rename)';

async function createBook(page, app, { name, account, balance }) {
  await app.open('#/settings/books', '.book-list');
  await page.fill('input[name=bookName]', name);
  await page.fill(`${NEW_BOOK} input[name=name]`, account);
  await page.fill(`${NEW_BOOK} input[name=balance]`, balance);
  await page.click(`${NEW_BOOK} .form-submit`);
  await expect(page.locator('.book-banner')).toHaveText(`LIBRO · ${name}`);
  await app.settle();
}

async function openBook(page, app, name) {
  await app.go('#/settings/books');
  await page.locator('.book-other', { hasText: name }).click();
  await expect(page.locator('.book-banner')).toHaveText(`LIBRO · ${name}`);
  await app.settle();
}

test('opening the app shows Añadir; INICIO stays in the bar', async ({ page, app }) => {
  await app.open('', '.form-submit');
  expect(new URL(page.url()).hash).toBe('#/add');
  await expect(page.locator('.navbar-add')).toHaveClass(/is-active/);
  // A single book: no book name on top.
  await expect(page.locator('.book-banner')).toHaveCount(0);
  await page.click('.navbar-item >> text=INICIO');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
});

test('a new book has its own accounts and total, and the personal one is untouched', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '100' });

  expect(new URL(page.url()).hash).toBe('#/');
  await expect(page.locator('.receipt-total-amount')).toHaveText('100,00 €');
  expect(await app.lines('.receipt-accounts')).toEqual([['🏦 Cuenta común', '100,00 €']]);

  const create = google.calls.find((call) => call.op === 'drive.create');
  expect(create.body.name).toBe('Cartos · Casa do medio');
  expect(create.body.appProperties).toMatchObject({ app: 'cartos', bookType: 'shared', name: 'Casa do medio' });
  const rows = google.files.get(create.fileId).rows;
  expect(rows.Accounts.slice(1).map((row) => row[1])).toEqual(['Cuenta común']);
  expect(rows.Categories.length).toBeGreaterThan(10);

  await openBook(page, app, 'Personal');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  expect(google.rows.Accounts).toHaveLength(3);

  // The last book open is the one that opens next time.
  await page.reload();
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Personal');
});

test('the book list marks the one open and a repeated name is rejected', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '0' });
  await app.go('#/settings/books');
  expect(await app.lines('.book-list')).toEqual([['Personal', '›'], ['Casa do medio', 'abierto']]);

  const creates = () => google.calls.filter((call) => call.op === 'drive.create').length;
  await page.fill('input[name=bookName]', 'casa do MEDIO');
  await page.fill(`${NEW_BOOK} input[name=name]`, 'Otra');
  await page.click(`${NEW_BOOK} .form-submit`);
  await expect(page.locator(`${NEW_BOOK} .form-error`)).toHaveText('Ya tienes un libro con ese nombre.');
  expect(creates()).toBe(1);
});

test('renaming the book open renames its file in Drive', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa', account: 'Cuenta común', balance: '0' });
  await app.go('#/settings/books');
  await page.fill('.book-rename input[name=name]', 'Casa do medio');
  await page.click('.book-rename .form-submit');
  await expect(page.locator('.book-open .receipt-label')).toHaveText('Casa do medio');

  const rename = google.calls.find((call) => call.op === 'drive.rename');
  expect(rename.body).toEqual({ name: 'Cartos · Casa do medio', appProperties: { name: 'Casa do medio' } });
  await app.go('#/');
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Casa do medio');
});

test('a change saved offline in one book is uploaded with the other book open', async ({ page, app, google, context }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '500' });
  const casa = google.calls.find((call) => call.op === 'drive.create').fileId;

  await context.setOffline(true);
  await app.addMovement({ amount: '120', category: 'Hogar', note: 'pintura' });
  await expect(page.locator('.receipt-total-amount')).toHaveText('380,00 €');
  await openBook(page, app, 'Personal');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  expect(google.movements(casa)).toEqual([]);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await app.settle();
  await expect.poll(() => google.movements(casa).map((m) => [m.amount, m.note])).toEqual([[120, 'pintura']]);
  // The personal book got nothing.
  expect(google.movements()).toHaveLength(4);
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Personal');
});

// Personal (open) → "Cuenta común" of Casa do medio, with a category on each side.
async function transferToCasa(page, app, { amount, expense, income, note }) {
  await app.go('#/add?type=transfer');
  await page.selectOption('select[name=from]', { label: '🏦 Abanca' });
  await page.selectOption('select[name=to]', { label: '🏦 Cuenta común' });
  await expect(page.locator('.only-cross')).toBeVisible();
  await page.fill('.amount-input', amount);
  if (expense) await page.locator('.cross-expense .category-option', { hasText: expense }).first().click();
  if (income) await page.locator('.cross-income .category-option', { hasText: income }).first().click();
  if (note) await page.fill('input[name=note]', note);
  await page.click('.form-submit');
  await app.settle();
}

test('a transfer to another book is an expense here and an income there', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '0' });
  const casa = google.calls.find((call) => call.op === 'drive.create').fileId;
  await openBook(page, app, 'Personal');

  await app.go('#/add?type=transfer');
  // Accounts of the other book are grouped under its name.
  await expect(page.locator('select[name=to] optgroup')).toHaveAttribute('label', 'Casa do medio');
  await expect(page.locator('.only-cross')).toBeHidden();

  await transferToCasa(page, app, { amount: '300', expense: 'Restaurantes', income: 'Otros ingresos', note: 'Aportación' });
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.174,51 €');

  const [here] = google.movements().slice(-1);
  expect([here.accountId, here.type, here.amount, here.categoryId, here.transferId, here.note])
    .toEqual(['acc-bank', 'expense', 300, 'cat-rest', '', 'Aportación']);
  const there = google.movements(casa);
  expect(there).toHaveLength(1);
  const income = google.files.get(casa).rows.Categories.find((row) => row[0] === there[0].categoryId);
  expect([there[0].type, there[0].amount, there[0].transferId, there[0].note, income[1]])
    .toEqual(['income', 300, '', 'Aportación', 'Otros ingresos']);

  await openBook(page, app, 'Casa do medio');
  await expect(page.locator('.receipt-total-amount')).toHaveText('300,00 €');
});

test('the next transfer to that account comes with both categories chosen', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '0' });
  const casa = google.calls.find((call) => call.op === 'drive.create').fileId;
  await openBook(page, app, 'Personal');
  await transferToCasa(page, app, { amount: '100', expense: 'Restaurantes', income: 'Otros ingresos' });

  // No category tapped this time.
  await transferToCasa(page, app, { amount: '50' });
  expect(google.movements().slice(-2).map((m) => [m.amount, m.categoryId])).toEqual([[100, 'cat-rest'], [50, 'cat-rest']]);
  const [first, second] = google.movements(casa);
  expect(second.categoryId).toBe(first.categoryId);
});

test('a transfer to another book needs both categories', async ({ page, app, google }) => {
  await createBook(page, app, { name: 'Casa do medio', account: 'Cuenta común', balance: '0' });
  await openBook(page, app, 'Personal');
  const writes = google.writes().length;
  await transferToCasa(page, app, { amount: '20', expense: 'Restaurantes' });
  await expect(page.locator('.form-error')).toHaveText('Elige una categoría.');
  expect(google.writes()).toHaveLength(writes);
});
