// A book's card (Ajustes → Libros, tareas 20c and 18): a new book with its
// first account, or the name of the book open and, in a shared book, its
// people and sharing it with someone. All go straight to Drive, so they
// need a connection.

import { es } from '../../i18n/es.js';
import { validateBookName } from '../domain/books.js';
import { createNewBook, renameBook } from '../data/books.js';
import { readMembers, shareBook } from '../data/members.js';
import { ValidationError } from '../data/errors.js';
import { memberName } from '../domain/members.js';
import { receiptLine } from '../ui/receipt.js';
import { fillTexts, renderAccountForm } from '../ui/components.js';
import { SECTION_HASH } from '../ui/router.js';
import { renderNavbar } from '../ui/navbar.js';

const EMAIL_ERRORS = { email_required: 'emailRequired', email_invalid: 'emailInvalid', email_own: 'emailOwn' };

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
    <section class="book-people-section" hidden>
      <h2 class="receipt-heading" data-text="people"></h2>
      <ul class="receipt-list book-people"></ul>
      <form class="form book-share" novalidate hidden>
        <label class="field">
          <span class="field-label" data-text="shareEmail"></span>
          <input class="field-input" name="email" type="email" autocomplete="off" autocapitalize="off" inputmode="email">
        </label>
        <p class="form-error" role="alert"></p>
        <p class="text-muted form-note book-share-done" role="status"></p>
        <button type="submit" class="btn-primary book-share-submit" data-text="share"></button>
      </form>
      <p class="text-muted form-note book-shared-with-you" data-text="sharedWithYou" hidden></p>
    </section>
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

  const info = books.find((book) => book.fileId === fileId);
  if (info?.bookType === 'shared') renderPeople(root.querySelector('.book-people-section'), { fileId, canShare: info.canShare !== false, t });

  renderNavbar(root, { active: 'settings' });
}

// A shared book's people (tab Members) and, for whoever can share it, the
// form to share it with someone.
function renderPeople(section, { fileId, canShare, t }) {
  section.hidden = false;
  const list = section.querySelector('.book-people');
  const paint = (members) => {
    list.replaceChildren(...(members.length
      ? members.map((member) => receiptLine(memberName(member), member.email))
      : [receiptLine(t.peopleEmpty, '', { className: 'text-muted' })]));
  };
  const note = (text) => list.replaceChildren(receiptLine(text, '', { className: 'text-muted' }));
  if (navigator.onLine) {
    note(t.peopleLoading);
    readMembers(fileId).then(paint).catch((err) => {
      console.warn('Members read failed', err);
      note(t.peopleOffline);
    });
  } else {
    note(t.peopleOffline);
  }

  if (!canShare) {
    section.querySelector('.book-shared-with-you').hidden = false;
    return;
  }
  const form = section.querySelector('.book-share');
  form.hidden = false;
  const { email } = form.elements;
  email.placeholder = t.sharePlaceholder;
  const error = form.querySelector('.form-error');
  const done = form.querySelector('.book-share-done');
  const submit = form.querySelector('.book-share-submit');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    done.textContent = '';
    if (!navigator.onLine) { error.textContent = t.shareOffline; return; }
    const address = email.value.trim();
    submit.disabled = true;
    submit.textContent = t.sharing;
    shareBook(fileId, address).then((members) => {
      paint(members);
      done.textContent = t.shared.replace('{email}', address);
      email.value = '';
    }).catch((err) => {
      console.warn('Book share failed', err);
      error.textContent = err instanceof ValidationError ? t[EMAIL_ERRORS[err.errors[0]]] : (navigator.onLine ? t.shareFailed : t.shareOffline);
    }).finally(() => {
      submit.disabled = false;
      submit.textContent = t.share;
    });
  });
}
