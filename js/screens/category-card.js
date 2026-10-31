// A category's card (Ajustes → Categorías, tarea 20c): name, emoji and type,
// to create a category or edit a saved one; "Quitar" on top (two taps). The
// type only changes while no movement uses the category. Goes straight to
// the Sheet, so it needs a connection.

import { es } from '../../i18n/es.js';
import { categoryUses, createCategory, editCategory, validateCategory, validateCategoryEdit } from '../domain/category.js';
import { addCategory, removeCategory, updateCategory } from '../data/book.js';
import {
  errorText, failureText, fillTexts, renderChoices, setBusy, setupEmojiPicker, twoTap,
} from '../ui/components.js';
import { labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const SUGGESTED_EMOJIS = ['🛍️', '☕', '🐶', '🎁', '✈️', '🏋️'];

// Validation codes → texts (es.categoryAdmin), first one wins.
const ERROR_TEXT = { name_required: 'nameRequired', name_taken: 'nameTaken', kind_in_use: 'kindLocked' };

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
  submit.textContent = category ? t.save : t.create;
  if (category) {
    name.value = category.name;
    emoji.value = category.emoji;
  }
  emoji.setAttribute('aria-label', t.emoji);
  setupEmojiPicker(root.querySelector('.emoji-row'), emoji, SUGGESTED_EMOJIS);

  const uses = category ? categoryUses(category, book.movements) : 0;
  const kindLocked = uses > 0;
  let kind = category?.kind ?? 'expense';
  renderChoices(root.querySelector('.kind-row'), [['expense', es.add.expense], ['income', es.add.income]]
    .map(([value, label]) => ({ value, label, disabled: kindLocked && value !== kind })), {
    selected: kind,
    dataKey: 'kind',
    onSelect: (value) => { kind = value; },
  });
  if (category) {
    const note = uses === 0 ? t.usesNone : uses === 1 ? t.usesOne : t.uses.replace('{n}', uses);
    root.querySelector('.card-uses').textContent = kindLocked ? `${note} ${t.kindLocked}` : note;
  }

  const failed = (err) => {
    console.warn('Category change failed', err);
    error.textContent = failureText(t.failed, t.offline);
  };
  const offline = () => {
    if (navigator.onLine) return false;
    error.textContent = t.offline;
    return true;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { name: name.value, emoji: emoji.value, kind };
    const errors = category
      ? validateCategoryEdit(editCategory(category, fields), category, book)
      : validateCategory(createCategory(fields), book.categories);
    error.textContent = errorText(errors, ERROR_TEXT, t);
    if (error.textContent || offline()) return;

    const restore = setBusy(submit, category ? t.saving : t.creating);
    (category ? updateCategory(fileId, category, fields, book) : addCategory(fileId, fields, book.categories))
      .then(onDone)
      .catch((err) => {
        failed(err);
        restore();
      });
  });

  if (category) {
    // Two taps: the first one asks, the second one removes.
    const remove = root.querySelector('.card-remove');
    remove.hidden = false;
    twoTap(remove, {
      confirm: t.confirmRemove,
      busy: t.removing,
      before: () => !offline(),
      work: () => removeCategory(fileId, category).then(onDone),
      fails: failed,
    });
  }

  renderNavbar(root, { active: 'settings' });
}
