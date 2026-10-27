// Shared setup for the acceptance tests: a fake Google with an in-memory
// book, a signed-in session and a fixed date. Nothing ever reaches Google.
//
// Each test gets `google` (the fake: rows, calls) and `app` (helpers to
// open the app and wait for it to settle).

import { test as base, expect } from '@playwright/test';

// The day the tests live in (local time, Europe/Madrid).
export const TODAY = new Date('2026-10-20T12:00:00+02:00');

const HEADERS = {
  Accounts: ['id', 'name', 'emoji', 'initialBalance', 'createdAt', 'updatedAt', 'deleted'],
  Categories: ['id', 'name', 'emoji', 'kind', 'isDefault', 'updatedAt', 'deleted'],
  Movements: ['id', 'accountId', 'type', 'amount', 'date', 'categoryId', 'note', 'transferId',
    'personId', 'createdBy', 'createdAt', 'updatedAt', 'deleted'],
};

const AT = '2026-09-01T10:00:00.000Z';
const movement = (id, accountId, type, amount, date, categoryId, note = '') =>
  [id, accountId, type, amount, date, categoryId, note, '', '', 'user-1', `${date}T10:00:00.000Z`, `${date}T10:00:00.000Z`, false];

// Two accounts, five categories and movements in October and September.
// Balances: Abanca 1000 + 1500 − 20,50 − 45 = 2.434,50; Efectivo 50 − 9,99 = 40,01.
export function sampleBook() {
  return {
    Accounts: [
      HEADERS.Accounts,
      ['acc-bank', 'Abanca', '🏦', 1000, AT, AT, false],
      ['acc-cash', 'Efectivo', '💶', 50, AT, AT, false],
    ],
    Categories: [
      HEADERS.Categories,
      ['cat-food', 'Supermercado', '🛒', 'expense', true, AT, false],
      ['cat-rest', 'Restaurantes', '🍽️', 'expense', true, AT, false],
      ['cat-salary', 'Nómina', '💼', 'income', true, AT, false],
      ['cat-old', 'Viejo', '📦', 'expense', false, AT, true],
      ['transfer', 'Transferencia', '🔁', 'both', true, AT, false],
    ],
    Movements: [
      HEADERS.Movements,
      movement('m-salary', 'acc-bank', 'income', 1500, '2026-10-01', 'cat-salary'),
      movement('m-food', 'acc-bank', 'expense', 20.5, '2026-10-15', 'cat-food'),
      movement('m-rest', 'acc-bank', 'expense', 45, '2026-10-18', 'cat-rest', 'cena'),
      movement('m-sept', 'acc-cash', 'expense', 9.99, '2026-09-15', 'cat-food'),
    ],
  };
}

// The fake Google: Drive lists one personal book; Sheets reads and writes
// `rows`. Every call is kept in `calls` as { op, ranges?, body? }.
function fakeGoogle(rows) {
  const calls = [];
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  async function install(context) {
    // Google Identity Services: an empty script, the session is seeded.
    await context.route('https://accounts.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

    await context.route('https://www.googleapis.com/drive/**', (route) => {
      calls.push({ op: 'drive.list' });
      return json(route, {
        files: [{ id: 'book-1', name: 'Cartos · Personal', createdTime: AT, appProperties: { app: 'cartos', bookType: 'personal' } }],
      });
    });

    await context.route('https://sheets.googleapis.com/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('values:batchGet')) {
        const ranges = url.searchParams.getAll('ranges');
        calls.push({ op: 'batchGet', ranges });
        return json(route, {
          valueRanges: ranges.map((range) => {
            const [tab, columns] = range.split('!');
            return { values: columns ? rows[tab].map((row) => [row[0]]) : rows[tab] };
          }),
        });
      }
      const body = JSON.parse(request.postData() ?? '{}');
      if (url.pathname.endsWith(':append')) {
        const tab = decodeURIComponent(url.pathname.split('/values/')[1]).replace(':append', '');
        calls.push({ op: 'append', tab, valueInputOption: url.searchParams.get('valueInputOption'), body });
        rows[tab].push(...body.values);
        return json(route, {});
      }
      if (url.pathname.endsWith('values:batchUpdate')) {
        calls.push({ op: 'update', valueInputOption: body.valueInputOption, body });
        // Writes cell by cell from the first column of the range (A, F...).
        for (const { range, values } of body.data) {
          const [tab, cells] = range.split('!');
          const [, letter, number] = cells.match(/^([A-Z])(\d+)/);
          const row = rows[tab][Number(number) - 1];
          values[0].forEach((value, i) => { row[letter.charCodeAt(0) - 65 + i] = value; });
        }
        return json(route, {});
      }
      calls.push({ op: 'unexpected', path: url.pathname });
      return route.fulfill({ status: 500 });
    });
  }

  const column = (name) => HEADERS.Movements.indexOf(name);
  return {
    rows,
    calls,
    install,
    // Movements as objects, header left out.
    movements: () => rows.Movements.slice(1).map((row) =>
      Object.fromEntries(HEADERS.Movements.map((name, i) => [name, row[i]]))),
    writes: () => calls.filter((call) => call.op === 'append' || call.op === 'update'),
    column,
  };
}

export const test = base.extend({
  google: async ({ context }, use) => {
    const google = fakeGoogle(sampleBook());
    await google.install(context);
    await use(google);
  },

  app: async ({ page, context, google }, use) => {
    await page.clock.setFixedTime(TODAY);
    // A signed-in session with Drive access and a token valid for an hour.
    await context.addInitScript((now) => {
      if (localStorage.getItem('cartos.session')) return;
      localStorage.setItem('cartos.session', JSON.stringify({
        user: { sub: 'user-1', email: 'prueba@example.com', name: 'Prueba' },
        driveGranted: true,
        accessToken: 'test-token',
        tokenExpiresAt: now + 3600 * 1000,
      }));
    }, TODAY.getTime());

    // Google calls in flight, so a test can wait for a sync to finish.
    let inFlight = 0;
    const isGoogle = (request) => /googleapis\.com/.test(request.url());
    page.on('request', (request) => { if (isGoogle(request)) inFlight += 1; });
    for (const event of ['requestfinished', 'requestfailed']) {
      page.on(event, (request) => { if (isGoogle(request)) inFlight -= 1; });
    }

    const app = {
      // Opens the app at a hash and waits until the Dashboard (or `ready`)
      // is painted with the book read from the fake Drive.
      async open(hash = '#/', ready = '.receipt-total-amount') {
        await page.goto(`/index.html${hash}`);
        await expect(page.locator(ready)).toBeVisible();
        await app.settle();
      },
      async go(hash) {
        await page.evaluate((h) => { location.hash = h; }, hash);
        await app.settle();
      },
      // Waits until no Google call has been in flight for a moment, so a
      // sync and the reload after it are over.
      async settle() {
        let quietSince = Date.now();
        await expect.poll(() => {
          if (inFlight > 0) quietSince = Date.now();
          return Date.now() - quietSince >= 300;
        }, { intervals: [50], timeout: 10_000 }).toBe(true);
      },
      // Receipt lines inside `list` as [label, amount] pairs.
      lines: (list) => page.locator(`${list} .receipt-row`).evaluateAll((rows) => rows.map((row) => [
        row.querySelector('.receipt-label')?.textContent.trim() ?? '',
        row.querySelector('.receipt-amount')?.textContent.trim() ?? '',
      ])),
      // Fills the Add form: { type, amount, category (name), account, from, to, note }.
      async addMovement({ type = 'expense', amount, category, account, from, to, note }) {
        await app.go(`#/add?type=${type}`);
        if (account) await page.selectOption('select[name=account]', { label: account });
        if (from) await page.selectOption('select[name=from]', { label: from });
        if (to) await page.selectOption('select[name=to]', { label: to });
        await page.fill('.amount-input', amount);
        if (category) await page.locator('.category-option', { hasText: category }).first().click();
        if (note) await page.fill('input[name=note]', note);
        await page.click('.form-submit');
        await app.settle();
      },
      google,
    };
    await use(app);
  },
});

export { expect };
