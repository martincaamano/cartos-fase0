// Theme and status bar (tareas 09, 12) and what the logs keep (tarea 09).
import { test, expect } from './fixtures.js';

const colors = (page) => page.evaluate(() => [
  document.documentElement.getAttribute('data-theme'),
  getComputedStyle(document.body).backgroundColor,
  document.querySelector('meta[name="theme-color"]').content,
]);
const LIGHT = 'rgb(250, 250, 248)';
const DARK = 'rgb(0, 0, 0)';
const NOTEBOOK = 'rgb(250, 246, 240)';
const NOTEBOOK_DARK = 'rgb(28, 25, 23)';

test('Sistema follows the device; Claro and Oscuro are forced and survive a reload', async ({ page, app }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await app.open('#/settings/theme', '.theme-picker');
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

// Tarea 32: the style, also saved on the device and there before the first paint.
test('Libreta applies at once, with the mode, and the app opens in it again', async ({ page, app }) => {
  await app.open('#/settings/theme', '.palette-picker');
  await page.evaluate(() => { document.body.style.transition = 'none'; });
  const palette = () => page.evaluate(() => document.documentElement.getAttribute('data-palette'));
  expect(await palette()).toBe(null);

  await page.click('.chip[data-palette=libreta]');
  expect(await palette()).toBe('libreta');
  expect((await colors(page)).slice(1)).toEqual([NOTEBOOK, NOTEBOOK]);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('-apple-system');
  await page.click('.chip[data-theme=dark]');
  expect((await colors(page)).slice(1)).toEqual([NOTEBOOK_DARK, NOTEBOOK_DARK]);

  // Closed and opened again: in Libreta from the very first paint.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.firstPalette = document.documentElement.getAttribute('data-palette');
    });
  });
  await page.reload();
  await expect(page.locator('.palette-picker')).toBeVisible();
  expect(await page.evaluate(() => window.firstPalette)).toBe('libreta');
  await expect(page.locator('.chip[data-palette=libreta]')).toHaveClass(/is-selected/);
  await app.go('#/settings');
  await expect(page.locator('.settings-link', { hasText: 'Tema' })).toContainText('Libreta · Oscuro ›');
  // Headings in sentence case: «Libro» rather than «LIBRO» (lowercase, and
  // the first letter a capital again).
  const headingCase = () => page.locator('.receipt-heading').first().evaluate((h) => [
    getComputedStyle(h).textTransform, getComputedStyle(h, '::first-letter').textTransform,
  ]);
  expect(await headingCase()).toEqual(['lowercase', 'uppercase']);

  await app.go('#/settings/theme');
  await page.click('.chip[data-palette=cartos]');
  expect(await palette()).toBe(null);
  await app.go('#/settings');
  expect((await headingCase())[0]).toBe('none');
});

test('the logs keep operations and codes, never amounts, notes or category names', async ({ page, app }) => {
  await app.open();
  await app.addMovement({ amount: '1234,56', category: 'Restaurantes', note: 'NOTA-SECRETA' });
  await app.go('#/settings/diagnostics');
  await expect(page.locator('.diagnostics-log')).toContainText('sheets.append:200');
  const log = await page.locator('.diagnostics-log').textContent();
  for (const secret of ['1234', '1.234', 'NOTA-SECRETA', 'Restaurantes']) expect(log).not.toContain(secret);
});
