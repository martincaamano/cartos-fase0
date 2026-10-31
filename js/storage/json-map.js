// A small map kept on the device as JSON under one key (localStorage in the
// app, a fake in the tests): the last account per book, the last transfer
// categories per account, the categories left out of Análisis per book.
// Reads never throw (a missing or broken value is an empty map) and
// writes only warn: losing one of these conveniences must not stop the app.

export function readMap(storage, key) {
  try {
    const data = JSON.parse(storage.getItem(key) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// Sets one entry of the map, keeping the others.
export function writeEntry(storage, key, id, value) {
  try {
    storage.setItem(key, JSON.stringify({ ...readMap(storage, key), [id]: value }));
  } catch (err) {
    console.warn(`${key} write failed`, err);
  }
}
