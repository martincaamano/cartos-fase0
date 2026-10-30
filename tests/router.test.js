import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideRoute, ROUTES, parseHash, SECTIONS, SECTION_HASH, SCREENS, isRepaintable } from '../js/ui/router.js';

test('decideRoute covers every session / drive / token combination', () => {
  const cases = [
    // hasSession, hasDriveAccess, tokenExpired, expected (book still unknown)
    [false, false, false, ROUTES.LOGIN],
    [false, false, true, ROUTES.LOGIN],
    [false, true, false, ROUTES.LOGIN],
    [false, true, true, ROUTES.LOGIN],
    [true, false, false, ROUTES.CONNECT],
    [true, false, true, ROUTES.CONNECT],
    [true, true, false, ROUTES.LOADING],
    [true, true, true, ROUTES.RECONNECT],
  ];
  for (const [hasSession, hasDriveAccess, tokenExpired, expected] of cases) {
    assert.equal(
      decideRoute({ hasSession, hasDriveAccess, tokenExpired }),
      expected,
      `session=${hasSession} drive=${hasDriveAccess} expired=${tokenExpired}`
    );
  }
});

const signedIn = { hasSession: true, hasDriveAccess: true, tokenExpired: false };

test('decideRoute goes to onboarding without a personal book and to the Dashboard with one', () => {
  assert.equal(decideRoute({ ...signedIn, book: 'none' }), ROUTES.ONBOARDING);
  assert.equal(decideRoute({ ...signedIn, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, book: 'unknown' }), ROUTES.LOADING);
});

test('offline, the device copy opens the Dashboard; without one, the offline screen', () => {
  assert.equal(decideRoute({ ...signedIn, offline: true, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, offline: true, tokenExpired: true, book: 'ready' }), ROUTES.DASHBOARD);
  assert.equal(decideRoute({ ...signedIn, offline: true, book: 'unknown' }), ROUTES.OFFLINE);
  assert.equal(
    decideRoute({ hasSession: false, hasDriveAccess: false, tokenExpired: false, offline: true }),
    ROUTES.LOGIN
  );
});

test('online with an expired token asks to reconnect even with a device copy', () => {
  assert.equal(decideRoute({ ...signedIn, tokenExpired: true, book: 'ready' }), ROUTES.RECONNECT);
});

test('parseHash maps each hash to its section and keeps the query', () => {
  assert.deepEqual(parseHash(''), { section: SECTIONS.HOME, params: {} });
  assert.deepEqual(parseHash('#/'), { section: SECTIONS.HOME, params: {} });
  assert.deepEqual(parseHash('#/add?type=income'), { section: SECTIONS.ADD, params: { type: 'income' } });
  assert.deepEqual(parseHash('#/settings'), { section: SECTIONS.SETTINGS, params: {} });
  assert.deepEqual(parseHash('#/settings/categories/'), { section: SECTIONS.CATEGORIES, params: {} });
  assert.deepEqual(parseHash('#/settings/accounts'), { section: SECTIONS.ACCOUNTS, params: {} });
  assert.deepEqual(parseHash('#/nope'), { section: SECTIONS.HOME, params: {} });
});

test('every section has a hash that parses back to it', () => {
  for (const [section, hash] of Object.entries(SECTION_HASH)) assert.equal(parseHash(hash).section, section);
});

test('the screen table produces exactly the expected hashes, books included', () => {
  assert.deepEqual(
    { ...SECTION_HASH },
    {
      home: '#/',
      history: '#/history',
      edit: '#/history/edit',
      add: '#/add',
      analysis: '#/analysis',
      settings: '#/settings',
      categories: '#/settings/categories',
      accounts: '#/settings/accounts',
      diagnostics: '#/settings/diagnostics',
      import: '#/settings/import',
      data: '#/settings/data',
      theme: '#/settings/theme',
      books: '#/settings/books',
      bookNew: '#/settings/books/new',
      bookEdit: '#/settings/books/edit',
      accountNew: '#/settings/accounts/new',
      accountEdit: '#/settings/accounts/edit',
      categoryNew: '#/settings/categories/new',
      categoryEdit: '#/settings/categories/edit',
    }
  );
  assert.deepEqual(parseHash('#/settings/import'), { section: SECTIONS.IMPORT, params: {} });
  assert.deepEqual(parseHash('#/settings/books'), { section: SECTIONS.BOOKS, params: {} });
  assert.deepEqual(parseHash('#/settings/data'), { section: SECTIONS.DATA, params: {} });
  assert.deepEqual(parseHash('#/settings/theme'), { section: SECTIONS.THEME, params: {} });
  assert.deepEqual(parseHash('#/history?account=acc-1'), { section: SECTIONS.HISTORY, params: { account: 'acc-1' } });
  assert.deepEqual(parseHash('#/settings/books/'), { section: SECTIONS.BOOKS, params: {} });
  assert.deepEqual(SCREENS.map((screen) => screen.section), Object.keys(SECTION_HASH));
});

test('SECTIONS keys are SNAKE_CASE of each section name', () => {
  assert.equal(SECTIONS.HOME, 'home');
  assert.equal(SECTIONS.BOOKS, 'books');
  assert.equal(SECTIONS.BOOK_NEW, 'bookNew');
  assert.equal(SECTIONS.BOOK_EDIT, 'bookEdit');
  assert.equal(SECTIONS.ACCOUNT_NEW, 'accountNew');
  assert.equal(SECTIONS.ACCOUNT_EDIT, 'accountEdit');
  assert.equal(SECTIONS.CATEGORY_NEW, 'categoryNew');
  assert.equal(SECTIONS.CATEGORY_EDIT, 'categoryEdit');
  assert.equal(SECTIONS.BOOKNEW, undefined);
  assert.deepEqual(Object.values(SECTIONS), Object.keys(SECTION_HASH));
  assert.ok(Object.isFrozen(SECTIONS));
});

test('parseHash maps the card screens and keeps their id', () => {
  const cases = [
    ['#/settings/books/new', SECTIONS.BOOK_NEW, {}],
    ['#/settings/books/edit', SECTIONS.BOOK_EDIT, {}],
    ['#/settings/accounts/new', SECTIONS.ACCOUNT_NEW, {}],
    ['#/settings/accounts/new/', SECTIONS.ACCOUNT_NEW, {}],
    ['#/settings/accounts/edit?id=x', SECTIONS.ACCOUNT_EDIT, { id: 'x' }],
    ['#/settings/categories/new', SECTIONS.CATEGORY_NEW, {}],
    ['#/settings/categories/edit?id=cat-7', SECTIONS.CATEGORY_EDIT, { id: 'cat-7' }],
    ['#/settings/accounts/remove', SECTIONS.HOME, {}],
  ];
  for (const [hash, section, params] of cases) assert.deepEqual(parseHash(hash), { section, params }, hash);
  assert.equal(parseHash('#/settings/accounts/edit?id=x').section, 'accountEdit');
});

test('card screens are never repainted: a half-filled form would reset', () => {
  for (const section of ['bookNew', 'bookEdit', 'accountNew', 'accountEdit', 'categoryNew', 'categoryEdit']) {
    assert.equal(isRepaintable(section), false, section);
  }
});

test('parseHash keeps the id of the movement being edited', () => {
  assert.deepEqual(parseHash('#/history/edit?id=x'), { section: SECTIONS.EDIT, params: { id: 'x' } });
  assert.deepEqual(parseHash('#/history'), { section: SECTIONS.HISTORY, params: {} });
  assert.deepEqual(parseHash('#/analysis'), { section: SECTIONS.ANALYSIS, params: {} });
  assert.deepEqual(parseHash('#/settings/diagnostics'), { section: SECTIONS.DIAGNOSTICS, params: {} });
});

test('only home, analysis, categories and accounts are repaintable', () => {
  const repaintable = Object.keys(SECTION_HASH).filter(isRepaintable);
  assert.deepEqual(repaintable.sort(), ['accounts', 'analysis', 'categories', 'home']);
  assert.equal(isRepaintable('nope'), false);
  assert.equal(isRepaintable(undefined), false);
});

test('every navbar button has a route', () => {
  const source = readFileSync(new URL('../js/ui/navbar.js', import.meta.url), 'utf8');
  const ids = [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(ids, ['home', 'history', 'add', 'analysis', 'settings']);
  for (const id of ids) assert.ok(id in SECTION_HASH, `navbar button "${id}" has no route`);
});
