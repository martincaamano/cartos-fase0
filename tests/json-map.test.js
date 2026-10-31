// The small JSON maps kept on the device (js/storage/json-map.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMap, writeEntry } from '../js/storage/json-map.js';
import { fakeStorage } from './helpers/fake-storage.js';

test('writeEntry sets one entry and keeps the others', () => {
  const storage = fakeStorage();
  writeEntry(storage, 'k', 'a', 1);
  writeEntry(storage, 'k', 'b', { x: 2 });
  writeEntry(storage, 'k', 'a', 3);
  assert.deepEqual(readMap(storage, 'k'), { a: 3, b: { x: 2 } });
});

test('readMap is empty for nothing, broken JSON, a list or a value', () => {
  for (const raw of [null, '{', '[1]', '"x"', '5', 'null']) {
    const storage = fakeStorage(raw === null ? {} : { k: raw });
    assert.deepEqual(readMap(storage, 'k'), {});
  }
});

test('neither reading nor writing throws when the storage does', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(readMap(broken, 'k'), {});
  assert.doesNotThrow(() => writeEntry(broken, 'k', 'a', 1));
});
