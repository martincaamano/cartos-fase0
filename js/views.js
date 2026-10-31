// How each screen of the router table (js/ui/router.js) is painted once the
// book is ready. One entry per section; a test checks that the table and
// this map list the same sections.
//
// ctx: { root, state (book-state), params, offline, redirect(hash), saved(hash),
// signOut() }.

import { SECTIONS, SECTION_HASH } from './ui/router.js';
import { findEntry } from './domain/history.js';
import { getCurrentUser } from './data/auth.js';
import { cachedBook } from './data/books.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderAddMovement } from './screens/addMovement.js';
import { renderHistory } from './screens/history.js';
import { renderAnalysis } from './screens/analysis.js';
import { renderSettings } from './screens/settings.js';
import { renderDiagnostics } from './screens/diagnostics.js';
import { renderCategories } from './screens/categories.js';
import { renderAccounts } from './screens/accounts.js';
import { renderImport } from './screens/import.js';
import { renderBooks } from './screens/books.js';
import { renderData } from './screens/data.js';
import { renderTheme } from './screens/theme.js';
import { renderBookEdit, renderBookNew } from './screens/book-card.js';
import { renderAccountCard } from './screens/account-card.js';
import { renderCategoryCard } from './screens/category-card.js';

// The name of the book open, shown on top of INICIO and Añadir when there
// is more than one book.
const bookName = (state) => (state.books.length > 1 ? state.bookInfo?.name ?? '' : '');

// INICIO shows its amounts once INICIO is tapped again (tarea 20d).
let amountsRevealed = false;

// After a card saved to the Sheet: back to its list, which repaints once
// the book is read again.
const savedTo = (state, redirect, hash) => () => {
  redirect(hash);
  state.reloadBook();
};

// The other books with a copy on the device: where a transfer can go.
const otherBooks = (state) => state.books
  .filter((info) => info.fileId !== state.fileId)
  .map((info) => ({ fileId: info.fileId, name: info.name, book: cachedBook(info.fileId) }))
  .filter((other) => other.book);

export const VIEWS = Object.freeze({
  [SECTIONS.HOME]: function home({ root, state, offline, repaint }) {
    // Amounts arrive hidden on every visit; fresh data keeps what was chosen.
    if (!repaint) amountsRevealed = false;
    renderDashboard(root, {
      book: state.book,
      bookName: bookName(state),
      offline,
      pendingCount: state.pendingCount,
      revealed: amountsRevealed,
      onReveal: () => {
        amountsRevealed = true;
        home({ root, state, offline, repaint: true });
      },
    });
  },

  [SECTIONS.HISTORY]: ({ root, state, params }) => renderHistory(root, { book: state.book, params }),

  [SECTIONS.EDIT]: ({ root, state, params, redirect, saved }) => {
    const book = state.book;
    const entry = findEntry(book.movements, params.id);
    // Deleted meanwhile, or a stale link.
    if (!entry) return redirect(SECTION_HASH.history);
    return renderAddMovement(root, {
      book, bookName: bookName(state), fileId: state.fileId, entry, onSaved: saved(SECTION_HASH.history),
      ownEmail: getCurrentUser()?.email ?? '',
    });
  },

  [SECTIONS.ADD]: ({ root, state, params, saved }) =>
    renderAddMovement(root, {
      book: state.book,
      bookName: bookName(state),
      otherBooks: otherBooks(state),
      fileId: state.fileId,
      params,
      onSaved: saved(SECTION_HASH.home),
      ownEmail: getCurrentUser()?.email ?? '',
    }),

  [SECTIONS.ANALYSIS]: ({ root, state, params }) => renderAnalysis(root, { book: state.book, fileId: state.fileId, params }),

  [SECTIONS.SETTINGS]: ({ root, state, signOut }) => renderSettings(root, {
    user: getCurrentUser(),
    book: state.book,
    bookName: state.bookInfo?.name ?? '',
    pendingCount: state.pendingCount,
    onSignOut: signOut,
  }),

  [SECTIONS.DATA]: ({ root, state }) => renderData(root, { book: state.book }),

  [SECTIONS.THEME]: ({ root }) => renderTheme(root),

  [SECTIONS.CATEGORIES]: ({ root, state }) => renderCategories(root, { book: state.book }),

  [SECTIONS.CATEGORY_NEW]: ({ root, state, redirect }) =>
    renderCategoryCard(root, { book: state.book, fileId: state.fileId, onDone: savedTo(state, redirect, SECTION_HASH.categories) }),

  [SECTIONS.CATEGORY_EDIT]: ({ root, state, params, redirect }) => {
    const category = state.book.categories.find((item) => item.id === params.id && !item.deleted);
    if (!category) return redirect(SECTION_HASH.categories);
    return renderCategoryCard(root, {
      book: state.book, fileId: state.fileId, category, onDone: savedTo(state, redirect, SECTION_HASH.categories),
    });
  },

  [SECTIONS.ACCOUNTS]: ({ root, state }) => renderAccounts(root, { book: state.book }),

  [SECTIONS.ACCOUNT_NEW]: ({ root, state, redirect }) =>
    renderAccountCard(root, { book: state.book, fileId: state.fileId, onDone: savedTo(state, redirect, SECTION_HASH.accounts) }),

  [SECTIONS.ACCOUNT_EDIT]: ({ root, state, params, redirect }) => {
    const account = state.book.accounts.find((item) => item.id === params.id && !item.deleted);
    if (!account) return redirect(SECTION_HASH.accounts);
    return renderAccountCard(root, {
      book: state.book, fileId: state.fileId, account, onDone: savedTo(state, redirect, SECTION_HASH.accounts),
    });
  },

  [SECTIONS.DIAGNOSTICS]: ({ root }) => renderDiagnostics(root),

  [SECTIONS.IMPORT]: ({ root, state, redirect }) => renderImport(root, {
    book: state.book,
    fileId: state.fileId,
    onBack: () => redirect(SECTION_HASH.settings),
    // The Dashboard opens with the imported movements already read.
    onDone: async () => {
      await state.reloadBook();
      redirect(SECTION_HASH.home);
    },
  }),

  [SECTIONS.BOOKS]: ({ root, state }) => renderBooks(root, {
    books: state.books,
    fileId: state.fileId,
    onOpen: (fileId) => {
      state.switchBook(fileId);
      location.hash = SECTION_HASH.home;
    },
    onShared: (result) => {
      state.setUp(result);
      location.hash = SECTION_HASH.home;
    },
  }),

  [SECTIONS.BOOK_NEW]: ({ root, state }) => renderBookNew(root, {
    books: state.books,
    onCreated: (result) => {
      state.setUp(result);
      location.hash = SECTION_HASH.home;
    },
  }),

  [SECTIONS.BOOK_EDIT]: ({ root, state, redirect }) => renderBookEdit(root, {
    books: state.books,
    fileId: state.fileId,
    onRenamed: (books) => {
      state.renamed(books);
      redirect(SECTION_HASH.books);
    },
    onShared: () => state.reloadBook(),
  }),
});
