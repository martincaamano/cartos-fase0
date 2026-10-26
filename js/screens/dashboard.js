// Dashboard as a receipt (design §3.4): TOTAL on top, one line per account,
// then the latest movements. Sums come from domain/, formats from ui/format.

import { es } from '../../i18n/es.js';
import { accountBalance, totalBalance } from '../domain/balance.js';
import { latestEntries } from '../domain/transfer.js';
import { activeOnly } from '../domain/active.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { lookupsOf, movementLine, receiptLine } from '../ui/receipt.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';

const LATEST_COUNT = 5;

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
  fillTexts(root, t);
  const pending = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
  root.querySelector('.dashboard-notice').textContent = [offline ? t.offline : '', pendingCount ? pending : '']
    .filter(Boolean)
    .join(' · ');
  root.querySelector('.receipt-total-label').textContent = t.total;

  const { accounts, movements } = book;
  const active = activeOnly(accounts);
  root.querySelector('.receipt-total-amount').textContent = formatEuros(totalBalance(active, movements));

  const accountList = root.querySelector('.receipt-accounts');
  for (const account of active) {
    const balance = accountBalance(account, movements);
    accountList.appendChild(
      receiptLine(labelOf(account), formatEuros(balance), { tone: balance < 0 ? 'expense' : '' })
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
  const lookups = lookupsOf(book);
  for (const entry of latest) movementList.appendChild(movementLine(entry, lookups));

  renderNavbar(root, { active: 'home' });
}
