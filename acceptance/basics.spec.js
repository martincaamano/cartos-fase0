// Opening the app and moving around (lists of tareas 04, 07, 08, 09).
import { test, expect } from './fixtures.js';

test('opens on the Dashboard with the total, the balances and the latest movements', async ({ page, app }) => {
  await app.open();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  expect(await app.lines('.receipt-accounts')).toEqual([
    ['🏦 Abanca', '2.434,50 €'],
    ['💶 Efectivo', '40,01 €'],
  ]);
  expect(await app.lines('.receipt-movements')).toEqual([
    ['18/10  🍽️ Restaurantes', '−45,00 €'],
    ['15/10  🛒 Supermercado', '−20,50 €'],
    ['01/10  💼 Nómina', '1.500,00 €'],
    ['15/09  🛒 Supermercado', '−9,99 €'],
  ]);
});

test('the navbar reaches every section and marks the one on view', async ({ page, app }) => {
  await app.open();
  const sections = [
    ['HISTORIAL', 'HISTORIAL', '#/history'],
    ['ANÁLISIS', 'ANÁLISIS', '#/analysis'],
    ['AJUSTES', 'AJUSTES', '#/settings'],
    ['INICIO', null, '#/'],
  ];
  for (const [button, title, hash] of sections) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${hash.replace('/', '\\/')}$`));
    if (title) await expect(page.locator('h1.form-title')).toHaveText(title);
    await expect(page.locator('.navbar-item.is-active')).toHaveText(button);
  }
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.locator('.tab.is-selected')).toHaveText('Gasto');
});

test('Ajustes links lead to Cuentas, Categorías and Diagnóstico and back', async ({ page, app }) => {
  await app.open('#/settings', '.settings-list');
  for (const [link, title] of [['Cuentas', 'CUENTAS'], ['Categorías', 'CATEGORÍAS'], ['Diagnóstico', 'DIAGNÓSTICO']]) {
    await page.locator('.settings-link', { hasText: link }).click();
    await expect(page.locator('h1.form-title')).toHaveText(title);
    await page.locator('.back-link').click();
    await expect(page.locator('h1.form-title')).toHaveText('AJUSTES');
  }
});

test('an unknown address falls back to the Dashboard', async ({ page, app }) => {
  await app.open('#/nope');
  await expect(page.locator('.receipt-total-amount')).toBeVisible();
});
