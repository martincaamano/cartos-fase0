// Analysis (design §3.7) for the whole book and one month at a time:
// spending by category as grey bars, then income, expenses and savings of
// the month and the savings of the months before. Sums come from
// domain/stats.js.

import { es } from '../../i18n/es.js';
import { toIsoDate } from '../domain/movement.js';
import { monthRange, monthSummary, shiftMonth, spendingByCategory } from '../domain/stats.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';

// How many earlier months the savings list shows.
const EARLIER_MONTHS = 6;

const monthLabel = (month) => {
  const [year, number] = month.split('-');
  return `${es.months[Number(number) - 1]} ${year}`;
};

// One category: name and amount, with a bar as long as its share of the
// largest category.
function categoryRow(label, amount, largest) {
  const item = receiptLine(label, formatEuros(amount), { tone: 'expense', className: 'stat-category' });
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
      <h1 class="form-title" data-text="title"></h1>
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
  fillTexts(root, t);
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
      const label = labelOf(categoryById.get(categoryId)) || categoryId;
      categoryList.appendChild(categoryRow(label, amount, largest));
    }

    const { income, expense, savings } = monthSummary(movements, month);
    root.querySelector('.stat-summary').replaceChildren(
      receiptLine(t.income, formatEuros(income), { tone: 'income' }),
      receiptLine(t.expense, formatEuros(expense), { tone: 'expense' }),
      receiptLine(t.savings, formatEuros(savings), { className: 'stat-savings' }),
    );

    // Earlier months, newest first, never before the first one with data.
    const earlier = [];
    for (let step = 1; step <= EARLIER_MONTHS; step += 1) {
      const other = shiftMonth(month, -step);
      if (other < first) break;
      const savingsOf = formatEuros(monthSummary(movements, other).savings);
      const item = receiptLine(monthLabel(other), savingsOf, { className: 'stat-month' });
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
