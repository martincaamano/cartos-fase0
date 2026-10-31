// Books (inside Settings, docs/tareas/tarea-17.md, 18 and 20c): the user's
// books with the one open marked, "+ Nuevo libro" and «Abrir un libro
// compartido conmigo» at the end. Tapping another book opens it (offline
// too, from its copy); tapping the open one opens its card.

import { es } from '../../i18n/es.js';
import { openSharedBook } from '../data/books.js';
import { PickerError, pickSpreadsheet } from '../data/picker.js';
import { ValidationError } from '../data/errors.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// books: the user's books (state.books); fileId: the book open.
// onOpen(fileId): another book was tapped. onShared(result): a book shared
// with the user was picked and opened.
export function renderBooks(root, { books, fileId, onOpen, onShared }) {
  const t = es.books;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list book-list"></ul>
      <p class="form-error books-error" role="alert"></p>
      <p class="text-muted form-note" data-text="note"></p>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const list = root.querySelector('.book-list');
  for (const book of books) {
    const isOpen = book.fileId === fileId;
    if (isOpen) {
      list.appendChild(receiptLine(book.name, t.open, { href: SECTION_HASH.bookEdit, className: 'book-open' }));
      continue;
    }
    const line = receiptLine(book.name, '›', { className: 'book-other' });
    line.setAttribute('role', 'button');
    line.tabIndex = 0;
    line.addEventListener('click', () => onOpen(book.fileId));
    list.appendChild(line);
  }
  list.appendChild(receiptLine(t.newLink, '', { href: SECTION_HASH.bookNew, className: 'add-row' }));

  // A book someone shared: picked in Google's Picker, which is what lets the
  // app reach it under drive.file.
  const error = root.querySelector('.books-error');
  const openShared = receiptLine(`+ ${t.openShared}`, '', { className: 'add-row book-open-shared' });
  openShared.setAttribute('role', 'button');
  openShared.tabIndex = 0;
  list.appendChild(openShared);
  const label = openShared.querySelector('.receipt-label');
  let busy = false;
  openShared.addEventListener('click', async () => {
    if (busy) return;
    error.textContent = '';
    if (!navigator.onLine) { error.textContent = t.pickerUnavailable; return; }
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      busy = true;
      label.textContent = t.openingShared;
      onShared(await openSharedBook(picked, books));
    } catch (err) {
      console.warn('Opening a shared book failed', err);
      if (err instanceof PickerError) error.textContent = err.code === 'not_configured' ? t.pickerNotConfigured : t.pickerUnavailable;
      else if (err instanceof ValidationError) error.textContent = t.notSharedBook;
      else error.textContent = t.openSharedFailed;
      busy = false;
      label.textContent = `+ ${t.openShared}`;
    }
  });

  renderNavbar(root, { active: 'settings' });
}
