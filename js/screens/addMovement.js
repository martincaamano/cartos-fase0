// Add: tabs Gasto / Ingreso / Transferencia. Validation comes from domain/;
// movements go to the outbox and are uploaded to the Sheet in the
// background. A transfer has no category: the app sets Transferencia.
// The same form edits or deletes a saved entry from the History: its type
// is fixed, and a transfer changes both halves together.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { activeOnly } from '../domain/active.js';
import { queueDelete, queueEdit, queueMovement, queueTransfer, queueTransferEdit } from '../data/movements.js';
import { showBookBanner, createAmountInput, fillTexts, renderCategoryPicker, renderDatePicker } from '../ui/components.js';
import { formatAmountInput, labelOf } from '../ui/format.js';
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
    option.textContent = labelOf(account);
    select.appendChild(option);
  }
}

// entry: a History entry to edit (historyEntries / findEntry), or null to
// add a new movement. onSaved gets what went to the outbox. bookName:
// shown on top when there is more than one book.
export function renderAddMovement(root, { book, bookName = '', fileId, params = {}, entry = null, today = new Date(), onSaved }) {
  const t = es.add;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" hidden></a>
      <div class="tabs" role="tablist"></div>
      <p class="text-muted form-note loose-half" hidden></p>
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
        <button type="button" class="link-button form-delete" hidden></button>
      </form>
    </main>
  `;
  showBookBanner(root.querySelector('main'), bookName);
  fillTexts(root, t);

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

  const accounts = activeOnly(book.accounts);
  const { account: accountSelect, from: fromSelect, to: toSelect } = form.elements;
  for (const select of [accountSelect, fromSelect, toSelect]) fillAccounts(select, accounts);
  if (accounts.length > 1) toSelect.value = accounts[1].id;

  // What is being edited: one movement, or both halves of a transfer.
  const original = entry?.kind === 'movement' ? entry.movement : null;
  const halves = entry?.kind === 'transfer' ? entry.halves : null;
  const initialType = halves ? 'transfer' : original?.type ?? params.type;
  const state = {
    type: TYPES.includes(initialType) ? initialType : 'expense',
    categoryId: null,
    date: null,
  };

  const categoryChoices = () => {
    const ranked = rankCategories(book.categories, book.movements, state.type);
    // A removed category (or Transferencia on a loose half) stays selectable
    // for the movement that already uses it.
    const own = original && book.categories.find((c) => c.id === original.categoryId);
    return own && !ranked.includes(own) ? [own, ...ranked] : ranked;
  };

  const paintCategories = () => {
    state.categoryId = null;
    if (state.type === 'transfer') return;
    renderCategoryPicker(root.querySelector('.category-picker'), {
      categories: categoryChoices(),
      selectedId: original?.categoryId ?? null,
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
    tab.disabled = Boolean(entry) && type !== state.type;
    tab.addEventListener('click', () => {
      state.type = type;
      applyType();
    });
    tabs.appendChild(tab);
  }
  applyType();

  const saved = original ?? halves?.[0];
  if (saved) {
    const back = root.querySelector('.back-link');
    back.hidden = false;
    back.href = SECTION_HASH.history;
    back.textContent = t.back;
    amount.value = formatAmountInput(saved.amount);
    form.elements.note.value = saved.note;
    if (original) accountSelect.value = original.accountId;
    if (halves) {
      fromSelect.value = halves[0].accountId;
      toSelect.value = halves[1].accountId;
    }
    if (original?.transferId) {
      const warning = root.querySelector('.loose-half');
      warning.hidden = false;
      warning.textContent = t.looseHalf;
    }
  }

  renderDatePicker(root.querySelector('.date-picker'), {
    today,
    initial: saved?.date ?? null,
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
    const transfer = { ...common, fromAccountId: fromSelect.value, toAccountId: toSelect.value };
    const single = { ...common, accountId: accountSelect.value, type: state.type, categoryId: state.categoryId };
    let saving;
    if (halves) saving = queueTransferEdit(fileId, halves, transfer, book);
    else if (original) saving = queueEdit(fileId, original, single, book);
    else if (state.type === 'transfer') saving = queueTransfer(fileId, transfer, book);
    else saving = queueMovement(fileId, single, book);
    saving
      .then(onSaved)
      .catch((err) => {
        const key = err.errors?.map((code) => ERROR_TEXT[code]).find(Boolean);
        error.textContent = key ? t[key] : t.failed;
        submit.disabled = false;
        submit.textContent = t.save;
      });
  });

  if (saved) {
    // Two taps: the first one asks, the second one deletes.
    const remove = root.querySelector('.form-delete');
    remove.hidden = false;
    remove.textContent = t.delete;
    let armed = false;
    remove.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        remove.textContent = t.confirmDelete;
        return;
      }
      remove.disabled = true;
      remove.textContent = t.deleting;
      queueDelete(fileId, halves ?? [original])
        .then(onSaved)
        .catch(() => {
          error.textContent = t.failed;
          remove.disabled = false;
          armed = false;
          remove.textContent = t.delete;
        });
    });
  }

  renderNavbar(root, { active: entry ? 'history' : 'add' });
}
