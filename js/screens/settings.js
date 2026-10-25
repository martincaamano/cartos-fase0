// Settings. For now only Categorías; theme and Diagnóstico come in tarea 09.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

export function renderSettings(root) {
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title"></h1>
      <ul class="receipt-list settings-list">
        <li class="receipt-line"><a class="receipt-row settings-link"><span></span><span aria-hidden="true">›</span></a></li>
      </ul>
    </main>
  `;
  root.querySelector('.form-title').textContent = es.settings.title;
  const link = root.querySelector('.settings-link');
  link.href = SECTION_HASH.categories;
  link.firstElementChild.textContent = es.settings.categories;
  renderNavbar(root, { active: 'settings' });
}
