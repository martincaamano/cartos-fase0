// Shared form pieces: template texts, emoji picker, amount field, account
// form, category grid and quick date picker. They touch the DOM only when
// called.

import { es } from '../../i18n/es.js';
import { quickDates } from '../domain/movement.js';
import { countAmount, parseAmountInput } from '../domain/money.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { formatAmountInput, formatEuros, formatShortDate } from './format.js';

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

// Folding (tarea 23): a block grows from nothing to its height when it
// opens, and shrinks back when it closes. Durations and easing come from
// the tokens (--motion, --ease), so CSS and JS move alike. With reduced
// motion nothing moves.
const stillMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function motionToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function resize(node, from, to) {
  node.style.overflow = 'hidden';
  const run = node.animate([from, to], {
    duration: parseFloat(motionToken('--motion', '260ms')),
    easing: motionToken('--ease', 'ease-out'),
  });
  return run.finished.catch(() => {}).then(() => { node.style.overflow = ''; });
}

// A block just shown (or just inserted, once it is on screen) unfolds.
export function unfold(node) {
  if (!node?.animate || stillMotion()) return;
  resize(node, { height: '0px', opacity: 0 }, { height: `${node.scrollHeight}px`, opacity: 1 });
}

// A block about to be hidden or removed folds up; resolves when it has, so
// the caller hides or removes it then.
export function foldAway(node) {
  if (!node?.animate || stillMotion()) return Promise.resolve();
  return resize(node, { height: `${node.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 });
}

// An amount that changed counts from the old one to the new one (tarea 23),
// so the change is seen. from: what was shown before, or null (shown at
// once, as when there was none or nothing moves). format: euros → text.
const COUNT_MS = 600;

// startedAt: when the count began (a repaint in the middle carries on).
export function showAmount(node, value, { from = null, format = formatEuros, startedAt = null } = {}) {
  if (from === null || from === value || stillMotion() || !globalThis.requestAnimationFrame) {
    node.textContent = format(value);
    return;
  }
  const start = startedAt ?? performance.now();
  const step = (now) => {
    const progress = (now - start) / COUNT_MS;
    node.textContent = format(countAmount(from, value, progress));
    if (progress < 1 && node.isConnected) requestAnimationFrame(step);
  };
  node.textContent = format(countAmount(from, value, (performance.now() - start) / COUNT_MS));
  requestAnimationFrame(step);
}

// An amount kept in `seen` (key → { value, from, start }) across paints:
// it counts when it changed since last shown, and a repaint while it counts
// (fresh data after a sync) carries on instead of jumping to the end.
export function showSeenAmount(node, seen, key, value, options = {}) {
  const now = performance.now();
  const last = seen.get(key);
  if (last && last.value !== value) seen.set(key, { value, from: last.value, start: now });
  else if (!last) seen.set(key, { value, from: null, start: now });
  const { from, start } = seen.get(key);
  const counting = from !== null && now - start < COUNT_MS;
  showAmount(node, value, { ...options, from: counting ? from : null, startedAt: start });
}

// How long a toast stays (tarea 23).
export const TOAST_MS = 5000;

// A short notice on top of the screen («✓ 12,50 € · 🛒 Supermercado»), with
// an optional action (Deshacer). It lives outside the screen, so a repaint
// keeps it; a new one replaces it. onAction runs once and closes it.
export function showToast({ text, action = '', onAction = null, duration = TOAST_MS }) {
  document.querySelector('.toast')?.remove();
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.appendChild(el('span', 'toast-text', text));
  const close = () => {
    clearTimeout(timer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 200);
  };
  if (action && onAction) {
    const button = el('button', 'link-button toast-action', action);
    button.type = 'button';
    button.addEventListener('click', () => {
      close();
      onAction();
    });
    toast.appendChild(button);
  }
  const timer = setTimeout(close, duration);
  document.body.appendChild(toast);
  return close;
}

// How long «¿Seguro?» waits for the second tap (tarea 23).
export const CONFIRM_MS = 5000;

// Two taps (Borrar, Quitar): the first one asks with `confirm`, the second
// one shows `busy` and runs work(), a promise. Without a second tap within
// CONFIRM_MS the button goes back as at first. If work fails the button is
// back as at first and fails(err) says why. before() may stop a tap
// (returns false), e.g. when offline.
export function twoTap(button, { confirm, busy, work, fails = () => {}, before = () => true }) {
  const idle = button.textContent;
  let armed = false;
  let timer = null;
  const disarm = () => {
    armed = false;
    button.textContent = idle;
  };
  button.addEventListener('click', () => {
    if (!before()) return;
    if (!armed) {
      armed = true;
      button.textContent = confirm;
      timer = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    clearTimeout(timer);
    const restore = setBusy(button, busy);
    work().catch((err) => {
      fails(err);
      restore();
      disarm();
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

// A block that just changed size grows (or shrinks) from `before`, its
// height a moment ago, to its height now (tarea 28).
function resizedFrom(node, before) {
  if (!node?.animate || stillMotion()) return;
  const after = node.offsetHeight;
  if (after !== before) resize(node, { height: `${before}px` }, { height: `${after}px` });
}

// How many tiles the category grid shows before «Ver todas» (tarea 28).
export const CATEGORY_TILES = 8;

// categories: already ranked (rankCategories). Shows the first ones as a
// grid of `gridSize` tiles; when there are more, the last tile is «Ver
// todas», which grows the same grid with the rest, in the same order, and
// shows a search box above it that filters the tiles; then the tile is «Ver
// menos». A selected category beyond the first ones opens it grown.
// texts: { seeAll, seeLess, search, empty }.
export function renderCategoryPicker(container, { categories, selectedId = null, onSelect, gridSize = CATEGORY_TILES, texts }) {
  container.replaceChildren();
  let selected = selectedId;
  const mark = () => {
    for (const button of container.querySelectorAll('.category-option')) {
      button.classList.toggle('is-selected', button.dataset.id === selected);
    }
  };
  const select = (category) => {
    selected = category.id;
    mark();
    onSelect(category);
  };

  const grid = document.createElement('div');
  grid.className = 'category-grid';
  const more = categories.length > gridSize;
  const shown = more ? gridSize - 1 : gridSize;
  for (const category of categories.slice(0, shown)) grid.appendChild(categoryButton(category, select));
  container.appendChild(grid);

  if (more) {
    const rest = categories.slice(shown).map((category) => categoryButton(category, select));
    const search = document.createElement('input');
    search.className = 'field-input category-search';
    search.type = 'search';
    search.placeholder = texts.search;
    search.setAttribute('aria-label', texts.search);
    search.hidden = true;
    const empty = document.createElement('p');
    empty.className = 'text-muted category-empty';
    empty.textContent = texts.empty;
    empty.hidden = true;
    container.prepend(search);
    container.append(empty);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'category-option category-more';
    const dots = document.createElement('span');
    dots.className = 'category-emoji';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '···';
    const label = document.createElement('span');
    label.className = 'category-name';
    toggle.append(dots, label);
    grid.appendChild(toggle);

    let open = false;
    const filter = () => {
      const query = search.value.trim().toLocaleLowerCase('es');
      let matches = 0;
      for (const button of grid.querySelectorAll('.category-option:not(.category-more)')) {
        const hit = button.textContent.toLocaleLowerCase('es').includes(query);
        button.hidden = !hit;
        if (hit) matches += 1;
      }
      empty.hidden = matches > 0;
    };
    const setOpen = (value, { animate = true } = {}) => {
      const before = grid.offsetHeight;
      open = value;
      if (open) toggle.before(...rest);
      else {
        for (const button of rest) button.remove();
        search.value = '';
      }
      filter();
      search.hidden = !open;
      label.textContent = open ? texts.seeLess : texts.seeAll;
      toggle.setAttribute('aria-expanded', String(open));
      mark();
      if (animate) resizedFrom(grid, before);
    };
    search.addEventListener('input', filter);
    toggle.addEventListener('click', () => setOpen(!open));
    // A category chosen before (editing) that is not among the first ones.
    setOpen(rest.some((button) => button.dataset.id === selected), { animate: false });
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
