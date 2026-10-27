// Ajustes: accounts, categories and signing out (tareas 05, 06, 09).
import { test, expect } from './fixtures.js';

test('a new account is written to the Sheet and a repeated name is refused', async ({ page, app, google }) => {
  await app.open('#/settings/accounts', '.account-list');
  await page.fill('input[name=name]', 'abanca');
  await page.click('.form-submit');
  await expect(page.locator('.form-error')).toHaveText('Ya tienes una cuenta con ese nombre.');
  expect(google.writes()).toEqual([]);

  await page.fill('input[name=name]', 'Hucha');
  await page.fill('input[name=balance]', '1.250,50');
  await page.click('.form-submit');
  await app.settle();
  expect(google.writes()[0]).toMatchObject({ op: 'append', tab: 'Accounts', valueInputOption: 'RAW' });
  expect(google.rows.Accounts.at(-1).slice(1, 4)).toEqual(['Hucha', '🏦', 1250.5]);
  expect(await app.lines('.account-list')).toContainEqual(['🏦 Hucha', '1.250,50 €']);
});

test('a category is created and then removed with a logical delete', async ({ page, app, google }) => {
  await app.open('#/settings/categories', '.list-expense');
  await page.fill('input[name=name]', 'Gimnasio');
  await page.click('.form-submit');
  await app.settle();
  await expect(page.locator('.list-expense')).toContainText('Gimnasio');
  const created = google.rows.Categories.at(-1);
  expect(created.slice(1, 5)).toEqual(['Gimnasio', '🛍️', 'expense', false]);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.list-expense .receipt-row', { hasText: 'Gimnasio' }).getByRole('button').click();
  await app.settle();
  await expect(page.locator('.list-expense')).not.toContainText('Gimnasio');
  const row = google.rows.Categories.find((category) => category[0] === created[0]);
  expect(row.at(-1)).toBe(true);
  expect(google.rows.Categories).toHaveLength(7);
});

test('Transferencia cannot be removed', async ({ page, app }) => {
  await app.open('#/settings/categories', '.list-expense');
  const line = page.locator('.receipt-row', { hasText: 'Transferencia' });
  await expect(line.getByRole('button')).toHaveCount(0);
});

test('signing out goes back to the Login and forgets the session', async ({ page, app }) => {
  await app.open('#/settings', '.settings-list');
  await expect(page.locator('.settings-email')).toHaveText('prueba@example.com');
  await page.click('.settings-signout');
  await expect(page.locator('.auth-title')).toHaveText('CARTOS');
  expect(await page.evaluate(() => [localStorage.getItem('cartos.session'), localStorage.getItem('cartos.book')]))
    .toEqual([null, null]);
});
