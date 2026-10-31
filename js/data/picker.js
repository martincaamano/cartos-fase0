// The Google Picker (architecture §5): the only way, under drive.file, for
// the app to reach a book someone shared. Picking the file grants access to
// it for good. Its script (apis.google.com) loads the first time it is used,
// never on start; nothing here touches the DOM until then.

import { GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER } from '../config.js';
import { getAccessToken } from './auth.js';

const SCRIPT_URL = 'https://apis.google.com/js/api.js';

// Raised when the Picker cannot open: 'not_configured' (no API key yet) or
// 'unavailable' (its script did not load, e.g. offline).
export class PickerError extends Error {
  constructor(code) {
    super(`Picker ${code}`);
    this.code = code;
  }
}

const defaults = {
  apiKey: () => GOOGLE_API_KEY,
  window: () => globalThis.window,
};
let deps = defaults;

// Lets the tests swap the key and the window.
export function configurePicker(overrides = {}) {
  deps = { ...defaults, ...overrides };
}

let loading = null;

function loadPickerApi() {
  const win = deps.window();
  if (win.google?.picker) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = win.document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => win.gapi.load('picker', { callback: resolve, onerror: reject });
    script.onerror = reject;
    win.document.head.appendChild(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

// Opens the Picker on the user's spreadsheets. Resolves with the id of the
// file picked, or null when the user closes it.
export async function pickSpreadsheet() {
  const apiKey = deps.apiKey();
  if (!apiKey) throw new PickerError('not_configured');
  const token = await getAccessToken();
  try {
    await loadPickerApi();
  } catch {
    throw new PickerError('unavailable');
  }
  const { picker } = deps.window().google;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      // Without the project number the file is picked but not granted.
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
