// History (design §3.6): every movement as a receipt, grouped by month,
// filtered on the device by account, category and dates. Tapping a line
// opens the Add form to edit or delete it. Filtering and order come from
// domain/history.js.

import { es } from '../../i18n/es.js';
import { historyEntries } from '../domain/history.js';
import { activeOnly } from '../domain/active.js';
import { labelOf } from '../ui/format.js';
import { lookupsOf, movementLine } from '../ui/receipt.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';

// Lines painted at once; "Mostrar más" adds another page.
const PAGE_SIZE = 200;

function option(value, text) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = text;
  return item;
}

// book: movements already include the pending ones (mergePending).
export function renderHistory(root, { book }) {
  const t = es.history;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h1 class="form-title" data-text="title"></h1>
      <form class="history-filters" novalidate>
        <label class="field">
          <span class="field-label" data-text="account"></span>
          <select class="field-input" name="account"></select>
        </label>
        <label class="field">
          <span class="field-label" data-text="category"></span>
          <select class="field-input" name="category"></select>
        </label>
        <label class="field">
          <span class="field-label" data-text="from"></span>
          <input class="field-input" type="date" name="from">
        </label>
        <label class="field">
          <span class="field-label" data-text="to"></span>
          <input class="field-input" type="date" name="to">
        </label>
        <button type="reset" class="link-button" data-text="clear"></button>
      </form>
      <div class="history-list"></div>
      <button type="button" class="link-button history-more" data-text="more" hidden></button>
    </main>
  `;
  fillTexts(root, t);

  const { accounts, categories, movements } = book;
  const lookups = lookupsOf(book);

  const form = root.querySelector('.history-filters');
  const { account, category, from, to } = form.elements;
  account.appendChild(option('', t.all));
  for (const item of activeOnly(accounts)) account.appendChild(option(item.id, labelOf(item)));
  category.appendChild(option('', t.all));
  for (const item of activeOnly(categories)) category.appendChild(option(item.id, labelOf(item)));

  const list = root.querySelector('.history-list');
  const more = root.querySelector('.history-more');
  let entries = [];
  let shown = 0;

  // Appends the next page, with a month heading wherever the month changes.
  const paintPage = () => {
    const page = entries.slice(shown, shown + PAGE_SIZE);
    let month = shown > 0 ? entries[shown - 1].date.slice(0, 7) : '';
    let ul = list.lastElementChild?.tagName === 'UL' ? list.lastElementChild : null;
    for (const entry of page) {
      const entryMonth = entry.date.slice(0, 7);
      if (entryMonth !== month || !ul) {
        month = entryMonth;
        const [year, monthNumber] = entryMonth.split('-');
        const heading = document.createElement('h2');
        heading.className = 'receipt-heading';
        heading.textContent = `${es.months[Number(monthNumber) - 1]} ${year}`;
        ul = document.createElement('ul');
        ul.className = 'receipt-list';
        list.append(heading, ul);
      }
      ul.appendChild(movementLine(entry, lookups, {
        withAccount: true,
        href: `${SECTION_HASH.edit}?id=${encodeURIComponent(entry.id)}`,
        className: 'history-line',
      }));
    }
    shown += page.length;
    more.hidden = shown >= entries.length;
  };

  const apply = () => {
    entries = historyEntries(movements, {
      accountId: account.value,
      categoryId: category.value,
      from: from.value,
      to: to.value,
    });
    shown = 0;
    list.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'receipt-empty text-muted';
      const filtered = account.value || category.value || from.value || to.value;
      empty.textContent = filtered ? t.noMatches : t.empty;
      list.appendChild(empty);
    }
    paintPage();
  };

  form.addEventListener('change', apply);
  // The reset event fires before the fields are cleared.
  form.addEventListener('reset', () => setTimeout(apply));
  more.addEventListener('click', paintPage);
  apply();

  renderNavbar(root, { active: 'history' });
}
