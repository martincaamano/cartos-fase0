// Ajustes → Tema (tarea 20d): the mode, Sistema · Claro · Oscuro. It applies
// at once and stays on the device. When there are more palettes (design
// §1.2) they are chosen here too.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts, renderChoices } from '../ui/components.js';
import { renderNavbar } from '../ui/navbar.js';
import { applyTheme, loadTheme, saveTheme, THEME_TEXT, THEMES } from '../ui/theme.js';

export function renderTheme(root) {
  const t = es.themeScreen;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <h2 class="receipt-heading" data-text="mode"></h2>
      <div class="chip-row theme-picker" role="group"></div>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const row = root.querySelector('.theme-picker');
  row.setAttribute('aria-label', t.mode);
  renderChoices(row, THEMES.map((theme) => ({ value: theme, label: es.settings[THEME_TEXT[theme]] })), {
    selected: loadTheme(),
    dataKey: 'theme',
    onSelect: (theme) => {
      saveTheme(theme);
      applyTheme(theme);
    },
  });

  renderNavbar(root, { active: 'settings' });
}
