// How each screen of the router table (js/ui/router.js) is painted once the
// book is ready. One entry per section; a test checks that the table and
// this map list the same sections.
//
// ctx: { root, state (book-state), params, offline, redirect(hash), saved(hash),
// signOut() }.

import { SECTIONS, SECTION_HASH } from './ui/router.js';
import { findEntry } from './domain/history.js';
import { getCurrentUser } from './data/auth.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderAddMovement } from './screens/addMovement.js';
import { renderHistory } from './screens/history.js';
import { renderAnalysis } from './screens/analysis.js';
import { renderSettings } from './screens/settings.js';
import { renderDiagnostics } from './screens/diagnostics.js';
import { renderCategories } from './screens/categories.js';
import { renderAccounts } from './screens/accounts.js';

export const VIEWS = Object.freeze({
  [SECTIONS.HOME]: ({ root, state, offline }) =>
    renderDashboard(root, { book: state.book, offline, pendingCount: state.pendingCount }),

  [SECTIONS.HISTORY]: ({ root, state }) => renderHistory(root, { book: state.book }),

  [SECTIONS.EDIT]: ({ root, state, params, redirect, saved }) => {
    const book = state.book;
    const entry = findEntry(book.movements, params.id);
    // Deleted meanwhile, or a stale link.
    if (!entry) return redirect(SECTION_HASH.history);
    return renderAddMovement(root, { book, fileId: state.fileId, entry, onSaved: saved(SECTION_HASH.history) });
  },

  [SECTIONS.ADD]: ({ root, state, params, saved }) =>
    renderAddMovement(root, { book: state.book, fileId: state.fileId, params, onSaved: saved(SECTION_HASH.home) }),

  [SECTIONS.ANALYSIS]: ({ root, state, params }) => renderAnalysis(root, { book: state.book, params }),

  [SECTIONS.SETTINGS]: ({ root, state, signOut }) =>
    renderSettings(root, { user: getCurrentUser(), pendingCount: state.pendingCount, onSignOut: signOut }),

  [SECTIONS.CATEGORIES]: ({ root, state }) =>
    renderCategories(root, { book: state.savedBook, fileId: state.fileId, onChanged: state.reloadBook }),

  [SECTIONS.ACCOUNTS]: ({ root, state }) =>
    renderAccounts(root, { book: state.book, fileId: state.fileId, onChanged: state.reloadBook }),

  [SECTIONS.DIAGNOSTICS]: ({ root }) => renderDiagnostics(root),
});
