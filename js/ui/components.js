// Shared form pieces: template texts, emoji picker, amount field, account
// form, category grid and quick date picker. They touch the DOM only when
// called.

import { es } from '../../i18n/es.js';
import { quickDates } from '../domain/movement.js';
import { parseAmountInput } from '../domain/money.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { formatAmountInput, formatShortDate } from './format.js';

// An element with its class and text: el('span', 'amount-income', '+12').
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// A chip that is on or off (filters, exclusions).
export function toggleChip(text, on, onTap) {
  const chip = el('button', 'chip', text);
  chip.type = 'button';
  chip.classList.toggle('is-selected', on);
  chip.setAttribute('aria-pressed', String(on));
  chip.addEventListener('click', onTap);
  return chip;
}

// One of several buttons, the chosen one marked: tabs, periods, views,
// theme, a category's kind. options: [{ value, label, disabled }]. Each
// button gets className and data-<dataKey>=value; role 'tab' marks it with
// aria-selected instead of aria-pressed. A tap marks it and calls
// onSelect(value).
export function renderChoices(container, options, { selected, className = 'chip', dataKey = 'value', role = null, onSelect }) {
  const state = role === 'tab' ? 'aria-selected' : 'aria-pressed';
  const mark = (value) => {
    for (const button of container.children) {
      const on = button.dataset[dataKey] === value;
      button.classList.toggle('is-selected', on);
      button.setAttribute(state, String(on));
    }
  };
  container.replaceChildren(...options.map(({ value, label, disabled = false }) => {
    const button = el('button', className, label);
    button.type = 'button';
    button.dataset[dataKey] = value;
    if (role) button.setAttribute('role', role);
    button.disabled = disabled;
    button.addEventListener('click', () => {
      mark(value);
      onSelect(value);
    });
    return button;
  }));
  mark(selected);
}

// A button busy with something: disabled, with `text`. Returns what puts
// it back as it was (when the work failed).
export function setBusy(button, text) {
  const idle = button.textContent;
  button.disabled = true;
  button.textContent = text;
  return () => {
    button.disabled = false;
    button.textContent = idle;
  };
}

// A change that goes straight to Drive failed: why, as far as the device
// knows.
export const failureText = (failed, offline) => (navigator.onLine ? failed : offline);

// The text for the first error code that has one. map: { code: textKey }.
export function errorText(codes, map, texts) {
  const key = codes.map((code) => map[code]).find(Boolean);
  return key ? texts[key] : '';
}

// Two taps (Borrar, Quitar): the first one asks with `confirm`, the second
// one shows `busy` and runs work(), a promise. If it fails the button is
// back as at first and fails(err) says why. before() may stop a tap
// (returns false), e.g. when offline.
export function twoTap(button, { confirm, busy, work, fails = () => {}, before = () => true }) {
  const idle = button.textContent;
  let armed = false;
  button.addEventListener('click', () => {
    if (!before()) return;
    if (!armed) {
      armed = true;
      button.textContent = confirm;
      return;
    }
    const restore = setBusy(button, busy);
    work().catch((err) => {
      fails(err);
      restore();
      button.textContent = idle;
      armed = false;
    });
  });
}

// Fills every [data-text="key"] inside root with texts[key].
export function fillTexts(root, texts) {
  for (const node of root.querySelectorAll('[data-text]')) node.textContent = texts[node.dataset.text];
}

// Emojis offered when creating an account (Onboarding and Ajustes → Cuentas).
export const ACCOUNT_EMOJIS = Object.freeze(['🏦', '💶', '💳', '🐷', '💼', '🏠']);

// Row of suggested emojis that fill `input`; typing any other emoji works too.
export function setupEmojiPicker(row, input, offered) {
  input.value = input.value || offered[0];
  // An emoji of its own (a saved one) goes first, in place of the last suggestion.
  const suggestions = offered.includes(input.value) ? offered : [input.value, ...offered.slice(0, -1)];
  // "Otro…" shows the field for any other emoji; it stays hidden otherwise.
  const other = document.createElement('button');
  other.type = 'button';
  other.className = 'emoji-option emoji-other';
  other.textContent = es.emoji.other;
  const markSelected = () => {
    for (const button of row.children) {
      button.classList.toggle('is-selected', button === other ? !input.hidden : input.hidden && button.textContent === input.value);
    }
  };
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-option';
    button.textContent = suggestion;
    button.addEventListener('click', () => {
      input.value = suggestion;
      input.hidden = true;
      markSelected();
    });
    row.appendChild(button);
  }
  other.addEventListener('click', () => {
    input.hidden = false;
    if (suggestions.includes(input.value)) input.value = '';
    input.focus();
    markSelected();
  });
  row.appendChild(other);
  input.hidden = suggestions.includes(input.value);
  markSelected();
}

// Native numeric keyboard on iOS; parsing and the two-decimal check happen
// in domain/ (parseAmountInput, validateMovement).
export function createAmountInput(name) {
  const input = document.createElement('input');
  input.className = 'field-input amount-input';
  input.name = name;
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = '0,00';
  return input;
}

// The text for the first account error, or null when the account is valid.
// texts: { nameRequired, nameTaken, balanceInvalid }.
export function accountErrorText(errors, texts) {
  if (errors.length === 0) return null;
  if (errors.includes('name_required')) return texts.nameRequired;
  if (errors.includes('name_taken')) return texts.nameTaken;
  return texts.balanceInvalid;
}

// "LIBRO · Casa do medio" on top of a screen, so a movement never goes to
// the wrong book. Nothing when the name is empty (a single book).
export function showBookBanner(main, name) {
  if (!name) return;
  const banner = document.createElement('p');
  banner.className = 'book-banner text-muted';
  banner.textContent = es.books.banner.replace('{name}', name);
  main.prepend(banner);
}

// Name, emoji and initial balance of a new account (Onboarding and
// Ajustes → Cuentas). Validates with domain/ and hands the fields to
// onSubmit, which returns a promise; while it runs the button says
// texts.creating, and if it fails the form says texts.failed (or
// texts.offline when needsConnection and there is no network).
// existing: the book's accounts, to reject a repeated name.
// texts: nameLabel, namePlaceholder, emojiLabel, balanceLabel,
// balancePlaceholder, submit, creating, failed, nameRequired, nameTaken,
// balanceInvalid and, with needsConnection, offline.
// check: another problem outside the form (the book name in Ajustes →
// Libros) as a text, or '' when there is none.
// account: a saved account to edit (its card): the fields start with its
// values and its own name does not count as repeated.
export function renderAccountForm(container, {
  existing = [], texts, needsConnection = false, check = () => '', account = null, onSubmit,
}) {
  const form = document.createElement('form');
  form.className = 'form';
  form.noValidate = true;
  form.innerHTML = `
    <label class="field">
      <span class="field-label" data-text="nameLabel"></span>
      <input class="field-input" name="name" autocomplete="off" maxlength="40">
    </label>
    <div class="field">
      <span class="field-label" data-text="emojiLabel"></span>
      <div class="emoji-row"></div>
      <input class="field-input emoji-input" name="emoji" maxlength="8">
    </div>
    <label class="field field-balance">
      <span class="field-label" data-text="balanceLabel"></span>
    </label>
    <p class="form-error" role="alert"></p>
    <button type="submit" class="btn-primary form-submit"></button>
  `;
  fillTexts(form, texts);
  const { name, emoji } = form.elements;
  name.placeholder = texts.namePlaceholder;
  emoji.setAttribute('aria-label', texts.emojiLabel);
  const balance = createAmountInput('balance');
  balance.placeholder = texts.balancePlaceholder;
  form.querySelector('.field-balance').appendChild(balance);
  const error = form.querySelector('.form-error');
  const submit = form.querySelector('.form-submit');
  submit.textContent = texts.submit;
  if (account) {
    name.value = account.name;
    emoji.value = account.emoji;
    balance.value = formatAmountInput(account.initialBalance);
  }
  setupEmojiPicker(form.querySelector('.emoji-row'), emoji, ACCOUNT_EMOJIS);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: name.value,
      emoji: emoji.value,
      initialBalance: balance.value.trim() === '' ? 0 : parseAmountInput(balance.value),
    };
    const others = account ? existing.filter((other) => other.id !== account.id) : existing;
    const problem = check() || accountErrorText(validateAccount(createAccount(fields), others), texts);
    if (problem) { error.textContent = problem; return; }
    if (needsConnection && !navigator.onLine) { error.textContent = texts.offline; return; }

    error.textContent = '';
    const restore = setBusy(submit, texts.creating);
    onSubmit(fields).catch((err) => {
      console.warn('Account creation failed', err);
      error.textContent = needsConnection ? failureText(texts.failed, texts.offline) : texts.failed;
      restore();
    });
  });
  container.appendChild(form);
}

function categoryButton(category, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'category-option';
  button.dataset.id = category.id;
  const emoji = document.createElement('span');
  emoji.className = 'category-emoji';
  emoji.textContent = category.emoji;
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category.name;
  button.append(emoji, name);
  button.addEventListener('click', () => onSelect(category));
  return button;
}

// categories: already ranked (rankCategories). Shows them as a grid of
// `gridSize` tiles; when there are more, the last tile is "Ver todas", which
// opens the full list with a search box.
// texts: { seeAll, search, empty }.
export function renderCategoryPicker(container, { categories, selectedId = null, onSelect, gridSize = 12, texts }) {
  container.replaceChildren();
  let selected = selectedId;
  const select = (category) => {
    selected = category.id;
    for (const button of container.querySelectorAll('.category-option')) {
      button.classList.toggle('is-selected', button.dataset.id === selected);
    }
    onSelect(category);
  };

  const grid = document.createElement('div');
  grid.className = 'category-grid';
  const more = categories.length > gridSize;
  for (const category of categories.slice(0, more ? gridSize - 1 : gridSize)) grid.appendChild(categoryButton(category, select));
  container.appendChild(grid);

  if (more) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'category-option category-more';
    const dots = document.createElement('span');
    dots.className = 'category-emoji';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '···';
    const label = document.createElement('span');
    label.className = 'category-name';
    label.textContent = texts.seeAll;
    toggle.append(dots, label);
    grid.appendChild(toggle);
    const panel = document.createElement('div');
    panel.className = 'category-all';
    panel.hidden = true;
    const search = document.createElement('input');
    search.className = 'field-input';
    search.type = 'search';
    search.placeholder = texts.search;
    const list = document.createElement('div');
    list.className = 'category-list';
    const paint = () => {
      const query = search.value.trim().toLocaleLowerCase('es');
      const matches = categories.filter((c) => c.name.toLocaleLowerCase('es').includes(query));
      list.replaceChildren(...matches.map((c) => categoryButton(c, select)));
      if (matches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-muted';
        empty.textContent = texts.empty;
        list.appendChild(empty);
      }
      for (const button of list.querySelectorAll('.category-option')) {
        button.classList.toggle('is-selected', button.dataset.id === selected);
      }
    };
    search.addEventListener('input', paint);
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) paint();
    });
    panel.append(search, list);
    container.append(panel);
  }
  if (selected) select(categories.find((c) => c.id === selected) ?? categories[0]);
}

// Hoy / Ayer / Anteayer / Otra… in one row. "Otra…" is a native date field
// laid over the chip (iOS only opens its picker on a direct tap) and then
// shows the day chosen (25/10).
// initial: YYYY-MM-DD to start with (today when not given).
// texts: { today, yesterday, dayBefore, other }.
export function renderDatePicker(container, { today, initial = null, onChange, texts }) {
  container.replaceChildren();
  const dates = quickDates(today);
  const row = document.createElement('div');
  row.className = 'chip-row date-row';
  const otherChip = document.createElement('label');
  otherChip.className = 'chip date-other';
  const otherText = document.createElement('span');
  const other = document.createElement('input');
  other.type = 'date';
  other.className = 'date-input';
  other.max = dates.today;
  other.setAttribute('aria-label', texts.other);
  otherChip.append(otherText, other);

  const choose = (value) => {
    const quick = Object.values(dates).includes(value);
    for (const chip of row.querySelectorAll('[data-date]')) chip.classList.toggle('is-selected', chip.dataset.date === value);
    otherChip.classList.toggle('is-selected', !quick);
    otherText.textContent = quick ? texts.other : formatShortDate(value);
    other.value = value;
    onChange(value);
  };
  for (const [key, value] of Object.entries(dates)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.date = value;
    chip.textContent = texts[key];
    chip.addEventListener('click', () => choose(value));
    row.appendChild(chip);
  }
  row.appendChild(otherChip);
  other.addEventListener('change', () => {
    if (other.value) choose(other.value);
  });
  container.append(row);
  choose(initial ?? dates.today);
}
