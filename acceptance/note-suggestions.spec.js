// Tarea 27: Añadir suggests the notes used before with the category chosen,
// once the note is open; typing filters them and a tap fills the note in.
// Invented data.
import { test, expect, movement } from './fixtures.js';

const AT = '2026-03-01T10:00:00.000Z';

// Hogar: «Agua» three times (once as «agua»), «Luz» twice, «Gas» once;
// Supermercado: «Mercadona». A transfer noted «ahorro» twice.
function withNotes(google) {
  google.rows.Categories.push(['cat-home', 'Hogar', '🏠', 'expense', false, AT, false]);
  const transfer = (id, accountId, type, date) => {
    const row = movement(id, accountId, type, 50, date, 'transfer', 'ahorro');
    row[7] = `t-${date}`;
    return row;
  };
  google.rows.Movements.push(
    movement('h1', 'acc-bank', 'expense', 30, '2026-07-02', 'cat-home', 'Agua'),
    movement('h2', 'acc-bank', 'expense', 31, '2026-08-02', 'cat-home', 'agua'),
    movement('h3', 'acc-bank', 'expense', 32, '2026-09-02', 'cat-home', 'Agua'),
    movement('h4', 'acc-bank', 'expense', 60, '2026-08-10', 'cat-home', 'Luz'),
    movement('h5', 'acc-bank', 'expense', 61, '2026-09-10', 'cat-home', 'Luz'),
    movement('h6', 'acc-bank', 'expense', 20, '2026-09-12', 'cat-home', 'Gas'),
    movement('s1', 'acc-bank', 'expense', 40, '2026-09-13', 'cat-food', 'Mercadona'),
    transfer('t1', 'acc-bank', 'expense', '2026-08-01'),
    transfer('t2', 'acc-cash', 'income', '2026-08-01'),
    transfer('t3', 'acc-bank', 'expense', '2026-09-01'),
    transfer('t4', 'acc-cash', 'income', '2026-09-01'),
  );
}

const chips = (page) => page.locator('.note-suggestions .suggestion');

test('the notes of the category show once the note is open, filter while typing, and a tap fills it', async ({ page, app, google }) => {
  withNotes(google);
  await app.open('#/add?type=expense', '.category-grid');
  await page.locator('.category-option', { hasText: 'Hogar' }).click();
  // Folded note: Añadir does not change.
  await expect(page.locator('.note-suggestions')).toBeHidden();

  await page.click('.note-toggle');
  await expect(chips(page)).toHaveText(['Agua', 'Luz', 'Gas']);
  await page.fill('input[name=note]', 'ag');
  await expect(chips(page)).toHaveText(['Agua']);
  await chips(page).click();
  await expect(page.locator('input[name=note]')).toHaveValue('Agua');
  // What is already written is not offered again.
  await expect(page.locator('.note-suggestions')).toBeHidden();

  // Another category, other notes.
  await page.fill('input[name=note]', '');
  await page.locator('.category-option', { hasText: 'Supermercado' }).click();
  await expect(chips(page)).toHaveText(['Mercadona']);
  // A category without notes shows none.
  await page.locator('.category-option', { hasText: 'Restaurantes' }).click();
  await expect(chips(page)).toHaveText(['cena']);
  await page.locator('.tab', { hasText: 'Ingreso' }).click();
  await page.locator('.category-option', { hasText: 'Nómina' }).click();
  await expect(page.locator('.note-suggestions')).toBeHidden();
});

test('a transfer suggests the notes of earlier transfers, each once', async ({ page, app, google }) => {
  withNotes(google);
  await app.open('#/add?type=transfer', 'select[name=from]');
  await page.click('.note-toggle');
  await expect(chips(page)).toHaveText(['ahorro']);
});

test('editing a movement offers the notes of its category too', async ({ page, context, app, google }) => {
  withNotes(google);
  await app.open('#/history/edit?id=h6', '.category-grid');
  await expect(page.locator('input[name=note]')).toHaveValue('Gas');
  // Its own note filters them: nothing else starts with «Gas».
  await expect(page.locator('.note-suggestions')).toBeHidden();
  await page.fill('input[name=note]', '');
  await expect(chips(page)).toHaveText(['Agua', 'Luz', 'Gas']);

  // Offline as well: all of it is on the device.
  await context.setOffline(true);
  await chips(page).first().click();
  await expect(page.locator('input[name=note]')).toHaveValue('Agua');
});
