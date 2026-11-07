// A category's card (Ajustes → Categorías, tarea 20c): name, emoji and type,
// to create a category or edit a saved one; "Quitar" on top (two taps). The
// type only changes while no movement uses the category. A category with
// movements is not removed from the top: its movements first go to another
// category (tarea 29), removing it or keeping it empty. Everything goes
// through the outbox (tarea 30c), so it works offline.

import { es } from '../../i18n/es.js';
import {
  categoryUses, createCategory, editCategory, moveTargets, rankAllCategories, validateCategory, validateCategoryEdit,
} from '../domain/category.js';
import { toIsoDate } from '../domain/movement.js';
import { queueCategoryMove } from '../data/category-move.js';
import { forgetExcluded } from '../storage/analysis-exclude.js';
import { replaceTransferCategory } from '../storage/transfer-categories.js';
import { queueCategory, queueCategoryEdit, queueCategoryRemove } from '../data/book-items.js';
import { fillTexts, renderChoices } from '../ui/dom.js';
import { errorText, reportFailure, setBusy, twoTap } from '../ui/feedback.js';
import { setupEmojiPicker } from '../ui/inputs.js';
import { labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const SUGGESTED_EMOJIS = ['🛍️', '☕', '🐶', '🎁', '✈️', '🏋️'];

// Validation codes → texts (es.categoryAdmin), first one wins.
const ERROR_TEXT = { name_required: 'nameRequired', name_taken: 'nameTaken', kind_in_use: 'kindLocked' };

// category: the category to edit, or null for a new one. onDone: after a
// change. shared: the book is shared (moving warns it touches everyone's
// movements). onMoved(changed): its movements went to another category.
export function renderCategoryCard(root, {
  book, fileId, category = null, onDone, shared = false, onMoved = () => {}, today = new Date(),
  storage = globalThis.localStorage,
}) {
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
      <section class="card-move" hidden>
        <h2 class="receipt-heading" data-text="moveTitle"></h2>
        <label class="line">
          <span class="line-label" data-text="moveTo"></span>
          <select class="line-select card-move-target"></select>
        </label>
        <p class="text-muted form-note card-move-note"></p>
        <p class="form-error card-move-error" role="alert"></p>
        <button type="button" class="btn-primary card-move-remove" data-text="moveAndRemove"></button>
        <button type="button" class="link-button card-move-keep" data-text="moveAndKeep"></button>
      </section>
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
  if (category && uses > 0) paintMove();
  if (category) {
    const note = uses === 0 ? t.usesNone : uses === 1 ? t.usesOne : t.uses.replace('{n}', uses);
    root.querySelector('.card-uses').textContent = kindLocked ? `${note} ${t.kindLocked}` : note;
  }

  const failed = (err) => {
    reportFailure('categoryChange', err);
    error.textContent = t.failed;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { name: name.value, emoji: emoji.value, kind };
    const errors = category
      ? validateCategoryEdit(editCategory(category, fields), category, book)
      : validateCategory(createCategory(fields), book.categories);
    error.textContent = errorText(errors, ERROR_TEXT, t);
    if (error.textContent) return;

    const restore = setBusy(submit, category ? t.saving : t.creating);
    (category ? queueCategoryEdit(fileId, category, fields, book) : queueCategory(fileId, fields, book.categories))
      .then(onDone)
      .catch((err) => {
        failed(err);
        restore();
      });
  });

  // --- Its movements to another category (tarea 29): to remove it, or to
  // merge it and keep it empty.
  function paintMove() {
    const section = root.querySelector('.card-move');
    section.hidden = false;
    const select = section.querySelector('.card-move-target');
    const targets = new Set(moveTargets(category, book.categories, book.movements).map((c) => c.id));
    const ranked = rankAllCategories(book.categories, book.movements, toIsoDate(today)).filter((c) => targets.has(c.id));
    const choose = document.createElement('option');
    choose.value = '';
    choose.textContent = t.moveChoose;
    select.replaceChildren(choose, ...ranked.map((c) => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = labelOf(c);
      return option;
    }));
    const note = section.querySelector('.card-move-note');
    const moveError = section.querySelector('.card-move-error');
    const target = () => book.categories.find((c) => c.id === select.value) ?? null;
    const paintNote = () => {
      const chosen = target();
      const count = uses === 1 ? t.moveOne : t.moveMany.replace('{n}', uses);
      note.textContent = [
        chosen ? `${count} ${t.moveInto.replace('{name}', labelOf(chosen))}` : count,
        shared ? t.moveShared : '',
      ].filter(Boolean).join(' ');
      moveError.textContent = '';
    };
    select.addEventListener('change', paintNote);
    paintNote();
    const move = (remove) => () => {
      const chosen = target();
      return queueCategoryMove(fileId, book, category, chosen, { remove }).then((changed) => {
        replaceTransferCategory(storage, category.id, chosen.id);
        if (remove) forgetExcluded(storage, fileId, category.id);
        onMoved(changed);
      });
    };
    const before = () => {
      if (target()) return true;
      moveError.textContent = t.moveChooseFirst;
      return false;
    };
    for (const [selector, remove] of [['.card-move-remove', true], ['.card-move-keep', false]]) {
      twoTap(section.querySelector(selector), {
        confirm: t.confirmRemove,
        busy: t.moving,
        before,
        work: move(remove),
        fails: (err) => {
          reportFailure('categoryMove', err);
          moveError.textContent = t.failed;
        },
      });
    }
  }

  if (category && uses === 0) {
    // Two taps: the first one asks, the second one removes.
    const remove = root.querySelector('.card-remove');
    remove.hidden = false;
    twoTap(remove, {
      confirm: t.confirmRemove,
      busy: t.removing,
      work: () => queueCategoryRemove(fileId, category).then(onDone),
      fails: failed,
    });
  }

  renderNavbar(root, { active: 'settings' });
}
