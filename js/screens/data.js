// Ajustes → Datos (tareas 16 and 20d): import movements, download the CSV
// template and download the whole book in that CSV. The files are read and
// made on the device; only the user's Drive is written.

import { es } from '../../i18n/es.js';
import { bookToCsv, templateCsv } from '../domain/import-csv.js';
import { toIsoDate } from '../domain/movement.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts } from '../ui/components.js';
import { linkRow } from '../ui/receipt.js';
import { saveFile } from '../ui/download.js';
import { renderNavbar } from '../ui/navbar.js';

// book: what "Descargar mis datos" saves.
export function renderData(root, { book }) {
  const t = es.dataScreen;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <ul class="receipt-list settings-data"></ul>
      <p class="form-error settings-save-failed" role="alert" data-text="saveFailed" hidden></p>
      <p class="text-muted form-note" data-text="note"></p>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const problem = root.querySelector('.settings-save-failed');
  // Straight from the tap: iOS only opens the share sheet then.
  const download = (name, text) => () => {
    problem.hidden = true;
    saveFile(name, text()).catch((err) => {
      console.warn('Save failed', err);
      problem.hidden = false;
    });
  };
  root.querySelector('.settings-data').append(
    linkRow({ label: t.importData, hash: SECTION_HASH.import, valueClass: '' }),
    linkRow({
      label: t.template,
      end: '↓',
      valueClass: '',
      className: 'settings-template',
      onClick: download(t.templateFile, () => templateCsv(es.importer.templateRows)),
    }),
    linkRow({
      label: t.exportData,
      end: '↓',
      valueClass: '',
      className: 'settings-export',
      onClick: download(t.exportFile.replace('{date}', toIsoDate(new Date())), () => bookToCsv(book)),
    }),
  );

  renderNavbar(root, { active: 'settings' });
}
