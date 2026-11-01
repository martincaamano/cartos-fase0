// Whether INICIO hides its amounts (js/storage/amounts-visibility.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAmountsHidden, saveAmountsHidden } from '../js/storage/amounts-visibility.js';
import { fakeStorage } from './helpers/fake-storage.js';

test('the amounts show the first time, and the choice is kept', () => {
  const storage = fakeStorage();
  assert.equal(loadAmountsHidden(storage), false);
  saveAmountsHidden(storage, true);
  assert.equal(loadAmountsHidden(storage), true);
  saveAmountsHidden(storage, false);
  assert.equal(loadAmountsHidden(storage), false);
});

test('a storage that fails shows the amounts and does not throw', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(loadAmountsHidden(broken), false);
  assert.doesNotThrow(() => saveAmountsHidden(broken, true));
});
