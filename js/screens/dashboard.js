// Dashboard as a receipt (design §3.4): TOTAL on top, one line per account,
// then the latest movements. Sums come from domain/, formats from ui/format.

import { es } from '../../i18n/es.js';
import { accountBalance, totalBalance } from '../domain/balance.js';
import { latestEntries } from '../domain/transfer.js';
import { activeOnly } from '../domain/active.js';
import { formatEuros, labelOf } from '../ui/format.js';
import { isPendingEntry, lookupsOf, movementLine, receiptLine } from '../ui/receipt.js';
import { showBookBanner, fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { SECTION_HASH } from '../ui/router.js';

const LATEST_COUNT = 4;

// The eye next to the total: open while the amounts show, crossed out while
// they are hidden. Drawn in the text colour.
const EYE = '<path d="M1 10c2.6-4.7 5.6-7 9-7s6.4 2.3 9 7c-2.6 4.7-5.6 7-9 7s-6.4-2.3-9-7z"/><circle cx="10" cy="10" r="3"/>';
const svgIcon = (body) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${body}</svg>`;
const EYE_OPEN = svgIcon(EYE);
const EYE_CLOSED = svgIcon(`${EYE}<path d="M3 17L17 3"/>`);

// book: movements already include the pending ones (mergePending);
// bookName: shown on top when there is more than one book;
// pendingCount: how many of them are not in the Sheet yet; pendingIds:
// their ids, marked with «·».
// hidden: the amounts show as «••••• €»; the eye next to the total calls
// onToggleHidden. swapped: they just changed, so they fade in.
export function renderDashboard(root, {
  book, bookName = '', offline, pendingCount = 0, pendingIds = new Set(), blockedCount = 0, hidden = false, swapped = false,
  onToggleHidden = () => {},
}) {
  const t = es.dashboard;
  root.innerHTML = `
    <main class="screen screen-dashboard">
      <p class="dashboard-notice text-muted" role="status"></p>
      <section class="receipt-total">
        <span class="receipt-total-label">
          <span class="receipt-total-text"></span>
          <button type="button" class="amounts-toggle"></button>
        </span>
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
  const revealed = !hidden;
  const euros = (amount) => (revealed ? formatEuros(amount) : t.hidden);
  const main = root.querySelector('main');
  main.classList.toggle('amounts-hidden', hidden);
  main.classList.toggle('amounts-swapped', swapped);
  const toggle = root.querySelector('.amounts-toggle');
  toggle.innerHTML = hidden ? EYE_CLOSED : EYE_OPEN;
  toggle.setAttribute('aria-label', hidden ? t.showAmounts : t.hideAmounts);
  toggle.setAttribute('aria-pressed', String(hidden));
  toggle.addEventListener('click', onToggleHidden);
  root.querySelector('.dashboard-see-all').href = SECTION_HASH.history;
  fillTexts(root, t);
  showBookBanner(root.querySelector('main'), bookName);
  const pending = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
  const blocked = blockedCount ? t.blocked.replace('{n}', blockedCount) : '';
  root.querySelector('.dashboard-notice').textContent = [offline ? t.offline : '', pendingCount ? pending : '', blocked]
    .filter(Boolean)
    .join(' · ');
  root.querySelector('.receipt-total-text').textContent = t.total;

  const { accounts, movements } = book;
  const active = activeOnly(accounts);
  root.querySelector('.receipt-total-amount').textContent = euros(totalBalance(active, movements));

  const accountList = root.querySelector('.receipt-accounts');
  for (const account of active) {
    const balance = accountBalance(account, movements);
    accountList.appendChild(receiptLine(labelOf(account), euros(balance), {
      // Hidden amounts hide their sign too.
      tone: revealed && balance < 0 ? 'expense' : '',
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
    movementList.appendChild(movementLine(entry, lookups, {
      withNote: true, pending: isPendingEntry(entry, pendingIds), amountText: revealed ? null : t.hidden,
    }));
  }

  renderNavbar(root, { active: 'home' });
}
