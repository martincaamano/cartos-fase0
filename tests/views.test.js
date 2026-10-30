import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS } from '../js/ui/router.js';

test('js/views.js imports in Node: no screen touches document on import', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const { VIEWS } = await import('../js/views.js');
  assert.ok(VIEWS);
});

test('VIEWS has a renderer for exactly the sections of the screen table', async () => {
  const { VIEWS } = await import('../js/views.js');
  // The same set of sections; key order in VIEWS carries no meaning.
  assert.deepEqual(Object.keys(VIEWS).sort(), SCREENS.map((screen) => screen.section).sort());
  for (const [section, render] of Object.entries(VIEWS)) {
    assert.equal(typeof render, 'function', `VIEWS.${section} is not a function`);
  }
});
