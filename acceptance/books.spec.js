// Several books (tarea 17a): opening in Añadir, creating a book, switching,
// renaming, and the outbox of a book that is not open. Invented data.
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
