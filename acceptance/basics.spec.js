// Opening the app and moving around (lists of tareas 04, 07, 08, 09).
import { test, expect } from './fixtures.js';

test('opens on the Dashboard with the total, the balances and the goals block', async ({ page, app }) => {
  await app.open();
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  expect(await app.lines('.receipt-accounts')).toEqual([
    ['🏦 Abanca', '2.434,50 €'],
    ['💶 Efectivo', '40,01 €'],
  ]);
  // No latest movements any more (tarea 25b): the goals, none yet.
  await expect(page.locator('.receipt-movements')).toHaveCount(0);
  await expect(page.locator('.dashboard-goals')).toHaveText('Aún no tienes metas. Crea una para apartar dinero para algo concreto.');
  await expect(page.locator('.dashboard-goals-sums')).toHaveCount(0);
});

test('the navbar reaches every section and marks the one on view', async ({ page, app }) => {
  await app.open();
  const sections = [
    // No titles since tarea 20: the navbar says where you are.
    ['HISTORIAL', '#/history'],
    ['ANÁLISIS', '#/analysis'],
    ['AJUSTES', '#/settings'],
    ['INICIO', '#/'],
  ];
  for (const [button, hash] of sections) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${hash.replace('/', '\\/')}$`));
    await expect(page.locator('.navbar-item.is-active')).toHaveText(button);
  }
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.locator('.tab.is-selected')).toHaveText('Gasto');
});

test('Ajustes links lead to each screen and back, and say where they stand', async ({ page, app }) => {
  await app.open('#/settings', '.settings-list');
  await expect(page.locator('.settings-link', { hasText: 'Cuentas' })).toContainText('2 ›');
  await expect(page.locator('.settings-link', { hasText: 'Tema' })).toContainText('Cartos · Sistema ›');
  const links = [['Libros', 'LIBROS'], ['Cuentas', 'CUENTAS'], ['Categorías', 'CATEGORÍAS'], ['Datos', 'DATOS'],
    ['Tema', 'TEMA'], ['Diagnóstico', 'DIAGNÓSTICO']];
  for (const [link, title] of links) {
    await page.locator('.settings-link', { hasText: link }).click();
    await expect(page.locator('h1.form-title')).toHaveText(title);
    await page.locator('.back-link').click();
    await expect(page.locator('.settings-list')).toBeVisible();
  }
});

test('the eye next to TOTAL hides and shows the amounts, and the choice is kept', async ({ page, app }) => {
  await app.open();
  // The first time they show.
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  await page.click('.amounts-toggle');
  await expect(page.locator('.receipt-total-amount')).toHaveText('••••• €');
  expect(await app.lines('.receipt-accounts')).toEqual([['🏦 Abanca', '••••• €'], ['💶 Efectivo', '••••• €']]);
  await expect(page.locator('.amounts-toggle')).toHaveAttribute('aria-label', 'Mostrar las cifras');
  // Leaving, coming back and reopening the app keep them hidden.
  await app.go('#/history');
  await app.go('#/');
  await expect(page.locator('.receipt-total-amount')).toHaveText('••••• €');
  await page.reload();
  await expect(page.locator('.receipt-total-amount')).toHaveText('••••• €');
  await page.click('.amounts-toggle');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  // Tapping INICIO again does nothing.
  await page.click('.navbar-item.is-active');
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
});

test('an account on INICIO opens History filtered by it; the bar opens it whole', async ({ page, app }) => {
  await app.open();
  await page.locator('.dashboard-account', { hasText: 'Efectivo' }).click();
  await page.click('.history-view[data-view=list]');
  expect((await app.lines('.history-list')).map(([label]) => label)).toEqual(['15/09  🛒 Supermercado']);
  await expect(page.locator('.history-filter-toggle')).toContainText('Filtrar · 1');
  await app.go('#/');
  await page.getByRole('button', { name: 'HISTORIAL', exact: true }).click();
  await expect(page.locator('.history-filter-toggle')).toHaveText('Filtrar ▾');
});

test('an unknown address falls back to the Dashboard', async ({ page, app }) => {
  await app.open('#/nope');
  await expect(page.locator('.receipt-total-amount')).toBeVisible();
});
