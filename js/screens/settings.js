// Settings (design §3.8, tarea 20d), in two groups. LIBRO: Libros, Cuentas,
// Categorías and Datos, each saying where it stands (the book open, how
// many). APP: Tema, Diagnóstico and signing out, with the account's email.

import { es } from '../../i18n/es.js';
import { activeOnly } from '../domain/active.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { loadTheme, THEME_TEXT } from '../ui/theme.js';
import { linkRow } from '../ui/receipt.js';

// user: { email } of the signed-in account. book: the book open; bookName:
// its name. pendingCount: changes not in the Sheet yet; signing out with
// some asks for a second tap.
export function renderSettings(root, { user = null, book, bookName = '', pendingCount = 0, onSignOut }) {
  const t = es.settings;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <h2 class="receipt-heading" data-text="book"></h2>
      <ul class="receipt-list settings-list"></ul>
      <h2 class="receipt-heading" data-text="app"></h2>
      <ul class="receipt-list settings-app"></ul>
      <p class="text-muted form-note signout-warning" role="alert" hidden></p>
    </main>
  `;
  fillTexts(root, t);

  root.querySelector('.settings-list').append(
    linkRow({ label: t.books, value: bookName, hash: SECTION_HASH.books }),
    linkRow({ label: t.accounts, value: String(activeOnly(book.accounts).length), hash: SECTION_HASH.accounts }),
    linkRow({ label: t.categories, value: String(activeOnly(book.categories).length), hash: SECTION_HASH.categories }),
    linkRow({ label: t.data, value: t.dataHint, hash: SECTION_HASH.data }),
  );

  // Signing out: a button row with the account's email in place of the arrow.
  const signOutItem = linkRow({ label: t.signOut, value: user?.email ?? '', end: '', className: 'settings-signout', valueClass: 'settings-email' });
  const signOut = signOutItem.querySelector('button');
  const signOutText = signOut.firstChild;
  root.querySelector('.settings-app').append(
    linkRow({ label: t.theme, value: t[THEME_TEXT[loadTheme()]], hash: SECTION_HASH.theme }),
    linkRow({ label: t.diagnostics, hash: SECTION_HASH.diagnostics }),
    signOutItem,
  );

  const warning = root.querySelector('.signout-warning');
  let armed = pendingCount === 0;
  signOut.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      warning.hidden = false;
      warning.textContent = pendingCount === 1 ? t.pendingOne : t.pendingMany.replace('{n}', pendingCount);
      signOutText.textContent = t.signOutAnyway;
      return;
    }
    onSignOut();
  });

  renderNavbar(root, { active: 'settings' });
}
