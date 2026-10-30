// "Nothing visible changed": the computed styles of every element of each
// screen, in light and dark, against a saved snapshot (tarea 12 checked the
// same way). Colours, type, spacing and borders, not pixels, so the result
// does not depend on the fonts of the machine. Widths and heights are left
// out for the same reason.
//
// Snapshots are kept for Chromium only. After an intended visual change:
// npm run acceptance:update, and review the diff of acceptance/__snapshots__.

import { test, expect } from './fixtures.js';

const PROPS = [
  'color', 'background-color', 'border-top-color', 'border-bottom-color', 'border-top-style',
  'border-bottom-style', 'border-top-width', 'border-bottom-width', 'border-left-style', 'border-radius',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height', 'text-transform',
  'text-decoration-line', 'text-align', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin-top', 'margin-bottom', 'min-height', 'min-width', 'gap', 'display', 'opacity', 'color-scheme',
];

const SCREENS = [
  ['dashboard', '#/', '.receipt-total-amount'],
  ['history', '#/history', '.history-list'],
  ['edit', '#/history/edit?id=m-rest', '.form-delete'],
  ['add', '#/add', '.category-grid'],
  ['analysis', '#/analysis', '.stat-tiles'],
  ['settings', '#/settings', '.settings-signout'],
  ['accounts', '#/settings/accounts', '.account-list'],
  ['categories', '#/settings/categories', '.list-expense'],
];

test.skip(({ browserName }) => browserName !== 'chromium', 'Style snapshots are kept for Chromium only');

for (const scheme of ['light', 'dark']) {
  for (const [name, hash, ready] of SCREENS) {
    test(`${name} looks the same (${scheme})`, async ({ page, app }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await app.open(hash, ready);
      const styles = await page.evaluate((props) => {
        const style = document.createElement('style');
        style.textContent = '*{transition:none !important}';
        document.head.appendChild(style);
        const elements = [document.documentElement, document.body, ...document.querySelectorAll('#app *')];
        return elements.map((element) => {
          const computed = getComputedStyle(element);
          const name = `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().split(/\s+/).join('.')}` : ''}`;
          return [name, ...props.map((prop) => computed.getPropertyValue(prop))].join(' | ');
        });
      }, PROPS);
      expect(`${PROPS.join(' | ')}\n${styles.join('\n')}\n`).toMatchSnapshot(`${name}-${scheme}.txt`);
    });
  }
}
