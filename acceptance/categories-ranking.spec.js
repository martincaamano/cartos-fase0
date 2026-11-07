// Tarea 28: Añadir shows the categories used most in the last 6 months, and
// «Ver todas» grows the same grid with the rest, never repeating one.
// Invented data; today is 20 October 2026.
import { test, expect, movement } from './fixtures.js';

const AT = '2026-03-01T10:00:00.000Z';
const NAMES = ['Ocio', 'Hogar', 'Ropa', 'Salud', 'Viajes', 'Regalos', 'Mascotas', 'Libros'];

// Eight more expense categories. Mascotas was used yesterday (a tie with
// Restaurantes, more recent); Libros five times in 2025 (too long ago).
function withMoreCategories(google) {
  NAMES.forEach((name, i) => google.rows.Categories.push([`cat-${i}`, name, '🏷️', 'expense', false, AT, false]));
  google.rows.Movements.push(movement('m-pet', 'acc-bank', 'expense', 12, '2026-10-19', 'cat-6'));
  for (let i = 0; i < 5; i += 1) {
    google.rows.Movements.push(movement(`m-book-${i}`, 'acc-bank', 'expense', 9, `2025-0${i + 1}-10`, 'cat-7'));
  }
}

const names = (page) => page.locator('.category-grid .category-option .category-name').allTextContents();
const RANKED = ['Supermercado', 'Mascotas', 'Restaurantes', 'Ocio', 'Hogar', 'Ropa', 'Salud', 'Viajes', 'Regalos', 'Libros'];

test('Añadir shows the 7 used most lately, and «Ver todas» completes the same grid', async ({ page, app, google }) => {
  withMoreCategories(google);
  await app.open('#/add?type=expense', '.category-grid');
  expect(await names(page)).toEqual([...RANKED.slice(0, 7), 'Ver todas']);
  await expect(page.locator('.category-search')).toBeHidden();

  await page.click('.category-more');
  // The first ones stay where they were; the rest follow; nothing twice.
  expect(await names(page)).toEqual([...RANKED, 'Ver menos']);
  await expect(page.locator('.category-search')).toBeVisible();

  // The search box filters the same grid.
  await page.fill('.category-search', 'ho');
  await expect(page.locator('.category-grid .category-option:visible .category-name')).toHaveText(['Hogar', 'Ver menos']);
  await page.fill('.category-search', 'zzz');
  await expect(page.locator('.category-empty')).toBeVisible();
  await page.fill('.category-search', '');

  // A category from the grown part can be chosen, and the grid folds back.
  await page.locator('.category-option', { hasText: 'Libros' }).click();
  await expect(page.locator('.category-option.is-selected')).toContainText('Libros');
  await page.click('.category-more');
  expect(await names(page)).toEqual([...RANKED.slice(0, 7), 'Ver todas']);
});

test('editing a movement whose category is not among the first ones opens the grid grown', async ({ page, app, google }) => {
  withMoreCategories(google);
  await app.open('#/history/edit?id=m-book-0', '.category-grid');
  await expect(page.locator('.category-search')).toBeVisible();
  await expect(page.locator('.category-option.is-selected')).toContainText('Libros');
  expect(await names(page)).toEqual([...RANKED, 'Ver menos']);
});

test('a book with few categories shows them all, without «Ver todas»', async ({ page, app }) => {
  await app.open('#/add?type=expense', '.category-grid');
  expect(await names(page)).toEqual(['Supermercado', 'Restaurantes']);
  await expect(page.locator('.category-more')).toHaveCount(0);
  await page.locator('.tab', { hasText: 'Ingreso' }).click();
  expect(await names(page)).toEqual(['Nómina']);
});
