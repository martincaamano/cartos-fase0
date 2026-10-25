// Add: tabs Gasto / Ingreso / Transferencia (the last one arrives in tarea
// 06). Validation comes from domain/; the movement goes to the outbox and is
// uploaded to the Sheet in the background.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { queueMovement } from '../data/sync.js';
import { createAmountInput, renderCategoryPicker, renderDatePicker } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';

const ERROR_TEXT = {
  amount_invalid: 'amountInvalid',
  category_unknown: 'categoryRequired',
  account_unknown: 'accountRequired',
  date_invalid: 'dateInvalid',
};

export function renderAddMovement(root, { book, fileId, params = {}, today = new Date(), onSaved }) {
  const t = es.add;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <div class="tabs" role="tablist"></div>
      <form class="form" novalidate>
        <label class="field">
          <span class="field-label" data-text="account"></span>
          <select class="field-input" name="account"></select>
        </label>
        <label class="field field-amount">
          <span class="field-label" data-text="amount"></span>
        </label>
        <div class="field">
          <span class="field-label" data-text="category"></span>
          <div class="category-picker"></div>
        </div>
        <div class="field">
          <span class="field-label" data-text="date"></span>
          <div class="date-picker"></div>
        </div>
        <label class="field">
          <span class="field-label" data-text="note"></span>
          <input class="field-input" name="note" maxlength="140" autocomplete="off">
        </label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  for (const label of root.querySelectorAll('[data-text]')) label.textContent = t[label.dataset.text];

  const form = root.querySelector('form');
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  submit.textContent = t.save;
  const amount = createAmountInput('amount');
  root.querySelector('.field-amount').appendChild(amount);

  const accounts = book.accounts.filter((account) => !account.deleted);
  const accountSelect = form.elements.account;
  for (const account of accounts) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.emoji} ${account.name}`.trim();
    accountSelect.appendChild(option);
  }

  const state = { type: params.type === 'income' ? 'income' : 'expense', categoryId: null, date: null };

  const paintCategories = () => {
    state.categoryId = null;
    renderCategoryPicker(root.querySelector('.category-picker'), {
      categories: rankCategories(book.categories, book.movements, state.type),
      onSelect: (category) => { state.categoryId = category.id; },
      texts: { seeAll: t.seeAll, search: t.search, empty: t.noMatches },
    });
  };

  const tabs = root.querySelector('.tabs');
  for (const type of ['expense', 'income', 'transfer']) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.type = type;
    tab.textContent = t[type];
    tab.disabled = type === 'transfer';
    tab.addEventListener('click', () => {
      state.type = type;
      markTab();
      paintCategories();
    });
    tabs.appendChild(tab);
  }
  const markTab = () => {
    for (const tab of tabs.children) {
      const selected = tab.dataset.type === state.type;
      tab.classList.toggle('is-selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    }
  };
  markTab();
  paintCategories();

  renderDatePicker(root.querySelector('.date-picker'), {
    today,
    onChange: (date) => { state.date = date; },
    texts: { today: t.today, yesterday: t.yesterday, dayBefore: t.dayBefore, other: t.otherDate },
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t.saving;
    const fields = {
      accountId: accountSelect.value,
      type: state.type,
      amount: parseAmountInput(amount.value),
      date: state.date,
      categoryId: state.categoryId,
      note: form.elements.note.value.trim(),
    };
    queueMovement(fileId, fields, book)
      .then(onSaved)
      .catch((err) => {
        const key = err.errors?.map((code) => ERROR_TEXT[code]).find(Boolean);
        error.textContent = key ? t[key] : t.failed;
        submit.disabled = false;
        submit.textContent = t.save;
      });
  });

  renderNavbar(root, { active: 'add' });
}
