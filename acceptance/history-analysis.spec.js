// History filters and the Analysis screen (tareas 07 and 08).
import { test, expect } from './fixtures.js';

const labels = async (app) => (await app.lines('.history-list')).map(([label]) => label);

test('History lists everything by month and filters by account, category and dates', async ({ page, app }) => {
  await app.open('#/history', '.history-list');
  await expect(page.locator('.history-list h2')).toHaveText(['OCTUBRE 2026', 'SEPTIEMBRE 2026']);
  expect(await labels(app)).toHaveLength(4);

  await page.selectOption('select[name=account]', { label: '💶 Efectivo' });
  expect(await labels(app)).toEqual(['15/09  🛒 Supermercado · 💶 Efectivo']);

  await page.locator('button[type=reset]').click();
  await page.selectOption('select[name=category]', { label: '🛒 Supermercado' });
  expect(await labels(app)).toHaveLength(2);

  // Both ends of the range count.
  await page.locator('button[type=reset]').click();
  await page.fill('input[name=from]', '2026-10-01');
  await page.fill('input[name=to]', '2026-10-15');
  await page.locator('input[name=to]').dispatchEvent('change');
  expect(await labels(app)).toEqual(['15/10  🛒 Supermercado · 🏦 Abanca', '01/10  💼 Nómina · 🏦 Abanca']);
});

test('Analysis puts the biggest category first, leaves Transferencia out and goes back a month', async ({ page, app }) => {
  await app.open();
  await app.addMovement({ type: 'transfer', amount: '500', from: '🏦 Abanca', to: '💶 Efectivo' });
  await app.go('#/analysis');

  await expect(page.locator('.month-label')).toHaveText('OCTUBRE 2026');
  await expect(page.locator('.month-step[data-step="1"]')).toBeDisabled();
  expect(await app.lines('.stat-categories')).toEqual([
    ['🍽️ Restaurantes', '45,00 €'],
    ['🛒 Supermercado', '20,50 €'],
  ]);
  // The transfer counts on both sides and leaves the savings alone.
  expect(await app.lines('.stat-summary')).toEqual([
    ['Ingresos', '2.000,00 €'],
    ['Gastos', '565,50 €'],
    ['Ahorro', '1.434,50 €'],
  ]);

  await page.click('.month-step[data-step="-1"]');
  await expect(page.locator('.month-label')).toHaveText('SEPTIEMBRE 2026');
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(page.locator('.month-step[data-step="-1"]')).toBeDisabled();
  expect(await app.lines('.stat-summary')).toContainEqual(['Ahorro', '−9,99 €']);
});
