// Drive access: first grant (mode "connect") or renewal of an expired token
// (mode "reconnect"). Same flow, different texts.

import { es } from '../../i18n/es.js';
import { prepareDriveAccess, requestDriveAccess, whenGoogleReady } from '../data/auth.js';

export function renderConnect(root, { mode, onConnected }) {
  const texts = mode === 'reconnect'
    ? { ...es.connect, ...es.reconnect }
    : es.connect;

  root.innerHTML = `
    <main class="screen screen-auth">
      <h1 class="auth-title"></h1>
      <p class="text-muted auth-note"></p>
      <button type="button" class="btn-primary auth-button" disabled></button>
      <p class="auth-status" role="status"></p>
    </main>
  `;
  root.querySelector('.auth-title').textContent = texts.title;
  root.querySelector('.auth-note').textContent = texts.note;
  const button = root.querySelector('.auth-button');
  const status = root.querySelector('.auth-status');
  button.textContent = texts.button;

  whenGoogleReady().then((ready) => {
    if (!ready) {
      status.textContent = texts.unavailable;
      return;
    }
    prepareDriveAccess();
    button.disabled = false;
  });

  button.addEventListener('click', () => {
    button.disabled = true;
    status.textContent = '';
    requestDriveAccess()
      .then(onConnected)
      .catch((err) => {
        status.textContent = err.code === 'popup_closed' || err.code === 'scope_denied'
          ? texts.cancelled
          : texts.failed;
        button.disabled = false;
      });
  });
}
