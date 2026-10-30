// A book's card (Ajustes → Libros, tarea 20c): a new book with its first
// account, or the name of the book open. Both go straight to Drive, so
// they need a connection.

import { es } from '../../i18n/es.js';
import { validateBookName } from '../domain/books.js';
import { createNewBook, renameBook } from '../data/books.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const NAME_ERRORS = { name_required: 'bookNameRequired', name_taken: 'bookNameTaken', name_too_long: 'bookNameTooLong' };

// The text for a book name problem, or ''.
const nameProblem = (errors, t) => (errors.length ? t[NAME_ERRORS[errors[0]]] : '');

const skeleton = (body) => `
  <main class="screen screen-form screen-with-navbar screen-card">
    <a class="link-button back-link" data-text="backList"></a>
    <h1 class="form-title"></h1>
    ${body}
  </main>
`;

// A new book: its name and its first account. onCreated(result).
export function renderBookNew(root, { books, onCreated }) {
  const t = es.books;
  root.innerHTML = skeleton(`
    <label class="field book-new-name">
      <span class="field-label" data-text="bookName"></span>
      <input class="field-input" name="bookName" autocomplete="off" maxlength="40">
    </label>
    <p class="text-muted form-note" data-text="newNote"></p>
  `);
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.books;
  root.querySelector('.form-title').textContent = t.newTitle;

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

// The name of the book open. onRenamed(books).
export function renderBookEdit(root, { books, fileId, onRenamed }) {
  const t = es.books;
  root.innerHTML = skeleton(`
    <form class="form book-rename" novalidate>
      <label class="field">
        <span class="field-label" data-text="bookName"></span>
        <input class="field-input" name="name" autocomplete="off" maxlength="40">
      </label>
      <p class="form-error" role="alert"></p>
      <button type="submit" class="btn-primary form-submit" data-text="rename"></button>
    </form>
  `);
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.books;
  root.querySelector('.form-title').textContent = t.renameTitle;

  const form = root.querySelector('form');
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

  renderNavbar(root, { active: 'settings' });
}
