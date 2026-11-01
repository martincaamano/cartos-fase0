// Using Cartos without jumps (tarea 23): Añadir stays after saving with
// «Deshacer», what is not in the Sheet yet is marked with «·», and
// «¿Seguro?» goes back to normal by itself. Invented data.
import { test, expect } from './fixtures.js';

const saveExpense = async (page, amount) => {
  await page.fill('.amount-input', amount);
  await page.locator('.category-option', { hasText: 'Supermercado' }).first().click();
  await page.click('.form-submit');
};

test('after saving, Añadir stays clean with «✓ … Deshacer», and Deshacer takes it back', async ({ page, app, google }) => {
  await app.open('#/add?type=expense', '.form-submit');
  await saveExpense(page, '12,5');
  await expect(page.locator('.toast')).toContainText('✓ 12,50 € · 🛒 Supermercado');
  expect(new URL(page.url()).hash).toBe('#/add?type=expense');
  await expect(page.locator('.amount-input')).toHaveValue('');
  await app.settle();
  const saved = google.movements().find((m) => m.amount === 12.5);
  expect(saved.deleted).toBe(false);

  await page.click('.toast-action');
  await expect(page.locator('.toast')).toHaveCount(0);
  await app.settle();
  expect(google.movements().find((m) => m.id === saved.id).deleted).toBe(true);
  await app.go('#/');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
});

test('a movement not in the Sheet yet carries «·» on INICIO and in History until it goes up', async ({ page, context, app }) => {
  await app.open();
  await context.setOffline(true);
  await app.go('#/add?type=expense');
  await saveExpense(page, '3');
  await expect(page.locator('.toast')).toBeVisible();
  await app.go('#/');
  await expect(page.locator('.receipt-movements .pending-dot')).toHaveCount(1);
  await app.go('#/history');
  await page.click('.history-view[data-view=list]');
  await expect(page.locator('.history-line .pending-dot')).toHaveCount(1);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await app.settle();
  await app.go('#/');
  await expect(page.locator('.pending-dot')).toHaveCount(0);
});

test('«¿Seguro? Toca otra vez» goes back to Borrar after 5 seconds without a second tap', async ({ page, app, google }) => {
  await app.open('#/history', '.history-list');
  await page.click('.history-view[data-view=list]');
  await page.locator('.history-line').first().click();
  const remove = page.locator('.form-delete');
  await remove.click();
  await expect(remove).toHaveText('¿Seguro? Toca otra vez para borrar');
  await expect(remove).toHaveText('Borrar', { timeout: 7000 });
  // A tap now only asks again: nothing is deleted.
  await remove.click();
  await expect(remove).toHaveText('¿Seguro? Toca otra vez para borrar');
  expect(google.writes()).toEqual([]);
});
