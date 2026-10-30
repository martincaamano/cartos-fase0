// Dashboard as a receipt (design §3.4): TOTAL on top, one line per account,
// then the latest movements. Sums come from domain/, formats from ui/format.

import { es } from '../../i18n/es.js';
import { accountBalance, totalBalance } from '../domain/balance.js';
import { latestEntries } from '../domain/transfer.js';
import { activeOnly } from '../domain/active.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { lookupsOf, movementLine, receiptLine } from '../ui/receipt.js';
import { showBookBanner, fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { SECTION_HASH } from '../ui/router.js';

const LATEST_COUNT = 4;

// What a hidden amount shows (tarea 20d).
const HIDDEN = '••••• €';

// book: movements already include the pending ones (mergePending);
// bookName: shown on top when there is more than one book;
// pendingCount: how many of them are not in the Sheet yet.
// revealed: the amounts are shown; they arrive hidden and tapping INICIO
// again calls onReveal.
export function renderDashboard(root, {
  book, bookName = '', offline, pendingCount = 0, revealed = true, onReveal = null,
}) {
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
      <div class="dashboard-latest-head">
        <h2 class="receipt-heading" data-text="latest"></h2>
        <a class="link-button dashboard-see-all" data-text="seeAll"></a>
      </div>
      <ul class="receipt-list receipt-movements"></ul>
    </main>
  `;
  const euros = (amount) => (revealed ? formatEuros(amount) : HIDDEN);
  root.querySelector('main').classList.toggle('amounts-hidden', !revealed);
  root.querySelector('.dashboard-see-all').href = SECTION_HASH.history;
  fillTexts(root, t);
  showBookBanner(root.querySelector('main'), bookName);
  const pending = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
  root.querySelector('.dashboard-notice').textContent = [offline ? t.offline : '', pendingCount ? pending : '']
    .filter(Boolean)
    .join(' · ');
  root.querySelector('.receipt-total-label').textContent = t.total;

  const { accounts, movements } = book;
  const active = activeOnly(accounts);
  root.querySelector('.receipt-total-amount').textContent = euros(totalBalance(active, movements));
  if (!revealed) root.querySelector('.receipt-total').title = t.revealHint;

  const accountList = root.querySelector('.receipt-accounts');
  for (const account of active) {
    const balance = accountBalance(account, movements);
    accountList.appendChild(receiptLine(labelOf(account), euros(balance), {
      tone: balance < 0 ? 'expense' : '',
      href: `${SECTION_HASH.history}?account=${encodeURIComponent(account.id)}`,
      className: 'dashboard-account',
    }));
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
  for (const entry of latest) {
    const line = movementLine(entry, lookups, { withNote: true });
    if (!revealed) line.querySelector('.receipt-amount').textContent = HIDDEN;
    movementList.appendChild(line);
  }

  renderNavbar(root, { active: 'home', onReselect: onReveal });
}
