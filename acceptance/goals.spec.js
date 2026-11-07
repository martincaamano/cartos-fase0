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

// --- Tarea 25d: the purchase of a reached goal ---

function withReachedGoal(google) {
  google.rows.Goals.push(goalRow('g-tv', 'Televisión', 1000, '2027-03-01'));
  google.rows.Contributions.push(contributionRow('c-1', 'g-tv', 600, '2026-09-01'), contributionRow('c-2', 'g-tv', 400, '2026-10-01'));
}

test('a reached goal records its purchase in Añadir, prefilled, and is completed with it', async ({ page, app, google }) => {
  withReachedGoal(google);
  await app.open('#/goals/goal?id=g-tv', '.goal-saved');
  await expect(page.locator('.goal-detail')).toContainText('objetivo alcanzado');
  await page.click('.goal-buy');
  await expect(page).toHaveURL(/#\/add\?type=expense&goal=g-tv/);
  await expect(page.locator('.amount-input')).toHaveValue('1000,00');
  await expect(page.locator('input[name=note]')).toHaveValue('Televisión');
  await expect(page.locator('.category-option.is-selected')).toContainText('Supermercado');

  // It cost less than planned.
  await page.fill('.amount-input', '950');
  await page.click('.form-submit');
  await expect(page.locator('.toast')).toContainText('Televisión: compra registrada, meta cumplida');
  await app.reveal();
  // The goal is out of METAS, archived; nothing is put aside any more.
  await expect(page.locator('.dashboard-goals')).toHaveText('Aún no tienes metas. Crea una para apartar dinero para algo concreto.');
  await expect(page.locator('.dashboard-goals-done')).toHaveText('Cumplidas: Televisión');
  await expect(page.locator('.receipt-total-amount')).toHaveText('1.524,51 €');

  await app.settle();
  const [movement] = google.movements().filter((m) => m.note === 'Televisión');
  expect([movement.type, movement.amount, movement.categoryId]).toEqual(['expense', 950, 'cat-food']);
  const goal = google.records('Goals')[0];
  expect([goal.status, goal.movementId]).toEqual(['completed', movement.id]);
  // Both in the same sync: the movement appended first, then the goal's row
  // rewritten, so the goal never points at a movement not in the Sheet yet.
  expect(google.writes().slice(-2).map((w) => w.tab ?? w.body.data[0].range.split('!')[0])).toEqual(['Movements', 'Goals']);
});

test('leaving Añadir without saving changes nothing', async ({ page, app, google }) => {
  withReachedGoal(google);
  await app.open('#/add?type=expense&goal=g-tv', '.amount-input');
  await page.click('.back-link');
  await expect(page.locator('.goal-buy')).toBeVisible();
  await app.settle();
  expect(google.writes()).toEqual([]);
  expect(google.records('Goals')[0].status).toBe('active');
});

test('a purchase saved offline goes up together with its goal', async ({ page, context, app, google }) => {
  withReachedGoal(google);
  await app.open('#/add?type=expense&goal=g-tv', '.amount-input');
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await page.click('.form-submit');
  await app.reveal();
  await expect(page.locator('.dashboard-notice')).toContainText('2 cambios pendientes');
  await expect(page.locator('.dashboard-goals-done')).toHaveText('Cumplidas: Televisión');
  expect(google.writes()).toEqual([]);

  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await app.settle();
  expect(google.records('Goals')[0].status).toBe('completed');
  expect(google.movements().some((m) => m.note === 'Televisión' && m.amount === 1000)).toBe(true);
});

// --- Tarea 25e: goals in a shared book ---

test('in a shared book a goal says who put how much: «Tú» and the other person', async ({ page, app, google }) => {
  const HEAD = (tab) => google.rows[tab][0];
  google.files.set('book-casa', {
    name: 'Cartos · Casa compartida',
    appProperties: { app: 'cartos', bookType: 'shared', name: 'Casa compartida' },
    createdTime: AT,
    rows: {
      Accounts: [HEAD('Accounts'), ['acc-common', 'Común', '🏠', 300, AT, AT, false]],
      Categories: [HEAD('Categories'), ['transfer', 'Transferencia', '🔁', 'both', true, AT, false], ['cat-home', 'Hogar', '🏠', 'expense', false, AT, false]],
      Movements: [HEAD('Movements')],
      Members: [['id', 'email', 'name', 'createdAt'], ['m-ana', 'ana@example.com', 'Ana Pérez', AT], ['m-me', 'prueba@example.com', 'Prueba', AT]],
      Goals: [HEAD('Goals'), goalRow('g-sofa', 'Sofá', 800, '2027-02-01', { categoryId: 'cat-home' })],
      Contributions: [
        HEAD('Contributions'),
        contributionRow('c-me', 'g-sofa', 150, '2026-10-01'),
        ['c-ana', 'g-sofa', 250, '2026-10-05', 'user-ana', AT, AT, false],
      ],
    },
  });
  // The personal book keeps a goal of its own: books never mix.
  withGoals(google);

  await app.open('#/settings/books', '.book-list');
  await page.locator('.book-other', { hasText: 'Casa compartida' }).click();
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Casa compartida');
  await app.reveal();
  await expect(page.locator('.dashboard-goals-sums')).toHaveText('Apartado 400,00 € · Disponible −100,00 €');
  await expect(page.locator('.dashboard-goal .receipt-label')).toHaveText('Sofá');

  await page.locator('.dashboard-goal').click();
  await app.settle();
  await expect(page.locator('.goal-people')).toHaveText('Ana 250,00 € · Tú 150,00 €');
  expect(await app.lines('.goal-contributions')).toEqual([['05/10  Ana', '+250,00 €'], ['01/10  Tú', '+150,00 €']]);

  // A contribution here goes to this book's Sheet only.
  await page.fill('.amount-input', '50');
  await page.click('.form-submit');
  await expect(page.locator('.goal-people')).toHaveText('Ana 250,00 € · Tú 200,00 €');
  await app.settle();
  expect(google.records('Contributions', 'book-casa').map((c) => [c.amount, c.createdBy])).toEqual([[150, 'user-1'], [250, 'user-ana'], [50, 'user-1']]);
  expect(google.records('Contributions')).toHaveLength(2);
});

test('in a personal book nobody is named', async ({ page, app, google }) => {
  withGoals(google);
  await app.open('#/goals/goal?id=g-tv', '.goal-saved');
  await expect(page.locator('.goal-people')).toHaveCount(0);
  expect(await app.lines('.goal-contributions')).toEqual([['15/10', '+50,00 €'], ['01/10', '+200,00 €']]);
});
