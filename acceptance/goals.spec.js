// Savings goals (tarea 25b and 25c): the METAS block on INICIO, a goal's
// screen, putting money in and taking it back. Invented data.
import { test, expect } from './fixtures.js';

const AT = '2026-10-01T10:00:00.000Z';
const goalRow = (id, name, target, date, extra = {}) => [
  id, name, extra.categoryId ?? 'cat-food', target, date, extra.status ?? 'active', '', '', 'user-1', AT, AT, extra.deleted ?? false,
];
const contributionRow = (id, goalId, amount, date) => [id, goalId, amount, date, 'user-1', AT, AT, false];

// A TV for March: 250 put aside in two contributions; an old goal removed.
function withGoals(google) {
  google.rows.Goals.push(
    goalRow('g-tv', 'Televisión', 1000, '2027-03-01'),
    goalRow('g-old', 'Vieja', 50, '2026-12-01', { deleted: true }),
  );
  google.rows.Contributions.push(contributionRow('c-1', 'g-tv', 200, '2026-10-01'), contributionRow('c-2', 'g-tv', 50, '2026-10-15'));
}

const goalLine = (page) => page.locator('.dashboard-goal');

test('INICIO shows what the goals put aside and what is left, and the TOTAL stays the same', async ({ page, app, google }) => {
  withGoals(google);
  await app.open();
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('2.474,51 €');
  expect(await app.lines('.receipt-accounts')).toEqual([['🏦 Abanca', '2.434,50 €'], ['💶 Efectivo', '40,01 €']]);
  await expect(page.locator('.dashboard-goals-sums')).toHaveText('Apartado 250,00 € · Disponible 2.224,51 €');
  await expect(goalLine(page)).toHaveCount(1);
  await expect(goalLine(page).locator('.receipt-label')).toHaveText('Televisión');
  await expect(goalLine(page).locator('.receipt-amount')).toHaveText('250,00 € / 1.000,00 €');
  await expect(page.locator('.goal-state')).toHaveText('hasta el 01/03/2027');

  // Hidden amounts hide the goals too.
  await page.click('.amounts-toggle');
  await expect(page.locator('.dashboard-goals-sums')).toHaveText('Apartado ••••• € · Disponible ••••• €');
  await expect(goalLine(page).locator('.receipt-amount')).toHaveText('••••• €');
});

test('a new goal is created from INICIO and opens on its screen', async ({ page, app, google }) => {
  await app.open();
  await page.click('.dashboard-goal-new');
  await expect(page.locator('.form-title')).toHaveText('NUEVA META');
  // Nothing filled in: it says what is missing and writes nothing.
  await page.click('.form-submit');
  await expect(page.locator('.form-error')).toHaveText('Ponle un nombre.');

  await page.fill('input[name=name]', 'Bici');
  await page.fill('.amount-input', '600');
  await page.fill('input[name=targetDate]', '2027-05-01');
  await page.locator('.category-option', { hasText: 'Supermercado' }).click();
  await page.click('.form-submit');
  await expect(page.locator('.screen-goal .form-title')).toHaveText('BICI');
  await expect(page).toHaveURL(/#\/goals\/goal\?id=/);
  await expect(page.locator('.goal-saved')).toHaveText('0,00 € de 600,00 €');
  // Today is 20 October: October to April, 7 months (600 / 7, a cent up).
  await expect(page.locator('.goal-suggested')).toHaveText('Para llegar: 85,72 € al mes durante 7 meses.');
  await app.settle();
  const [goal] = google.records('Goals');
  expect([goal.name, goal.targetAmount, goal.targetDate, goal.categoryId, goal.status]).toEqual(['Bici', 600, '2027-05-01', 'cat-food', 'active']);
});

test('putting money in, taking some back, undoing, editing and deleting a contribution', async ({ page, app, google }) => {
  withGoals(google);
  await app.open('#/goals/goal?id=g-tv', '.goal-saved');
  await expect(page.locator('.goal-saved')).toHaveText('250,00 € de 1.000,00 €');
  expect(await app.lines('.goal-contributions')).toEqual([['15/10', '+50,00 €'], ['01/10', '+200,00 €']]);

  await page.fill('.amount-input', '100');
  await page.click('.form-submit');
  await expect(page.locator('.toast')).toContainText('✓ aportado 100,00 €');
  await expect(page.locator('.goal-saved')).toHaveText('350,00 € de 1.000,00 €');

  await page.locator('.goal-direction .chip', { hasText: 'Retirar' }).click();
  await page.fill('.amount-input', '30');
  await page.click('.form-submit');
  await expect(page.locator('.toast')).toContainText('✓ retirado 30,00 €');
  await expect(page.locator('.goal-saved')).toHaveText('320,00 € de 1.000,00 €');
  await page.locator('.toast button').click();
  await expect(page.locator('.goal-saved')).toHaveText('350,00 € de 1.000,00 €');

  // 0 is not a contribution.
  await page.fill('.amount-input', '0');
  await page.click('.form-submit');
  await expect(page.locator('.form-error')).toHaveText('Pon un importe distinto de 0, con dos decimales como mucho.');

  // A tap on a contribution edits it.
  await page.locator('.goal-contribution', { hasText: '01/10' }).click();
  await expect(page.locator('.amount-input')).toHaveValue('200,00');
  await page.fill('.amount-input', '180');
  await page.click('.form-submit');
  await expect(page.locator('.goal-saved')).toHaveText('330,00 € de 1.000,00 €');

  // And deletes it with two taps.
  await page.locator('.goal-contribution', { hasText: '15/10' }).click();
  await page.click('.goal-delete');
  await expect(page.locator('.goal-delete')).toHaveText('¿Seguro? Toca otra vez');
  await page.click('.goal-delete');
  await expect(page.locator('.goal-saved')).toHaveText('280,00 € de 1.000,00 €');

  await app.settle();
  // Left: the 200 edited to 180 and the new 100; the 30 taken back was
  // undone and the 50 deleted.
  const live = google.records('Contributions').filter((c) => !c.deleted);
  expect(live.map((c) => c.amount)).toEqual([180, 100]);
  expect(google.records('Contributions').find((c) => c.id === 'c-2').deleted).toBe(true);
});

test('a contribution saved offline waits and goes up when the connection is back', async ({ page, context, app, google }) => {
  withGoals(google);
  await app.open('#/goals/goal?id=g-tv', '.goal-saved');
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await page.fill('.amount-input', '25,50');
  await page.click('.form-submit');
  await expect(page.locator('.goal-saved')).toHaveText('275,50 € de 1.000,00 €');
  await app.go('#/');
  await expect(page.locator('.dashboard-notice')).toContainText('1 cambio pendiente');
  expect(google.records('Contributions')).toHaveLength(2);

  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await app.settle();
  await expect(page.locator('.dashboard-notice')).toBeHidden();
  expect(google.records('Contributions').map((c) => c.amount)).toEqual([200, 50, 25.5]);
});

test('editing a goal, then removing it frees what it put aside', async ({ page, app, google }) => {
  withGoals(google);
  await app.open('#/goals/goal?id=g-tv', '.goal-saved');
  await page.click('.goal-edit');
  await expect(page.locator('input[name=name]')).toHaveValue('Televisión');
  await page.fill('input[name=name]', 'Tele grande');
  await page.fill('.amount-input', '1200');
  await page.click('.form-submit');
  await expect(page.locator('.screen-goal .form-title')).toHaveText('TELE GRANDE');
  await expect(page.locator('.goal-saved')).toHaveText('250,00 € de 1.200,00 €');

  await page.click('.card-remove');
  await page.click('.card-remove');
  await expect(page.locator('.receipt-total-amount')).toBeVisible();
  await app.reveal();
  await expect(page.locator('.dashboard-goals')).toHaveText('Aún no tienes metas. Crea una para apartar dinero para algo concreto.');
  await app.settle();
  const goal = google.records('Goals').find((g) => g.id === 'g-tv');
  expect([goal.name, goal.targetAmount, goal.deleted]).toEqual(['Tele grande', 1200, true]);
});
