// Guards for the design tokens: raw values live only in styles/tokens.css,
// everything else goes through semantic tokens that actually exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const TOKENS = 'styles/tokens.css';

function privacyStyle() {
  const match = read('privacy.html').match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(match, 'privacy.html has no <style> block');
  return match[1];
}

// Every stylesheet plus the inline <style> of privacy.html, comments removed.
const sources = [
  ...readdirSync(resolve(root, 'styles'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ file: `styles/${name}`, css: stripComments(read(`styles/${name}`)) })),
  { file: 'privacy.html <style>', css: stripComments(privacyStyle()) },
];
const tokensCss = sources.find((source) => source.file === TOKENS).css;
const others = sources.filter((source) => source.file !== TOKENS);

// Declarations inside the innermost { } blocks, so selectors (#id, a:hover)
// never count as values.
function declarations(css) {
  return [...css.matchAll(/\{([^{}]*)\}/g)].flatMap(([, body]) =>
    body
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes(':'))
      .map((part) => {
        const colon = part.indexOf(':');
        return { property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
      })
  );
}

const definedIn = (css) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
const usedIn = (css) => [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);

test('the expected stylesheets are analysed', () => {
  const files = sources.map((source) => source.file);
  for (const file of [TOKENS, 'styles/base.css', 'styles/components.css', 'styles/screens.css']) {
    assert.ok(files.includes(file), `missing ${file}`);
  }
});

test('the comment stripper removes single and multi-line comments', () => {
  assert.equal(stripComments('a { color: red; /* #fff */ }'), 'a { color: red;  }');
  assert.equal(stripComments('/* one\n two */b{}/* x */'), 'b{}');
});

test('no hand-written colours outside tokens.css', () => {
  const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
  for (const { file, css } of others) {
    for (const { property, value } of declarations(css)) {
      assert.doesNotMatch(value, raw, `${file}: ${property}: ${value}`);
    }
  }
});

test('every var(--x) is defined in tokens.css or in the same file', () => {
  const global = definedIn(tokensCss);
  for (const { file, css } of sources) {
    const local = definedIn(css);
    for (const name of usedIn(css)) {
      assert.ok(global.has(name) || local.has(name), `${file}: var(${name}) is not defined`);
    }
  }
});

test('outside tokens.css only semantic tokens are used, never --palette-*', () => {
  for (const { file, css } of others) {
    const palette = usedIn(css).filter((name) => name.startsWith('--palette-'));
    assert.deepEqual(palette, [], `${file} uses palette tokens directly`);
    assert.doesNotMatch(css, /--palette-[\w-]+\s*:/, `${file} defines a palette token`);
  }
});

test('every font-size outside tokens.css is var(--text-*) or inherit', () => {
  for (const { file, css } of others) {
    for (const { property, value } of declarations(css)) {
      if (property !== 'font-size') continue;
      assert.match(value, /^(var\(--text-[\w-]+\)|inherit)$/, `${file}: font-size: ${value}`);
    }
  }
});

test('initial colours in index.html and manifest.json match the light --palette-paper', () => {
  const match = tokensCss.match(/--palette-paper\s*:\s*light-dark\(\s*([^,\s]+)\s*,/);
  assert.ok(match, '--palette-paper must be light-dark(light, dark)');
  const paper = match[1].toLowerCase();

  const meta = read('index.html').match(/<meta name="theme-color" content="([^"]+)">/);
  assert.ok(meta, 'index.html has no theme-color meta');
  assert.equal(meta[1].toLowerCase(), paper, 'index.html theme-color');

  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.background_color.toLowerCase(), paper, 'manifest background_color');
  assert.equal(manifest.theme_color.toLowerCase(), paper, 'manifest theme_color');
});
