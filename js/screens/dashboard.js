// Dashboard as a receipt (design §3.4): TOTAL on top, one line per account,
// then the savings goals (tarea 25b): what they put aside, what would be
// left if they are kept, and each goal with its progress. The TOTAL and the
// balances never change because of the goals. Sums come from domain/,
// formats from ui/format.

import { es } from '../../i18n/es.js';
import { accountBalance, totalBalance } from '../domain/balance.js';
import { activeOnly } from '../domain/active.js';
import { activeGoals, available, goalProgress, totalSaved } from '../domain/goals.js';
import { toIsoDate } from '../domain/movement.js';
import { formatDate, formatEuros, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';
import { el, fillTexts, showBookBanner, showSeenAmount } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { SECTION_HASH } from '../ui/router.js';

// The eye next to the total: open while the amounts show, crossed out while
// they are hidden. Drawn in the text colour.
const EYE = '<path d="M1 10c2.6-4.7 5.6-7 9-7s6.4 2.3 9 7c-2.6 4.7-5.6 7-9 7s-6.4-2.3-9-7z"/><circle cx="10" cy="10" r="3"/>';
const svgIcon = (body) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${body}</svg>`;
const EYE_OPEN = svgIcon(EYE);
const EYE_CLOSED = svgIcon(`${EYE}<path d="M3 17L17 3"/>`);

// book: movements, goals and contributions already include the pending
// ones (mergePending); bookName: shown on top when there is more than one
// book; pendingCount: how many changes are not in the Sheet yet.
// hidden: the amounts show as «••••• €»; the eye next to the total calls
// onToggleHidden. swapped: they just changed, so they fade in.
// seen: the amounts shown last time, kept by the caller (showSeenAmount);
// one that changed counts from the old value to the new one (tarea 23).
export function renderDashboard(root, {
  book, bookName = '', offline, pendingCount = 0, blockedCount = 0, hidden = false, swapped = false,
  onToggleHidden = () => {}, seen = new Map(), today = new Date(),
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
      <div class="dashboard-goals-head">
        <h2 class="receipt-heading" data-text="goals"></h2>
        <a class="link-button dashboard-goal-new" data-text="newGoal"></a>
      </div>
      <p class="dashboard-goals-sums"></p>
      <ul class="receipt-list dashboard-goals"></ul>
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
  root.querySelector('.dashboard-goal-new').href = SECTION_HASH.goalNew;
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
  // An amount shown: counting when it changed since last seen.
  const show = (node, key, value) => {
    if (revealed) showSeenAmount(node, seen, key, value);
    else node.textContent = t.hidden;
  };
  show(root.querySelector('.receipt-total-amount'), 'total', totalBalance(active, movements));

  const accountList = root.querySelector('.receipt-accounts');
  for (const account of active) {
    const balance = accountBalance(account, movements);
    const line = receiptLine(labelOf(account), euros(balance), {
      // Hidden amounts hide their sign too.
      tone: revealed && balance < 0 ? 'expense' : '',
      href: `${SECTION_HASH.history}?account=${encodeURIComponent(account.id)}`,
      className: 'dashboard-account',
    });
    show(line.querySelector('.receipt-amount'), account.id, balance);
    accountList.appendChild(line);
  }

  // --- Metas: only the active ones; what they put aside comes out of the
  // TOTAL as «Disponible», never out of a balance.
  const { goals = [], contributions = [] } = book;
  const goalList = root.querySelector('.dashboard-goals');
  const shown = activeGoals(goals);
  const sums = root.querySelector('.dashboard-goals-sums');
  if (shown.length === 0) {
    sums.remove();
    goalList.appendChild(el('li', 'receipt-empty text-muted', t.noGoals));
  } else {
    const saved = totalSaved(goals, contributions);
    const total = totalBalance(active, movements);
    sums.append(el('span', 'dashboard-goals-saved'), ' · ', el('span', 'dashboard-goals-available'));
    const part = (selector, label, key, value) => {
      const node = sums.querySelector(selector);
      node.append(`${label} `, el('span', 'receipt-amount'));
      show(node.querySelector('.receipt-amount'), key, value);
    };
    part('.dashboard-goals-saved', t.saved, 'goals:saved', saved);
    part('.dashboard-goals-available', t.available, 'goals:available', available(total, saved));
  }
  const day = toIsoDate(today);
  for (const goal of shown) {
    const progress = goalProgress(goal, contributions, day);
    const line = receiptLine(goal.name, revealed
      ? `${formatEuros(progress.saved)} / ${formatEuros(goal.targetAmount)}`
      : t.hidden, { href: `${SECTION_HASH.goal}?id=${encodeURIComponent(goal.id)}`, className: 'dashboard-goal' });
    const bar = el('span', 'stat-bar goal-bar');
    const fill = el('span', 'stat-bar-fill');
    fill.style.width = `${Math.min(progress.progress, 100)}%`;
    bar.appendChild(fill);
    const state = progress.status === 'onTrack' ? t.until.replace('{date}', formatDate(goal.targetDate)) : t[progress.status];
    // Inside the link, above its dashed rule.
    line.querySelector('.dashboard-goal').append(bar, el('small', 'goal-state text-muted', state));
    goalList.appendChild(line);
  }

  renderNavbar(root, { active: 'home' });
}
