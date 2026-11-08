// Feedback on what the user does: a busy button, the text for an error,
// the toast with «Deshacer», and the two taps that confirm a removal.

import { el } from './dom.js';
import { failureResult, logEvent } from '../storage/logs.js';

// A button busy with something: disabled, with `text`. Returns what puts
// it back as it was (when the work failed).
export function setBusy(button, text) {
  const idle = button.textContent;
  button.disabled = true;
  button.textContent = text;
  return () => {
    button.disabled = false;
    button.textContent = idle;
  };
}

// A change that goes straight to Drive failed: why, as far as the device
// knows.
export const failureText = (failed, offline) => (navigator.onLine ? failed : offline);

// The text for the first error code that has one. map: { code: textKey }.
export function errorText(codes, map, texts) {
  const key = codes.map((code) => map[code]).find(Boolean);
  return key ? texts[key] : '';
}

// How long a toast stays (tarea 23).
export const TOAST_MS = 5000;

// A short notice on top of the screen («✓ 12,50 € · 🛒 Supermercado»), with
// an optional action (Deshacer). It lives outside the screen, so a repaint
// keeps it; a new one replaces it. onAction runs once and closes it.
export function showToast({ text, action = '', onAction = null, duration = TOAST_MS }) {
  document.querySelector('.toast')?.remove();
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.appendChild(el('span', 'toast-text', text));
  const close = () => {
    clearTimeout(timer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 200);
  };
  if (action && onAction) {
    const button = el('button', 'link-button toast-action', action);
    button.type = 'button';
    button.addEventListener('click', () => {
      close();
      onAction();
    });
    toast.appendChild(button);
  }
  const timer = setTimeout(close, duration);
  document.body.appendChild(toast);
  return close;
}

// How long «¿Seguro?» waits for the second tap (tarea 23).
export const CONFIRM_MS = 5000;

// Two taps (Borrar, Quitar): the first one asks with `confirm`, the second
// one shows `busy` and runs work(), a promise. Without a second tap within
// CONFIRM_MS the button goes back as at first. If work fails the button is
// back as at first and fails(err) says why. before() may stop a tap
// (returns false), e.g. when offline.
export function twoTap(button, { confirm, busy, work, fails = () => {}, before = () => true }) {
  const idle = button.textContent;
  let armed = false;
  let timer = null;
  const disarm = () => {
    armed = false;
    button.textContent = idle;
  };
  button.addEventListener('click', () => {
    if (!before()) return;
    if (!armed) {
      armed = true;
      button.textContent = confirm;
      timer = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    clearTimeout(timer);
    const restore = setBusy(button, busy);
    work().catch((err) => {
      fails(err);
      restore();
      disarm();
    });
  });
}

// Something the user did failed: kept in the technical log (Diagnóstico) as
// where it happened and the error's name and code, never its data; and in
// the console. where: a short code, e.g. 'categoryMove'.
export function reportFailure(where, err) {
  console.warn(`${where} failed`, err);
  logEvent({ type: 'error', result: failureResult(where, err) }).catch(() => {});
}
