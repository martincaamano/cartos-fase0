// Dashboard as a receipt (design §3.4): TOTAL on top, one line per account,
// then the latest movements. Sums come from domain/, formats from ui/format.

import { es } from '../../i18n/es.js';
import { accountBalance, totalBalance } from '../domain/balance.js';
import { latestEntries } from '../domain/transfer.js';
import { formatEuros, formatShortDate } from '../ui/format.js';
import { renderNavbar } from '../ui/navbar.js';

const LATEST_COUNT = 5;

function line(left, right, rightClass = '') {
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

// book: movements already include the pending ones (mergePending);
// pendingCount: how many of them are not in the Sheet yet.
export function renderDashboard(root, { book, offline, pendingCount = 0 }) {
  const t = es.dashboard;
  root.innerHTML = `
    <main class="screen screen-dashboard">
      <p class="dashboard-notice text-muted" role="status"></p>
      <section class="receipt-total">
        <span class="receipt-total-label"></span>
        <span class="receipt-total-amount"></span>
      </section>
      <h2 class="receipt-heading" data-text="accounts"></h2>
      <ul class="receipt-list receipt-accounts"></ul>
      <h2 class="receipt-heading" data-text="latest"></h2>
      <ul class="receipt-list receipt-movements"></ul>
    </main>
  `;
  for (const heading of root.querySelectorAll('[data-text]')) heading.textContent = t[heading.dataset.text];
  const pending = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
  root.querySelector('.dashboard-notice').textContent = [offline ? t.offline : '', pendingCount ? pending : '']
    .filter(Boolean)
    .join(' · ');
  root.querySelector('.receipt-total-label').textContent = t.total;

  const { accounts, categories, movements } = book;
  const active = accounts.filter((account) => !account.deleted);
  root.querySelector('.receipt-total-amount').textContent = formatEuros(totalBalance(active, movements));

  const accountList = root.querySelector('.receipt-accounts');
  for (const account of active) {
    const balance = accountBalance(account, movements);
    accountList.appendChild(
      line(`${account.emoji} ${account.name}`.trim(), formatEuros(balance), balance < 0 ? 'amount-expense' : '')
    );
  }

  const movementList = root.querySelector('.receipt-movements');
  const latest = latestEntries(movements, LATEST_COUNT);
  if (latest.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'receipt-empty text-muted';
    empty.textContent = t.noMovements;
    movementList.appendChild(empty);
  }
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountLabel = (id) => {
    const account = accountById.get(id);
    return account ? `${account.emoji} ${account.name}`.trim() : '';
  };
  for (const entry of latest) {
    if (entry.kind === 'transfer') {
      // Neither expense nor income: plain ink.
      const label = `${formatShortDate(entry.date)}  ${accountLabel(entry.from)} → ${accountLabel(entry.to)}`;
      movementList.appendChild(line(label, formatEuros(entry.amount)));
      continue;
    }
    const { movement } = entry;
    const category = categoryById.get(movement.categoryId);
    const label = `${formatShortDate(movement.date)}  ${category ? `${category.emoji} ${category.name}` : ''}`;
    const isExpense = movement.type === 'expense';
    movementList.appendChild(
      line(label, formatEuros(isExpense ? -movement.amount : movement.amount), isExpense ? 'amount-expense' : 'amount-income')
    );
  }

  renderNavbar(root, { active: 'home' });
}
