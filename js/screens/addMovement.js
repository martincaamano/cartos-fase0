// Add: tabs Gasto / Ingreso / Transferencia. Validation comes from domain/;
// movements go to the outbox and are uploaded to the Sheet in the
// background. A transfer inside the book has no category: the app sets
// Transferencia. A transfer to an account of another book is an expense
// here and an income there, each with a category the user picks.
// The same form edits or deletes a saved entry from the History: its type
// is fixed, and a transfer changes both halves together.

import { es } from '../../i18n/es.js';
import { queuePurchase } from '../data/goals.js';
import { suggestNotes } from '../domain/noteSuggestions.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { activeOnly } from '../domain/active.js';
import { startingAccounts, toIsoDate } from '../domain/movement.js';
import {
  queueCrossBookTransfer, queueDelete, queueEdit, queueMovement, queueTransfer, queueTransferEdit,
} from '../data/movements.js';
import { loadTransferCategories, saveTransferCategories } from '../storage/transfer-categories.js';
import { loadLastAccount, saveLastAccount } from '../storage/last-account.js';
import {
  createAmountInput, errorText, fillTexts, renderCategoryPicker, renderChoices, renderDatePicker, renderSuggestions, showBookBanner,
  twoTap,
} from '../ui/components.js';
import { formatAmountInput, formatEuros, labelOf } from '../ui/format.js';
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
// add a new movement. onSaved gets what went to this book's outbox and, for
// a new one, { summary, undo }: the text of what was saved and a function
// that takes it back (a promise of what it queued).
// bookName: shown on top when there is more than one book.
// otherBooks: [{ fileId, name, book }] the other books with a copy on the
// device, offered as transfer destinations (not when editing).
// storage: where the account used last and the categories of the last
// transfer to another book are remembered.
export function renderAddMovement(root, {
  book, bookName = '', fileId, params = {}, entry = null, goal = null, today = new Date(), onSaved, onPurchased = () => {},
  otherBooks = [], storage = globalThis.localStorage,
}) {
  const t = es.add;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-add">
      <div class="add-top" hidden>
        <a class="link-button back-link"></a>
        <button type="button" class="link-button form-delete"></button>
      </div>
      <div class="tabs" role="tablist"></div>
      <p class="text-muted form-note loose-half" hidden></p>
      <div class="transfer-blocked" hidden>
        <p class="text-muted form-note"></p>
        <a class="link-button"></a>
      </div>
      <form class="add-form" novalidate>
        <div class="amount-row">
          <label class="line-pick only-single">
            <span class="offscreen" data-text="account"></span>
            <select class="line-select" name="account"></select>
          </label>
          <label class="amount-field">
            <span class="offscreen" data-text="amount"></span>
          </label>
          <span class="amount-currency" aria-hidden="true">€</span>
        </div>
        <label class="line only-transfer">
          <span class="line-label" data-text="from"></span>
          <select class="line-select" name="from"></select>
        </label>
        <label class="line only-transfer">
          <span class="line-label" data-text="to"></span>
          <select class="line-select" name="to"></select>
        </label>
        <div class="only-cross" hidden>
          <label class="line">
            <span class="line-label" data-text="crossExpense"></span>
            <select class="line-select" name="expenseCategory"></select>
          </label>
          <label class="line">
            <span class="line-label" data-text="crossIncome"></span>
            <select class="line-select" name="incomeCategory"></select>
          </label>
        </div>
        <div class="only-single category-picker" role="group"></div>
        <div class="date-picker" role="group"></div>
        <div class="note-field">
          <button type="button" class="link-button note-toggle" data-text="addNote"></button>
          <input class="field-input" name="note" maxlength="140" autocomplete="off" hidden>
          <div class="chip-strip note-suggestions" hidden></div>
        </div>
        <p class="form-error" role="alert"></p>
        <div class="add-actions">
          <button type="submit" class="btn-primary form-submit"></button>
        </div>
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
  root.querySelector('.amount-field').appendChild(amount);
  root.querySelector('.category-picker').setAttribute('aria-label', t.category);
  root.querySelector('.date-picker').setAttribute('aria-label', t.date);

  // The note stays folded until it is wanted (or the movement has one).
  const note = form.elements.note;
  const noteToggle = root.querySelector('.note-toggle');
  note.setAttribute('aria-label', t.note);
  // Notes used before with this category (tarea 27), under the note once
  // it is open; typing filters them, a tap fills the note in.
  const suggestions = root.querySelector('.note-suggestions');
  const paintSuggestions = () => {
    if (note.hidden) {
      suggestions.hidden = true;
      return;
    }
    const offered = state.type === 'transfer' || state.categoryId
      ? suggestNotes(book.movements, { type: state.type, categoryId: state.categoryId, typed: note.value })
      : [];
    renderSuggestions(suggestions, offered, (text) => {
      note.value = text;
      paintSuggestions();
    });
  };
  const openNote = () => {
    noteToggle.hidden = true;
    note.hidden = false;
    paintSuggestions();
  };
  noteToggle.addEventListener('click', () => {
    openNote();
    note.focus();
  });
  note.addEventListener('input', () => paintSuggestions());

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
  // A new movement starts from the account used last in this book.
  const start = startingAccounts(accounts.map((account) => account.id), entry ? null : loadLastAccount(storage, fileId), otherAccounts > 0);
  accountSelect.value = start.account;
  fromSelect.value = start.from;
  if (start.to === null) toSelect.selectedIndex = accounts.length;
  else toSelect.value = start.to;

  // What is being edited: one movement, or both halves of a transfer.
  const original = entry?.kind === 'movement' ? entry.movement : null;
  const halves = entry?.kind === 'transfer' ? entry.halves : null;
  // goal: the purchase a savings goal was for (tarea 25d), an expense.
  const initialType = halves ? 'transfer' : original?.type ?? (goal ? 'expense' : params.type);
  const state = {
    type: TYPES.includes(initialType) ? initialType : 'expense',
    categoryId: null,
    date: null,
  };

  // Categories ranked by their use up to today (tarea 28).
  const day = toIsoDate(today);
  const categoryChoices = () => {
    const ranked = rankCategories(book.categories, book.movements, state.type, day);
    // A removed category (or Transferencia on a loose half) stays selectable
    // for the movement that already uses it.
    const keptId = original?.categoryId ?? goal?.categoryId;
    const own = keptId && book.categories.find((c) => c.id === keptId);
    return own && !ranked.includes(own) ? [own, ...ranked] : ranked;
  };

  const paintCategories = () => {
    state.categoryId = null;
    if (state.type === 'transfer') return;
    renderCategoryPicker(root.querySelector('.category-picker'), {
      categories: categoryChoices(),
      selectedId: original?.categoryId ?? goal?.categoryId ?? null,
      onSelect: (category) => {
        state.categoryId = category.id;
        paintSuggestions();
      },
      texts: { seeAll: t.seeAll, seeLess: t.seeLess, search: t.search, empty: t.noMatches },
    });
  };

  const cross = root.querySelector('.only-cross');
  const { expenseCategory, incomeCategory } = form.elements;
  // A category <select>, ranked by use, preselecting `id` when it is there;
  // otherwise it starts on "Elige…", so saving asks for one.
  const fillCategories = (select, categories, id) => {
    const choose = document.createElement('option');
    choose.value = '';
    choose.textContent = t.choose;
    select.replaceChildren(choose, ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = labelOf(category);
      return option;
    }));
    select.value = categories.some((category) => category.id === id) ? id : '';
  };
  // Shown when the destination of a transfer is in another book.
  const paintCross = () => {
    const other = state.type === 'transfer' ? otherBookOf(toSelect.value) : null;
    cross.hidden = !other;
    if (!other) return;
    const remembered = loadTransferCategories(storage, toSelect.value);
    fillCategories(expenseCategory, rankCategories(book.categories, book.movements, 'expense', day), remembered?.expenseCategoryId);
    fillCategories(incomeCategory, rankCategories(other.book.categories, other.book.movements, 'income', day), remembered?.incomeCategoryId);
  };
  toSelect.addEventListener('change', paintCross);

  const applyType = () => {
    const isTransfer = state.type === 'transfer';
    for (const field of root.querySelectorAll('.only-single')) field.hidden = isTransfer;
    for (const field of root.querySelectorAll('.only-transfer')) field.hidden = !isTransfer;
    const cannotTransfer = isTransfer && accounts.length + otherAccounts < 2;
    blocked.hidden = !cannotTransfer;
    form.hidden = cannotTransfer;
    error.textContent = '';
    paintCategories();
    paintCross();
    paintSuggestions();
  };
  // Editing keeps the type: the other tabs are off.
  renderChoices(root.querySelector('.tabs'), TYPES.map((type) => ({
    value: type, label: t[type], disabled: Boolean(entry || goal) && type !== state.type,
  })), {
    selected: state.type,
    className: 'tab',
    dataKey: 'type',
    role: 'tab',
    onSelect: (type) => {
      state.type = type;
      applyType();
    },
  });
  applyType();

  if (goal) {
    root.querySelector('.add-top').hidden = false;
    const back = root.querySelector('.back-link');
    back.href = `${SECTION_HASH.goal}?id=${encodeURIComponent(goal.id)}`;
    back.textContent = es.goals.backGoal;
    amount.value = formatAmountInput(goal.targetAmount);
    note.value = goal.name;
    openNote();
  }

  const saved = original ?? halves?.[0];
  if (saved) {
    root.querySelector('.add-top').hidden = false;
    const back = root.querySelector('.back-link');
    back.href = SECTION_HASH.history;
    back.textContent = t.back;
    amount.value = formatAmountInput(saved.amount);
    note.value = saved.note;
    if (saved.note) openNote();
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

  // «12,50 € · 🛒 Supermercado» or «50,00 € · 🏦 Abanca → 💶 Efectivo».
  const allAccounts = [...accounts, ...destinations.flatMap((other) => other.book.accounts)];
  const accountLabel = (id) => labelOf(allAccounts.find((account) => account.id === id));
  const summaryOf = (amountValue, transfer, single) => {
    const what = state.type === 'transfer'
      ? `${accountLabel(transfer.fromAccountId)} → ${accountLabel(transfer.toAccountId)}`
      : labelOf(book.categories.find((category) => category.id === single.categoryId));
    return `${formatEuros(amountValue)} · ${what}`;
  };

  const remove = root.querySelector('.form-delete');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (remove.disabled) return;
    error.textContent = '';
    submit.disabled = true;
    remove.disabled = true;
    submit.textContent = t.saving;
    const common = {
      amount: parseAmountInput(amount.value),
      date: state.date,
      note: note.value.trim(),
    };
    const transfer = { ...common, fromAccountId: fromSelect.value, toAccountId: toSelect.value };
    const single = { ...common, accountId: accountSelect.value, type: state.type, categoryId: state.categoryId };
    const other = state.type === 'transfer' ? otherBookOf(toSelect.value) : null;
    let saving;
    let undo = null;
    if (other) {
      const categories = { expenseCategoryId: expenseCategory.value, incomeCategoryId: incomeCategory.value };
      // Only the half of this book is counted here; the other one waits in
      // its own book's outbox and is uploaded with it.
      saving = queueCrossBookTransfer({ fileId, book }, other, { ...transfer, ...categories })
        .then(([outgoing, incoming]) => {
          saveTransferCategories(storage, transfer.toAccountId, categories);
          // Undoing takes back both halves, each in its book.
          undo = () => queueDelete(other.fileId, [incoming]).then(() => queueDelete(fileId, [outgoing]));
          return outgoing;
        });
    } else if (goal) {
      // The purchase and the goal it completes, together.
      return queuePurchase(fileId, single, goal, book)
        .then(([movement, completed]) => onPurchased(movement, completed))
        .catch((err) => {
          error.textContent = errorText(err.errors ?? [], ERROR_TEXT, t) || t.failed;
          submit.disabled = false;
          remove.disabled = false;
          submit.textContent = t.save;
        });
    } else if (halves) saving = queueTransferEdit(fileId, halves, transfer, book);
    else if (original) saving = queueEdit(fileId, original, single, book);
    else if (state.type === 'transfer') saving = queueTransfer(fileId, transfer, book);
    else saving = queueMovement(fileId, single, book);
    saving
      .then((saved) => {
        if (entry) return onSaved(saved);
        saveLastAccount(storage, fileId, state.type === 'transfer' ? transfer.fromAccountId : single.accountId);
        // A new one: what was saved, and how to take it back.
        return onSaved(saved, {
          summary: summaryOf(common.amount, transfer, single),
          undo: undo ?? (() => queueDelete(fileId, [saved].flat())),
        });
      })
      .catch((err) => {
        error.textContent = errorText(err.errors ?? [], ERROR_TEXT, t) || t.failed;
        submit.disabled = false;
        remove.disabled = false;
        submit.textContent = t.save;
      });
  });

  if (saved) {
    // Two taps: the first one asks, the second one deletes. While it
    // deletes, Guardar cannot bring the movement back.
    remove.textContent = t.delete;
    twoTap(remove, {
      confirm: t.confirmDelete,
      busy: t.deleting,
      work: () => {
        submit.disabled = true;
        return queueDelete(fileId, halves ?? [original]).then(onSaved).catch((err) => {
          submit.disabled = false;
          throw err;
        });
      },
      fails: () => { error.textContent = t.failed; },
    });
  }

  renderNavbar(root, { active: entry ? 'history' : 'add' });
}
