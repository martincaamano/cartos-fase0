// The two categories last used for a transfer to an account of another
// book, so the next one (the monthly contribution) comes filled in. Kept on
// the device, per destination account; only ids, never names or amounts.
//
// The storage area is passed in (localStorage in the app, a fake in the tests).

const KEY = 'cartos.transferCategories';

function read(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// → { expenseCategoryId, incomeCategoryId } or null.
export function loadTransferCategories(storage, toAccountId) {
  const entry = read(storage)[toAccountId];
  if (typeof entry?.expenseCategoryId !== 'string' || typeof entry?.incomeCategoryId !== 'string') return null;
  return { expenseCategoryId: entry.expenseCategoryId, incomeCategoryId: entry.incomeCategoryId };
}

export function saveTransferCategories(storage, toAccountId, { expenseCategoryId, incomeCategoryId }) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...read(storage), [toAccountId]: { expenseCategoryId, incomeCategoryId } }));
  } catch (err) {
    console.warn('Transfer categories write failed', err);
  }
}
