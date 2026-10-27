// Adding, editing and deleting movements and transfers (tareas 05, 06, 07).
import { test, expect } from './fixtures.js';

test('an expense is saved to the Sheet with RAW and the balance drops', async ({ page, app, google }) => {
  await app.open();
  await app.addMovement({ amount: '12,34', category: 'Supermercado', note: '=1+1' });

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.462,17 €');
  const [append] = google.writes();
  expect(append).toMatchObject({ op: 'append', tab: 'Movements', valueInputOption: 'RAW' });
  const saved = google.movements().at(-1);
  expect(saved).toMatchObject({
    accountId: 'acc-bank', type: 'expense', amount: 12.34, date: '2026-10-20',
    categoryId: 'cat-food', note: '=1+1', createdBy: 'user-1', deleted: false,
  });
  expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
});

test('an income is saved as a positive amount in the chosen account', async ({ page, app, google }) => {
  await app.open();
  await app.addMovement({ type: 'income', amount: '100', category: 'Nómina', account: '💶 Efectivo' });
  expect(google.movements().at(-1)).toMatchObject({ accountId: 'acc-cash', type: 'income', amount: 100 });
  expect(await app.lines('.receipt-accounts')).toContainEqual(['💶 Efectivo', '140,01 €']);
});

test('a wrong amount or a missing category is refused and nothing is written', async ({ page, app, google }) => {
  await app.open();
  await app.go('#/add');
  await page.fill('.amount-input', '12,345');
  await page.locator('.category-option').first().click();
  await page.click('.form-submit');
  await expect(page.locator('.form-error')).toContainText('dos decimales');
  // A fresh form: no category chosen.
  await app.go('#/');
  await app.go('#/add');
  await page.fill('.amount-input', '5');
  await page.click('.form-submit');
  await expect(page.locator('.form-error')).toHaveText('Elige una categoría.');
  expect(google.writes()).toEqual([]);
});

test('a transfer writes both halves in one request and shows as one line', async ({ page, app, google }) => {
  await app.open();
  await app.addMovement({ type: 'transfer', amount: '30', from: '🏦 Abanca', to: '💶 Efectivo' });

  const writes = google.writes();
  expect(writes).toHaveLength(1);
  expect(writes[0].body.values).toHaveLength(2);
  const halves = google.movements().slice(-2);
  expect(halves.map((m) => [m.accountId, m.type, m.categoryId]).sort()).toEqual([
    ['acc-bank', 'expense', 'transfer'],
    ['acc-cash', 'income', 'transfer'],
  ]);
  expect(halves[0].transferId).toBe(halves[1].transferId);
  expect((await app.lines('.receipt-movements'))[0]).toEqual(['20/10  🏦 Abanca → 💶 Efectivo', '30,00 €']);
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
});

test('editing from the History rewrites the same row and keeps the id', async ({ page, app, google }) => {
  await app.open();
  await app.go('#/history');
  await page.locator('.history-line', { hasText: 'Supermercado' }).first().click();
  await expect(page.locator('.amount-input')).toHaveValue('20,50');
  await page.fill('.amount-input', '25');
  await page.click('.form-submit');
  await app.settle();

  await expect(page).toHaveURL(/#\/history$/);
  const [write] = google.writes();
  expect(write.op).toBe('update');
  expect(write.valueInputOption).toBe('RAW');
  expect(write.body.data[0].range).toBe('Movements!A3:M3');
  expect(google.rows.Movements).toHaveLength(5);
  expect(google.movements().find((m) => m.id === 'm-food')).toMatchObject({ amount: 25, deleted: false });
});

test('deleting asks for a second tap and only marks the row as deleted', async ({ page, app, google }) => {
  await app.open();
  await app.go('#/history/edit?id=m-rest');
  await page.click('.form-delete');
  await expect(page.locator('.form-delete')).toContainText('¿Seguro?');
  expect(google.writes()).toEqual([]);
  await page.click('.form-delete');
  await app.settle();

  await expect(page.locator('.history-line', { hasText: 'Restaurantes' })).toHaveCount(0);
  expect(google.rows.Movements).toHaveLength(5);
  expect(google.movements().find((m) => m.id === 'm-rest')).toMatchObject({ deleted: true });

  // It no longer counts: the 45 € are back in the balance.
  await app.go('#/');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.519,51 €');
});

test('editing a transfer changes both halves in one request', async ({ page, app, google }) => {
  await app.open();
  await app.addMovement({ type: 'transfer', amount: '30', from: '🏦 Abanca', to: '💶 Efectivo' });
  await app.go('#/history');
  await page.locator('.history-line', { hasText: '→' }).click();
  await page.fill('.amount-input', '35');
  await page.click('.form-submit');
  await app.settle();

  const update = google.writes().at(-1);
  expect(update.op).toBe('update');
  expect(update.body.data).toHaveLength(2);
  expect(google.movements().filter((m) => m.categoryId === 'transfer').map((m) => m.amount)).toEqual([35, 35]);
});
