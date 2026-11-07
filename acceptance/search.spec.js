// Tarea 26: searching the notes in History, inside «Filtrar». Words in any
// order, accents and capitals ignored, a typo forgiven, most words enough;
// a line on top says what was found. Invented data.
import { test, expect, movement } from './fixtures.js';

// A trip to Andorra and other notes; a transfer whose note says Andorra.
function withNotes(google) {
  const transfer = (id, accountId, type) => {
    const row = movement(id, accountId, type, 100, '2026-10-06', 'transfer', 'cambio Andorra');
    row[7] = 't-andorra';
    return row;
  };
  google.rows.Movements.push(
    movement('m-fuel', 'acc-bank', 'expense', 60, '2026-10-05', 'cat-food', 'gasolina Andorra'),
    movement('m-hotel', 'acc-bank', 'expense', 200.5, '2026-10-07', 'cat-rest', 'Hotel en ANDÓRRA la Vella'),
    movement('m-back', 'acc-bank', 'income', 20, '2026-10-08', 'cat-salary', 'devolución viaje Andorra'),
    movement('m-gift', 'acc-cash', 'expense', 30, '2026-09-20', 'cat-food', 'regalo Ana'),
    transfer('m-t1', 'acc-bank', 'expense'),
    transfer('m-t2', 'acc-cash', 'income'),
  );
}

async function search(page, text) {
  if (await page.locator('.history-filters').isHidden()) await page.click('.history-filter-toggle');
  await page.fill('.history-search', text);
}

const listView = (page) => page.click('.history-view[data-view=list]');
const labels = async (app) => (await app.lines('.history-list')).map(([label]) => label);

test('one word finds every note that has it, with the total of what was found', async ({ page, app, google }) => {
  withNotes(google);
  await app.open('#/history', '.history-list');
  await listView(page);
  await search(page, 'andorra');
  await expect(page.locator('.history-found')).toHaveText('4 movimientos · 260,50 € de gasto · 20,00 € de ingreso');
  await expect.poll(() => labels(app)).toEqual([
    '08/10  💼 Nómina devolución viaje Andorra',
    '07/10  🍽️ Restaurantes Hotel en ANDÓRRA la Vella',
    '06/10  🏦 Abanca → 💶 Efectivo cambio Andorra',
    '05/10  🛒 Supermercado gasolina Andorra',
  ]);
  // The word found is marked in each note, with its own spelling.
  await expect(page.locator('.note-hit')).toHaveText(['Andorra', 'ANDÓRRA', 'Andorra', 'Andorra']);
  await expect(page.locator('.history-filter-toggle')).toContainText('Filtrar · 1');
});

test('words in another order, a typo, and the majority rule', async ({ page, app, google }) => {
  withNotes(google);
  await app.open('#/history', '.history-list');
  await listView(page);
  await search(page, 'Andorro viaje');
  await expect.poll(() => labels(app)).toEqual(['08/10  💼 Nómina devolución viaje Andorra']);
  // Three words: one may be missing («Vella» is not in the others).
  await search(page, 'hotel andorra vella');
  await expect.poll(() => labels(app)).toEqual(['07/10  🍽️ Restaurantes Hotel en ANDÓRRA la Vella']);
  // «Ana» does not find «Ano» nor a typo of it; short words are ignored.
  await search(page, 'regalo de Ana');
  await expect.poll(() => labels(app)).toEqual(['20/09  🛒 Supermercado regalo Ana']);
  await search(page, 'zapatos');
  await expect(page.locator('.history-list')).toHaveText('Ningún movimiento coincide con los filtros.');
  await expect(page.locator('.history-found')).toHaveText('0 movimientos');
});

test('the search adds to the other filters and works in the Resumen view', async ({ page, app, google }) => {
  withNotes(google);
  await app.open('#/history', '.history-list');
  await search(page, 'andorra');
  await page.locator('.history-categories .chip', { hasText: 'Supermercado' }).click();
  await expect(page.locator('.history-found')).toHaveText('1 movimiento · 60,00 € de gasto');
  await expect(page.locator('.history-filter-toggle')).toContainText('Filtrar · 2');
  // Resumen: the total of what was found.
  await expect(page.locator('.tree-total .tree-value')).toHaveText('−60,00 €');

  // «Quitar» clears the search too.
  await page.click('.history-clear');
  await expect(page.locator('.history-search')).toHaveValue('');
  await expect(page.locator('.history-found')).toBeHidden();
});

test('the search is gone when History opens again, and works offline', async ({ page, context, app, google }) => {
  withNotes(google);
  await app.open('#/history', '.history-list');
  await context.setOffline(true);
  await listView(page);
  await search(page, 'regalo');
  await expect.poll(() => labels(app)).toEqual(['20/09  🛒 Supermercado regalo Ana']);
  await app.go('#/');
  await app.go('#/history');
  await expect(page.locator('.history-found')).toBeHidden();
  await expect(page.locator('.history-filter-toggle')).toHaveText('Filtrar ▾');
});
