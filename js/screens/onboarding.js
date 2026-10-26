// Onboarding: first account of the personal book (name, emoji, initial
// balance). The form and its validation are shared with Ajustes → Cuentas;
// creating the book comes from data/.

import { es } from '../../i18n/es.js';
import { setUpPersonalBook } from '../data/personal-book.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';

export function renderOnboarding(root, { fileId = null, onDone }) {
  root.innerHTML = `
    <main class="screen screen-form">
      <h1 class="form-title" data-text="title"></h1>
      <p class="text-muted form-note" data-text="note"></p>
    </main>
  `;
  fillTexts(root, es.onboarding);
  renderAccountForm(root.querySelector('main'), {
    texts: es.onboarding,
    onSubmit: (account) => setUpPersonalBook({ fileId, account }).then(onDone),
  });
}
