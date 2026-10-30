// History filters and the Analysis screen (tareas 07, 08 and 20).
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

test('Analysis shows the last 12 months by default and leaves transfers out', async ({ page, app }) => {
  await app.open();
  await app.addMovement({ type: 'transfer', amount: '500', from: '🏦 Abanca', to: '💶 Efectivo' });
  await app.go('#/analysis');

  await expect(page.locator('.stat-period.is-selected')).toHaveText('12 meses');
  await expect(page.locator('.month-picker')).toBeHidden();
  // 1.500 in, 75,49 out: 95 % kept.
  await expect(page.locator('.stat-tile').nth(1)).toContainText('95 %');
  expect(await app.lines('.stat-categories')).toEqual([
    ['🍽️ Restaurantes', '45,00 €'],
    ['🛒 Supermercado', '30,49 €'],
  ]);
  expect(await app.lines('.stat-largest')).toEqual([
    ['18/10  🍽️ Restaurantes cena', '−45,00 €'],
    ['15/10  🛒 Supermercado', '−20,50 €'],
    ['15/09  🛒 Supermercado', '−9,99 €'],
  ]);
  await expect(page.locator('.stat-chart svg').first()).toBeVisible();
});

test('Analysis by month compares each category with the month before', async ({ page, app }) => {
  await app.open('#/analysis', '.stat-categories');
  await page.click('.stat-period[data-period=month]');
  await expect(page.locator('.month-label')).toHaveText('OCTUBRE 2026');
  await expect(page.locator('.month-step[data-step="1"]')).toBeDisabled();
  await expect(page).toHaveURL(/period=month&month=2026-10/);
  // 20,50 against 9,99 in September.
  expect(await app.lines('.stat-categories')).toEqual([
    ['🍽️ Restaurantes', '45,00 €'],
    ['🛒 Supermercado', '20,50 € ▲ 105 %'],
  ]);
  await expect(page.locator('.stat-bar-mark')).toHaveCount(1);

  await page.click('.month-step[data-step="-1"]');
  await expect(page.locator('.month-label')).toHaveText('SEPTIEMBRE 2026');
  await expect(page.locator('.month-step[data-step="-1"]')).toBeDisabled();
  expect(await app.lines('.stat-categories')).toEqual([['🛒 Supermercado', '9,99 €']]);
});

test('Analysis leaves out the categories chosen, and remembers them', async ({ page, app }) => {
  await app.open('#/analysis', '.stat-categories');
  await expect(page.locator('.stat-exclude-toggle')).toHaveText('Excluir: ninguna ▾');
  await page.click('.stat-exclude-toggle');
  await page.locator('.stat-exclude-chips .chip', { hasText: 'Restaurantes' }).click();
  await expect(page.locator('.stat-exclude-toggle')).toHaveText('Excluir: Restaurantes ▴');
  expect(await app.lines('.stat-categories')).toEqual([['🛒 Supermercado', '30,49 €']]);

  await app.go('#/');
  await app.go('#/analysis');
  await expect(page.locator('.stat-exclude-toggle')).toHaveText('Excluir: Restaurantes ▾');
  expect(await app.lines('.stat-categories')).toEqual([['🛒 Supermercado', '30,49 €']]);
});

test('Analysis: a month tapped on the chart shows its figures, tapped again opens it in History', async ({ page, app }) => {
  await app.open('#/analysis', '.stat-categories');
  // The last column is October.
  await page.locator('.chart-hit').nth(11).click();
  await expect(page.locator('.stat-picked')).toContainText('OCTUBRE 2026 +1.500,00 − 65,50 = +1.434,50 €');
  await page.locator('.chart-hit').nth(11).click();
  await expect(page).toHaveURL(/#\/history\?month=2026-10/);
  await expect(page.locator('.tree-month .tree-label')).toHaveText(['OCTUBRE 2026']);
});
