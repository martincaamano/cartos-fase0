// Receipt lines (design §1): label on the left, amount on the right, a
// dashed rule below. Every list in the app is built from these, so the look
// of a line changes in one place. Touches the DOM only when called.

import { formatEuros, formatShortDate, formatSums, labelOf } from './format.js';

// What a movement line says, without the DOM. entry: from groupEntries or
// historyEntries. lookups: { accountById, categoryById } (Maps).
// withAccount adds " · Cuenta" after the category.
// Returns { label, amount, tone, note }; tone is 'expense', 'income' or ''
// (a transfer is neither, so it stays in plain ink); note is the movement's
// note, shown in grey where the line asks for it (History).
export function movementLineModel(entry, { accountById, categoryById }, { withAccount = false } = {}) {
  const date = formatShortDate(entry.date);
  if (entry.kind === 'transfer') {
    const from = labelOf(accountById.get(entry.from));
    const to = labelOf(accountById.get(entry.to));
    return { label: `${date}  ${from} → ${to}`, amount: entry.amount, tone: '', note: entry.halves[0].note };
  }
  const { movement } = entry;
  const category = labelOf(categoryById.get(movement.categoryId));
  const account = withAccount ? ` · ${labelOf(accountById.get(movement.accountId))}` : '';
  const isExpense = movement.type === 'expense';
  return {
    label: `${date}  ${category}${account}`,
    amount: isExpense ? -movement.amount : movement.amount,
    tone: isExpense ? 'expense' : 'income',
    note: movement.note,
  };
}

// right: the amount text, or an element (a button, a note) shown instead.
// tone: 'expense' or 'income' colours the amount. href turns the line into a
// link inside the list item. className is added to the line itself. note
// follows the label in grey.
export function receiptLine(label, right, { tone = '', href = null, className = '', note = '' } = {}) {
  const line = document.createElement(href ? 'a' : 'li');
  line.className = `receipt-line receipt-row ${className}`.trim();
  if (href) line.href = href;
  const start = document.createElement('span');
  start.className = 'receipt-label';
  start.textContent = label;
  if (note) {
    const small = document.createElement('small');
    small.className = 'receipt-note';
    small.textContent = ` ${note}`;
    start.appendChild(small);
  }
  line.appendChild(start);
  if (typeof right === 'string') {
    const end = document.createElement('span');
    end.className = tone ? `receipt-amount amount-${tone}` : 'receipt-amount';
    end.textContent = right;
    line.appendChild(end);
  } else {
    line.appendChild(right);
  }
  if (!href) return line;
  const item = document.createElement('li');
  item.appendChild(line);
  return item;
}

// withNote adds the note in grey after the label (History).
export function movementLine(entry, lookups, { withAccount = false, withNote = false, ...options } = {}) {
  const { label, amount, tone, note } = movementLineModel(entry, lookups, { withAccount });
  return receiptLine(label, formatEuros(amount), { tone, note: withNote ? note : '', ...options });
}

// Maps for the lookups above, built once per screen.
export function lookupsOf({ accounts, categories }) {
  return {
    accountById: new Map(accounts.map((account) => [account.id, account])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
  };
}

// A row that opens something (Ajustes, Datos): label, a value in grey and
// an arrow. hash makes it a link; onClick a button. end: the arrow ('›' by
// default, '↓' for a download).
export function linkRow({ label, value = '', hash = null, onClick = null, className = '', end = '›', valueClass = 'settings-value' }) {
  const item = document.createElement('li');
  item.className = 'receipt-line';
  const row = document.createElement(hash ? 'a' : 'button');
  row.className = `receipt-row settings-link ${className}`.trim();
  if (hash) row.href = hash;
  else {
    row.type = 'button';
    if (onClick) row.addEventListener('click', onClick);
  }
  const text = document.createElement('span');
  text.textContent = label;
  const tail = document.createElement('span');
  if (valueClass) tail.className = valueClass;
  tail.textContent = [value, end].filter(Boolean).join(' ');
  // Just an arrow: nothing to read out.
  if (!value) tail.setAttribute('aria-hidden', 'true');
  row.append(text, tail);
  item.appendChild(row);
  return item;
}

// "+1.601,27 − 3.547,58 = −1.946,31 €" (History and Análisis). withNet
// false leaves out "= net" where the net is already on the line above.
export function sumLine(sums, { withNet = true, tag = 'p' } = {}) {
  const { income, expense, net } = formatSums(sums);
  const line = document.createElement(tag);
  line.className = withNet ? 'sum-line' : 'sum-line sum-line-short';
  const part = (cls, text, node = 'span') => {
    const span = document.createElement(node);
    span.className = cls;
    span.textContent = text;
    return span;
  };
  line.append(part('amount-income', income), part('sum-op', '−'), part('amount-expense', expense));
  if (withNet) line.append(part('sum-op', '='), part('sum-net', net, 'strong'));
  return line;
}

// The first `shown` lines of a list and a «+ N más» line that shows the
// rest. line(item) → a list item.
export function appendFolded(list, items, { shown, line, moreText, className = 'link-button', rowClass = '' }) {
  list.append(...items.slice(0, shown).map(line));
  if (items.length <= shown) return;
  const rest = items.slice(shown);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = className;
  more.textContent = moreText.replace('{n}', rest.length);
  const item = receiptLine('', more, { className: rowClass });
  more.addEventListener('click', () => item.replaceWith(...rest.map(line)));
  list.appendChild(item);
}
