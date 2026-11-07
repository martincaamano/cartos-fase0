// A savings goal's card (tarea 25c): name, what it will be spent on, the
// target amount and date, to create a goal or edit one. It goes to the
// outbox like a movement, so it works offline.

import { es } from '../../i18n/es.js';
import { parseAmountInput } from '../domain/money.js';
import { rankCategories } from '../domain/category.js';
import { toIsoDate } from '../domain/movement.js';
import { queueGoal, queueGoalEdit } from '../data/goals.js';
import {
  createAmountInput, errorText, fillTexts, renderCategoryPicker, setBusy,
} from '../ui/components.js';
import { formatAmountInput } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// Validation codes → texts (es.goals), first one wins.
const ERROR_TEXT = {
  name_required: 'nameRequired', amount_invalid: 'amountInvalid', date_invalid: 'dateInvalid', category_unknown: 'categoryUnknown',
};

// goal: the goal to edit, or null for a new one. onSaved(goal): after it was
// queued.
export function renderGoalCard(root, { book, fileId, goal = null, today = new Date(), onSaved }) {
  const t = es.goals;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-card">
      <div class="card-top">
        <a class="link-button back-link"></a>
      </div>
      <h1 class="form-title"></h1>
      <form class="form" novalidate>
        <label class="field">
          <span class="field-label" data-text="name"></span>
          <input class="field-input" name="name" maxlength="40" autocomplete="off">
        </label>
        <div class="field">
          <span class="field-label" data-text="target"></span>
          <div class="amount-slot"></div>
        </div>
        <label class="field">
          <span class="field-label" data-text="targetDate"></span>
          <input class="field-input" type="date" name="targetDate">
        </label>
        <div class="field">
          <span class="field-label" data-text="category"></span>
          <div class="category-picker"></div>
        </div>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit"></button>
      </form>
    </main>
  `;
  fillTexts(root, t);
  const back = root.querySelector('.back-link');
  back.href = goal ? `${SECTION_HASH.goal}?id=${encodeURIComponent(goal.id)}` : SECTION_HASH.home;
  back.textContent = goal ? t.backGoal : t.back;
  root.querySelector('.form-title').textContent = goal ? goal.name.toUpperCase() : t.newTitle;

  const form = root.querySelector('form');
  const amount = createAmountInput('targetAmount');
  amount.setAttribute('aria-label', t.target);
  root.querySelector('.amount-slot').appendChild(amount);
  const { name, targetDate } = form.elements;
  name.placeholder = t.namePlaceholder;
  targetDate.min = toIsoDate(today);
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  submit.textContent = goal ? t.save : t.create;

  let categoryId = goal?.categoryId ?? null;
  if (goal) {
    name.value = goal.name;
    amount.value = formatAmountInput(goal.targetAmount);
    targetDate.value = goal.targetDate;
  }
  renderCategoryPicker(root.querySelector('.category-picker'), {
    categories: rankCategories(book.categories, book.movements, 'expense', toIsoDate(today)),
    selectedId: categoryId,
    onSelect: (category) => { categoryId = category.id; },
    texts: { seeAll: es.add.seeAll, seeLess: es.add.seeLess, search: es.add.search, empty: es.add.noMatches },
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: name.value,
      targetAmount: parseAmountInput(amount.value) ?? Number.NaN,
      targetDate: targetDate.value,
      categoryId,
    };
    const restore = setBusy(submit, t.saving);
    (goal ? queueGoalEdit(fileId, goal, fields, book) : queueGoal(fileId, fields, book))
      .then(onSaved)
      .catch((err) => {
        error.textContent = errorText(err.errors ?? [], ERROR_TEXT, t) || t.failed;
        restore();
      });
  });

  renderNavbar(root, { active: 'home' });
}
