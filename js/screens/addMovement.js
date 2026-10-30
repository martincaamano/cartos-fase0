// Add: tabs Gasto / Ingreso / Transferencia. Validation comes from domain/;
// movements go to the outbox and are uploaded to the Sheet in the
// background. A transfer inside the book has no category: the app sets
// Transferencia. A transfer to an account of another book is an expense
// here and an income there, each with a category the user picks.
// The same form edits or deletes a saved entry from the History: its type
// is fixed, and a transfer changes both halves together.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { activeOnly } from '../domain/active.js';
import {
  queueCrossBookTransfer, queueDelete, queueEdit, queueMovement, queueTransfer, queueTransferEdit,
} from '../data/movements.js';
import { loadTransferCategories, saveTransferCategories } from '../storage/transfer-categories.js';
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

// The accounts of the other books, one group per book. Each one also says
// its book ("🏦 Abanca · Casa do medio"): the iPhone picker barely shows
// group names, and two books may have accounts with the same name.
function fillOtherBooks(select, otherBooks) {
  for (const other of otherBooks) {
    const group = document.createElement('optgroup');
    group.label = other.name;
    fillAccounts(group, activeOnly(other.book.accounts));
    for (const option of group.children) {
      option.textContent = es.add.otherBookAccount.replace('{account}', option.textContent).replace('{book}', other.name);
    }
    select.appendChild(group);
  }
}

// entry: a History entry to edit (historyEntries / findEntry), or null to
// add a new movement. onSaved gets what went to this book's outbox.
// bookName: shown on top when there is more than one book.
// otherBooks: [{ fileId, name, book }] the other books with a copy on the
// device, offered as transfer destinations (not when editing).
// storage: where the categories of the last transfer to another book are
// remembered.
export function renderAddMovement(root, {
  book, bookName = '', fileId, params = {}, entry = null, today = new Date(), onSaved,
  otherBooks = [], storage = globalThis.localStorage,
}) {
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
        <div class="only-cross" hidden>
          <p class="text-muted form-note cross-note"></p>
          <div class="field">
            <span class="field-label cross-expense-label"></span>
            <div class="category-picker cross-expense"></div>
          </div>
          <div class="field">
            <span class="field-label cross-income-label"></span>
            <div class="category-picker cross-income"></div>
          </div>
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
  // Other books are offered only for a new transfer.
  const destinations = entry ? [] : otherBooks.filter((other) => activeOnly(other.book.accounts).length > 0);
  fillOtherBooks(toSelect, destinations);
  const otherBookOf = (accountId) =>
    destinations.find((other) => other.book.accounts.some((account) => account.id === accountId)) ?? null;
  const otherAccounts = destinations.reduce((count, other) => count + activeOnly(other.book.accounts).length, 0);
  if (accounts.length > 1) toSelect.value = accounts[1].id;
  else if (otherAccounts > 0) toSelect.selectedIndex = accounts.length;

  // What is being edited: one movement, or both halves of a transfer.
  const original = entry?.kind === 'movement' ? entry.movement : null;
  const halves = entry?.kind === 'transfer' ? entry.halves : null;
  const initialType = halves ? 'transfer' : original?.type ?? params.type;
  const state = {
    type: TYPES.includes(initialType) ? initialType : 'expense',
    categoryId: null,
    date: null,
    // Transfer to another book: the category on each side.
    expenseCategoryId: null,
    incomeCategoryId: null,
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

  const pickerTexts = { seeAll: t.seeAll, search: t.search, empty: t.noMatches };
  const cross = root.querySelector('.only-cross');
  // Shown when the destination of a transfer is in another book.
  const paintCross = () => {
    const other = state.type === 'transfer' ? otherBookOf(toSelect.value) : null;
    cross.hidden = !other;
    if (!other) return;
    const remembered = loadTransferCategories(storage, toSelect.value);
    const expenses = rankCategories(book.categories, book.movements, 'expense');
    const incomes = rankCategories(other.book.categories, other.book.movements, 'income');
    const pick = (list, id) => (list.some((category) => category.id === id) ? id : null);
    state.expenseCategoryId = pick(expenses, remembered?.expenseCategoryId);
    state.incomeCategoryId = pick(incomes, remembered?.incomeCategoryId);
    root.querySelector('.cross-note').textContent = t.crossNote.replace('{book}', other.name);
    root.querySelector('.cross-expense-label').textContent = t.crossExpense.replace('{book}', bookName);
    root.querySelector('.cross-income-label').textContent = t.crossIncome.replace('{book}', other.name);
    renderCategoryPicker(root.querySelector('.cross-expense'), {
      categories: expenses,
      selectedId: state.expenseCategoryId,
      onSelect: (category) => { state.expenseCategoryId = category.id; },
      texts: pickerTexts,
    });
    renderCategoryPicker(root.querySelector('.cross-income'), {
      categories: incomes,
      selectedId: state.incomeCategoryId,
      onSelect: (category) => { state.incomeCategoryId = category.id; },
      texts: pickerTexts,
    });
  };
  toSelect.addEventListener('change', paintCross);

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
    const cannotTransfer = isTransfer && accounts.length + otherAccounts < 2;
    blocked.hidden = !cannotTransfer;
    form.hidden = cannotTransfer;
    error.textContent = '';
    paintCategories();
    paintCross();
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
    const other = state.type === 'transfer' ? otherBookOf(toSelect.value) : null;
    let saving;
    if (other) {
      const categories = { expenseCategoryId: state.expenseCategoryId, incomeCategoryId: state.incomeCategoryId };
      // Only the half of this book is counted here; the other one waits in
      // its own book's outbox and is uploaded with it.
      saving = queueCrossBookTransfer({ fileId, book }, other, { ...transfer, ...categories })
        .then(([outgoing]) => {
          saveTransferCategories(storage, transfer.toAccountId, categories);
          return outgoing;
        });
    } else if (halves) saving = queueTransferEdit(fileId, halves, transfer, book);
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
