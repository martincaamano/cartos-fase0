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

// The section marked last time: the mark slides from there (tarea 23).
let markedBefore = null;

// active: the section on view; tapping it again does nothing.
export function renderNavbar(container, { active = 'home' } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'navbar';
  // The mark under the active section, one fifth of the bar per section.
  const mark = document.createElement('span');
  mark.className = 'navbar-mark';
  mark.setAttribute('aria-hidden', 'true');
  const place = (id) => { mark.style.setProperty('--at', String(SECTIONS.findIndex((section) => section.id === id))); };
  place(markedBefore ?? active);
  nav.appendChild(mark);
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
      if (section.id !== active) location.hash = SECTION_HASH[section.id];
    });
    nav.appendChild(button);
  }
  container.appendChild(nav);
  // From where it was to the section on view, once it is on screen.
  if (markedBefore !== null && markedBefore !== active) requestAnimationFrame(() => requestAnimationFrame(() => place(active)));
  else place(active);
  markedBefore = active;
}
