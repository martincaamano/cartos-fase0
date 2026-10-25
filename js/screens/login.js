// Login: the app name, Google's sign-in button and one line on privacy.

import { es } from '../../i18n/es.js';
import { renderSignInButton, whenGoogleReady } from '../data/auth.js';

export function renderLogin(root, { onSignedIn }) {
  root.innerHTML = `
    <main class="screen screen-auth">
      <h1 class="auth-title"></h1>
      <div class="auth-action"></div>
      <p class="text-muted auth-note"></p>
      <p class="auth-status" role="status"></p>
    </main>
  `;
  root.querySelector('.auth-title').textContent = es.appName;
  root.querySelector('.auth-note').textContent = es.login.note;

  whenGoogleReady().then((ready) => {
    if (!ready) {
      root.querySelector('.auth-status').textContent = es.login.unavailable;
      return;
    }
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    renderSignInButton(root.querySelector('.auth-action'), {
      theme: dark ? 'outline' : 'filled_black',
      onSignedIn,
    });
  });
}
