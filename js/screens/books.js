// Books (inside Settings, docs/tareas/tarea-17.md and 20c): the user's books
// with the one open marked, and "+ Nuevo libro" at the end. Tapping another
// book opens it (offline too, from its copy); tapping the open one opens
// its card to rename it.

import { es } from '../../i18n/es.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

// books: the user's books (state.books); fileId: the book open.
// onOpen(fileId): another book was tapped.
export function renderBooks(root, { books, fileId, onOpen }) {
  const t = es.books;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list book-list"></ul>
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

  renderNavbar(root, { active: 'settings' });
}
