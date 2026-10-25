// Analysis (design §3.7) for the whole book and one month at a time:
// spending by category as grey bars, then income, expenses and savings of
// the month and the savings of the months before. Sums come from
// domain/stats.js.

import { es } from '../../i18n/es.js';
import { toIsoDate } from '../domain/movement.js';
import { monthRange, monthSummary, shiftMonth, spendingByCategory } from '../domain/stats.js';
import { formatEuros } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// How many earlier months the savings list shows.
const EARLIER_MONTHS = 6;

const monthLabel = (month) => {
  const [year, number] = month.split('-');
  return `${es.months[Number(number) - 1]} ${year}`;
};

function row(left, right, rightClass = '') {
  const item = document.createElement('li');
  item.className = 'receipt-line receipt-row';
  const start = document.createElement('span');
  start.className = 'receipt-label';
  start.textContent = left;
  const end = document.createElement('span');
  end.className = `receipt-amount ${rightClass}`.trim();
  end.textContent = right;
  item.append(start, end);
  return item;
}

// One category: name and amount, with a bar as long as its share of the
// largest category.
function categoryRow(label, amount, largest) {
  const item = row(label, formatEuros(amount), 'amount-expense');
  item.classList.add('stat-category');
  const bar = document.createElement('span');
  bar.className = 'stat-bar';
  const fill = document.createElement('span');
  fill.className = 'stat-bar-fill';
  fill.style.width = `${Math.max(1, Math.round((amount / largest) * 100))}%`;
  bar.appendChild(fill);
  item.appendChild(bar);
  return item;
}

// book: movements already include the pending ones (mergePending).
// params.month: YYYY-MM to show; the current month when missing or out of
// range.
export function renderAnalysis(root, { book, params = {}, today = new Date() }) {
  const t = es.analysis;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title"></h1>
      <div class="month-picker">
        <button type="button" class="month-step" data-step="-1">‹</button>
        <span class="month-label"></span>
        <button type="button" class="month-step" data-step="1">›</button>
      </div>
      <h2 class="receipt-heading" data-text="byCategory"></h2>
      <ul class="receipt-list stat-categories"></ul>
      <h2 class="receipt-heading" data-text="summary"></h2>
      <ul class="receipt-list stat-summary"></ul>
      <h2 class="receipt-heading stat-earlier-heading" data-text="earlier"></h2>
      <ul class="receipt-list stat-earlier"></ul>
    </main>
  `;
  for (const node of root.querySelectorAll('[data-text]')) node.textContent = t[node.dataset.text];
  root.querySelector('.form-title').textContent = t.title;
  const [previous, next] = root.querySelectorAll('.month-step');
  previous.setAttribute('aria-label', t.previous);
  next.setAttribute('aria-label', t.next);

  const { categories, movements } = book;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const { first, last } = monthRange(movements, toIsoDate(today));
  const valid = (month) => /^\d{4}-\d{2}$/.test(month ?? '') && month >= first && month <= last;
  let month = valid(params.month) ? params.month : last;

  const paint = () => {
    root.querySelector('.month-label').textContent = monthLabel(month);
    previous.disabled = month <= first;
    next.disabled = month >= last;

    const spending = spendingByCategory(movements, month);
    const categoryList = root.querySelector('.stat-categories');
    categoryList.replaceChildren();
    if (spending.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'receipt-empty text-muted';
      empty.textContent = t.noSpending;
      categoryList.appendChild(empty);
    }
    const largest = spending[0]?.amount ?? 0;
    for (const { categoryId, amount } of spending) {
      const category = categoryById.get(categoryId);
      const label = category ? `${category.emoji} ${category.name}`.trim() : categoryId;
      categoryList.appendChild(categoryRow(label, amount, largest));
    }

    const { income, expense, savings } = monthSummary(movements, month);
    const savingsRow = row(t.savings, formatEuros(savings));
    savingsRow.classList.add('stat-savings');
    root.querySelector('.stat-summary').replaceChildren(
      row(t.income, formatEuros(income), 'amount-income'),
      row(t.expense, formatEuros(expense), 'amount-expense'),
      savingsRow,
    );

    // Earlier months, newest first, never before the first one with data.
    const earlier = [];
    for (let step = 1; step <= EARLIER_MONTHS; step += 1) {
      const other = shiftMonth(month, -step);
      if (other < first) break;
      const item = row(monthLabel(other), formatEuros(monthSummary(movements, other).savings));
      item.classList.add('stat-month');
      item.setAttribute('role', 'button');
      item.addEventListener('click', () => go(other));
      earlier.push(item);
    }
    root.querySelector('.stat-earlier').replaceChildren(...earlier);
    root.querySelector('.stat-earlier-heading').hidden = earlier.length === 0;
  };

  // The month lives in the URL so a repaint after a sync keeps it; replacing
  // the hash does not fire hashchange, so the screen repaints itself.
  const go = (other) => {
    month = other;
    history.replaceState(null, '', `${SECTION_HASH.analysis}?month=${month}`);
    paint();
  };
  previous.addEventListener('click', () => go(shiftMonth(month, -1)));
  next.addEventListener('click', () => go(shiftMonth(month, 1)));
  paint();

  renderNavbar(root, { active: 'analysis' });
}
