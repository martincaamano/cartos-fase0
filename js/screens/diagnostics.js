// Diagnóstico (design §3.9): the latest log entries kept on the device,
// newest first, and a button to copy them. Entries hold only ids, operation
// names and result codes (architecture §9).

import { es } from '../../i18n/es.js';
import { readLogs } from '../storage/logs.js';
import { formatLogLine } from '../ui/format.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';

// Safari only lets the page write to the clipboard from a tap; older
// versions lack navigator.clipboard, so a selected text area is the fallback.
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'offscreen';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy_failed');
}

export function renderDiagnostics(root) {
  const t = es.diagnostics;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <button type="button" class="btn-primary form-submit diagnostics-copy" disabled></button>
      <p class="text-muted diagnostics-status" role="status"></p>
      <pre class="diagnostics-log"></pre>
    </main>
  `;
  fillTexts(root, t);
  const back = root.querySelector('.back-link');
  back.href = SECTION_HASH.settings;
  const copy = root.querySelector('.diagnostics-copy');
  const status = root.querySelector('.diagnostics-status');
  const log = root.querySelector('.diagnostics-log');
  copy.textContent = t.copy;
  status.textContent = t.loading;

  let text = '';
  readLogs()
    .then((entries) => {
      text = entries.slice().reverse().map(formatLogLine).join('\n');
      log.textContent = text;
      status.textContent = entries.length === 0 ? t.empty : t.count.replace('{n}', entries.length);
      copy.disabled = entries.length === 0;
    })
    .catch(() => {
      status.textContent = t.readFailed;
    });

  copy.addEventListener('click', () => {
    copyText(text)
      .then(() => { status.textContent = t.copied; })
      .catch(() => { status.textContent = t.copyFailed; });
  });

  renderNavbar(root, { active: 'settings' });
}
