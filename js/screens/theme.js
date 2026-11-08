// Ajustes → Tema (tarea 20d, 32): the style (Cartos · Libreta…) and the
// mode (Sistema · Claro · Oscuro). Each applies at once and stays on the
// device, so the app opens with the last one chosen.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from '../ui/router.js';
import { fillTexts, renderChoices } from '../ui/dom.js';
import { renderNavbar } from '../ui/navbar.js';
import {
  applyPalette, applyTheme, loadPalette, loadTheme, PALETTES, savePalette, saveTheme, THEME_TEXT, THEMES,
} from '../ui/theme.js';

export function renderTheme(root) {
  const t = es.themeScreen;
  root.innerHTML = `
    <main class="screen screen-form screen-with-navbar">
      <a class="link-button back-link" data-text="back"></a>
      <h1 class="form-title" data-text="title"></h1>
      <h2 class="receipt-heading" data-text="style"></h2>
      <div class="chip-row palette-picker" role="group"></div>
      <h2 class="receipt-heading" data-text="mode"></h2>
      <div class="chip-row theme-picker" role="group"></div>
    </main>
  `;
  fillTexts(root, t);
  root.querySelector('.back-link').href = SECTION_HASH.settings;

  const styles = root.querySelector('.palette-picker');
  styles.setAttribute('aria-label', t.style);
  renderChoices(styles, PALETTES.map((palette) => ({ value: palette, label: t.palettes[palette] })), {
    selected: loadPalette(),
    dataKey: 'palette',
    onSelect: (palette) => {
      savePalette(palette);
      applyPalette(palette);
    },
  });

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
