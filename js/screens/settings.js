// Settings (design §3.8): Cuentas, Categorías and Diagnóstico, the data
// (import, CSV template, download), the theme picker and signing out. The
// theme applies at once and stays on the device.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { applyTheme, loadTheme, saveTheme, THEMES } from '../ui/theme.js';
import { saveFile } from '../ui/download.js';
import { bookToCsv, templateCsv } from '../domain/import-csv.js';
import { toIsoDate } from '../domain/movement.js';

const THEME_TEXT = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

const ENTRIES = [
  { label: es.settings.accounts, hash: SECTION_HASH.accounts },
  { label: es.settings.categories, hash: SECTION_HASH.categories },
  { label: es.settings.diagnostics, hash: SECTION_HASH.diagnostics },
];

// A row of the receipt list: a link to `hash`, or a button.
function settingsRow({ label, hash = null, className = '', onClick = null }) {
  const item = document.createElement('li');
  item.className = 'receipt-line';
  const row = document.createElement(hash ? 'a' : 'button');
  row.className = `receipt-row settings-link ${className}`.trim();
  if (hash) row.href = hash;
  else {
    row.type = 'button';
    row.addEventListener('click', onClick);
  }
  const text = document.createElement('span');
  text.textContent = label;
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = hash ? '›' : '↓';
  row.append(text, arrow);
  item.appendChild(row);
  return item;
}

function renderDataList(list, book, problem) {
  const t = es.settings;
  // Straight from the tap: iOS only opens the share sheet then.
  const download = (name, text) => () => {
    problem.hidden = true;
    saveFile(name, text()).catch((err) => {
      console.warn('Save failed', err);
      problem.hidden = false;
    });
  };
  list.append(
    settingsRow({ label: t.importData, hash: SECTION_HASH.import }),
    settingsRow({
      label: t.template,
      className: 'settings-template',
      onClick: download(t.templateFile, () => templateCsv(es.importer.templateRows)),
    }),
    settingsRow({
      label: t.exportData,
      className: 'settings-export',
      onClick: download(t.exportFile.replace('{date}', toIsoDate(new Date())), () => bookToCsv(book)),
    }),
  );
}

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

// user: { email } of the signed-in account. book: what "Descargar mis
// datos" saves. pendingCount: changes not in the Sheet yet; signing out
// with some asks for a second tap.
export function renderSettings(root, { user = null, book, pendingCount = 0, onSignOut }) {
  const t = es.settings;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list settings-list"></ul>
      <h2 class="receipt-heading" data-text="data"></h2>
      <ul class="receipt-list settings-data"></ul>
      <p class="form-error settings-save-failed" role="alert" data-text="saveFailed" hidden></p>
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
  for (const entry of ENTRIES) list.appendChild(settingsRow(entry));
  renderDataList(root.querySelector('.settings-data'), book, root.querySelector('.settings-save-failed'));

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
