// An account's card (Ajustes → Cuentas, tarea 20c): name, emoji and initial
// balance, to create a new account or edit a saved one. Goes straight to
// the Sheet, so it needs a connection.

import { es } from '../../i18n/es.js';
import { addAccount, updateAccount } from '../data/book.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// account: the account to edit, or null for a new one. onDone: after saving.
export function renderAccountCard(root, { book, fileId, account = null, onDone }) {
  const t = es.accountAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-card">
      <a class="link-button back-link" data-text="backList"></a>
      <h1 class="form-title"></h1>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.accounts;
  root.querySelector('.form-title').textContent = account ? labelOf(account).toUpperCase() : t.newTitle;

  renderAccountForm(root.querySelector('main'), {
    existing: book.accounts,
    account,
    texts: {
      ...es.onboarding,
      ...t,
      submit: account ? t.save : t.create,
      creating: account ? t.saving : t.creating,
    },
    needsConnection: true,
    onSubmit: (fields) => (account
      ? updateAccount(fileId, account, fields, book.accounts)
      : addAccount(fileId, fields, book.accounts)).then(onDone),
  });

  renderNavbar(root, { active: 'settings' });
}
