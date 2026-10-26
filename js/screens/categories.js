// Categories (inside Settings): the book's categories by type, removing
// own and default ones (never Transferencia) and creating new ones. Changes
// go straight to the Sheet, so they need a connection.

import { es } from '../../i18n/es.js';
import { canRemoveCategory, createCategory, validateCategory } from '../domain/category.js';
import { activeOnly } from '../domain/active.js';
import { addCategory, removeCategory } from '../data/book.js';
import { setupEmojiPicker } from '../ui/components.js';
import { labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const SUGGESTED_EMOJIS = ['🛍️', '☕', '🐶', '🎁', '✈️', '🏋️'];

function categoryLine(category, { onRemove, t }) {
  const item = document.createElement('li');
  item.className = 'receipt-line receipt-row';
  const label = document.createElement('span');
  label.className = 'receipt-label';
  label.textContent = labelOf(category);
  item.appendChild(label);
  if (canRemoveCategory(category)) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-button';
    remove.textContent = t.remove;
    remove.addEventListener('click', () => onRemove(category));
    item.appendChild(remove);
  } else {
    const fixed = document.createElement('span');
    fixed.className = 'text-muted';
    fixed.textContent = t.fixed;
    item.appendChild(fixed);
  }
  return item;
}

export function renderCategories(root, { book, fileId, onChanged }) {
  const t = es.categoryAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link"></a>
      <h1 class="form-title"></h1>
      <p class="form-error categories-error" role="alert"></p>
      <h2 class="receipt-heading" data-text="expenses"></h2>
      <ul class="receipt-list list-expense"></ul>
      <h2 class="receipt-heading" data-text="incomes"></h2>
      <ul class="receipt-list list-income"></ul>
      <h2 class="receipt-heading" data-text="newTitle"></h2>
      <form class="form" novalidate>
        <label class="field">
          <span class="field-label" data-text="name"></span>
          <input class="field-input" name="name" maxlength="30" autocomplete="off">
        </label>
        <div class="field">
          <span class="field-label" data-text="emoji"></span>
          <div class="emoji-row"></div>
          <input class="field-input emoji-input" name="emoji" maxlength="8">
        </div>
        <div class="field">
          <span class="field-label" data-text="kind"></span>
          <div class="chip-row kind-row"></div>
        </div>
        <p class="form-error form-error-new" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  for (const label of root.querySelectorAll('[data-text]')) label.textContent = t[label.dataset.text];
  const back = root.querySelector('.back-link');
  back.href = SECTION_HASH.settings;
  back.textContent = t.back;
  root.querySelector('.form-title').textContent = t.title;
  const listError = root.querySelector('.categories-error');

  const fail = (target, err) => {
    target.textContent = !navigator.onLine ? t.offline : t.failed;
    console.warn('Category change failed', err);
  };

  const onRemove = (category) => {
    if (!navigator.onLine) { listError.textContent = t.offline; return; }
    if (!window.confirm(t.confirmRemove.replace('{name}', category.name))) return;
    removeCategory(fileId, category).then(onChanged).catch((err) => fail(listError, err));
  };

  const active = activeOnly(book.categories);
  for (const category of active) {
    const list = root.querySelector(category.kind === 'income' ? '.list-income' : '.list-expense');
    list.appendChild(categoryLine(category, { onRemove, t }));
  }

  const form = root.querySelector('form');
  const error = root.querySelector('.form-error-new');
  const submit = root.querySelector('.form-submit');
  submit.textContent = t.create;
  setupEmojiPicker(root.querySelector('.emoji-row'), form.elements.emoji, SUGGESTED_EMOJIS);

  let kind = 'expense';
  const kindRow = root.querySelector('.kind-row');
  for (const [value, text] of [['expense', es.add.expense], ['income', es.add.income]]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.kind = value;
    chip.textContent = text;
    chip.addEventListener('click', () => {
      kind = value;
      for (const other of kindRow.children) other.classList.toggle('is-selected', other.dataset.kind === kind);
    });
    kindRow.appendChild(chip);
  }
  kindRow.firstElementChild.classList.add('is-selected');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { name: form.elements.name.value, emoji: form.elements.emoji.value, kind };
    const errors = validateCategory(createCategory(fields), book.categories);
    if (errors.includes('name_required')) { error.textContent = t.nameRequired; return; }
    if (errors.includes('name_taken')) { error.textContent = t.nameTaken; return; }
    if (!navigator.onLine) { error.textContent = t.offline; return; }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t.creating;
    addCategory(fileId, fields, book.categories)
      .then(onChanged)
      .catch((err) => {
        fail(error, err);
        submit.disabled = false;
        submit.textContent = t.create;
      });
  });

  renderNavbar(root, { active: 'settings' });
}
