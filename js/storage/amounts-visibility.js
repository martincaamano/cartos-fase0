// Whether INICIO hides its amounts (tarea 23): the eye next to the total.
// Kept on the device; the first time, they are shown.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.amountsHidden';

export function loadAmountsHidden(storage) {
  try {
    return storage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAmountsHidden(storage, hidden) {
  try {
    storage.setItem(KEY, hidden ? '1' : '0');
  } catch (err) {
    console.warn('Amounts visibility write failed', err);
  }
}
