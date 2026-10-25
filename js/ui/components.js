// Shared form pieces: emoji picker, amount field, category grid and quick
// date picker. They touch the DOM only when called.

import { quickDates } from '../domain/movement.js';

// Row of suggested emojis that fill `input`; typing any other emoji works too.
export function setupEmojiPicker(row, input, suggestions) {
  input.value = input.value || suggestions[0];
  const markSelected = () => {
    for (const button of row.children) button.classList.toggle('is-selected', button.textContent === input.value);
  };
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-option';
    button.textContent = suggestion;
    button.addEventListener('click', () => {
      input.value = suggestion;
      markSelected();
    });
    row.appendChild(button);
  }
  input.addEventListener('input', markSelected);
  markSelected();
}

// Native numeric keyboard on iOS; parsing and the two-decimal check happen
// in domain/ (parseAmountInput, validateMovement).
export function createAmountInput(name) {
  const input = document.createElement('input');
  input.className = 'field-input amount-input';
  input.name = name;
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = '0,00';
  return input;
}

function categoryButton(category, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'category-option';
  button.dataset.id = category.id;
  const emoji = document.createElement('span');
  emoji.className = 'category-emoji';
  emoji.textContent = category.emoji;
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category.name;
  button.append(emoji, name);
  button.addEventListener('click', () => onSelect(category));
  return button;
}

// categories: already ranked (rankCategories). Shows the first `gridSize` as
// a grid and the rest behind "Ver todas", with a search box.
// texts: { seeAll, search, empty }.
export function renderCategoryPicker(container, { categories, selectedId = null, onSelect, gridSize = 8, texts }) {
  container.replaceChildren();
  let selected = selectedId;
  const select = (category) => {
    selected = category.id;
    for (const button of container.querySelectorAll('.category-option')) {
      button.classList.toggle('is-selected', button.dataset.id === selected);
    }
    onSelect(category);
  };

  const grid = document.createElement('div');
  grid.className = 'category-grid';
  for (const category of categories.slice(0, gridSize)) grid.appendChild(categoryButton(category, select));
  container.appendChild(grid);

  if (categories.length > gridSize) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-button';
    toggle.textContent = texts.seeAll;
    const panel = document.createElement('div');
    panel.className = 'category-all';
    panel.hidden = true;
    const search = document.createElement('input');
    search.className = 'field-input';
    search.type = 'search';
    search.placeholder = texts.search;
    const list = document.createElement('div');
    list.className = 'category-list';
    const paint = () => {
      const query = search.value.trim().toLocaleLowerCase('es');
      const matches = categories.filter((c) => c.name.toLocaleLowerCase('es').includes(query));
      list.replaceChildren(...matches.map((c) => categoryButton(c, select)));
      if (matches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-muted';
        empty.textContent = texts.empty;
        list.appendChild(empty);
      }
      for (const button of list.querySelectorAll('.category-option')) {
        button.classList.toggle('is-selected', button.dataset.id === selected);
      }
    };
    search.addEventListener('input', paint);
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) paint();
    });
    panel.append(search, list);
    container.append(toggle, panel);
  }
  if (selected) select(categories.find((c) => c.id === selected) ?? categories[0]);
}

// Hoy / Ayer / Anteayer plus a native date field for any other day.
// texts: { today, yesterday, dayBefore, other }.
export function renderDatePicker(container, { today, onChange, texts }) {
  container.replaceChildren();
  const dates = quickDates(today);
  const row = document.createElement('div');
  row.className = 'chip-row';
  const other = document.createElement('input');
  other.type = 'date';
  other.className = 'field-input date-input';
  other.max = dates.today;
  other.setAttribute('aria-label', texts.other);

  const choose = (value) => {
    for (const chip of row.children) chip.classList.toggle('is-selected', chip.dataset.date === value);
    other.value = value;
    onChange(value);
  };
  for (const [key, value] of Object.entries(dates)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.date = value;
    chip.textContent = texts[key];
    chip.addEventListener('click', () => choose(value));
    row.appendChild(chip);
  }
  other.addEventListener('change', () => {
    if (other.value) choose(other.value);
  });
  container.append(row, other);
  choose(dates.today);
}
