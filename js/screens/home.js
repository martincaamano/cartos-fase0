// Placeholder shown after login until the Dashboard exists (tarea 04).

import { es } from '../../i18n/es.js';

export function renderHome(root, { email, offline }) {
  root.innerHTML = `
    <main class="screen screen-auth">
      <h1 class="auth-title"></h1>
      <p class="home-email"></p>
      <p class="text-muted home-status" role="status"></p>
    </main>
  `;
  root.querySelector('.auth-title').textContent = es.appName;
  root.querySelector('.home-email').textContent = email;
  root.querySelector('.home-status').textContent = offline ? es.home.offline : es.home.connected;
}
