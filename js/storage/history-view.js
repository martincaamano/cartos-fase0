// The Historial view chosen last, Resumen or Lista (tarea 20b), kept on the
// device. The filters are not kept: History opens clean every time.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.historyView';

export const HISTORY_VIEWS = Object.freeze(['summary', 'list']);

export function loadHistoryView(storage) {
  try {
    const view = storage.getItem(KEY);
    return HISTORY_VIEWS.includes(view) ? view : HISTORY_VIEWS[0];
  } catch {
    return HISTORY_VIEWS[0];
  }
}

export function saveHistoryView(storage, view) {
  try {
    storage.setItem(KEY, view);
  } catch (err) {
    console.warn('History view write failed', err);
  }
}
