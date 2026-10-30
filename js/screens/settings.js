// Settings (design §3.8, tarea 20d), in two groups. LIBRO: Libros, Cuentas,
// Categorías and Datos, each saying where it stands (the book open, how
// many). APP: Tema, Diagnóstico and signing out, with the account's email.

import { es } from '../../i18n/es.js';
import { activeOnly } from '../domain/active.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { loadTheme } from '../ui/theme.js';

const THEME_TEXT = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

// A row of the receipt list: label, its value in grey and "›".
function settingsRow({ label, value = '', hash }) {
  const item = document.createElement('li');
  item.className = 'receipt-line';
  const row = document.createElement('a');
  row.className = 'receipt-row settings-link';
  row.href = hash;
  const text = document.createElement('span');
  text.textContent = label;
  const end = document.createElement('span');
  end.className = 'settings-value';
  end.textContent = value ? `${value} ›` : '›';
  row.append(text, end);
  item.appendChild(row);
  return item;
}

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
    settingsRow({ label: t.books, value: bookName, hash: SECTION_HASH.books }),
    settingsRow({ label: t.accounts, value: String(activeOnly(book.accounts).length), hash: SECTION_HASH.accounts }),
    settingsRow({ label: t.categories, value: String(activeOnly(book.categories).length), hash: SECTION_HASH.categories }),
    settingsRow({ label: t.data, value: t.dataHint, hash: SECTION_HASH.data }),
  );

  const signOutItem = document.createElement('li');
  signOutItem.className = 'receipt-line';
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'receipt-row settings-link settings-signout';
  const signOutText = document.createElement('span');
  signOutText.textContent = t.signOut;
  const email = document.createElement('span');
  email.className = 'settings-email';
  email.textContent = user?.email ?? '';
  signOut.append(signOutText, email);
  signOutItem.appendChild(signOut);
  root.querySelector('.settings-app').append(
    settingsRow({ label: t.theme, value: t[THEME_TEXT[loadTheme()]], hash: SECTION_HASH.theme }),
    settingsRow({ label: t.diagnostics, hash: SECTION_HASH.diagnostics }),
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
