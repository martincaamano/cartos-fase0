// An in-memory localStorage for the tests. initial: { key: value } or
// [[key, value], ...]. The Map is exposed as `data` (and `items`) to look
// inside.
export function fakeStorage(initial = {}) {
  const data = new Map(Array.isArray(initial) ? initial : Object.entries(initial));
  return {
    data,
    items: data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => data.delete(key),
  };
}
