// The fixes of tarea 21, checked on the real app with a fake Google and
// invented data, so they need no test on the phone with real data.
import { test, expect, TODAY } from './fixtures.js';

test('two expenses saved one right after the other both reach the Sheet without reopening the app', async ({ page, app, google }) => {
  await app.open('#/add?type=expense', '.form-submit');
  // Each upload takes a while: the second expense is saved while the first one is still going up.
  google.slow(1500);
  for (const amount of ['11', '22']) {
    // Not app.go: it would wait for the upload to end.
    await page.evaluate(() => { location.hash = '#/add?type=expense'; });
    await expect(page.locator('.amount-input')).toBeVisible();
    await page.fill('.amount-input', amount);
    await page.locator('.category-option', { hasText: 'Supermercado' }).first().click();
    await page.click('.form-submit');
    await expect(page.locator('.toast')).toContainText(`${amount},00 €`);
  }
  await expect.poll(() => google.movements().map((m) => m.amount).filter((a) => a === 11 || a === 22).sort(), { timeout: 15_000 })
    .toEqual([11, 22]);
});

test('«Hoy» is the new day when the app comes back after midnight', async ({ page, app, google }) => {
  await app.open('#/add?type=expense', '.form-submit');
  // The phone sleeps with Añadir open and wakes up the next day.
  const nextDay = new Date(TODAY.getTime() + 24 * 3600 * 1000);
  // A token still valid then, so the app does not ask to reconnect first.
  await page.evaluate((until) => {
    const session = JSON.parse(localStorage.getItem('cartos.session'));
    localStorage.setItem('cartos.session', JSON.stringify({ ...session, tokenExpiresAt: until }));
  }, nextDay.getTime() + 3600 * 1000);
  await page.clock.setFixedTime(nextDay);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.fill('.amount-input', '7');
  await page.locator('.category-option', { hasText: 'Supermercado' }).first().click();
  await page.click('.form-submit');
  await app.settle();
  expect(google.movements().find((m) => m.amount === 7).date).toBe('2026-10-21');
});

test('an account with a negative initial balance with decimals is edited without errors', async ({ page, app, google }) => {
  google.rows.Accounts[2][3] = -10.5;
  await app.open('#/settings/accounts/edit?id=acc-cash', 'input[name=balance]');
  await expect(page.locator('input[name=balance]')).toHaveValue('-10,50');
  await page.fill('input[name=name]', 'Efectivo casa');
  await page.click('form .form-submit');
  await expect(page).toHaveURL(/#\/settings\/accounts$/);
  await app.settle();
  const row = google.rows.Accounts.find((r) => r[0] === 'acc-cash');
  expect(row[1]).toBe('Efectivo casa');
  expect(row[3]).toBe(-10.5);
});
