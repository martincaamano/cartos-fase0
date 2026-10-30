// Fixed bottom bar with the five sections (design §2). A section without a
// screen in the router table is shown dimmed and does not respond. Touches
// the DOM only when called.

import { es } from '../../i18n/es.js';
import { SECTION_HASH } from './router.js';

const SECTIONS = [
  { id: 'home', label: es.navbar.home },
  { id: 'history', label: es.navbar.history },
  { id: 'add', label: es.navbar.add, ariaLabel: es.navbar.addLabel },
  { id: 'analysis', label: es.navbar.analysis },
  { id: 'settings', label: es.navbar.settings },
];

// onReselect: what tapping the section already on view does (INICIO shows
// its hidden amounts); nothing by default.
export function renderNavbar(container, { active = 'home', onReselect = null } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  for (const section of SECTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = section.id === 'add' ? 'navbar-item navbar-add' : 'navbar-item';
    button.textContent = section.label;
    if (section.ariaLabel) button.setAttribute('aria-label', section.ariaLabel);
    if (section.id === active) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'page');
    }
    button.disabled = !(section.id in SECTION_HASH);
    button.addEventListener('click', () => {
      if (section.id === active && onReselect) onReselect();
      else location.hash = SECTION_HASH[section.id];
    });
    nav.appendChild(button);
  }
  container.appendChild(nav);
}
