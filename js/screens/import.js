// Import (docs/tareas/tarea-16.md): pick a Cartos CSV or JSON file, check
// it, show what the book will look like and write it. From the onboarding
// it creates the book; from Ajustes (book given) it adds to it. The file is
// read on the device; only the book goes to the user's Drive.

import { es } from '../../i18n/es.js';
import { buildImport, countDuplicates, summarizeImport, validateImport } from '../domain/import.js';
import { locateErrors, parseImportFile } from '../domain/import-csv.js';
import { importIntoBook, importPersonalBook, startingBook } from '../data/books.js';
import { fillTexts } from '../ui/components.js';
import { formatDate, formatEuros, labelOf } from '../ui/format.js';
import { receiptLine } from '../ui/receipt.js';

// At most this many problems are listed; the rest are counted.
const SHOWN_ERRORS = 5;

// { at: 'movements[12]', code } → "Movimiento 13: importe no válido".
function errorText({ at, code }, t) {
  const [, list, index] = at.match(/^(\w+)\[(\d+)\]$/) ?? [];
  const what = t.codes[code] ?? code;
  return list ? `${t.where[list]} ${Number(index) + 1}: ${what}` : what;
}

// book: the book to add to (Ajustes); none in the onboarding, where a new
// one is made (fileId: an empty one from an earlier try).
export function renderImport(root, { book = null, fileId = null, onDone, onBack }) {
  const t = es.importer;
  const adding = Boolean(book);
  root.innerHTML = `
    <main class="screen screen-form">
      <button type="button" class="link-button back-link" data-text="${adding ? 'backSettings' : 'back'}"></button>
      <h1 class="form-title" data-text="${adding ? 'titleAppend' : 'title'}"></h1>
      <p class="text-muted form-note" data-text="${adding ? 'noteAppend' : 'note'}"></p>
      <label class="field import-pick">
        <span class="field-label" data-text="file"></span>
        <input class="field-input" type="file" name="file" accept=".csv,text/csv,.json,application/json">
      </label>
      <div class="import-errors" role="alert" hidden>
        <p class="form-error"></p>
        <ul class="import-error-list"></ul>
      </div>
      <section class="import-preview" hidden>
        <h2 class="receipt-heading" data-text="accounts"></h2>
        <ul class="receipt-list import-accounts"></ul>
        <p class="text-muted import-span"></p>
        <p class="text-muted import-new" hidden></p>
        <p class="form-error import-duplicates" hidden></p>
        <p class="form-error import-failed" role="alert"></p>
        <button type="button" class="btn-primary form-submit import-confirm" data-text="confirm"></button>
      </section>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').addEventListener('click', onBack);

  const input = root.querySelector('input[type=file]');
  const errors = root.querySelector('.import-errors');
  const preview = root.querySelector('.import-preview');
  const confirm = root.querySelector('.import-confirm');
  const failed = root.querySelector('.import-failed');
  const target = book ?? startingBook();
  let data = null;

  const showErrors = (list) => {
    data = null;
    preview.hidden = true;
    errors.hidden = false;
    errors.querySelector('.form-error').textContent = t.invalid;
    const items = list.slice(0, SHOWN_ERRORS).map((error) => {
      const item = document.createElement('li');
      item.textContent = errorText(error, t);
      return item;
    });
    if (list.length > SHOWN_ERRORS) {
      const more = document.createElement('li');
      more.textContent = t.moreErrors.replace('{n}', list.length - SHOWN_ERRORS);
      items.push(more);
    }
    errors.querySelector('.import-error-list').replaceChildren(...items);
  };

  const showPreview = (summary) => {
    errors.hidden = true;
    preview.hidden = false;
    failed.textContent = '';
    const lines = summary.accounts.map((account) =>
      receiptLine(labelOf(account), formatEuros(account.balance), { tone: account.balance < 0 ? 'expense' : '' }));
    lines.push(receiptLine(t.total, formatEuros(summary.total), { className: 'import-total' }));
    root.querySelector('.import-accounts').replaceChildren(...lines);
    root.querySelector('.import-span').textContent = summary.count === 0
      ? t.noMovements
      : t.span
        .replace('{n}', summary.count)
        .replace('{from}', formatDate(summary.firstDate))
        .replace('{to}', formatDate(summary.lastDate));
    const created = root.querySelector('.import-new');
    created.hidden = !adding || summary.newAccounts + summary.newCategories === 0;
    created.textContent = t.newRows
      .replace('{accounts}', summary.newAccounts)
      .replace('{categories}', summary.newCategories);
    const duplicates = root.querySelector('.import-duplicates');
    duplicates.hidden = summary.duplicates === 0;
    duplicates.textContent = t.duplicates.replace('{n}', summary.duplicates);
  };

  // What the book will be once the file is in.
  const summarize = () => {
    const rows = buildImport(data, target);
    const whole = {
      accounts: [...target.accounts, ...rows.accounts],
      movements: [...target.movements, ...rows.movements],
    };
    return {
      ...summarizeImport(whole, data.movements),
      newAccounts: rows.accounts.length,
      newCategories: rows.categories.length,
      duplicates: countDuplicates(target.movements, rows.movements),
    };
  };

  input.addEventListener('change', async () => {
    const [file] = input.files;
    if (!file) return;
    const parsed = parseImportFile(await file.text());
    if (parsed.errors) return showErrors(parsed.errors);
    const problems = validateImport(parsed.data, target);
    if (problems.length) return showErrors(locateErrors(problems, parsed.data.lines));
    data = parsed.data;
    return showPreview(summarize());
  });

  confirm.addEventListener('click', () => {
    if (!data) return;
    confirm.disabled = true;
    confirm.textContent = t.importing;
    failed.textContent = '';
    (adding ? importIntoBook(fileId, data) : importPersonalBook({ fileId, data }))
      .then(onDone)
      .catch((err) => {
        console.warn('Import failed', err);
        failed.textContent = navigator.onLine ? t.failed : t.offline;
        confirm.disabled = false;
        confirm.textContent = t.confirm;
      });
  });
}
