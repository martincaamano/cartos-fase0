// Onboarding: first account of the personal book (name, emoji, initial
// balance). Validation comes from domain/; creating the book from data/.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { setUpPersonalBook } from '../data/personal-book.js';
import { ACCOUNT_EMOJIS, setupEmojiPicker } from '../ui/components.js';

export function renderOnboarding(root, { fileId = null, onDone }) {
  const t = es.onboarding;
  root.innerHTML = `
    <main class="screen screen-form">
      <h1 class="form-title"></h1>
      <p class="text-muted form-note"></p>
      <form class="form" novalidate>
        <label class="field">
          <span class="field-label" data-text="nameLabel"></span>
          <input class="field-input" name="name" autocomplete="off" maxlength="40">
        </label>
        <div class="field">
          <span class="field-label" data-text="emojiLabel"></span>
          <div class="emoji-row"></div>
          <input class="field-input emoji-input" name="emoji" maxlength="8" aria-label="${t.emojiLabel}">
        </div>
        <label class="field">
          <span class="field-label" data-text="balanceLabel"></span>
          <input class="field-input amount-input" name="balance" inputmode="decimal" autocomplete="off">
        </label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  root.querySelector('.form-title').textContent = t.title;
  root.querySelector('.form-note').textContent = t.note;
  for (const label of root.querySelectorAll('[data-text]')) label.textContent = t[label.dataset.text];

  const form = root.querySelector('form');
  const { name, emoji, balance } = form.elements;
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  name.placeholder = t.namePlaceholder;
  balance.placeholder = t.balancePlaceholder;
  submit.textContent = t.submit;
  setupEmojiPicker(root.querySelector('.emoji-row'), emoji, ACCOUNT_EMOJIS);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: name.value,
      emoji: emoji.value,
      initialBalance: balance.value.trim() === '' ? 0 : parseAmountInput(balance.value),
    };
    const errors = validateAccount(createAccount(fields));
    if (errors.length) {
      error.textContent = errors.includes('name_required') ? t.nameRequired : t.balanceInvalid;
      return;
    }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t.creating;
    setUpPersonalBook({ fileId, account: fields })
      .then(onDone)
      .catch(() => {
        error.textContent = t.failed;
        submit.disabled = false;
        submit.textContent = t.submit;
      });
  });
}
