// Accounts (inside Settings): the book's accounts with their balance and a
// form to create another one. Goes straight to the Sheet, so it needs a
// connection. Accounts are not edited or removed in the MVP.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { accountBalance } from '../domain/balance.js';
import { addAccount } from '../data/book.js';
import { formatEuros } from '../ui/format.js';
import { createAmountInput, setupEmojiPicker } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const SUGGESTED_EMOJIS = ['🏦', '💶', '💳', '🐷', '💼', '🏠'];

// book: movements already include the pending ones, so balances match the
// Dashboard.
export function renderAccounts(root, { book, fileId, onChanged }) {
  const t = es.accountAdmin;
  const form = es.onboarding;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link"></a>
      <h1 class="form-title"></h1>
      <ul class="receipt-list account-list"></ul>
      <h2 class="receipt-heading new-title"></h2>
      <form class="form" novalidate>
        <label class="field">
          <span class="field-label name-label"></span>
          <input class="field-input" name="name" autocomplete="off" maxlength="40">
        </label>
        <div class="field">
          <span class="field-label emoji-label"></span>
          <div class="emoji-row"></div>
          <input class="field-input emoji-input" name="emoji" maxlength="8">
        </div>
        <label class="field field-balance">
          <span class="field-label balance-label"></span>
        </label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  const back = root.querySelector('.back-link');
  back.href = SECTION_HASH.settings;
  back.textContent = t.back;
  root.querySelector('.form-title').textContent = t.title;
  root.querySelector('.new-title').textContent = t.newTitle;
  root.querySelector('.name-label').textContent = form.nameLabel;
  root.querySelector('.emoji-label').textContent = form.emojiLabel;
  root.querySelector('.balance-label').textContent = form.balanceLabel;

  const list = root.querySelector('.account-list');
  for (const account of book.accounts.filter((a) => !a.deleted)) {
    const item = document.createElement('li');
    item.className = 'receipt-line receipt-row';
    const label = document.createElement('span');
    label.className = 'receipt-label';
    label.textContent = `${account.emoji} ${account.name}`.trim();
    const amount = document.createElement('span');
    const balance = accountBalance(account, book.movements);
    amount.className = balance < 0 ? 'receipt-amount amount-expense' : 'receipt-amount';
    amount.textContent = formatEuros(balance);
    item.append(label, amount);
    list.appendChild(item);
  }

  const formEl = root.querySelector('form');
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  const balance = createAmountInput('balance');
  root.querySelector('.field-balance').appendChild(balance);
  formEl.elements.name.placeholder = form.namePlaceholder;
  submit.textContent = t.create;
  setupEmojiPicker(root.querySelector('.emoji-row'), formEl.elements.emoji, SUGGESTED_EMOJIS);

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: formEl.elements.name.value,
      emoji: formEl.elements.emoji.value,
      initialBalance: balance.value.trim() === '' ? 0 : parseAmountInput(balance.value),
    };
    const errors = validateAccount(createAccount(fields), book.accounts);
    if (errors.includes('name_required')) { error.textContent = form.nameRequired; return; }
    if (errors.includes('name_taken')) { error.textContent = t.nameTaken; return; }
    if (errors.length) { error.textContent = form.balanceInvalid; return; }
    if (!navigator.onLine) { error.textContent = t.offline; return; }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t.creating;
    addAccount(fileId, fields, book.accounts)
      .then(onChanged)
      .catch((err) => {
        console.warn('Account creation failed', err);
        error.textContent = navigator.onLine ? t.failed : t.offline;
        submit.disabled = false;
        submit.textContent = t.create;
      });
  });

  renderNavbar(root, { active: 'settings' });
}
