// The Google Picker wrapper (js/data/picker.js) with a fake window. Nothing
// loads from Google: the fake window already has google.picker, or its
// script fails to load.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { configurePicker, pickSpreadsheet, PickerError } from '../js/data/picker.js';
import { configureAuth, TokenExpiredError } from '../js/data/auth.js';
import { setupGoogleApi, TOKEN } from './helpers/fake-google.js';

const API_KEY = 'fake-api-key';

// A google.picker whose builder records every setting; setVisible answers
// the callback with `answer(picker)` (or nothing when it returns undefined).
function fakePickerWindow(answer) {
  const built = { views: [] };
  class DocsView {
    constructor(viewId) { this.viewId = viewId; }
    setMode(mode) { this.mode = mode; return this; }
  }
  class PickerBuilder {
    addView(view) { built.views.push(view); return this; }
    setOAuthToken(token) { built.token = token; return this; }
    setDeveloperKey(key) { built.developerKey = key; return this; }
    setAppId(id) { built.appId = id; return this; }
    setCallback(callback) { built.callback = callback; return this; }
    build() {
      built.builds = (built.builds ?? 0) + 1;
      return {
        setVisible(visible) {
          built.visible = visible;
          const data = answer(picker);
          if (data) built.callback(data);
        },
      };
    }
  }
  const picker = {
    DocsView,
    PickerBuilder,
    ViewId: { SPREADSHEETS: 'spreadsheets' },
    DocsViewMode: { LIST: 'list' },
    Action: { PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded' },
  };
  return { win: { google: { picker } }, built };
}

let calls;
beforeEach(() => {
  calls = setupGoogleApi(() => ({ status: 500 })); // signed-in session; any fetch is recorded
});

test('pickSpreadsheet without an API key rejects with not_configured and never touches the window or network', async () => {
  let windowRead = false;
  configurePicker({ apiKey: () => '', window: () => { windowRead = true; return {}; } });
  await assert.rejects(pickSpreadsheet(), (err) => err instanceof PickerError && err.code === 'not_configured');
  assert.equal(windowRead, false);
  assert.equal(calls.length, 0);
});

test('pickSpreadsheet with the default config (empty key in config.js) is not_configured', async () => {
  configurePicker();
  await assert.rejects(pickSpreadsheet(), (err) => err instanceof PickerError && err.code === 'not_configured');
});

test('pickSpreadsheet resolves with the id of the file picked', async () => {
  const { win, built } = fakePickerWindow((p) => ({ action: p.Action.PICKED, docs: [{ id: 'f-1' }] }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  assert.equal(await pickSpreadsheet(), 'f-1');
  assert.equal(calls.length, 0, 'no fetch');
});

test('pickSpreadsheet passes the token, the developer key and the project number to the builder', async () => {
  const { win, built } = fakePickerWindow((p) => ({ action: p.Action.PICKED, docs: [{ id: 'f-1' }] }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  await pickSpreadsheet();
  assert.equal(built.token, TOKEN);
  assert.equal(built.developerKey, API_KEY);
  assert.equal(built.appId, '354443018222');
  assert.equal(built.builds, 1);
  assert.equal(built.visible, true);
  assert.equal(built.views.length, 1);
  assert.equal(built.views[0].viewId, 'spreadsheets');
  assert.equal(built.views[0].mode, 'list');
});

test('pickSpreadsheet with several docs picked takes the first', async () => {
  const { win } = fakePickerWindow((p) => ({ action: p.Action.PICKED, docs: [{ id: 'f-1' }, { id: 'f-2' }] }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  assert.equal(await pickSpreadsheet(), 'f-1');
});

test('pickSpreadsheet picked without docs resolves null', async () => {
  const { win } = fakePickerWindow((p) => ({ action: p.Action.PICKED, docs: [] }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  assert.equal(await pickSpreadsheet(), null);
});

test('pickSpreadsheet resolves null when the user closes the Picker', async () => {
  const { win } = fakePickerWindow((p) => ({ action: p.Action.CANCEL }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  assert.equal(await pickSpreadsheet(), null);
});

test('pickSpreadsheet ignores other actions (LOADED) and waits for the real answer', async () => {
  const { win, built } = fakePickerWindow((p) => ({ action: p.Action.LOADED }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  let settled = false;
  const result = pickSpreadsheet().then((id) => { settled = true; return id; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'still open after LOADED');
  built.callback({ action: 'picked', docs: [{ id: 'f-9' }] });
  assert.equal(await result, 'f-9');
});

test('pickSpreadsheet without a valid token rejects before opening the Picker', async () => {
  configureAuth({ storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }), google: () => undefined, now: () => 0 });
  const { win, built } = fakePickerWindow((p) => ({ action: p.Action.PICKED, docs: [{ id: 'f-1' }] }));
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  await assert.rejects(pickSpreadsheet(), (err) => err instanceof TokenExpiredError);
  assert.equal(built.builds, undefined);
});

test('pickSpreadsheet when the Picker script cannot load rejects with unavailable, and tries again next time', async () => {
  const added = [];
  const win = {
    document: {
      createElement: (tag) => ({ tag }),
      head: {
        appendChild(script) {
          added.push(script);
          queueMicrotask(() => script.onerror(new Error('offline')));
        },
      },
    },
  };
  configurePicker({ apiKey: () => API_KEY, window: () => win });
  await assert.rejects(pickSpreadsheet(), (err) => err instanceof PickerError && err.code === 'unavailable');
  assert.equal(added.length, 1);
  assert.equal(added[0].tag, 'script');
  assert.equal(added[0].src, 'https://apis.google.com/js/api.js');

  await assert.rejects(pickSpreadsheet(), (err) => err instanceof PickerError && err.code === 'unavailable');
  assert.equal(added.length, 2, 'a failed load is not cached');
  assert.equal(calls.length, 0);
});
