// Theme picker (design §3.8): Sistema / Claro / Oscuro. The choice belongs
// to the device (localStorage), never to the account. A forced theme sets
// data-theme on <html> (styles/main.css); Sistema removes it and follows
// prefers-color-scheme. Touches the DOM only when called.

export const THEMES = Object.freeze(['system', 'light', 'dark']);

const KEY = 'cartos.theme';

// Status bar colour on iOS; the same values as --color-bg in main.css.
const THEME_COLOR = { light: '#FAFAF8', dark: '#14181C' };

export function parseTheme(raw) {
  return THEMES.includes(raw) ? raw : 'system';
}

// The theme actually shown for a preference and the system mode.
export function resolveTheme(preference, systemDark) {
  const theme = parseTheme(preference);
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function loadTheme(storage = globalThis.localStorage) {
  try {
    return parseTheme(storage.getItem(KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(preference, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, parseTheme(preference));
  } catch (err) {
    console.warn('Theme write failed', err);
  }
}

const systemQuery = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

// Paints the preference: data-theme on <html> and the status bar colour.
export function applyTheme(preference) {
  const theme = parseTheme(preference);
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[resolveTheme(theme, systemQuery()?.matches ?? false)];
}

// Applies the saved theme and keeps the status bar in step when the
// system mode changes while Sistema is chosen.
export function startTheme() {
  applyTheme(loadTheme());
  systemQuery()?.addEventListener?.('change', () => applyTheme(loadTheme()));
}
