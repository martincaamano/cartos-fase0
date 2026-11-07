// How each screen of the router table (js/ui/router.js) is painted once the
// book is ready. One entry per section; a test checks that the table and
// this map list the same sections.
//
// ctx: { root, state (book-state), params, offline, redirect(hash), saved(hash),
// signOut() }.

import { SECTIONS, SECTION_HASH } from './ui/router.js';
import { findEntry } from './domain/history.js';
import { activeGoals } from './domain/goals.js';
import { otherMemberName } from './domain/members.js';
import { readMembers } from './data/members.js';
import { getCurrentUser } from './data/auth.js';
import { es } from '../i18n/es.js';
import { cachedBook } from './data/books.js';
import { loadAmountsHidden, saveAmountsHidden } from './storage/amounts-visibility.js';
import { showToast } from './ui/feedback.js';
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
import { renderGoal } from './screens/goal.js';
import { renderGoalCard } from './screens/goal-card.js';

// A goal still active in the book, or null (removed meanwhile, a stale link).
const activeGoalById = (book, id) => activeGoals(book.goals ?? []).find((goal) => goal.id === id) ?? null;

// The people of each shared book, read while the app is open (tarea 25e).
const membersOf = new Map();
const isShared = (state) => state.bookInfo?.bookType === 'shared';
// createdBy → «Tú» for the one signed in; the other person's name in a book
// of two (Members keeps emails, not Google ids); «Otra persona» otherwise.
function personNamer(members) {
  const me = getCurrentUser();
  const other = otherMemberName(members, me?.email) || es.goals.someoneElse;
  return (createdBy) => (createdBy === me?.sub ? es.goals.you : other);
}

// The name of the book open, shown on top of INICIO and Añadir when there
// is more than one book.
const bookName = (state) => (state.books.length > 1 ? state.bookInfo?.name ?? '' : '');

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

// The amounts INICIO showed last, per book, while the app is open: one that
// changed counts to its new value (tarea 23).
const seenAmounts = new Map();
const seenIn = (fileId) => {
  if (!seenAmounts.has(fileId)) seenAmounts.set(fileId, new Map());
  return seenAmounts.get(fileId);
};

export const VIEWS = Object.freeze({
  [SECTIONS.HOME]: function home({ root, state, offline, swapped = false }) {
    renderDashboard(root, {
      book: state.book,
      bookName: bookName(state),
      offline,
      pendingCount: state.pendingCount,
      blockedCount: state.blockedCount,
      hidden: loadAmountsHidden(localStorage),
      seen: seenIn(state.fileId),
      swapped,
      onToggleHidden: () => {
        saveAmountsHidden(localStorage, !loadAmountsHidden(localStorage));
        home({ root, state, offline, repaint: true, swapped: true });
      },
    });
  },

  [SECTIONS.HISTORY]: ({ root, state, params }) => renderHistory(root, { book: state.book, params, pendingIds: state.pendingIds }),

  [SECTIONS.EDIT]: ({ root, state, params, redirect, saved }) => {
    const book = state.book;
    const entry = findEntry(book.movements, params.id);
    // Deleted meanwhile, or a stale link.
    if (!entry) return redirect(SECTION_HASH.history);
    return renderAddMovement(root, {
      book, bookName: bookName(state), fileId: state.fileId, entry, onSaved: saved(SECTION_HASH.history),
    });
  },

  // After saving it stays, clean for the next one, with «✓ … Deshacer».
  // ?goal=: the purchase of a reached goal (tarea 25d); once saved, the goal
  // is completed and INICIO shows what is free again.
  [SECTIONS.ADD]: ({ root, state, params, savedHere, saved }) =>
    renderAddMovement(root, {
      book: state.book,
      bookName: bookName(state),
      otherBooks: otherBooks(state),
      fileId: state.fileId,
      params,
      goal: params.goal ? activeGoalById(state.book, params.goal) : null,
      onPurchased: (movement, completed) => {
        state.saved([completed], 'Goals');
        saved(SECTION_HASH.home)([movement]);
        showToast({ text: `✓ ${es.goals.purchased.replace('{name}', completed.name)}` });
      },
      onSaved: (movements, { summary, undo }) => {
        savedHere(movements);
        showToast({ text: `✓ ${summary}`, action: es.add.undo, onAction: () => undo().then(savedHere) });
      },
    }),

  [SECTIONS.ANALYSIS]: ({ root, state, params, repaint }) =>
    renderAnalysis(root, { book: state.book, fileId: state.fileId, params, animate: !repaint }),

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
      book: state.book,
      fileId: state.fileId,
      category,
      shared: isShared(state),
      onDone: savedTo(state, redirect, SECTION_HASH.categories),
      // Its movements moved to another one (tarea 29): counted at once, one
      // upload; back to the list.
      onMoved: ({ categories, movements, goals }) => {
        state.savedAcross([
          ...categories.map((record) => ({ sheet: 'Categories', record })),
          ...movements.map((record) => ({ sheet: 'Movements', record })),
          ...goals.map((record) => ({ sheet: 'Goals', record })),
        ]);
        redirect(SECTION_HASH.categories);
      },
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
  }),

  // A savings goal (tarea 25c): after each change it stays, with «✓ …
  // Deshacer» when there is something to take back.
  [SECTIONS.GOAL]: function goalView(ctx) {
    const { root, state, params, redirect, savedHere, saved } = ctx;
    const goal = activeGoalById(state.book, params.id);
    if (!goal) return redirect(SECTION_HASH.home);
    // A shared book names who put what (tarea 25e). Its people are read once
    // per book while the app is open; the screen is painted again then.
    const { fileId } = state;
    if (isShared(state) && !membersOf.has(fileId) && navigator.onLine) {
      membersOf.set(fileId, []);
      readMembers(fileId).then((members) => {
        membersOf.set(fileId, members);
        if (state.fileId === fileId && location.hash.startsWith(SECTION_HASH.goal)) goalView(ctx);
      }).catch(() => membersOf.delete(fileId));
    }
    return renderGoal(root, {
      book: state.book,
      fileId: state.fileId,
      goal,
      nameOf: isShared(state) ? personNamer(membersOf.get(fileId) ?? []) : null,
      onSaved: (records, sheet, toast) => {
        savedHere(records, sheet);
        if (toast) showToast({ text: `✓ ${toast.text}`, action: es.add.undo, onAction: () => toast.undo().then((r) => savedHere([r], sheet)) });
      },
      onRemoved: (deleted) => saved(SECTION_HASH.home)([deleted], 'Goals'),
    });
  },

  // A new goal, or ?id= to edit one; then the goal's screen.
  [SECTIONS.GOAL_NEW]: ({ root, state, params, redirect, saved }) => {
    const goal = params.id ? activeGoalById(state.book, params.id) : null;
    if (params.id && !goal) return redirect(SECTION_HASH.home);
    return renderGoalCard(root, {
      book: state.book,
      fileId: state.fileId,
      goal,
      onSaved: (record) => saved(`${SECTION_HASH.goal}?id=${encodeURIComponent(record.id)}`)([record], 'Goals'),
    });
  },
});
