// Tarea 29: a category with movements is removed by moving them to another
// one first, or merged into it and kept empty; offline too. Invented data.
import { test, expect, movement } from './fixtures.js';

const AT = '2026-03-01T10:00:00.000Z';

// Facturas (two expenses) and Hogar; a goal for something to pay with
// Facturas; Facturas left out of Análisis and remembered for a transfer.
function withFacturas(google) {
  google.rows.Categories.push(
    ['cat-bills', 'Facturas', '🧾', 'expense', false, AT, false],
    ['cat-home', 'Hogar', '🏠', 'expense', false, AT, false],
  );
  google.rows.Movements.push(
    movement('b1', 'acc-bank', 'expense', 70, '2026-10-02', 'cat-bills', 'luz'),
    movement('b2', 'acc-bank', 'expense', 30, '2026-09-02', 'cat-bills', 'agua'),
    movement('h1', 'acc-bank', 'expense', 15, '2026-10-03', 'cat-home', 'bombillas'),
  );
  google.rows.Goals.push(['g-1', 'Caldera', 'cat-bills', 500, '2027-02-01', 'active', '', '', 'user-1', AT, AT, false]);
}

async function openCard(page, app, name) {
  await app.open('#/settings/categories', '.list-expense');
  await page.locator('.category-line', { hasText: name }).click();
  await expect(page.locator('.form-title')).toBeVisible();
}

test('removing a category with movements moves them to the one chosen', async ({ page, app, google }) => {
  withFacturas(google);
  await app.open('#/analysis', '.stat-categories');
  await page.click('.stat-exclude-toggle');
  await page.locator('.stat-exclude-chips .chip', { hasText: 'Facturas' }).click();

  await openCard(page, app, 'Facturas');
  // No «Quitar» on top: its movements have to go somewhere first.
  await expect(page.locator('.card-remove')).toBeHidden();
  await expect(page.locator('.card-move')).toBeVisible();
  // Only expense categories, never itself nor Transferencia.
  const options = await page.locator('.card-move-target option').allTextContents();
  expect(options).toContain('🏠 Hogar');
  expect(options).not.toContain('🧾 Facturas');
  expect(options).not.toContain('💼 Nómina');
  expect(options.some((o) => o.includes('Transferencia'))).toBe(false);

  // Without a destination it asks for one.
  await page.click('.card-move-remove');
  await expect(page.locator('.card-move-error')).toHaveText('Elige a qué categoría pasan.');

  await page.selectOption('.card-move-target', { label: '🏠 Hogar' });
  await expect(page.locator('.card-move-note')).toHaveText('Se moverán 2 movimientos a 🏠 Hogar.');
  await page.click('.card-move-remove');
  await expect(page.locator('.card-move-remove')).toHaveText('¿Seguro? Toca otra vez');
  await page.click('.card-move-remove');
  await expect(page.locator('.list-expense')).not.toContainText('Facturas');
  await app.settle();

  // In the Sheet: the movements and the goal in Hogar, Facturas deleted, rows kept.
  const byId = Object.fromEntries(google.movements().map((m) => [m.id, m.categoryId]));
  expect([byId.b1, byId.b2, byId.h1]).toEqual(['cat-home', 'cat-home', 'cat-home']);
  expect(google.records('Goals')[0].categoryId).toBe('cat-home');
  const bills = google.records('Categories').find((c) => c.id === 'cat-bills');
  expect(bills.deleted).toBe(true);
  // One write for all of it.
  const writes = google.writes();
  expect(writes.at(-1).op).toBe('update');
  expect(writes.at(-1).body.data.map((d) => d.range.split('!')[0]).sort()).toEqual(['Categories', 'Goals', 'Movements', 'Movements']);

  // History shows them in Hogar; Análisis no longer leaves anything out.
  await app.go('#/history');
  await page.click('.history-view[data-view=list]');
  await expect(page.locator('.history-line', { hasText: 'luz' })).toContainText('Hogar');
  await app.go('#/analysis');
  await expect(page.locator('.stat-exclude-toggle')).toContainText('Excluir: ninguna');
});

test('merging keeps the category, empty, with its movements in the other one', async ({ page, app, google }) => {
  withFacturas(google);
  await openCard(page, app, 'Facturas');
  await page.selectOption('.card-move-target', { label: '🏠 Hogar' });
  await page.click('.card-move-keep');
  await page.click('.card-move-keep');
  await expect(page.locator('.list-expense')).toContainText('Facturas');
  await app.settle();
  expect(google.movements().filter((m) => m.categoryId === 'cat-bills')).toEqual([]);
  expect(google.records('Categories').find((c) => c.id === 'cat-bills').deleted).toBe(false);
  // Empty now: it can be removed from the top, as before.
  await openCard(page, app, 'Facturas');
  await expect(page.locator('.card-move')).toBeHidden();
  await expect(page.locator('.card-remove')).toBeVisible();
});

test('a category without movements is removed as before, without asking where they go', async ({ page, app, google }) => {
  withFacturas(google);
  google.rows.Categories.push(['cat-empty', 'Vacía', '📦', 'expense', false, AT, false]);
  await openCard(page, app, 'Vacía');
  await expect(page.locator('.card-move')).toBeHidden();
  await page.click('.card-remove');
  await page.click('.card-remove');
  await expect(page.locator('.list-expense')).not.toContainText('Vacía');
});

test('offline the move waits on the device and goes up when the connection is back', async ({ page, context, app, google }) => {
  withFacturas(google);
  await openCard(page, app, 'Facturas');
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await page.selectOption('.card-move-target', { label: '🏠 Hogar' });
  await page.click('.card-move-remove');
  await page.click('.card-move-remove');
  // Counted at once on the device.
  await expect(page.locator('.list-expense')).not.toContainText('Facturas');
  expect(google.movements().filter((m) => m.categoryId === 'cat-bills')).toHaveLength(2);

  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await app.settle();
  expect(google.movements().filter((m) => m.categoryId === 'cat-bills')).toEqual([]);
  expect(google.records('Categories').find((c) => c.id === 'cat-bills').deleted).toBe(true);
});
