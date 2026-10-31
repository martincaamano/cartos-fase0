// The categories left out of Análisis, per book (tarea 20e), kept on the
// device. Only ids.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

import { readMap, writeEntry } from './json-map.js';

const KEY = 'cartos.analysisExclude';

// → the category ids left out in that book ([] when none).
export function loadExcluded(storage, fileId) {
  const ids = readMap(storage, KEY)[fileId];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

export function saveExcluded(storage, fileId, ids) {
  writeEntry(storage, KEY, fileId, [...ids]);
}
