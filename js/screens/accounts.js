// Accounts (inside Settings, tarea 20c): the book's accounts with their
// balance, each one opening its card, and "+ Nueva cuenta" at the end.

import { es } from '../../i18n/es.js';
import { accountBalance } from '../domain/balance.js';
import { activeOnly } from '../domain/active.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// book: movements already include the pending ones, so balances match the
// Dashboard.
export function renderAccounts(root, { book }) {
  const t = es.accountAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list account-list"></ul>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const list = root.querySelector('.account-list');
  for (const account of activeOnly(book.accounts)) {
    const balance = accountBalance(account, book.movements);
    list.appendChild(receiptLine(labelOf(account), formatEuros(balance), {
      tone: balance < 0 ? 'expense' : '',
      href: `${SECTION_HASH.accountEdit}?id=${encodeURIComponent(account.id)}`,
      className: 'account-line',
    }));
  }
  list.appendChild(receiptLine(t.newLink, '', { href: SECTION_HASH.accountNew, className: 'add-row' }));

  renderNavbar(root, { active: 'settings' });
}
