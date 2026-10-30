// History filters and the Analysis screen (tareas 07 and 08).
import { test, expect } from './fixtures.js';

const labels = async (app) => (await app.lines('.history-list')).map(([label]) => label);
const listView = (page) => page.click('.history-view[data-view=list]');

test('History opens as a summary: the total and each month add up, and open down to the movements', async ({ page, app }) => {
  await app.open('#/history', '.history-list');
  await expect(page.locator('.tree-month .tree-label')).toHaveText(['OCTUBRE 2026', 'SEPTIEMBRE 2026']);
  // 1.500 − (20,50 + 45 + 9,99) = 1.424,51.
  await expect(page.locator('.tree-total .tree-value')).toHaveText('+1.424,51 €');
  await expect(page.locator('.tree-total .sum-line')).toHaveText('+1.500,00−75,49');
  await expect(page.locator('.history-line')).toHaveCount(0);

  await page.locator('.tree-month .tree-head', { hasText: 'OCTUBRE' }).click();
  await expect(page.locator('.tree-month .tree-category .tree-label')).toHaveText(['💼 Nómina', '🍽️ Restaurantes', '🛒 Supermercado']);
  await page.locator('.tree-category .tree-head', { hasText: 'Restaurantes' }).click();
  await expect(page.locator('.history-line')).toHaveText([/18\/10\s+🍽️ Restaurantes cena\s*−45,00 €/]);
});

test('History list shows every movement with its note, and filters by months, accounts and categories', async ({ page, app }) => {
  await app.open('#/history', '.history-list');
  await listView(page);
  await expect(page.locator('.history-list h2')).toHaveText(['OCTUBRE 2026', 'SEPTIEMBRE 2026']);
  expect(await labels(app)).toHaveLength(4);
  await expect(page.locator('.history-list .sum-line').first()).toHaveText('+1.500,00−65,50=+1.434,50 €');

  await page.click('.history-filter-toggle');
  await page.locator('.history-accounts .chip', { hasText: 'Efectivo' }).click();
  expect(await labels(app)).toEqual(['15/09  🛒 Supermercado']);
  await expect(page.locator('.history-filter-toggle')).toContainText('Filtrar · 1');

  // Abanca too: both accounts.
  await page.locator('.history-accounts .chip', { hasText: 'Abanca' }).click();
  expect(await labels(app)).toHaveLength(4);

  await page.click('.history-clear');
  await page.locator('.history-categories .chip', { hasText: 'Supermercado' }).click();
  expect(await labels(app)).toHaveLength(2);

  // One month: October only; then the range September – October.
  await page.click('.history-clear');
  await page.locator('.month-cell', { hasText: 'Oct' }).click();
  await expect(page.locator('.history-range')).toHaveText('Oct 2026');
  expect(await labels(app)).toHaveLength(3);
  await page.locator('.month-cell', { hasText: 'Sep' }).click();
  await expect(page.locator('.history-range')).toHaveText('Sep – Oct 2026');
  expect(await labels(app)).toHaveLength(4);
});

test('History remembers the view and clears the filters when it opens again', async ({ page, app }) => {
  await app.open('#/history', '.history-list');
  await listView(page);
  await page.click('.history-filter-toggle');
  await page.locator('.history-accounts .chip', { hasText: 'Efectivo' }).click();
  await app.go('#/');
  await app.go('#/history');
  await expect(page.locator('.history-view[data-view=list]')).toHaveClass(/is-selected/);
  await expect(page.locator('.history-filter-toggle')).toHaveText('Filtrar ▾');
  expect(await labels(app)).toHaveLength(4);
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
