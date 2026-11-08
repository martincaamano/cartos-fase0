// Theme picker (design §3.8): the style (Cartos, Libreta…, tarea 32) and
// the mode (Sistema / Claro / Oscuro). Both belong to the device
// (localStorage), never to the account, and index.html applies them before
// the first paint. A forced mode sets data-theme on <html>
// (styles/tokens.css); Sistema removes it and follows prefers-color-scheme.
// A style other than Cartos sets data-palette (styles/themes.css).
// Touches the DOM only when called.

export const THEMES = Object.freeze(['system', 'light', 'dark']);

// Each mode's name in es.settings.
export const THEME_TEXT = Object.freeze({ system: 'themeSystem', light: 'themeLight', dark: 'themeDark' });

const KEY = 'cartos.theme';

// The styles, the default first. A new one: its block in styles/themes.css,
// its name here and its text in es.themeScreen.palettes.
export const PALETTES = Object.freeze(['cartos', 'libreta']);
export const DEFAULT_PALETTE = PALETTES[0];
const PALETTE_KEY = 'cartos.palette';

export function parsePalette(raw) {
  return PALETTES.includes(raw) ? raw : DEFAULT_PALETTE;
}

export function loadPalette(storage = globalThis.localStorage) {
  try {
    return parsePalette(storage.getItem(PALETTE_KEY));
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function savePalette(palette, storage = globalThis.localStorage) {
  try {
    storage.setItem(PALETTE_KEY, parsePalette(palette));
  } catch (err) {
    console.warn('Palette write failed', err);
  }
}

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
  paintStatusBar();
}

// Paints the style: data-palette on <html> (none for the default) and the
// status bar colour.
export function applyPalette(palette) {
  const chosen = parsePalette(palette);
  const root = document.documentElement;
  if (chosen === DEFAULT_PALETTE) root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', chosen);
  paintStatusBar();
}

function paintStatusBar() {
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

// Applies the saved style and mode, and keeps the status bar in step when the
// system mode changes while Sistema is chosen.
export function startTheme() {
  applyPalette(loadPalette());
  applyTheme(loadTheme());
  systemQuery()?.addEventListener?.('change', () => applyTheme(loadTheme()));
}
