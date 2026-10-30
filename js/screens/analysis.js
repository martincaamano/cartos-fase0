// Analysis (tarea 20e): how spending moves over time. A period on top (Mes ·
// 12 meses · Todo) and categories the user leaves out, then key figures,
// the evolution of income, spending and net, what the money goes on, how
// each category changes, the month's pace, the weekday pattern, fixed
// costs and the biggest expenses. Every figure comes from
// domain/analysis.js; the charts from ui/charts.js.

import { es } from '../../i18n/es.js';
import { toIsoDate } from '../domain/movement.js';
import { monthRange, shiftMonth } from '../domain/stats.js';
import {
  categoryChanges, categoryTrends, countable, fixedCosts, keyFigures, largestExpenses, monthlySeries, monthPace,
  periodMonths, previousMonths, weekdayPattern,
} from '../domain/analysis.js';
import { rankCategories } from '../domain/category.js';
import { formatEuros, formatShortDate, formatSums, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { barChart, lineChart, paceChart, sparkline } from '../ui/charts.js';
import { loadExcluded, saveExcluded } from '../storage/analysis-exclude.js';

const PERIODS = ['month', 'year', 'all'];
// Categories shown in "¿En qué?" before "+ N más".
const SHOWN_CATEGORIES = 6;

const monthLabel = (month) => {
  const [year, number] = month.split('-');
  return `${es.months[Number(number) - 1]} ${year}`;
};
const shortMonth = (month) => es.monthsShort[Number(month.slice(5)) - 1];

function element(tag, className, content = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (content) node.textContent = content;
  return node;
}

// A whole number of euros for the big figures: 1.684 €.
const wholeEuros = (amount) => formatEuros(Math.round(amount)).replace(/,00 €$/, ' €');

// "▲ 12 %" (more spending, in the expense colour) or "▼ 5 %".
function changeBadge(percent) {
  if (percent === null || percent === 0) return null;
  return element('span', percent > 0 ? 'stat-change amount-expense' : 'stat-change amount-income', `${percent > 0 ? '▲' : '▼'} ${Math.abs(percent)} %`);
}

function tile(key, value, detail) {
  const box = element('div', 'stat-tile');
  box.append(element('span', 'stat-tile-key', key), element('span', 'stat-tile-value', value));
  const line = element('span', 'stat-tile-detail');
  line.append(detail);
  box.appendChild(line);
  return box;
}

function heading(title, hint = '') {
  const head = element('h2', 'receipt-heading stat-heading', title);
  if (hint) head.appendChild(element('small', 'stat-hint', hint));
  return head;
}

// book: movements already include the pending ones (mergePending).
// fileId: the book open, for the categories left out. params: { period,
// month } kept in the URL so a repaint after a sync keeps them.
export function renderAnalysis(root, { book, fileId = '', params = {}, today = new Date(), storage = globalThis.localStorage }) {
  const t = es.analysis;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar screen-analysis">
      <div class="stat-periods" role="group"></div>
      <div class="month-picker" hidden>
        <button type="button" class="month-step" data-step="-1">‹</button>
        <span class="month-label"></span>
        <button type="button" class="month-step" data-step="1">›</button>
      </div>
      <div class="stat-exclude">
        <button type="button" class="link-button stat-exclude-toggle" aria-expanded="false"></button>
        <div class="chip-strip stat-exclude-chips" hidden></div>
      </div>
      <div class="stat-body"></div>
    </main>
  `;
  fillTexts(root, t);
  const [previous, next] = root.querySelectorAll('.month-step');
  previous.setAttribute('aria-label', t.previous);
  next.setAttribute('aria-label', t.next);

  const { categories } = book;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryName = (id) => labelOf(categoryById.get(id)) || id;
  const day = toIsoDate(today);
  const { first, last } = monthRange(book.movements, day);
  const validMonth = (month) => /^\d{4}-\d{2}$/.test(month ?? '') && month >= first && month <= last;

  const state = {
    period: PERIODS.includes(params.period) ? params.period : 'year',
    month: validMonth(params.month) ? params.month : last,
    excluded: new Set(loadExcluded(storage, fileId)),
    picked: null,
  };

  const remember = () => {
    const query = new URLSearchParams({ period: state.period });
    if (state.period === 'month') query.set('month', state.month);
    history.replaceState(null, '', `${SECTION_HASH.analysis}?${query}`);
  };

  // --- Period and exclusions
  const periods = root.querySelector('.stat-periods');
  const paintPeriods = () => {
    periods.replaceChildren(...PERIODS.map((period) => {
      const button = element('button', 'stat-period', t.periods[period]);
      button.type = 'button';
      button.dataset.period = period;
      button.classList.toggle('is-selected', period === state.period);
      button.setAttribute('aria-pressed', String(period === state.period));
      button.addEventListener('click', () => {
        state.period = period;
        state.picked = null;
        remember();
        paint();
      });
      return button;
    }));
    const picker = root.querySelector('.month-picker');
    picker.hidden = state.period !== 'month';
    root.querySelector('.month-label').textContent = monthLabel(state.month);
    previous.disabled = state.month <= first;
    next.disabled = state.month >= last;
  };
  const step = (delta) => {
    state.month = shiftMonth(state.month, delta);
    remember();
    paint();
  };
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  const excludeToggle = root.querySelector('.stat-exclude-toggle');
  const excludeChips = root.querySelector('.stat-exclude-chips');
  const choosable = [
    ...rankCategories(categories, book.movements, 'expense'),
    ...rankCategories(categories, book.movements, 'income').filter((c) => c.kind !== 'both'),
  ];
  const paintExclude = () => {
    const names = choosable.filter((c) => state.excluded.has(c.id)).map((c) => c.name);
    excludeToggle.textContent = `${t.exclude}: ${names.length ? names.join(', ') : t.excludeNone} ${excludeChips.hidden ? '▾' : '▴'}`;
    excludeToggle.setAttribute('aria-expanded', String(!excludeChips.hidden));
    excludeChips.replaceChildren(...choosable.map((category) => {
      const on = state.excluded.has(category.id);
      const chip = element('button', 'chip', labelOf(category));
      chip.type = 'button';
      chip.classList.toggle('is-selected', on);
      chip.setAttribute('aria-pressed', String(on));
      chip.addEventListener('click', () => {
        if (on) state.excluded.delete(category.id);
        else state.excluded.add(category.id);
        saveExcluded(storage, fileId, state.excluded);
        paint();
      });
      return chip;
    }));
  };
  excludeToggle.addEventListener('click', () => {
    excludeChips.hidden = !excludeChips.hidden;
    paintExclude();
  });

  // --- Sections
  const body = root.querySelector('.stat-body');

  function paintKeyFigures(movements, months) {
    const figures = keyFigures(movements, months, day);
    const average = document.createElement('span');
    const badge = changeBadge(figures.averageChange);
    if (badge) average.append(badge, ` ${t.vsBefore}`);
    else average.textContent = t.perMonth;
    const projection = document.createElement('span');
    const over = figures.projectionOverUsual;
    projection.append(
      element('span', over > 0 ? 'amount-expense' : 'amount-income', `${over > 0 ? '+' : ''}${wholeEuros(over)}`),
      ` ${t.overUsual}`,
    );
    const tiles = element('div', 'stat-tiles');
    tiles.append(
      tile(t.averageExpense, wholeEuros(figures.averageExpense), average),
      tile(t.savings, figures.savingsRate === null ? '—' : `${figures.savingsRate} %`, t.savingsDetail),
      tile(t.atThisPace, wholeEuros(figures.projection), projection),
      tile(t.perDay, wholeEuros(figures.perDay), t.perDayDetail),
    );
    body.appendChild(tiles);
    return figures;
  }

  function paintEvolution(movements, months) {
    const chartMonths = months.length > 1 ? months : periodMonths('year', { today: `${state.month}-01` });
    const series = monthlySeries(movements, chartMonths);
    body.appendChild(heading(t.evolution, t.tapMonth));
    const wrap = element('div', 'stat-chart');
    const draw = () => {
      wrap.replaceChildren(lineChart({
        label: t.evolution,
        labels: chartMonths.map((m) => shortMonth(m)[0]),
        series: [
          { values: series.map((p) => p.income), color: 'var(--color-income)', name: t.income },
          { values: series.map((p) => p.expense), color: 'var(--color-expense)', name: t.expense },
          { values: series.map((p) => p.net), color: 'var(--color-ink)', width: 3, name: t.net },
        ],
        selected: state.picked,
        onPick: (index) => {
          // A second tap on the same month opens it in History.
          if (state.picked === index) {
            location.hash = `${SECTION_HASH.history}?month=${chartMonths[index]}`;
            return;
          }
          state.picked = index;
          draw();
        },
      }));
      const legend = element('p', 'stat-legend');
      for (const [name, color] of [[t.income, 'income'], [t.expense, 'expense'], [t.net, 'net']]) {
        const item = element('span', `stat-legend-item stat-legend-${color}`, name);
        legend.appendChild(item);
      }
      wrap.appendChild(legend);
      if (state.picked !== null) {
        const point = series[state.picked];
        const sums = formatSums(point);
        const detail = element('p', 'stat-picked');
        detail.append(
          element('strong', '', `${monthLabel(point.month)} `),
          element('span', 'amount-income', sums.income),
          ' − ',
          element('span', 'amount-expense', sums.expense),
          ` = ${sums.net}`,
          element('span', 'text-muted', ` · ${t.tapAgain}`),
        );
        wrap.appendChild(detail);
      }
    };
    draw();
    body.appendChild(wrap);
  }

  function paintCategories(movements, months) {
    // Compared only when the book reaches back to the start of the period before.
    const compare = state.period !== 'all' && first <= previousMonths(months)[0];
    const rows = categoryChanges(movements, months, { compare });
    body.appendChild(heading(t.onWhat, compare ? t.markBefore : ''));
    const list = element('ul', 'receipt-list stat-categories');
    if (rows.length === 0) list.appendChild(element('li', 'receipt-empty text-muted', t.noSpending));
    const largest = Math.max(...rows.map((r) => Math.max(r.amount, r.previous ?? 0)), 1);
    const line = (row) => {
      const right = element('span', 'receipt-amount stat-amount');
      right.append(formatEuros(row.amount));
      const badge = changeBadge(row.change);
      if (badge) right.append(' ', badge);
      const item = receiptLine(categoryName(row.categoryId), right, { className: 'stat-category' });
      const bar = element('span', 'stat-bar');
      const fill = element('span', 'stat-bar-fill');
      fill.style.width = `${Math.max(1, Math.round((row.amount / largest) * 100))}%`;
      bar.appendChild(fill);
      if (row.previous) {
        const mark = element('span', 'stat-bar-mark');
        mark.style.left = `${Math.round((row.previous / largest) * 100)}%`;
        bar.appendChild(mark);
      }
      item.appendChild(bar);
      return item;
    };
    list.append(...rows.slice(0, SHOWN_CATEGORIES).map(line));
    if (rows.length > SHOWN_CATEGORIES) {
      const more = element('button', 'link-button stat-more', t.more.replace('{n}', rows.length - SHOWN_CATEGORIES));
      more.type = 'button';
      const item = receiptLine('', more);
      more.addEventListener('click', () => item.replaceWith(...rows.slice(SHOWN_CATEGORIES).map(line)));
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  function paintTrends(movements) {
    const months = periodMonths('year', { today: day });
    const trends = categoryTrends(movements, months, 4);
    if (trends.length === 0) return;
    body.appendChild(heading(t.howChanges, t.last12));
    const grid = element('div', 'stat-trends');
    for (const trend of trends) {
      const box = element('div', 'stat-trend');
      const head = element('p', 'stat-trend-head');
      const arrow = { up: '▲', down: '▼', flat: '=' }[trend.trend];
      head.append(element('span', '', categoryName(trend.categoryId)),
        element('span', trend.trend === 'up' ? 'amount-expense' : trend.trend === 'down' ? 'amount-income' : 'text-muted', arrow));
      box.append(head, sparkline(trend.series, categoryName(trend.categoryId)));
      grid.appendChild(box);
    }
    body.appendChild(grid);
  }

  function paintPace(movements, usual) {
    const pace = monthPace(movements, day, usual);
    body.appendChild(heading(t.when, t.cumulative));
    const peakDay = pace.peak ? Number(pace.peak.date.slice(8, 10)) : null;
    const peakLabel = pace.peak ? `${formatShortDate(pace.peak.date)} ${pace.peak.note || categoryName(pace.peak.categoryId)}` : '';
    body.appendChild(element('div', 'stat-chart')).appendChild(paceChart({
      spent: pace.spent,
      usual: pace.usual,
      peakDay,
      peakLabel,
      usualLabel: `${t.usualMonth} ${wholeEuros(usual)}`,
      label: t.when,
    }));
  }

  function paintWeekdays(movements, months) {
    body.appendChild(heading(t.whichDays, t.perWeekday));
    body.appendChild(element('div', 'stat-chart')).appendChild(barChart(weekdayPattern(movements, months, day), t.weekdays, t.whichDays));
  }

  function paintFixed(movements, average) {
    const fixed = fixedCosts(movements, day);
    if (fixed.length === 0) return;
    body.appendChild(heading(t.fixed, t.fixedHint));
    const list = element('ul', 'receipt-list stat-fixed');
    for (const cost of fixed) {
      const label = `${labelOf({ ...categoryById.get(cost.categoryId), name: cost.note })} · ${t.day} ${cost.day}`;
      list.appendChild(receiptLine(label, formatEuros(cost.amount)));
    }
    body.appendChild(list);
    const total = fixed.reduce((sum, cost) => sum + Math.round(cost.amount * 100), 0) / 100;
    const share = average > 0 ? Math.round((total / average) * 100) : null;
    body.appendChild(element('p', 'text-muted form-note', t.fixedTotal.replace('{total}', formatEuros(total)).replace('{share}', share ?? '—')));
  }

  function paintLargest(movements, months) {
    const { items, averageWithout } = largestExpenses(movements, months);
    if (items.length === 0) return;
    body.appendChild(heading(t.largest, t.periods[state.period].toLowerCase()));
    const list = element('ul', 'receipt-list stat-largest');
    for (const movement of items) {
      const label = `${formatShortDate(movement.date)}  ${categoryName(movement.categoryId)}`;
      list.appendChild(receiptLine(label, formatEuros(-movement.amount), { tone: 'expense', note: movement.note }));
    }
    body.appendChild(list);
    if (months.length > 1) body.appendChild(element('p', 'text-muted form-note', t.without.replace('{n}', items.length).replace('{amount}', wholeEuros(averageWithout))));
  }

  function paint() {
    paintPeriods();
    paintExclude();
    body.replaceChildren();
    const movements = countable(book.movements, state.excluded);
    const months = periodMonths(state.period, { today: day, first, month: state.month });
    const figures = paintKeyFigures(movements, months);
    paintEvolution(movements, months);
    paintCategories(movements, months);
    paintTrends(movements);
    paintPace(movements, figures.projection - figures.projectionOverUsual);
    paintWeekdays(movements, months);
    paintFixed(movements, figures.averageExpense);
    paintLargest(movements, months);
  }

  paint();
  renderNavbar(root, { active: 'analysis' });
}
