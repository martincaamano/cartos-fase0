// Small DOM helpers shared by the screens: an element with its class and
// text, texts from the template, chips and choices, the book banner. They
// touch the DOM only when called.

import { es } from '../../i18n/es.js';

// An element with its class and text: el('span', 'amount-income', '+12').
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// A chip that is on or off (filters, exclusions).
export function toggleChip(text, on, onTap) {
  const chip = el('button', 'chip', text);
  chip.type = 'button';
  chip.classList.toggle('is-selected', on);
  chip.setAttribute('aria-pressed', String(on));
  chip.addEventListener('click', onTap);
  return chip;
}

// One of several buttons, the chosen one marked: tabs, periods, views,
// theme, a category's kind. options: [{ value, label, disabled }]. Each
// button gets className and data-<dataKey>=value; role 'tab' marks it with
// aria-selected instead of aria-pressed. A tap marks it and calls
// onSelect(value).
export function renderChoices(container, options, { selected, className = 'chip', dataKey = 'value', role = null, onSelect }) {
  const state = role === 'tab' ? 'aria-selected' : 'aria-pressed';
  const mark = (value) => {
    for (const button of container.children) {
      const on = button.dataset[dataKey] === value;
      button.classList.toggle('is-selected', on);
      button.setAttribute(state, String(on));
    }
  };
  container.replaceChildren(...options.map(({ value, label, disabled = false }) => {
    const button = el('button', className, label);
    button.type = 'button';
    button.dataset[dataKey] = value;
    if (role) button.setAttribute('role', role);
    button.disabled = disabled;
    button.addEventListener('click', () => {
      mark(value);
      onSelect(value);
    });
    return button;
  }));
  mark(selected);
}

// Fills every [data-text="key"] inside root with texts[key].
export function fillTexts(root, texts) {
  for (const node of root.querySelectorAll('[data-text]')) node.textContent = texts[node.dataset.text];
}

// "LIBRO · Casa do medio" on top of a screen, so a movement never goes to
// the wrong book. Nothing when the name is empty (a single book).
export function showBookBanner(main, name) {
  if (!name) return;
  const banner = document.createElement('p');
  banner.className = 'book-banner text-muted';
  banner.textContent = es.books.banner.replace('{name}', name);
  main.prepend(banner);
}

// A bar filled to `percent` (0–100, clamped), with an optional thin mark at
// `mark` percent (the period before, in Análisis). className: extra classes.
export function progressBar(percent, { mark = null, className = '' } = {}) {
  const clamp = (value) => Math.min(Math.max(value, 0), 100);
  const bar = el('span', `stat-bar ${className}`.trim());
  const fill = el('span', 'stat-bar-fill');
  fill.style.width = `${clamp(percent)}%`;
  bar.appendChild(fill);
  if (mark !== null) {
    const line = el('span', 'stat-bar-mark');
    line.style.left = `${clamp(mark)}%`;
    bar.appendChild(line);
  }
  return bar;
}

// A section heading of Análisis, with an optional hint on its right.
export function sectionHeading(title, hint = '') {
  const head = el('h2', 'receipt-heading stat-heading', title);
  if (hint) head.appendChild(el('small', 'stat-hint', hint));
  return head;
}
