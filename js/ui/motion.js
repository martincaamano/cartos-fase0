// Movement (tarea 23): blocks that unfold and fold away, and amounts that
// count to their new value. Durations and easing come from the tokens
// (--motion, --ease); with reduced motion nothing moves.

import { countAmount } from '../domain/money.js';
import { formatEuros } from './format.js';

// Folding (tarea 23): a block grows from nothing to its height when it
// opens, and shrinks back when it closes. Durations and easing come from
// the tokens (--motion, --ease), so CSS and JS move alike. With reduced
// motion nothing moves.
const stillMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function motionToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function resize(node, from, to) {
  node.style.overflow = 'hidden';
  const run = node.animate([from, to], {
    duration: parseFloat(motionToken('--motion', '260ms')),
    easing: motionToken('--ease', 'ease-out'),
  });
  return run.finished.catch(() => {}).then(() => { node.style.overflow = ''; });
}

// A block just shown (or just inserted, once it is on screen) unfolds.
export function unfold(node) {
  if (!node?.animate || stillMotion()) return;
  resize(node, { height: '0px', opacity: 0 }, { height: `${node.scrollHeight}px`, opacity: 1 });
}

// A block about to be hidden or removed folds up; resolves when it has, so
// the caller hides or removes it then.
export function foldAway(node) {
  if (!node?.animate || stillMotion()) return Promise.resolve();
  return resize(node, { height: `${node.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 });
}

// An amount that changed counts from the old one to the new one (tarea 23),
// so the change is seen. from: what was shown before, or null (shown at
// once, as when there was none or nothing moves). format: euros → text.
const COUNT_MS = 600;

// startedAt: when the count began (a repaint in the middle carries on).
export function showAmount(node, value, { from = null, format = formatEuros, startedAt = null } = {}) {
  if (from === null || from === value || stillMotion() || !globalThis.requestAnimationFrame) {
    node.textContent = format(value);
    return;
  }
  const start = startedAt ?? performance.now();
  const step = (now) => {
    const progress = (now - start) / COUNT_MS;
    node.textContent = format(countAmount(from, value, progress));
    if (progress < 1 && node.isConnected) requestAnimationFrame(step);
  };
  node.textContent = format(countAmount(from, value, (performance.now() - start) / COUNT_MS));
  requestAnimationFrame(step);
}

// An amount kept in `seen` (key → { value, from, start }) across paints:
// it counts when it changed since last shown, and a repaint while it counts
// (fresh data after a sync) carries on instead of jumping to the end.
export function showSeenAmount(node, seen, key, value, options = {}) {
  const now = performance.now();
  const last = seen.get(key);
  if (last && last.value !== value) seen.set(key, { value, from: last.value, start: now });
  else if (!last) seen.set(key, { value, from: null, start: now });
  const { from, start } = seen.get(key);
  const counting = from !== null && now - start < COUNT_MS;
  showAmount(node, value, { ...options, from: counting ? from : null, startedAt: start });
}

// A block that just changed size grows (or shrinks) from `before`, its
// height a moment ago, to its height now (tarea 28).
export function resizedFrom(node, before) {
  if (!node?.animate || stillMotion()) return;
  const after = node.offsetHeight;
  if (after !== before) resize(node, { height: `${before}px` }, { height: `${after}px` });
}

// Opens or folds a block (its hidden attribute), moving. changed(open) runs
// once it changed: right away when opening (so the block is painted before
// it unfolds), after folding away when closing.
export function toggleFold(body, changed = () => {}) {
  if (body.hidden) {
    body.hidden = false;
    changed(true);
    unfold(body);
    return Promise.resolve(true);
  }
  return foldAway(body).then(() => {
    body.hidden = true;
    changed(false);
    return false;
  });
}
