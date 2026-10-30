// A category's card (Ajustes → Categorías, tarea 20c): name, emoji and type,
// to create a category or edit a saved one; "Quitar" on top (two taps). The
// type only changes while no movement uses the category. Goes straight to
// the Sheet, so it needs a connection.

import { es } from '../../i18n/es.js';
import { categoryUses, createCategory, editCategory, validateCategory, validateCategoryEdit } from '../domain/category.js';
import { addCategory, removeCategory, updateCategory } from '../data/book.js';
import { fillTexts, setupEmojiPicker } from '../ui/components.js';
import { labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const SUGGESTED_EMOJIS = ['🛍️', '☕', '🐶', '🎁', '✈️', '🏋️'];

// category: the category to edit, or null for a new one. onDone: after a
// change.
export function renderCategoryCard(root, { book, fileId, category = null, onDone }) {
  const t = es.categoryAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-card">
      <div class="card-top">
        <a class="link-button back-link" data-text="backList"></a>
        <button type="button" class="link-button card-remove" data-text="remove" hidden></button>
      </div>
      <h1 class="form-title"></h1>
      <p class="text-muted form-note card-uses"></p>
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
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.categories;
  root.querySelector('.form-title').textContent = category ? labelOf(category).toUpperCase() : t.newTitle;

  const form = root.querySelector('form');
  const { name, emoji } = form.elements;
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  const idle = category ? t.save : t.create;
  submit.textContent = idle;
  if (category) {
    name.value = category.name;
    emoji.value = category.emoji;
  }
  emoji.setAttribute('aria-label', t.emoji);
  setupEmojiPicker(root.querySelector('.emoji-row'), emoji, SUGGESTED_EMOJIS);

  const uses = category ? categoryUses(category, book.movements) : 0;
  const kindLocked = uses > 0;
  let kind = category?.kind ?? 'expense';
  const kindRow = root.querySelector('.kind-row');
  for (const [value, text] of [['expense', es.add.expense], ['income', es.add.income]]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.kind = value;
    chip.textContent = text;
    chip.disabled = kindLocked && value !== kind;
    chip.addEventListener('click', () => {
      kind = value;
      for (const other of kindRow.children) other.classList.toggle('is-selected', other.dataset.kind === kind);
    });
    kindRow.appendChild(chip);
  }
  for (const chip of kindRow.children) chip.classList.toggle('is-selected', chip.dataset.kind === kind);
  if (category) {
    const note = uses === 0 ? t.usesNone : uses === 1 ? t.usesOne : t.uses.replace('{n}', uses);
    root.querySelector('.card-uses').textContent = kindLocked ? `${note} ${t.kindLocked}` : note;
  }

  const failed = (err) => {
    console.warn('Category change failed', err);
    error.textContent = navigator.onLine ? t.failed : t.offline;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { name: name.value, emoji: emoji.value, kind };
    const errors = category
      ? validateCategoryEdit(editCategory(category, fields), category, book)
      : validateCategory(createCategory(fields), book.categories);
    if (errors.includes('name_required')) { error.textContent = t.nameRequired; return; }
    if (errors.includes('name_taken')) { error.textContent = t.nameTaken; return; }
    if (errors.includes('kind_in_use')) { error.textContent = t.kindLocked; return; }
    if (!navigator.onLine) { error.textContent = t.offline; return; }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = category ? t.saving : t.creating;
    (category ? updateCategory(fileId, category, fields, book) : addCategory(fileId, fields, book.categories))
      .then(onDone)
      .catch((err) => {
        failed(err);
        submit.disabled = false;
        submit.textContent = idle;
      });
  });

  if (category) {
    // Two taps: the first one asks, the second one removes.
    const remove = root.querySelector('.card-remove');
    remove.hidden = false;
    let armed = false;
    remove.addEventListener('click', () => {
      if (!navigator.onLine) { error.textContent = t.offline; return; }
      if (!armed) {
        armed = true;
        remove.textContent = t.confirmRemove;
        return;
      }
      remove.disabled = true;
      remove.textContent = t.removing;
      removeCategory(fileId, category).then(onDone).catch((err) => {
        failed(err);
        remove.disabled = false;
        armed = false;
        remove.textContent = t.remove;
      });
    });
  }

  renderNavbar(root, { active: 'settings' });
}
