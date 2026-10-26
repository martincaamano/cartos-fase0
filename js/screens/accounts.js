// Accounts (inside Settings): the book's accounts with their balance and a
// form to create another one. Goes straight to the Sheet, so it needs a
// connection. Accounts are not edited or removed in the MVP.

import { es } from '../../i18n/es.js';
import { accountBalance } from '../domain/balance.js';
import { activeOnly } from '../domain/active.js';
import { addAccount } from '../data/book.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// book: movements already include the pending ones, so balances match the
// Dashboard.
export function renderAccounts(root, { book, fileId, onChanged }) {
  const t = es.accountAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list account-list"></ul>
      <h2 class="receipt-heading new-title" data-text="newTitle"></h2>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const list = root.querySelector('.account-list');
  for (const account of activeOnly(book.accounts)) {
    const balance = accountBalance(account, book.movements);
    list.appendChild(receiptLine(labelOf(account), formatEuros(balance), { tone: balance < 0 ? 'expense' : '' }));
  }

  renderAccountForm(root.querySelector('main'), {
    existing: book.accounts,
    texts: { ...es.onboarding, ...t, submit: t.create },
    needsConnection: true,
    onSubmit: (fields) => addAccount(fileId, fields, book.accounts).then(onChanged),
  });

  renderNavbar(root, { active: 'settings' });
}
