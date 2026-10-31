// Categories (inside Settings, tarea 20c): the book's categories by type,
// most used first, each one opening its card, and "+ Nueva categoría" at
// the end. The less used expenses fold behind "+ N más". Transferencia is
// fixed and has no card.

import { es } from '../../i18n/es.js';
import { rankCategories, TRANSFER_CATEGORY_ID } from '../domain/category.js';
import { labelOf } from '../ui/format.js';
import { appendFolded, receiptLine } from '../ui/receipt.js';
import { fillTexts } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// Expenses shown before "+ N más".
const SHOWN_EXPENSES = 8;

const cardLine = (category) => receiptLine(labelOf(category), '›', {
  href: `${SECTION_HASH.categoryEdit}?id=${encodeURIComponent(category.id)}`,
  className: 'category-line',
});

export function renderCategories(root, { book }) {
  const t = es.categoryAdmin;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <h2 class="receipt-heading" data-text="expenses"></h2>
      <ul class="receipt-list list-expense"></ul>
      <h2 class="receipt-heading" data-text="incomes"></h2>
      <ul class="receipt-list list-income"></ul>
      <ul class="receipt-list list-new"></ul>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const { categories, movements } = book;
  // A category of both kinds is listed once, with the expenses.
  const expenses = rankCategories(categories, movements, 'expense');
  const incomes = rankCategories(categories, movements, 'income').filter((c) => c.kind !== 'both');

  const expenseList = root.querySelector('.list-expense');
  appendFolded(expenseList, expenses, {
    shown: SHOWN_EXPENSES, line: cardLine, moreText: t.more, className: 'link-button category-more-link', rowClass: 'more-row',
  });

  const incomeList = root.querySelector('.list-income');
  incomeList.append(...incomes.map(cardLine));
  const transfer = categories.find((c) => c.id === TRANSFER_CATEGORY_ID && !c.deleted);
  if (transfer) {
    const fixed = document.createElement('span');
    fixed.className = 'text-muted';
    fixed.textContent = t.fixed;
    incomeList.appendChild(receiptLine(labelOf(transfer), fixed));
  }

  root.querySelector('.list-new').appendChild(receiptLine(t.newLink, '', { href: SECTION_HASH.categoryNew, className: 'add-row' }));

  renderNavbar(root, { active: 'settings' });
}
