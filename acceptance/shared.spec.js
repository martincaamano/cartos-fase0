// A shared book (tarea 18a): sharing it from its card, and opening one
// someone shared through the Picker (a fake one). Invented data.
import { test, expect, MEMBERS_HEADER } from './fixtures.js';

const AT = '2026-09-01T10:00:00.000Z';

// The Picker needs an API key; the real config.js has none yet.
async function withPickerKey(context) {
  await context.route('**/js/config.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("GOOGLE_API_KEY = ''", "GOOGLE_API_KEY = 'test-key'");
    await route.fulfill({ response, body });
  });
}

// A book Ana shared with the signed-in user: not reachable until picked.
function sharedByAna(google) {
  google.files.set('book-ana', {
    name: 'Cartos · Casa compartida',
    appProperties: { app: 'cartos', bookType: 'shared', name: 'Casa compartida' },
    createdTime: AT,
    hidden: true,
    canShare: false,
    rows: {
      Accounts: [
        ['id', 'name', 'emoji', 'initialBalance', 'createdAt', 'updatedAt', 'deleted'],
        ['acc-common', 'Común', '🏠', 300, AT, AT, false],
      ],
      Categories: [
        ['id', 'name', 'emoji', 'kind', 'isDefault', 'updatedAt', 'deleted'],
        ['transfer', 'Transferencia', '🔁', 'both', true, AT, false],
      ],
      Movements: [[
        'id', 'accountId', 'type', 'amount', 'date', 'categoryId', 'note', 'transferId',
        'personId', 'createdBy', 'createdAt', 'updatedAt', 'deleted',
      ]],
      Members: [MEMBERS_HEADER, ['member-ana', 'ana@example.com', 'Ana Pérez', AT]],
    },
  });
}

test('a shared book is shared from its card: the one who shares joins, Drive gets the email', async ({ page, app, google }) => {
  await app.open('#/settings/books/new', 'input[name=bookName]');
  await page.fill('input[name=bookName]', 'Casa');
  await page.fill('form input[name=name]', 'Cuenta común');
  await page.click('form .form-submit');
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Casa');
  await app.go('#/settings/books');
  await page.click('.book-open');
  await app.settle();
  // Nobody yet: the book has no Members tab.
  expect(await app.lines('.book-people')).toEqual([['Aún nadie. Al compartirlo apareces tú; la otra persona, cuando lo abra.', '']]);

  await page.fill('.book-share input[name=email]', 'Prueba@Example.com ');
  await page.click('.book-share-submit');
  await expect(page.locator('.book-share .form-error')).toHaveText('Ese es tu propio email.');
  await page.fill('.book-share input[name=email]', 'ana@');
  await page.click('.book-share-submit');
  await expect(page.locator('.book-share .form-error')).toHaveText('Ese email no parece válido.');

  await page.fill('.book-share input[name=email]', 'ana@example.com');
  await page.click('.book-share-submit');
  await expect(page.locator('.book-share-done')).toContainText('Compartido con ana@example.com.');
  await app.settle();
  expect(await app.lines('.book-people')).toEqual([['Prueba', 'prueba@example.com']]);

  const fileId = 'book-new-1';
  const op = (name) => google.calls.filter((call) => call.op === name && call.fileId === fileId);
  expect(op('drive.share').map((call) => call.body)).toEqual([{ type: 'user', role: 'writer', emailAddress: 'ana@example.com' }]);
  expect(op('drive.noReshare').map((call) => call.body)).toEqual([{ writersCanShare: false }]);
  const members = google.files.get(fileId).rows.Members;
  expect(members[0]).toEqual(MEMBERS_HEADER);
  expect(members.slice(1).map((row) => row.slice(1, 3))).toEqual([['prueba@example.com', 'Prueba']]);
});

test('the personal book has no people nor sharing on its card', async ({ page, app }) => {
  await app.open('#/settings/books/edit', '.book-rename');
  await expect(page.locator('.book-people-section')).toBeHidden();
});

test('a book shared with me opens from the Picker, and I join it', async ({ page, context, app, google }) => {
  await withPickerKey(context);
  sharedByAna(google);
  google.pick('book-ana');
  await app.open('#/settings/books', '.book-list');
  expect((await app.lines('.book-list')).map(([label]) => label)).not.toContain('Casa compartida');

  await page.click('.book-open-shared');
  await expect(page.locator('.book-banner')).toHaveText('LIBRO · Casa compartida');
  expect(new URL(page.url()).hash).toBe('#/');
  await app.reveal();
  await expect(page.locator('.receipt-total-amount')).toHaveText('300,00 €');

  // Joined: Ana and the signed-in user, who cannot share it further.
  await app.go('#/settings/books');
  expect((await app.lines('.book-list')).map(([label]) => label)).toContain('Casa compartida');
  await page.click('.book-open');
  await app.settle();
  expect(await app.lines('.book-people')).toEqual([['Ana', 'ana@example.com'], ['Prueba', 'prueba@example.com']]);
  await expect(page.locator('.book-share')).toBeHidden();
  await expect(page.locator('.book-shared-with-you')).toBeVisible();

  // Next time the app starts, Drive lists it like any other book.
  await page.reload();
  await app.settle();
  await app.go('#/settings/books');
  expect((await app.lines('.book-list')).map(([label]) => label)).toContain('Casa compartida');
});

test('the Picker only opens shared Cartos books, and says when it is not set up', async ({ page, context, app, google }) => {
  // No API key yet: nothing is loaded.
  await app.open('#/settings/books', '.book-list');
  await page.click('.book-open-shared');
  await expect(page.locator('.books-error')).toHaveText('Esta versión de Cartos aún no puede abrir libros compartidos.');
  expect(google.calls.filter((call) => call.op === 'picker')).toEqual([]);

  // With a key, picking a personal book is refused.
  await withPickerKey(context);
  google.pick('book-1');
  await page.reload();
  await app.open('#/settings/books', '.book-list');
  await page.click('.book-open-shared');
  await expect(page.locator('.books-error')).toHaveText('Ese archivo no es un libro compartido de Cartos.');
  await expect(page.locator('.book-open')).toContainText('Personal');
});
