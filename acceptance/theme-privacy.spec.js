// Theme and status bar (tareas 09, 12) and what the logs keep (tarea 09).
import { test, expect } from './fixtures.js';

const colors = (page) => page.evaluate(() => [
  document.documentElement.getAttribute('data-theme'),
  getComputedStyle(document.body).backgroundColor,
  document.querySelector('meta[name="theme-color"]').content,
]);
const LIGHT = 'rgb(250, 250, 248)';
const DARK = 'rgb(20, 24, 28)';

test('Sistema follows the device; Claro and Oscuro are forced and survive a reload', async ({ page, app }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await app.open('#/settings', '.theme-picker');
  await page.evaluate(() => { document.body.style.transition = 'none'; });
  expect(await colors(page)).toEqual([null, DARK, DARK]);

  await page.click('.chip[data-theme=light]');
  expect(await colors(page)).toEqual(['light', LIGHT, LIGHT]);

  await page.reload();
  await expect(page.locator('.theme-picker')).toBeVisible();
  await page.evaluate(() => { document.body.style.transition = 'none'; });
  expect(await colors(page)).toEqual(['light', LIGHT, LIGHT]);

  await page.click('.chip[data-theme=system]');
  expect(await colors(page)).toEqual([null, DARK, DARK]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => colors(page)).toEqual([null, LIGHT, LIGHT]);
});

test('the logs keep operations and codes, never amounts, notes or category names', async ({ page, app }) => {
  await app.open();
  await app.addMovement({ amount: '1234,56', category: 'Restaurantes', note: 'NOTA-SECRETA' });
  await app.go('#/settings/diagnostics');
  await expect(page.locator('.diagnostics-log')).toContainText('sheets.append:200');
  const log = await page.locator('.diagnostics-log').textContent();
  for (const secret of ['1234', '1.234', 'NOTA-SECRETA', 'Restaurantes']) expect(log).not.toContain(secret);
});
