// Ajustes: accounts, categories and signing out (tareas 05, 06, 09).
import { test, expect } from './fixtures.js';

test('a new account is written to the Sheet and a repeated name is refused', async ({ page, app, google }) => {
  await app.open('#/settings/accounts', '.account-list');
  await page.click('.add-row');
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

test('an account card edits name, emoji and initial balance on the same row', async ({ page, app, google }) => {
  await app.open('#/settings/accounts', '.account-list');
  await page.locator('.account-line', { hasText: 'Efectivo' }).click();
  await expect(page.locator('input[name=balance]')).toHaveValue('50,00');
  // Its own name is not "repeated".
  await page.click('.form-submit');
  await app.settle();
  await page.locator('.account-line', { hasText: 'Efectivo' }).click();
  await page.fill('input[name=name]', 'Cartera');
  await page.click('.emoji-other');
  await page.fill('input[name=emoji]', '👛');
  await page.fill('input[name=balance]', '60');
  await page.click('.form-submit');
  await app.settle();

  const update = google.writes().at(-1);
  expect(update).toMatchObject({ op: 'update', valueInputOption: 'RAW' });
  expect(update.body.data[0].range).toBe('Accounts!A3:G3');
  expect(google.rows.Accounts[2].slice(0, 4)).toEqual(['acc-cash', 'Cartera', '👛', 60]);
  expect(google.rows.Accounts).toHaveLength(3);
  expect(await app.lines('.account-list')).toContainEqual(['👛 Cartera', '50,01 €']);
});

test('a category is created, edited and then removed with a logical delete', async ({ page, app, google }) => {
  await app.open('#/settings/categories', '.list-expense');
  await page.click('.add-row');
  await page.fill('input[name=name]', 'Gimnasio');
  await page.click('.form-submit');
  await app.settle();
  await expect(page.locator('.list-expense')).toContainText('Gimnasio');
  const created = google.rows.Categories.at(-1);
  expect(created.slice(1, 5)).toEqual(['Gimnasio', '🛍️', 'expense', false]);

  // Unused: its type can change.
  await page.locator('.category-line', { hasText: 'Gimnasio' }).click();
  await expect(page.locator('.card-uses')).toHaveText('Ningún movimiento la usa.');
  await page.fill('input[name=name]', 'Deporte');
  await page.click('.chip[data-kind=income]');
  await page.click('.form-submit');
  await app.settle();
  await expect(page.locator('.list-income')).toContainText('Deporte');

  await page.locator('.category-line', { hasText: 'Deporte' }).click();
  await page.click('.card-remove');
  await expect(page.locator('.card-remove')).toHaveText('¿Seguro? Toca otra vez');
  await page.click('.card-remove');
  await app.settle();
  await expect(page.locator('.list-income')).not.toContainText('Deporte');
  const row = google.rows.Categories.find((category) => category[0] === created[0]);
  expect(row.slice(1, 4)).toEqual(['Deporte', '🛍️', 'income']);
  expect(row.at(-1)).toBe(true);
  expect(google.rows.Categories).toHaveLength(7);
});

test('a category in use keeps its type, and Transferencia has no card', async ({ page, app }) => {
  await app.open('#/settings/categories', '.list-expense');
  await page.locator('.category-line', { hasText: 'Supermercado' }).click();
  await expect(page.locator('.card-uses')).toContainText('2 movimientos la usan');
  await expect(page.locator('.chip[data-kind=income]')).toBeDisabled();
  await app.go('#/settings/categories');
  const line = page.locator('.receipt-row', { hasText: 'Transferencia' });
  await expect(line).toContainText('fija');
  await expect(page.locator('a.category-line', { hasText: 'Transferencia' })).toHaveCount(0);
});

test('signing out goes back to the Login and forgets the session', async ({ page, app }) => {
  await app.open('#/settings', '.settings-list');
  await expect(page.locator('.settings-email')).toHaveText('prueba@example.com');
  await page.click('.settings-signout');
  await expect(page.locator('.auth-title')).toHaveText('CARTOS');
  expect(await page.evaluate(() => [localStorage.getItem('cartos.session'), localStorage.getItem('cartos.book')]))
    .toEqual([null, null]);
});
