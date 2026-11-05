// Desviaciones in Análisis (tarea 24b): why a month went off its average,
// and from there to History filtered by month and category. Invented data.
import { test, expect, movement } from './fixtures.js';

const AT = '2026-03-01T10:00:00.000Z';

// March to August: Supermercado 100 and Restaurantes 30 each month (August's
// Supermercado is 110). September (with the sample's 9,99 of Supermercado):
// Restaurantes 150 + 40 and a new category, Ocio, 60.
function withHistory(google) {
  google.rows.Categories.push(['cat-fun', 'Ocio', '🎭', 'expense', false, AT, false]);
  for (const month of ['03', '04', '05', '06', '07', '08']) {
    const food = month === '08' ? 110 : 100;
    google.rows.Movements.push(
      movement(`m-food-${month}`, 'acc-bank', 'expense', food, `2026-${month}-05`, 'cat-food'),
      movement(`m-rest-${month}`, 'acc-bank', 'expense', 30, `2026-${month}-12`, 'cat-rest'),
    );
  }
  google.rows.Movements.push(
    movement('m-boda', 'acc-bank', 'expense', 150, '2026-09-15', 'cat-rest', 'boda'),
    movement('m-cena', 'acc-bank', 'expense', 40, '2026-09-20', 'cat-rest', 'cena'),
    movement('m-fun', 'acc-bank', 'expense', 60, '2026-09-25', 'cat-fun'),
  );
}

const summary = (page) => page.locator('.stat-deviation-summary');
const rows = (page) => page.locator('.stat-deviation .tree-head');

test('a month that spent more says why, and opens a category on its movements and in History', async ({ page, app, google }) => {
  withHistory(google);
  await app.open('#/analysis?period=month&month=2026-09', '.stat-deviations');
  // 9,99 + 190 + 60 = 259,99 against (5 × 130 + 140) / 6 = 131,67 a month.
  await expect(summary(page)).toHaveText('Septiembre: +128 € sobre tu media de los últimos 6 meses, sobre todo por Restaurantes y Ocio.');
  await expect(rows(page)).toHaveText([/🍽️ Restaurantes\s*\+160 €/, /🎭 Ocio nueva\s*\+60 €/]);
  await expect(page.locator('.stat-deviation .tree-body').first()).toBeHidden();

  await rows(page).first().click();
  const detail = page.locator('.stat-deviation .tree-body').first();
  await expect(detail.locator('.stat-deviation-sums')).toHaveText('Gastado 190,00 € · media 30,00 €');
  // The biggest first, until they cover the 160 more.
  await expect(detail.locator('.receipt-line').filter({ hasNot: page.locator('a') })).toHaveText([/15\/09\s+boda\s*−150,00 €/, /20\/09\s+cena\s*−40,00 €/]);

  await detail.locator('.stat-deviation-link').click();
  await expect(page).toHaveURL(/#\/history\?month=2026-09&category=cat-rest/);
  await expect(page.locator('.tree-month .tree-label')).toHaveText(['SEPTIEMBRE 2026']);
  await expect(page.locator('.tree-total .tree-value')).toHaveText('−190,00 €');
});

test('a normal month shows its total, a young one says there is not enough history', async ({ page, app, google }) => {
  withHistory(google);
  await app.open('#/analysis?period=month&month=2026-08', '.stat-deviations');
  // 140 against the 130 of March to July: no category goes off.
  await expect(summary(page)).toHaveText('Agosto: +10 € sobre tu media de los últimos 5 meses. Ninguna categoría se sale de lo normal.');
  await expect(rows(page)).toHaveCount(0);

  // The month picker moves the block along.
  for (let i = 0; i < 4; i += 1) await page.click('.month-step[data-step="-1"]');
  await expect(page.locator('.month-label')).toHaveText('ABRIL 2026');
  await expect(summary(page)).toHaveText('Aún no hay histórico suficiente para compararlo con tu media.');
});

test('the categories left out of Análisis are left out of the deviations too', async ({ page, app, google }) => {
  withHistory(google);
  await app.open('#/analysis?period=month&month=2026-09', '.stat-deviations');
  await page.click('.stat-exclude-toggle');
  await page.locator('.stat-exclude-chips .chip', { hasText: 'Restaurantes' }).click();
  // 9,99 + 60 against (5 × 100 + 110) / 6 = 101,67 a month.
  await expect(summary(page)).toHaveText('Septiembre: −32 € por debajo de tu media de los últimos 6 meses, aunque subió Ocio.');
  await expect(rows(page)).toHaveText([/🎭 Ocio nueva\s*\+60 €/]);
});

test('by 12 meses every month with history is listed, newest first, and a tap opens it', async ({ page, app, google }) => {
  withHistory(google);
  await app.open('#/analysis', '.stat-deviation-months');
  // March to May have not enough history before them; October is in
  // progress (20,50 + 45 against the 919,99 / 6 = 153,33 of April to
  // September).
  expect(await app.lines('.stat-deviation-months')).toEqual([
    ['Oct 2026 en curso · dentro de lo normal', '−88 €'],
    ['Sep 2026 · 🍽️ Restaurantes', '+128 €'],
    ['Ago 2026 · dentro de lo normal', '+10 €'],
    ['Jul 2026 · dentro de lo normal', '0 €'],
    ['Jun 2026 · dentro de lo normal', '0 €'],
  ]);

  await page.locator('.stat-deviation-month', { hasText: 'Sep 2026' }).click();
  await expect(page).toHaveURL(/period=month&month=2026-09/);
  await expect(page.locator('.month-label')).toHaveText('SEPTIEMBRE 2026');
  await expect(summary(page)).toContainText('Septiembre: +128 €');
});

test('Todo shows the 12 newest months and the rest behind «+ N más»', async ({ page, app, google }) => {
  // Two years of the same spending, October 2024 to September 2026: from
  // January 2025 on, 22 months have enough history.
  for (let i = 0; i < 24; i += 1) {
    const month = `${2024 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`;
    google.rows.Movements.push(movement(`m-old-${i}`, 'acc-bank', 'expense', 50, `${month}-03`, 'cat-food'));
  }
  await app.open('#/analysis?period=all', '.stat-deviation-months');
  const months = page.locator('.stat-deviation-month');
  await expect(months).toHaveCount(12);
  await expect(months.first()).toContainText('Oct 2026 en curso');
  await page.locator('.stat-deviations .stat-more').click();
  await expect(months).toHaveCount(22);
  await expect(months.last()).toContainText('Ene 2025');
});

test('a young book says there is not enough history in every period', async ({ page, app }) => {
  await app.open('#/analysis', '.stat-deviations');
  await expect(summary(page)).toHaveText('Aún no hay histórico suficiente para compararlo con tu media.');
  await expect(page.locator('.stat-deviation-month')).toHaveCount(0);
});
