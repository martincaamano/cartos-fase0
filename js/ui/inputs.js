// Form inputs shared by several screens: the amount field, the emoji
// picker and the account form (onboarding, Ajustes → Cuentas, a new book).

import { es } from '../../i18n/es.js';
import { createAccount, validateAccount } from '../domain/account.js';
import { parseAmountInput } from '../domain/money.js';
import { fillTexts } from './dom.js';
import { failureText, reportFailure, setBusy } from './feedback.js';
import { formatAmountInput } from './format.js';

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

// Name, emoji and initial balance of a new account (Onboarding and
// Ajustes → Cuentas). Validates with domain/ and hands the fields to
// onSubmit, which returns a promise; while it runs the button says
// texts.creating, and if it fails the form says texts.failed (or
// texts.offline when needsConnection and there is no network).
// existing: the book's accounts, to reject a repeated name.
// texts: nameLabel, emojiLabel, balanceLabel, submit, creating, failed, nameRequired, nameTaken,
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
  emoji.setAttribute('aria-label', texts.emojiLabel);
  const balance = createAmountInput('balance');
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
      reportFailure('accountCreate', err);
      error.textContent = needsConnection ? failureText(texts.failed, texts.offline) : texts.failed;
      restore();
    });
  });
  container.appendChild(form);
}
