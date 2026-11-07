// Pickers in Añadir and other forms: the category grid, the quick dates
// and the note suggestions.

import { quickDates } from '../domain/movement.js';
import { formatShortDate } from './format.js';
import { resizedFrom } from './motion.js';

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

// A row of suggestions to tap (tarea 27: notes used before). Hidden, taking
// no room, when there are none. onPick(text) on a tap.
export function renderSuggestions(container, suggestions, onPick) {
  container.hidden = suggestions.length === 0;
  container.replaceChildren(...suggestions.map((text) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip suggestion';
    chip.textContent = text;
    chip.addEventListener('click', () => onPick(text));
    return chip;
  }));
}

// How many tiles the category grid shows before «Ver todas» (tarea 28).
export const CATEGORY_TILES = 8;

// categories: already ranked (rankCategories). Shows the first ones as a
// grid of `gridSize` tiles; when there are more, the last tile is «Ver
// todas», which grows the same grid with the rest, in the same order, and
// shows a search box above it that filters the tiles; then the tile is «Ver
// menos». A selected category beyond the first ones opens it grown.
// texts: { seeAll, seeLess, search, empty }.
export function renderCategoryPicker(container, { categories, selectedId = null, onSelect, gridSize = CATEGORY_TILES, texts }) {
  container.replaceChildren();
  let selected = selectedId;
  const mark = () => {
    for (const button of container.querySelectorAll('.category-option')) {
      button.classList.toggle('is-selected', button.dataset.id === selected);
    }
  };
  const select = (category) => {
    selected = category.id;
    mark();
    onSelect(category);
  };

  const grid = document.createElement('div');
  grid.className = 'category-grid';
  const more = categories.length > gridSize;
  const shown = more ? gridSize - 1 : gridSize;
  for (const category of categories.slice(0, shown)) grid.appendChild(categoryButton(category, select));
  container.appendChild(grid);

  if (more) {
    const rest = categories.slice(shown).map((category) => categoryButton(category, select));
    const search = document.createElement('input');
    search.className = 'field-input category-search';
    search.type = 'search';
    search.placeholder = texts.search;
    search.setAttribute('aria-label', texts.search);
    search.hidden = true;
    const empty = document.createElement('p');
    empty.className = 'text-muted category-empty';
    empty.textContent = texts.empty;
    empty.hidden = true;
    container.prepend(search);
    container.append(empty);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'category-option category-more';
    const dots = document.createElement('span');
    dots.className = 'category-emoji';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '···';
    const label = document.createElement('span');
    label.className = 'category-name';
    toggle.append(dots, label);
    grid.appendChild(toggle);

    let open = false;
    const filter = () => {
      const query = search.value.trim().toLocaleLowerCase('es');
      let matches = 0;
      for (const button of grid.querySelectorAll('.category-option:not(.category-more)')) {
        const hit = button.textContent.toLocaleLowerCase('es').includes(query);
        button.hidden = !hit;
        if (hit) matches += 1;
      }
      empty.hidden = matches > 0;
    };
    const setOpen = (value, { animate = true } = {}) => {
      const before = grid.offsetHeight;
      open = value;
      if (open) toggle.before(...rest);
      else {
        for (const button of rest) button.remove();
        search.value = '';
      }
      filter();
      search.hidden = !open;
      label.textContent = open ? texts.seeLess : texts.seeAll;
      toggle.setAttribute('aria-expanded', String(open));
      mark();
      if (animate) resizedFrom(grid, before);
    };
    search.addEventListener('input', filter);
    toggle.addEventListener('click', () => setOpen(!open));
    // A category chosen before (editing) that is not among the first ones.
    setOpen(rest.some((button) => button.dataset.id === selected), { animate: false });
  }
  if (selected) select(categories.find((c) => c.id === selected) ?? categories[0]);
}

// Hoy / Ayer / Anteayer / Otra… in one row. "Otra…" is a native date field
// laid over the chip (iOS only opens its picker on a direct tap) and then
// shows the day chosen (25/10).
// initial: YYYY-MM-DD to start with (today when not given).
// texts: { today, yesterday, dayBefore, other }.
export function renderDatePicker(container, { today, initial = null, onChange, texts }) {
  container.replaceChildren();
  const dates = quickDates(today);
  const row = document.createElement('div');
  row.className = 'chip-row date-row';
  const otherChip = document.createElement('label');
  otherChip.className = 'chip date-other';
  const otherText = document.createElement('span');
  const other = document.createElement('input');
  other.type = 'date';
  other.className = 'date-input';
  other.max = dates.today;
  other.setAttribute('aria-label', texts.other);
  otherChip.append(otherText, other);

  const choose = (value) => {
    const quick = Object.values(dates).includes(value);
    for (const chip of row.querySelectorAll('[data-date]')) chip.classList.toggle('is-selected', chip.dataset.date === value);
    otherChip.classList.toggle('is-selected', !quick);
    otherText.textContent = quick ? texts.other : formatShortDate(value);
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
  row.appendChild(otherChip);
  other.addEventListener('change', () => {
    if (other.value) choose(other.value);
  });
  container.append(row);
  choose(initial ?? dates.today);
}
