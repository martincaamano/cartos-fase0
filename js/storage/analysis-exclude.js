// The categories left out of Análisis, per book (tarea 20e), kept on the
// device. Only ids.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.analysisExclude';

function read(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// → the category ids left out in that book ([] when none).
export function loadExcluded(storage, fileId) {
  const ids = read(storage)[fileId];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

export function saveExcluded(storage, fileId, ids) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...read(storage), [fileId]: [...ids] }));
  } catch (err) {
    console.warn('Analysis exclusions write failed', err);
  }
}
