// Books (inside Settings, docs/tareas/tarea-17.md): the user's books with
// the one open marked, renaming the book open and creating a new one with
// its first account. Creating and renaming go straight to Drive, so they
// need a connection; opening another book works offline from its copy.

import { es } from '../../i18n/es.js';
import { validateBookName } from '../domain/books.js';
import { createNewBook, renameBook } from '../data/books.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const NAME_ERRORS = { name_required: 'bookNameRequired', name_taken: 'bookNameTaken', name_too_long: 'bookNameTooLong' };

// The text for a book name problem, or ''.
const nameProblem = (errors, t) => (errors.length ? t[NAME_ERRORS[errors[0]]] : '');

function renderRename(form, { books, fileId, onRenamed }) {
  const t = es.books;
  const { name } = form.elements;
  const error = form.querySelector('.form-error');
  const submit = form.querySelector('.form-submit');
  name.value = books.find((book) => book.fileId === fileId)?.name ?? '';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = nameProblem(validateBookName(name.value, books, fileId), t);
    if (problem) { error.textContent = problem; return; }
    if (!navigator.onLine) { error.textContent = t.offline; return; }
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = t.renaming;
    renameBook(fileId, name.value, books).then(onRenamed).catch((err) => {
      console.warn('Book rename failed', err);
      error.textContent = navigator.onLine ? t.failed : t.offline;
      submit.disabled = false;
      submit.textContent = t.rename;
    });
  });
}

// books: the user's books (state.books); fileId: the book open.
// onOpen(fileId), onCreated(result), onRenamed(books).
export function renderBooks(root, { books, fileId, onOpen, onCreated, onRenamed }) {
  const t = es.books;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <p class="text-muted form-note" data-text="note"></p>
      <ul class="receipt-list book-list"></ul>
      <h2 class="receipt-heading" data-text="renameTitle"></h2>
      <form class="form book-rename" novalidate>
        <label class="field">
          <span class="field-label" data-text="bookName"></span>
          <input class="field-input" name="name" autocomplete="off" maxlength="40">
        </label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn-primary form-submit" data-text="rename"></button>
      </form>
      <h2 class="receipt-heading new-title" data-text="newTitle"></h2>
      <label class="field book-new-name">
        <span class="field-label" data-text="bookName"></span>
        <input class="field-input" name="bookName" autocomplete="off" maxlength="40">
      </label>
      <p class="text-muted form-note" data-text="newNote"></p>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const list = root.querySelector('.book-list');
  for (const book of books) {
    const isOpen = book.fileId === fileId;
    const mark = document.createElement('span');
    mark.className = 'receipt-amount';
    mark.textContent = isOpen ? t.open : '›';
    const line = receiptLine(book.name, mark, { className: isOpen ? 'book-open' : 'book-other' });
    if (!isOpen) {
      line.setAttribute('role', 'button');
      line.tabIndex = 0;
      line.addEventListener('click', () => onOpen(book.fileId));
    }
    list.appendChild(line);
  }

  renderRename(root.querySelector('.book-rename'), {
    books,
    fileId,
    onRenamed: (renamed) => {
      onRenamed(renamed);
      renderBooks(root, { books: renamed, fileId, onOpen, onCreated, onRenamed });
    },
  });

  const bookName = root.querySelector('input[name=bookName]');
  bookName.placeholder = t.bookNamePlaceholder;
  renderAccountForm(root.querySelector('main'), {
    texts: { ...es.onboarding, ...es.accountAdmin, ...t, submit: t.create, creating: t.creating },
    needsConnection: true,
    check: () => nameProblem(validateBookName(bookName.value, books), t),
    onSubmit: (account) => createNewBook({ name: bookName.value, account }, books).then(onCreated),
  });

  renderNavbar(root, { active: 'settings' });
}
