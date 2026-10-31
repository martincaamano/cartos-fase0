// History (design §3.6, tarea 20b): every movement of the book, as a
// summary (total → months → categories → movements, opened by tapping) or
// as a plain list by month. Both show income − spending = net for the total
// and each month. Filters by a range of months, accounts and categories,
// folded under "Filtrar" and cleared every time the screen opens. Tapping a
// movement opens the Add form to edit or delete it. Filtering and sums come
// from domain/history.js.

import { es } from '../../i18n/es.js';
import {
  activeFilterCount, entryMonth, historyEntries, monthsSpan, selectMonth, summarizeHistory, sumEntries, transferAmount,
} from '../domain/history.js';
import { activeOnly } from '../domain/active.js';
import { rankAllCategories, TRANSFER_CATEGORY_ID } from '../domain/category.js';
import { toIsoDate } from '../domain/movement.js';
import { isMonth } from '../domain/stats.js';
import { formatEuros, formatMonth, formatMonthRange, formatShortMonth, formatSums, labelOf } from '../ui/format.js';
import { lookupsOf, movementLine, sumLine } from '../ui/receipt.js';
import { SECTION_HASH } from '../ui/router.js';
import { el, fillTexts, renderChoices, toggleChip } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { HISTORY_VIEWS, loadHistoryView, saveHistoryView } from '../storage/history-view.js';

// Lines painted at once in the list view; "Mostrar más" adds another page.
const PAGE_SIZE = 200;

// book: movements already include the pending ones (mergePending).
// params: { account } opens it filtered by that account (from INICIO);
// { month } by that month (from Análisis).
// storage: where the view chosen last is remembered.
export function renderHistory(root, { book, params = {}, today = new Date(), storage = globalThis.localStorage }) {
  const t = es.history;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-history">
      <div class="history-bar">
        <button type="button" class="link-button history-filter-toggle" aria-expanded="false"></button>
        <button type="button" class="link-button history-clear" data-text="clear" hidden></button>
        <div class="history-views" role="group"></div>
      </div>
      <div class="history-filters" hidden>
        <p class="history-filter-head"><span data-text="months"></span><span class="history-range"></span></p>
        <div class="chip-strip history-months"></div>
        <p class="history-filter-head"><span data-text="accounts"></span><span class="history-count-accounts"></span></p>
        <div class="chip-strip history-accounts"></div>
        <p class="history-filter-head"><span data-text="categories"></span><span class="history-count-categories"></span></p>
        <div class="chip-strip history-categories"></div>
      </div>
      <div class="history-list"></div>
      <button type="button" class="link-button history-more" data-text="more" hidden></button>
    </main>
  `;
  fillTexts(root, t);

  const { movements } = book;
  const lookups = lookupsOf(book);
  const accounts = activeOnly(book.accounts);
  const categories = rankAllCategories(book.categories, movements);

  // What is on screen. Filters start empty every time (tarea 20).
  const state = {
    view: loadHistoryView(storage),
    range: isMonth(params.month) ? { from: params.month, to: params.month, open: false } : null,
    accountIds: new Set(book.accounts.some((a) => a.id === params.account) ? [params.account] : []),
    categoryIds: new Set(),
    open: new Set(),
  };
  const filters = () => ({
    accountIds: [...state.accountIds],
    categoryIds: [...state.categoryIds],
    fromMonth: state.range?.from ?? '',
    toMonth: state.range?.to ?? '',
  });

  const list = root.querySelector('.history-list');
  const more = root.querySelector('.history-more');
  const panel = root.querySelector('.history-filters');
  const toggle = root.querySelector('.history-filter-toggle');
  const clear = root.querySelector('.history-clear');
  let entries = [];
  let shown = 0;

  const movementItem = (entry) => movementLine(entry, lookups, {
    withNote: true,
    href: `${SECTION_HASH.edit}?id=${encodeURIComponent(entry.id)}`,
    className: 'history-line',
  });

  // --- Lista: every movement, a heading with the sums wherever the month changes.
  const monthSums = new Map();
  const paintPage = () => {
    const page = entries.slice(shown, shown + PAGE_SIZE);
    let month = shown > 0 ? entryMonth(entries[shown - 1]) : '';
    let ul = list.lastElementChild?.tagName === 'UL' ? list.lastElementChild : null;
    for (const entry of page) {
      if (entryMonth(entry) !== month || !ul) {
        month = entryMonth(entry);
        ul = el('ul', 'receipt-list');
        list.append(el('h2', 'receipt-heading', formatMonth(month)), sumLine(monthSums.get(month)), ul);
      }
      ul.appendChild(movementItem(entry));
    }
    shown += page.length;
    more.hidden = shown >= entries.length;
  };

  // --- Resumen: nodes that open on a tap. key: what is open, kept while the
  // screen lives.
  const node = ({ key, level, label, value = '', tone = '', sums = null, children }) => {
    const wrap = el('div', `tree-node tree-${level}`);
    const head = el('button', 'tree-head');
    head.type = 'button';
    const isOpen = state.open.has(key);
    head.setAttribute('aria-expanded', String(isOpen));
    head.append(
      el('span', 'tree-twisty', isOpen ? '▾' : '▸'),
      el('span', 'tree-label', label),
      el('span', tone ? `tree-value amount-${tone}` : 'tree-value', value),
    );
    head.addEventListener('click', () => {
      if (state.open.has(key)) state.open.delete(key);
      else state.open.add(key);
      paint();
    });
    wrap.appendChild(head);
    if (sums) wrap.appendChild(sumLine(sums, { withNet: false }));
    if (isOpen) {
      const body = el('div', 'tree-body');
      body.append(...children());
      wrap.appendChild(body);
    }
    return wrap;
  };

  const categoryNodes = (prefix, groups) => groups.map((group) => {
    const transfer = group.categoryId === TRANSFER_CATEGORY_ID;
    const lines = el('ul', 'receipt-list');
    return node({
      key: `${prefix}/${group.categoryId}`,
      level: 'category',
      label: transfer ? t.transfers : labelOf(lookups.categoryById.get(group.categoryId)),
      value: formatEuros(transfer ? transferAmount(group.entries) : group.net),
      tone: transfer ? '' : group.net < 0 ? 'expense' : 'income',
      children: () => {
        lines.replaceChildren(...group.entries.map(movementItem));
        return [lines];
      },
    });
  });

  // "Ago – Oct 2026 · Abanca · Supermercado": what the total adds up.
  const describe = () => {
    const parts = [];
    if (state.range) parts.push(formatMonthRange(state.range));
    if (state.accountIds.size) parts.push(accounts.filter((a) => state.accountIds.has(a.id)).map((a) => a.name).join(', '));
    if (state.categoryIds.size) parts.push(categories.filter((c) => state.categoryIds.has(c.id)).map((c) => c.name).join(', '));
    return parts.length ? parts.join(' · ') : t.total;
  };

  const paintSummary = () => {
    const { total, months } = summarizeHistory(entries);
    list.append(node({
      key: 'total',
      level: 'total',
      label: describe(),
      value: formatSums(total).net,
      sums: total,
      children: () => categoryNodes('total', total.categories),
    }));
    for (const month of months) {
      list.appendChild(node({
        key: month.month,
        level: 'month',
        label: formatMonth(month.month),
        value: formatSums(month).net,
        sums: month,
        children: () => categoryNodes(month.month, month.categories),
      }));
    }
    more.hidden = true;
  };

  // --- Filters
  const span = monthsSpan(movements, toIsoDate(today));

  const paintFilters = () => {
    const count = activeFilterCount(filters());
    toggle.textContent = `${count ? t.filterCount.replace('{n}', count) : t.filter} ${panel.hidden ? '▾' : '▴'}`;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    clear.hidden = count === 0;
    if (panel.hidden) return;

    root.querySelector('.history-range').textContent = state.range ? formatMonthRange(state.range) : t.allMonths;
    const months = root.querySelector('.history-months');
    const scroll = months.scrollLeft;
    months.replaceChildren(...span.map((month) => {
      const cell = el('button', 'month-cell');
      cell.type = 'button';
      const { from, to } = state.range ?? {};
      const inRange = Boolean(state.range) && month >= from && month <= to;
      cell.classList.toggle('is-edge', inRange && (month === from || month === to));
      cell.classList.toggle('is-inside', inRange && month !== from && month !== to);
      cell.setAttribute('aria-pressed', String(inRange));
      cell.append(el('span', 'month-name', formatShortMonth(month)), el('span', 'month-year', month.slice(0, 4)));
      cell.addEventListener('click', () => {
        state.range = selectMonth(state.range, month);
        apply();
      });
      return cell;
    }));
    months.scrollLeft = scroll;

    const toggleIn = (set, id) => () => {
      if (set.has(id)) set.delete(id);
      else set.add(id);
      apply();
    };
    root.querySelector('.history-accounts').replaceChildren(...accounts.map((account) =>
      toggleChip(labelOf(account), state.accountIds.has(account.id), toggleIn(state.accountIds, account.id))));
    root.querySelector('.history-categories').replaceChildren(...categories.map((category) =>
      toggleChip(labelOf(category), state.categoryIds.has(category.id), toggleIn(state.categoryIds, category.id))));
    root.querySelector('.history-count-accounts').textContent = state.accountIds.size || '';
    root.querySelector('.history-count-categories').textContent = state.categoryIds.size || '';
  };

  const paintViews = () => {
    renderChoices(root.querySelector('.history-views'), HISTORY_VIEWS.map((view) => ({ value: view, label: t[view] })), {
      selected: state.view,
      className: 'history-view',
      dataKey: 'view',
      onSelect: (view) => {
        state.view = view;
        saveHistoryView(storage, view);
        paint();
      },
    });
  };

  // Paints the movements from `entries` in the view chosen.
  function paint() {
    shown = 0;
    list.replaceChildren();
    if (entries.length === 0) {
      list.appendChild(el('p', 'receipt-empty text-muted', activeFilterCount(filters()) ? t.noMatches : t.empty));
      more.hidden = true;
      return;
    }
    if (state.view === 'summary') paintSummary();
    else paintPage();
  }

  function apply() {
    entries = historyEntries(movements, filters());
    monthSums.clear();
    const byMonth = new Map();
    for (const entry of entries) {
      if (!byMonth.has(entryMonth(entry))) byMonth.set(entryMonth(entry), []);
      byMonth.get(entryMonth(entry)).push(entry);
    }
    for (const [month, monthEntries] of byMonth) monthSums.set(month, sumEntries(monthEntries));
    paintFilters();
    paint();
  }

  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    paintFilters();
    // The current month is on the right; start there.
    if (opening) {
      const months = root.querySelector('.history-months');
      months.scrollLeft = months.scrollWidth;
    }
  });
  clear.addEventListener('click', () => {
    state.range = null;
    state.accountIds.clear();
    state.categoryIds.clear();
    apply();
  });
  more.addEventListener('click', paintPage);

  paintViews();
  apply();
  renderNavbar(root, { active: 'history' });
}
