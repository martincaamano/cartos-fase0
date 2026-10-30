// Shared form pieces: template texts, emoji picker, amount field, account
// form, category grid and quick date picker. They touch the DOM only when
// called.

import { es } from '../../i18n/es.js';
import { quickDates } from '../domain/movement.js';
import { parseAmountInput } from '../domain/money.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { formatShortDate } from './format.js';

// Fills every [data-text="key"] inside root with texts[key].
export function fillTexts(root, texts) {
  for (const node of root.querySelectorAll('[data-text]')) node.textContent = texts[node.dataset.text];
}

// Emojis offered when creating an account (Onboarding and Ajustes → Cuentas).
export const ACCOUNT_EMOJIS = Object.freeze(['🏦', '💶', '💳', '🐷', '💼', '🏠']);

// Row of suggested emojis that fill `input`; typing any other emoji works too.
export function setupEmojiPicker(row, input, suggestions) {
  input.value = input.value || suggestions[0];
  const markSelected = () => {
    for (const button of row.children) button.classList.toggle('is-selected', button.textContent === input.value);
  };
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-option';
    button.textContent = suggestion;
    button.addEventListener('click', () => {
      input.value = suggestion;
      markSelected();
    });
    row.appendChild(button);
  }
  input.addEventListener('input', markSelected);
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
export function renderAccountForm(container, { existing = [], texts, needsConnection = false, check = () => '', onSubmit }) {
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
  setupEmojiPicker(form.querySelector('.emoji-row'), emoji, ACCOUNT_EMOJIS);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: name.value,
      emoji: emoji.value,
      initialBalance: balance.value.trim() === '' ? 0 : parseAmountInput(balance.value),
    };
    const problem = check() || accountErrorText(validateAccount(createAccount(fields), existing), texts);
    if (problem) { error.textContent = problem; return; }
    if (needsConnection && !navigator.onLine) { error.textContent = texts.offline; return; }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = texts.creating;
    onSubmit(fields).catch((err) => {
      console.warn('Account creation failed', err);
      error.textContent = needsConnection && !navigator.onLine ? texts.offline : texts.failed;
      submit.disabled = false;
      submit.textContent = texts.submit;
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
