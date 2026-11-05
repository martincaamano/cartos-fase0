// Tarea 25a: the outbox moves to its version 2 (one entry per record, with
// its tab) and the books gain the tabs Goals and Contributions. What a
// device had waiting from before must still go up, once. Invented data.
import { test, expect } from './fixtures.js';
import { HEADERS } from '../js/data/rows.js';

const AT = '2026-10-19T10:00:00.000Z';
const waiting = {
  id: 'm-old-queue', accountId: 'acc-bank', type: 'expense', amount: 12.34, date: '2026-10-19',
  categoryId: 'cat-food', note: 'antes de la 25', transferId: '', personId: '',
  createdBy: 'user-1', createdAt: AT, updatedAt: AT, deleted: false,
};

// The outbox as tarea 21 left it: database version 1, store `pending` keyed
// by movement.id, entries { fileId, movement, sub }.
async function seedVersion1(page, entry) {
  await page.goto('/not-the-app');
  await page.evaluate((item) => new Promise((resolve, reject) => {
    const request = indexedDB.open('cartos-outbox', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'movement.id' });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').put(item);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }), entry);
}

const ids = (google) => google.rows.Movements.slice(1).map((row) => row[0]);

test('a movement waiting in the old outbox is moved to the new one and goes up once', async ({ page, app, google }) => {
  await seedVersion1(page, { fileId: 'book-1', movement: waiting, sub: 'user-1' });
  await app.open();
  await expect.poll(() => ids(google)).toContain('m-old-queue');
  expect(ids(google).filter((id) => id === 'm-old-queue')).toHaveLength(1);
  const row = google.rows.Movements.find((r) => r[0] === 'm-old-queue');
  expect(row.slice(1, 7)).toEqual(['acc-bank', 'expense', 12.34, '2026-10-19', 'cat-food', 'antes de la 25']);

  // Opening the app again uploads nothing more: the old store is gone.
  await page.reload();
  await app.settle();
  expect(ids(google).filter((id) => id === 'm-old-queue')).toHaveLength(1);
  const stores = await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('cartos-outbox');
    request.onsuccess = () => { resolve([request.result.version, [...request.result.objectStoreNames]]); request.result.close(); };
  }));
  expect(stores).toEqual([2, ['entries']]);
});

test('a book from before tarea 25 opens and gains the goal tabs, with their headers', async ({ app, google }) => {
  delete google.rows.Goals;
  delete google.rows.Contributions;
  await app.open();
  await app.reveal();
  expect(google.rows.Goals).toEqual([HEADERS.Goals]);
  expect(google.rows.Contributions).toEqual([HEADERS.Contributions]);
});
