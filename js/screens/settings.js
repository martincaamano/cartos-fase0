// Settings. For now Cuentas and Categorías; theme and Diagnóstico come in
// tarea 09.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const ENTRIES = [
  { label: es.settings.accounts, hash: SECTION_HASH.accounts },
  { label: es.settings.categories, hash: SECTION_HASH.categories },
];

export function renderSettings(root) {
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title"></h1>
      <ul class="receipt-list settings-list"></ul>
    </main>
  `;
  root.querySelector('.form-title').textContent = es.settings.title;
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
  renderNavbar(root, { active: 'settings' });
}
