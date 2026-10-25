// Full-screen message: loading the book, offline without a device copy, or
// a failed load with a retry button.

import { es } from '../../i18n/es.js';

export function renderStatus(root, { message, onRetry = null }) {
  root.innerHTML = `
    <main class="screen screen-auth">
      <h1 class="auth-title"></h1>
      <p class="text-muted auth-note" role="status"></p>
    </main>
  `;
  root.querySelector('.auth-title').textContent = es.appName;
  root.querySelector('.auth-note').textContent = message;
  if (onRetry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-primary auth-button';
    button.textContent = es.status.retry;
    button.addEventListener('click', onRetry);
    root.querySelector('main').appendChild(button);
  }
}
