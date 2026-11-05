// One savings goal (tarea 25c): how far it is, what it asks a month, a form
// to put money in or take it back, and its contributions, each one editable
// or removable. «Editar meta» opens its card; «Quitar meta» (two taps)
// frees what it put aside. When reached, «Registrar compra» opens Añadir
// with the purchase filled in (tarea 25d). Everything goes to the outbox,
// so it works offline.

import { es } from '../../i18n/es.js';
import { goalProgress } from '../domain/goals.js';
import { parseAmountInput } from '../domain/money.js';
import { toIsoDate } from '../domain/movement.js';
import {
  queueContribution, queueContributionDelete, queueContributionEdit, queueGoalDelete,
} from '../data/goals.js';
import {
  createAmountInput, el, errorText, fillTexts, renderChoices, renderDatePicker, setBusy, twoTap,
} from '../ui/components.js';
import { formatAmountInput, formatDate, formatEuros, formatShortDate, labelOf } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const ERROR_TEXT = { amount_invalid: 'contributionInvalid', date_invalid: 'dateInvalid', goal_unknown: 'failed' };
const DIRECTIONS = ['in', 'out'];

// goal: the goal shown. onSaved(records, sheet, { text, undo }): a change
// was queued; undo() takes it back. onRemoved(goal): the goal was removed.
// nameOf(contribution): who made it, in a shared book ('' otherwise).
export function renderGoal(root, {
  book, fileId, goal, today = new Date(), onSaved, onRemoved, nameOf = () => '',
}) {
  const t = es.goals;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-card screen-goal">
      <div class="card-top">
        <a class="link-button back-link" data-text="back"></a>
        <button type="button" class="link-button card-remove" data-text="remove"></button>
      </div>
      <h1 class="form-title"></h1>
      <section class="goal-progress"></section>
      <form class="form goal-form" novalidate>
        <div class="chip-row goal-direction" role="group"></div>
        <div class="amount-slot"></div>
        <div class="date-picker"></div>
        <p class="form-error" role="alert"></p>
        <div class="goal-form-actions">
          <button type="submit" class="btn-primary form-submit"></button>
          <button type="button" class="link-button goal-cancel" data-text="cancel" hidden></button>
          <button type="button" class="link-button goal-delete" data-text="deleteContribution" hidden></button>
        </div>
      </form>
      <h2 class="receipt-heading" data-text="contributions"></h2>
      <ul class="receipt-list goal-contributions"></ul>
      <a class="link-button goal-edit" data-text="editGoal"></a>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.home;
  root.querySelector('.form-title').textContent = goal.name.toUpperCase();
  root.querySelector('.goal-edit').href = `${SECTION_HASH.goalNew}?id=${encodeURIComponent(goal.id)}`;
  const day = toIsoDate(today);
  const category = book.categories.find((c) => c.id === goal.categoryId);
  const contributions = book.contributions
    .filter((c) => !c.deleted && c.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  // --- Where it stands
  const progress = goalProgress(goal, book.contributions, day);
  const box = root.querySelector('.goal-progress');
  const bar = el('span', 'stat-bar goal-bar');
  const fill = el('span', 'stat-bar-fill');
  fill.style.width = `${Math.min(progress.progress, 100)}%`;
  bar.appendChild(fill);
  box.append(
    el('p', 'goal-saved', t.savedOf.replace('{saved}', formatEuros(progress.saved)).replace('{target}', formatEuros(goal.targetAmount))),
    bar,
    el('p', 'text-muted goal-detail', [
      `${t.until.replace('{date}', formatDate(goal.targetDate))}${category ? ` · ${labelOf(category)}` : ''}`,
      progress.status === 'onTrack' ? t.remaining.replace('{amount}', formatEuros(progress.remaining)) : t[progress.status],
    ].join(' · ')),
  );
  if (progress.status === 'onTrack') {
    const months = progress.monthsLeft === 1 ? t.suggestedOne : t.suggested.replace('{n}', progress.monthsLeft);
    box.appendChild(el('p', 'text-muted goal-suggested', months.replace('{amount}', formatEuros(progress.suggestedMonthly))));
  }
  if (progress.status === 'reached') {
    const buy = el('a', 'btn-primary goal-buy', t.buy);
    buy.href = `${SECTION_HASH.add}?type=expense&goal=${encodeURIComponent(goal.id)}`;
    box.appendChild(buy);
  }

  // --- Put in or take out; the same form edits a contribution.
  const form = root.querySelector('form');
  const amount = createAmountInput('amount');
  amount.setAttribute('aria-label', t.amount);
  root.querySelector('.amount-slot').appendChild(amount);
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('.form-submit');
  const cancel = root.querySelector('.goal-cancel');
  const remove = root.querySelector('.goal-delete');
  const state = { direction: 'in', date: day, editing: null };
  const paintDirection = () => renderChoices(root.querySelector('.goal-direction'),
    DIRECTIONS.map((value) => ({ value, label: value === 'in' ? t.add : t.withdraw })), {
      selected: state.direction,
      dataKey: 'direction',
      onSelect: (value) => {
        state.direction = value;
        submit.textContent = state.editing ? t.save : value === 'in' ? t.add : t.withdraw;
      },
    });
  const paintDate = () => renderDatePicker(root.querySelector('.date-picker'), {
    today,
    initial: state.date,
    onChange: (date) => { state.date = date; },
    texts: { today: es.add.today, yesterday: es.add.yesterday, dayBefore: es.add.dayBefore, other: es.add.otherDate },
  });
  const startEditing = (contribution) => {
    state.editing = contribution;
    state.direction = contribution.amount < 0 ? 'out' : 'in';
    state.date = contribution.date;
    amount.value = formatAmountInput(Math.abs(contribution.amount));
    paintDirection();
    paintDate();
    submit.textContent = t.save;
    cancel.hidden = false;
    remove.hidden = false;
    error.textContent = '';
    form.scrollIntoView?.({ block: 'center' });
  };
  paintDirection();
  paintDate();
  submit.textContent = t.add;
  cancel.addEventListener('click', () => onSaved([], 'Contributions', null));
  twoTap(remove, {
    confirm: t.confirm,
    busy: t.removing,
    work: () => queueContributionDelete(fileId, state.editing).then((deleted) => onSaved([deleted], 'Contributions', null)),
    fails: () => { error.textContent = t.failed; },
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = parseAmountInput(amount.value);
    const fields = {
      goalId: goal.id,
      amount: value === null ? Number.NaN : Math.abs(value) * (state.direction === 'out' ? -1 : 1),
      date: state.date,
    };
    const restore = setBusy(submit, t.saving);
    const { editing } = state;
    (editing ? queueContributionEdit(fileId, editing, fields, book) : queueContribution(fileId, fields, book))
      .then((saved) => {
        const text = `${fields.amount < 0 ? t.withdrawn : t.contributed} ${formatEuros(Math.abs(fields.amount))}`;
        const undo = editing
          ? () => queueContributionEdit(fileId, saved, editing, book)
          : () => queueContributionDelete(fileId, saved);
        onSaved([saved], 'Contributions', { text, undo });
      })
      .catch((err) => {
        error.textContent = errorText(err.errors ?? [], ERROR_TEXT, t) || t.failed;
        restore();
      });
  });

  // --- Its contributions, newest first; a tap edits one.
  const list = root.querySelector('.goal-contributions');
  if (contributions.length === 0) list.appendChild(el('li', 'receipt-empty text-muted', t.noContributions));
  for (const contribution of contributions) {
    const who = nameOf(contribution);
    const label = `${formatShortDate(contribution.date)}${who ? `  ${who}` : ''}`;
    const button = el('button', 'receipt-row goal-contribution');
    button.type = 'button';
    button.append(
      el('span', 'receipt-label', label),
      el('span', `receipt-amount amount-${contribution.amount < 0 ? 'expense' : 'income'}`,
        `${contribution.amount < 0 ? '' : '+'}${formatEuros(contribution.amount)}`),
    );
    button.addEventListener('click', () => startEditing(contribution));
    const item = el('li', 'receipt-line');
    item.appendChild(button);
    list.appendChild(item);
  }

  // --- Remove the goal: two taps; what it put aside is free again.
  twoTap(root.querySelector('.card-remove'), {
    confirm: t.confirm,
    busy: t.removing,
    work: () => queueGoalDelete(fileId, goal).then(onRemoved),
    fails: () => { error.textContent = t.failed; },
  });

  renderNavbar(root, { active: 'home' });
}

