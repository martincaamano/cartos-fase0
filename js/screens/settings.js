// Settings (design §3.8): Cuentas, Categorías and Diagnóstico, the theme
// picker and signing out. The theme applies at once and stays on the device.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { applyTheme, loadTheme, saveTheme, THEMES } from '../ui/theme.js';

const THEME_TEXT = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

const ENTRIES = [
  { label: es.settings.accounts, hash: SECTION_HASH.accounts },
  { label: es.settings.categories, hash: SECTION_HASH.categories },
  { label: es.settings.diagnostics, hash: SECTION_HASH.diagnostics },
];

function renderThemePicker(row) {
  const t = es.settings;
  let current = loadTheme();
  for (const theme of THEMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.theme = theme;
    chip.textContent = t[THEME_TEXT[theme]];
    chip.addEventListener('click', () => {
      current = theme;
      saveTheme(theme);
      applyTheme(theme);
      mark();
    });
    row.appendChild(chip);
  }
  const mark = () => {
    for (const chip of row.children) {
      const selected = chip.dataset.theme === current;
      chip.classList.toggle('is-selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
  };
  mark();
}

// user: { email } of the signed-in account. pendingCount: changes not in
// the Sheet yet; signing out with some asks for a second tap.
export function renderSettings(root, { user = null, pendingCount = 0, onSignOut }) {
  const t = es.settings;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list settings-list"></ul>
      <h2 class="receipt-heading" data-text="theme"></h2>
      <div class="chip-row theme-picker" role="group"></div>
      <h2 class="receipt-heading" data-text="account"></h2>
      <p class="settings-email"></p>
      <p class="text-muted form-note signout-warning" role="alert" hidden></p>
      <button type="button" class="link-button settings-signout"></button>
    </main>
  `;
  fillTexts(root, t);
  const list = root.querySelector('.settings-list');
  for (const entry of ENTRIES) {
    const item = document.createElement('li');
    item.className = 'receipt-line';
    const link = document.createElement('a');
    link.className = 'receipt-row settings-link';
    link.href = entry.hash;
    const label = document.createElement('span');
    label.textContent = entry.label;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    link.append(label, arrow);
    item.appendChild(link);
    list.appendChild(item);
  }

  const picker = root.querySelector('.theme-picker');
  picker.setAttribute('aria-label', t.theme);
  renderThemePicker(picker);

  root.querySelector('.settings-email').textContent = user?.email ?? '';
  const signOut = root.querySelector('.settings-signout');
  const warning = root.querySelector('.signout-warning');
  signOut.textContent = t.signOut;
  let armed = pendingCount === 0;
  signOut.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      warning.hidden = false;
      warning.textContent = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
      signOut.textContent = t.signOutAnyway;
      return;
    }
    onSignOut();
  });

  renderNavbar(root, { active: 'settings' });
}
