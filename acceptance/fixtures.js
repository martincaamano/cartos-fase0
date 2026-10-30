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

// The fake Google: Drive lists the books (the personal one, `book-1`, or
// none until the app creates one) and Sheets reads and writes the rows of
// each. `rows` are those of the first book. Every call is kept in `calls`
// as { op, fileId?, ranges?, body? }.
function fakeGoogle(book) {
  const rows = book ?? {};
  // fileId → { name, appProperties, createdTime, rows }.
  const files = new Map();
  if (book) {
    files.set('book-1', { name: 'Cartos · Personal', appProperties: { app: 'cartos', bookType: 'personal' }, createdTime: AT, rows });
  }
  const calls = [];
  // Google's REST APIs answer cross-origin calls, preflight included.
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  };
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  const preflight = (route) => route.request().method() === 'OPTIONS' && route.fulfill({ status: 204, headers: CORS });

  async function install(context) {
    // Google Identity Services: an empty script, the session is seeded.
    await context.route('https://accounts.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

    await context.route('https://www.googleapis.com/drive/**', (route) => {
      if (preflight(route)) return undefined;
      const request = route.request();
      const body = JSON.parse(request.postData() ?? '{}');
      // Creating a book: an empty spreadsheet whose tabs come next. The
      // first one is `book-new` and uses `rows`.
      if (request.method() === 'POST') {
        const fileId = files.size === 0 ? 'book-new' : `book-new-${files.size}`;
        const tabs = files.size === 0 ? rows : {};
        for (const tab of Object.keys(HEADERS)) tabs[tab] = [];
        files.set(fileId, { name: body.name, appProperties: body.appProperties, createdTime: `2026-10-20T0${files.size}:00:00.000Z`, rows: tabs });
        calls.push({ op: 'drive.create', fileId, body });
        return json(route, { id: fileId, name: body.name });
      }
      if (request.method() === 'PATCH') {
        const fileId = decodeURIComponent(new URL(request.url()).pathname.split('/').pop());
        const file = files.get(fileId);
        file.name = body.name;
        file.appProperties = { ...file.appProperties, ...body.appProperties };
        calls.push({ op: 'drive.rename', fileId, body });
        return json(route, { id: fileId, name: body.name });
      }
      calls.push({ op: 'drive.list' });
      return json(route, {
        files: [...files].map(([id, { name, appProperties, createdTime }]) => ({ id, name, createdTime, appProperties })),
      });
    });

    await context.route('https://sheets.googleapis.com/**', (route) => {
      if (preflight(route)) return undefined;
      const request = route.request();
      const url = new URL(request.url());
      const fileId = decodeURIComponent(url.pathname.match(/spreadsheets\/([^/:]+)/)[1]);
      const tabs = files.get(fileId)?.rows;
      if (!tabs) {
        calls.push({ op: 'unexpected', path: url.pathname });
        return route.fulfill({ status: 404, headers: CORS });
      }
      if (url.pathname.endsWith('values:batchGet')) {
        const ranges = url.searchParams.getAll('ranges');
        calls.push({ op: 'batchGet', fileId, ranges });
        return json(route, {
          valueRanges: ranges.map((range) => {
            const [tab, columns] = range.split('!');
            return { values: columns ? tabs[tab].map((row) => [row[0]]) : tabs[tab] };
          }),
        });
      }
      const body = JSON.parse(request.postData() ?? '{}');
      // Renaming and adding tabs when a book is created.
      if (/spreadsheets\/[^/]+:batchUpdate$/.test(url.pathname)) {
        calls.push({ op: 'structure', fileId });
        return json(route, {});
      }
      if (url.pathname.endsWith('values:batchClear')) {
        calls.push({ op: 'clear', fileId, ranges: body.ranges });
        // Only "Tab!A2:Z" is used: everything below the header goes.
        for (const range of body.ranges) tabs[range.split('!')[0]].length = 1;
        return json(route, {});
      }
      if (url.pathname.endsWith(':append')) {
        const tab = decodeURIComponent(url.pathname.split('/values/')[1]).replace(':append', '');
        calls.push({ op: 'append', fileId, tab, valueInputOption: url.searchParams.get('valueInputOption'), body });
        tabs[tab].push(...body.values);
        return json(route, {});
      }
      if (url.pathname.endsWith('values:batchUpdate')) {
        calls.push({ op: 'update', fileId, valueInputOption: body.valueInputOption, body });
        // Writes cell by cell from the top-left cell of the range (A2, F8...),
        // as many rows as given, adding rows when needed.
        for (const { range, values } of body.data) {
          const [tab, cells] = range.split('!');
          const [, letter, number] = cells.match(/^([A-Z])(\d+)/);
          values.forEach((cellsOfRow, k) => {
            const index = Number(number) - 1 + k;
            tabs[tab][index] ??= [];
            cellsOfRow.forEach((value, i) => { tabs[tab][index][letter.charCodeAt(0) - 65 + i] = value; });
          });
        }
        return json(route, {});
      }
      calls.push({ op: 'unexpected', path: url.pathname });
      return route.fulfill({ status: 500, headers: CORS });
    });
  }

  const column = (name) => HEADERS.Movements.indexOf(name);
  return {
    rows,
    files,
    calls,
    install,
    // Movements of a book as objects, header left out.
    movements: (fileId = null) => (fileId ? files.get(fileId).rows : rows).Movements.slice(1).map((row) =>
      Object.fromEntries(HEADERS.Movements.map((name, i) => [name, row[i]]))),
    writes: () => calls.filter((call) => call.op === 'append' || call.op === 'update'),
    column,
  };
}

export const test = base.extend({
  // false: the user has no book yet (onboarding).
  withBook: [true, { option: true }],

  google: async ({ context, withBook }, use) => {
    const google = fakeGoogle(withBook ? sampleBook() : null);
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
        if (note) {
          if (await page.locator('.note-toggle').isVisible()) await page.click('.note-toggle');
          await page.fill('input[name=note]', note);
        }
        await page.click('.form-submit');
        await app.settle();
      },
      google,
    };
    await use(app);
  },
});

export { expect };
