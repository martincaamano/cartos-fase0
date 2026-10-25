// Add: tabs Gasto / Ingreso / Transferencia. Validation comes from domain/;
// movements go to the outbox and are uploaded to the Sheet in the
// background. A transfer has no category: the app sets Transferencia.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { queueMovement, queueTransfer } from '../data/sync.js';
import { createAmountInput, renderCategoryPicker, renderDatePicker } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const TYPES = ['expense', 'income', 'transfer'];

const ERROR_TEXT = {
  amount_invalid: 'amountInvalid',
  category_unknown: 'categoryRequired',
  account_unknown: 'accountRequired',
  date_invalid: 'dateInvalid',
  same_account: 'sameAccount',
};

function fillAccounts(select, accounts) {
  for (const account of accounts) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.emoji} ${account.name}`.trim();
    select.appendChild(option);
  }
}

export function renderAddMovement(root, { book, fileId, params = {}, today = new Date(), onSaved }) {
  const t = es.add;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <div class="tabs" role="tablist"></div>
      <div class="transfer-blocked" hidden>
        <p class="text-muted form-note"></p>
        <a class="link-button"></a>
      </div>
      <form class="form" novalidate>
        <label class="field only-single">
          <span class="field-label" data-text="account"></span>
          <select class="field-input" name="account"></select>
        </label>
        <label class="field only-transfer">
          <span class="field-label" data-text="from"></span>
          <select class="field-input" name="from"></select>
        </label>
        <label class="field only-transfer">
          <span class="field-label" data-text="to"></span>
          <select class="field-input" name="to"></select>
        </label>
        <label class="field field-amount">
          <span class="field-label" data-text="amount"></span>
        </label>
        <div class="field only-single">
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

  const blocked = root.querySelector('.transfer-blocked');
  blocked.querySelector('.form-note').textContent = t.needTwoAccounts;
  const createLink = blocked.querySelector('a');
  createLink.href = SECTION_HASH.accounts;
  createLink.textContent = t.createAccount;

  const accounts = book.accounts.filter((account) => !account.deleted);
  const { account: accountSelect, from: fromSelect, to: toSelect } = form.elements;
  for (const select of [accountSelect, fromSelect, toSelect]) fillAccounts(select, accounts);
  if (accounts.length > 1) toSelect.value = accounts[1].id;

  const state = {
    type: TYPES.includes(params.type) ? params.type : 'expense',
    categoryId: null,
    date: null,
  };

  const paintCategories = () => {
    state.categoryId = null;
    if (state.type === 'transfer') return;
    renderCategoryPicker(root.querySelector('.category-picker'), {
      categories: rankCategories(book.categories, book.movements, state.type),
      onSelect: (category) => { state.categoryId = category.id; },
      texts: { seeAll: t.seeAll, search: t.search, empty: t.noMatches },
    });
  };

  const tabs = root.querySelector('.tabs');
  const applyType = () => {
    const isTransfer = state.type === 'transfer';
    for (const tab of tabs.children) {
      const selected = tab.dataset.type === state.type;
      tab.classList.toggle('is-selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    }
    for (const field of root.querySelectorAll('.only-single')) field.hidden = isTransfer;
    for (const field of root.querySelectorAll('.only-transfer')) field.hidden = !isTransfer;
    const cannotTransfer = isTransfer && accounts.length < 2;
    blocked.hidden = !cannotTransfer;
    form.hidden = cannotTransfer;
    error.textContent = '';
    paintCategories();
  };
  for (const type of TYPES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.type = type;
    tab.textContent = t[type];
    tab.addEventListener('click', () => {
      state.type = type;
      applyType();
    });
    tabs.appendChild(tab);
  }
  applyType();

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
    const common = {
      amount: parseAmountInput(amount.value),
      date: state.date,
      note: form.elements.note.value.trim(),
    };
    const saving = state.type === 'transfer'
      ? queueTransfer(fileId, { ...common, fromAccountId: fromSelect.value, toAccountId: toSelect.value }, book)
      : queueMovement(fileId, { ...common, accountId: accountSelect.value, type: state.type, categoryId: state.categoryId }, book);
    saving
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
