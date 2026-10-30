// Without connection (tareas 04, 05, 07): changes wait in the outbox and go
// up once, and the app opens from the Service Worker cache.
import { test, expect } from './fixtures.js';

async function goOffline(context, page, offline) {
  await context.setOffline(offline);
  await page.evaluate((off) => dispatchEvent(new Event(off ? 'offline' : 'online')), offline);
}

test('a movement saved offline waits, then goes up once without duplicates', async ({ page, context, app, google }) => {
  await app.open();
  await goOffline(context, page, true);
  await app.addMovement({ amount: '3', category: 'Supermercado' });

  await expect(page.locator('.dashboard-notice')).toContainText('1 movimiento pendiente');
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.471,51 €');
  expect(google.writes()).toEqual([]);

  await goOffline(context, page, false);
  await app.settle();
  await expect(page.locator('.dashboard-notice')).toBeHidden();
  expect(google.writes()).toHaveLength(1);
  expect(google.rows.Movements).toHaveLength(6);

  // Coming back to the foreground again uploads nothing more.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await app.settle();
  expect(google.writes()).toHaveLength(1);
});

test('an edit saved offline rewrites its row when the connection is back', async ({ page, context, app, google }) => {
  await app.open();
  await goOffline(context, page, true);
  await app.go('#/history/edit?id=m-food');
  await page.fill('.amount-input', '22');
  await page.click('.form-submit');
  await goOffline(context, page, false);
  await app.settle();
  expect(google.writes().map((write) => write.op)).toEqual(['update']);
  expect(google.movements().find((m) => m.id === 'm-food').amount).toBe(22);
});

test('the app opens offline from the Service Worker cache with the device copy', async ({ page, context, app, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs with the Service Worker blocked (see playwright.config.js)');
  await app.open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await goOffline(context, page, true);
  await page.reload();
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  await expect(page.locator('.dashboard-notice')).toContainText('Sin conexión');
});
