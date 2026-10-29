// Onboarding: first account of the personal book (name, emoji, initial
// balance), or a whole book imported from a file (screens/import.js). The
// form and its validation are shared with Ajustes → Cuentas; creating the
// book comes from data/.

import { es } from '../../i18n/es.js';
import { setUpPersonalBook } from '../data/personal-book.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { renderImport } from './import.js';

export function renderOnboarding(root, { fileId = null, onDone }) {
  root.innerHTML = `
    <main class="screen screen-form">
      <h1 class="form-title" data-text="title"></h1>
      <p class="text-muted form-note" data-text="note"></p>
      <button type="button" class="link-button import-link"></button>
    </main>
  `;
  fillTexts(root, es.onboarding);
  const link = root.querySelector('.import-link');
  link.textContent = es.importer.importLink;
  link.addEventListener('click', () => renderImport(root, {
    fileId,
    onDone,
    onBack: () => renderOnboarding(root, { fileId, onDone }),
  }));
  renderAccountForm(root.querySelector('main'), {
    texts: es.onboarding,
    onSubmit: (account) => setUpPersonalBook({ fileId, account }).then(onDone),
  });
}
