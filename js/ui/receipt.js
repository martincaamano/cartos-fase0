// Receipt lines (design §1): label on the left, amount on the right, a
// dashed rule below. Every list in the app is built from these, so the look
// of a line changes in one place. Touches the DOM only when called.

import { formatEuros, formatShortDate, labelOf } from './format.js';
import { personName } from '../domain/members.js';

// What a movement line says, without the DOM. entry: from groupEntries or
// historyEntries. lookups: { accountById, categoryById } (Maps).
// withAccount adds " · Cuenta" after the category.
// Returns { label, amount, tone, note }; tone is 'expense', 'income' or ''
// (a transfer is neither, so it stays in plain ink); note is the movement's
// note, shown in grey where the line asks for it (History). In a shared
// book the person who paid goes first: "Ana · cena".
export function movementLineModel(entry, { accountById, categoryById, members = [] }, { withAccount = false } = {}) {
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
  const person = personName(members, movement.personId);
  return {
    label: `${date}  ${category}${account}`,
    amount: isExpense ? -movement.amount : movement.amount,
    tone: isExpense ? 'expense' : 'income',
    note: [person, movement.note].filter(Boolean).join(' · '),
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
export function lookupsOf({ accounts, categories, members = [] }) {
  return {
    accountById: new Map(accounts.map((account) => [account.id, account])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
    members,
  };
}
