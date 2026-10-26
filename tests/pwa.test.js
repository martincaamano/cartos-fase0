// Guards for the PWA shell. There is no bundler, so a typo in a path or an
// import only shows up on the phone; these tests catch it on the Mac first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('manifest.json is valid and installable', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.name, 'Cartos');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url);
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), 'missing 192x192 icon');
  assert.ok(sizes.includes('512x512'), 'missing 512x512 icon');
  for (const icon of manifest.icons) {
    assert.ok(existsSync(resolve(root, icon.src)), `missing icon file: ${icon.src}`);
  }
});

test('index.html wires manifest, module entry point and service worker', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /<script type="module" src="js\/app\.js">/);
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
});

test('every file listed in the service worker app shell exists', () => {
  // cache.addAll() fails as a whole if a single URL is a 404, which would
  // break the offline cache entirely.
  const sw = read('sw.js');
  const block = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, 'APP_SHELL not found in sw.js');
  const entries = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(entries.length > 0, 'APP_SHELL is empty');
  for (const entry of entries) {
    const file = entry === './' ? 'index.html' : entry;
    assert.ok(existsSync(resolve(root, file)), `APP_SHELL lists a missing file: ${entry}`);
  }
});

const STYLESHEETS = ['styles/tokens.css', 'styles/base.css', 'styles/components.css', 'styles/screens.css'];
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('theme tokens exist for light and dark mode', () => {
  const css = stripComments(read('styles/tokens.css'));
  const semantic = ['--color-bg', '--color-ink', '--color-ink-muted', '--color-line', '--color-expense', '--color-income'];
  for (const token of semantic) {
    assert.match(css, new RegExp(`${token}\\s*:`), `missing CSS token ${token}`);
  }
  // Background, ink and line palette colours carry their light and dark value.
  const palette = [...css.matchAll(/(--palette-[\w-]+)\s*:\s*([^;]+);/g)];
  const themed = palette.filter(([, name]) => /paper|ink|rule|line|bg/.test(name));
  assert.ok(themed.length >= 4, 'expected palette tokens for paper, ink, ink-soft and rule');
  for (const [, name, value] of themed) {
    assert.match(value, /light-dark\(/, `${name} must use light-dark()`);
  }
  assert.match(css, /html\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light\s*;/);
  assert.match(css, /html\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark\s*;/);
});

test('every stylesheet is in APP_SHELL and linked from index.html in order', () => {
  const sw = read('sw.js');
  const block = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, 'APP_SHELL not found in sw.js');
  const entries = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1].replace(/^\.\//, ''));
  for (const file of STYLESHEETS) {
    assert.ok(entries.includes(file), `APP_SHELL is missing ${file}`);
    assert.ok(existsSync(resolve(root, file)), `missing stylesheet ${file}`);
  }
  const html = read('index.html');
  const linked = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]);
  assert.deepEqual(linked, STYLESHEETS);
});

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every relative import in js/ and i18n/ resolves to an existing file with .js extension', () => {
  const dirs = ['js', 'i18n'].map((d) => resolve(root, d)).filter(existsSync);
  const importPattern = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const file of dirs.flatMap(listJsFiles)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      assert.ok(specifier.endsWith('.js'), `${file}: import "${specifier}" must end in .js`);
      assert.ok(
        existsSync(resolve(dirname(file), specifier)),
        `${file}: import "${specifier}" points to a missing file`
      );
    }
  }
});
