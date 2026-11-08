// Desviaciones in Análisis (tarea 24): why the month chosen went off its
// average (24b), or each month of the period against its own (24c). The
// figures come from domain/deviations.js.

import { es } from '../../i18n/es.js';
import { monthDeviations, yearDeviations } from '../domain/deviations.js';
import { formatEuros, formatMonthName, formatMonthRange, formatShortDate, formatWholeEuros } from '../ui/format.js';
import { appendFolded, linkRow, receiptLine } from '../ui/receipt.js';
import { SECTION_HASH } from '../ui/router.js';
import { el, sectionHeading } from '../ui/dom.js';
import { toggleFold } from '../ui/motion.js';

const t = es.analysis;
// Months the list shows before «+ N más».
const SHOWN_MONTHS = 12;
// Categories the sentence names («sobre todo por Ocio y Hogar»).
const NAMED_DEVIATIONS = 2;

// «Ocio», «Ocio y Hogar», «Ocio, Hogar y Ropa».
function joinNames(names, and) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')}${and}${names.at(-1)}`;
}

// ctx: { body (where it goes), state ({ month, openDeviations }), day
// (today, YYYY-MM-DD), last (the current month), categoryName(id,
// { plain }) }; the list also gets openMonth(month).
// Why the month went off its average (tarea 24): a sentence, then the
// categories that went up, each opening on its movements.
export function paintDeviations(movements, { body, state, day, categoryName }) {
  const result = monthDeviations(movements, state.month, day);
  body.appendChild(sectionHeading(t.deviations, result.inProgress ? t.inProgress : t.deviationsHint));
  const block = el('div', 'stat-deviations');
  body.appendChild(block);
  if (result.status === 'insufficient') {
    block.appendChild(el('p', 'text-muted stat-deviation-summary', t.notEnough));
    return;
  }
  const up = result.difference > 0;
  const sentence = result.difference === 0 ? t.same : up ? t.above : t.below;
  const [before, after = ''] = sentence.replace('{month}', formatMonthName(state.month))
    .replace('{n}', result.baselineMonths).split('{amount}');
  const names = result.categories.slice(0, NAMED_DEVIATIONS).map((c) => categoryName(c.categoryId, { plain: true }));
  let tail = t.noneOut;
  if (names.length) {
    const although = names.length > 1 ? t.althoughMany : t.althoughOne;
    tail = (up ? t.mostlyBy : although).replace('{names}', joinNames(names, t.and));
  }
  const summary = el('p', 'stat-deviation-summary');
  summary.append(before);
  if (result.difference !== 0) {
    summary.append(el('strong', up ? 'amount-expense' : 'amount-income', `${up ? '+' : ''}${formatWholeEuros(result.difference)}`));
  }
  summary.append(after + tail);
  block.appendChild(summary);

  for (const row of result.categories) {
    const isOpen = state.openDeviations.has(row.categoryId);
    const wrap = el('div', 'tree-node stat-deviation');
    const head = el('button', 'tree-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(isOpen));
    const label = el('span', 'tree-label', categoryName(row.categoryId));
    if (row.isNew) label.append(' ', el('small', 'stat-deviation-new', t.isNew));
    head.append(
      el('span', 'tree-twisty', isOpen ? '▾' : '▸'),
      label,
      el('span', 'tree-value amount-expense', `+${formatWholeEuros(row.excess)}`),
    );
    wrap.appendChild(head);
    const detail = el('div', 'tree-body');
    detail.hidden = !isOpen;
    detail.appendChild(el('p', 'text-muted stat-deviation-sums', t.spentVsAverage
      .replace('{spent}', formatEuros(row.spent)).replace('{average}', formatEuros(row.average))));
    const list = el('ul', 'receipt-list');
    for (const movement of row.movements) {
      list.appendChild(receiptLine(formatShortDate(movement.date), formatEuros(-movement.amount), { tone: 'expense', note: movement.note }));
    }
    list.appendChild(linkRow({
      label: t.seeInHistory,
      hash: `${SECTION_HASH.history}?month=${state.month}&category=${encodeURIComponent(row.categoryId)}`,
      className: 'stat-deviation-link',
      end: '',
    }));
    detail.appendChild(list);
    wrap.appendChild(detail);
    head.addEventListener('click', () => toggleFold(detail, (open) => {
      if (open) state.openDeviations.add(row.categoryId);
      else state.openDeviations.delete(row.categoryId);
      head.setAttribute('aria-expanded', String(open));
      head.querySelector('.tree-twisty').textContent = open ? '▾' : '▸';
    }));
    block.appendChild(wrap);
  }
}

// The months of the period against their averages (tarea 24c), newest
// first; a tap opens the month's deviations. Months without enough
// history are left out.
export function paintDeviationMonths(movements, months, { body, day, last, categoryName, openMonth }) {
  body.appendChild(sectionHeading(t.deviations, t.deviationsHint));
  const block = el('div', 'stat-deviations');
  body.appendChild(block);
  const rows = yearDeviations(movements, months, day).filter((row) => row.status !== 'insufficient').reverse();
  if (rows.length === 0) {
    block.appendChild(el('p', 'text-muted stat-deviation-summary', t.notEnough));
    return;
  }
  const line = (row) => {
    const month = formatMonthRange({ from: row.month, to: row.month });
    const current = row.month === last ? ` ${t.current}` : '';
    const reason = row.top ? categoryName(row.top.categoryId) : t.withinUsual;
    const value = el('span', row.difference > 0 ? 'receipt-amount amount-expense' : 'receipt-amount amount-income',
      `${row.difference > 0 ? '+' : ''}${formatWholeEuros(row.difference)}`);
    if (row.difference === 0) value.className = 'receipt-amount';
    const item = el('li', 'receipt-line');
    const button = el('button', 'receipt-row stat-deviation-month');
    button.type = 'button';
    const label = el('span', 'receipt-label', `${month}${current} · `);
    label.appendChild(el(row.top ? 'span' : 'small', row.top ? '' : 'text-muted', reason));
    button.append(label, value);
    button.addEventListener('click', () => openMonth(row.month));
    item.appendChild(button);
    return item;
  };
  const list = el('ul', 'receipt-list stat-deviation-months');
  appendFolded(list, rows, { shown: SHOWN_MONTHS, line, moreText: t.more, className: 'link-button stat-more' });
  block.appendChild(list);
}
