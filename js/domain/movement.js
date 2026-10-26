// A movement (Movements tab). Direction comes from `type`; `amount` is always
// positive (architecture §2). Deletes are logical: the row stays, `deleted`
// becomes true.

import { hasAtMostTwoDecimals } from './money.js';

export const MOVEMENT_TYPES = Object.freeze(['income', 'expense']);

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

export function createMovement(fields, { userSub = '', ...deps } = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const at = now().toISOString();
  return {
    id: newId(),
    accountId: fields.accountId,
    type: fields.type,
    amount: fields.amount,
    date: fields.date,
    categoryId: fields.categoryId,
    note: String(fields.note ?? ''),
    transferId: fields.transferId ?? '',
    personId: fields.personId ?? '',
    createdBy: userSub,
    createdAt: at,
    updatedAt: at,
    deleted: false,
  };
}

// YYYY-MM-DD that is also a real calendar day (no 2026-02-30).
export function isValidDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Returns a list of error codes; empty means valid.
export function validateMovement(movement, { accountIds, categoryIds }) {
  const accounts = new Set(accountIds);
  const categories = new Set(categoryIds);
  const errors = [];
  if (!MOVEMENT_TYPES.includes(movement.type)) errors.push('type_invalid');
  if (typeof movement.amount !== 'number' || !(movement.amount > 0) || !hasAtMostTwoDecimals(movement.amount)) {
    errors.push('amount_invalid');
  }
  if (!isValidDate(movement.date)) errors.push('date_invalid');
  if (!accounts.has(movement.accountId)) errors.push('account_unknown');
  if (!categories.has(movement.categoryId)) errors.push('category_unknown');
  return errors;
}

// Local calendar day as YYYY-MM-DD (no time zone conversion).
export function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Hoy / Ayer / Anteayer for the date picker. `today` is passed in so month
// and year boundaries can be tested.
export function quickDates(today) {
  const shift = (days) => toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  return { today: shift(0), yesterday: shift(1), dayBefore: shift(2) };
}

// A new version of a saved movement: same id, author, creation time, type
// and transferId; only the editable fields and updatedAt change. Validate
// the result with validateMovement.
export function editMovement(original, fields, now = new Date()) {
  return {
    ...original,
    accountId: fields.accountId,
    amount: fields.amount,
    date: fields.date,
    categoryId: fields.categoryId,
    note: String(fields.note ?? ''),
    updatedAt: now.toISOString(),
  };
}

export function markDeleted(movement, now = new Date()) {
  return { ...movement, deleted: true, updatedAt: now.toISOString() };
}
