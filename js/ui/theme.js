// Theme picker (design §3.8): Sistema / Claro / Oscuro. The choice belongs
// to the device (localStorage), never to the account. A forced theme sets
// data-theme on <html> (styles/tokens.css); Sistema removes it and follows
// prefers-color-scheme. Touches the DOM only when called.

export const THEMES = Object.freeze(['system', 'light', 'dark']);

const KEY = 'cartos.theme';

export function parseTheme(raw) {
  return THEMES.includes(raw) ? raw : 'system';
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
  if (meta) meta.content = backgroundColor();
}

// The iOS status bar takes the app's background, as resolved by the CSS
// tokens for the current theme and palette. A probe without transition
// gives the final colour, not one halfway through the body's fade.
function backgroundColor() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;transition:none;background:var(--color-bg)';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

// Applies the saved theme and keeps the status bar in step when the
// system mode changes while Sistema is chosen.
export function startTheme() {
  applyTheme(loadTheme());
  systemQuery()?.addEventListener?.('change', () => applyTheme(loadTheme()));
}
