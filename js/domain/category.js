// Categories of a book (Categories tab). Names come from the caller (i18n),
// so this module holds no visible text.

export const CATEGORY_KINDS = Object.freeze(['expense', 'income', 'both']);

// Fixed id so transfers can always find their category.
export const TRANSFER_CATEGORY_ID = 'transfer';

export const DEFAULT_CATEGORIES = Object.freeze([
  { key: 'groceries', emoji: '🛒', kind: 'expense' },
  { key: 'restaurants', emoji: '🍽️', kind: 'expense' },
  { key: 'transport', emoji: '🚗', kind: 'expense' },
  { key: 'home', emoji: '🏠', kind: 'expense' },
  { key: 'bills', emoji: '💡', kind: 'expense' },
  { key: 'leisure', emoji: '🎉', kind: 'expense' },
  { key: 'health', emoji: '💊', kind: 'expense' },
  { key: 'clothing', emoji: '👕', kind: 'expense' },
  { key: 'subscriptions', emoji: '📺', kind: 'expense' },
  { key: 'otherExpense', emoji: '📦', kind: 'expense' },
  { key: 'salary', emoji: '💼', kind: 'income' },
  { key: 'otherIncome', emoji: '💰', kind: 'income' },
  { key: 'transfer', emoji: '🔁', kind: 'both' },
]);

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// names: { [key]: visible name }, one per DEFAULT_CATEGORIES entry.
export function buildDefaultCategories(names, deps = {}) {
  const { now, newId } = { ...defaults, ...deps };
  const at = now().toISOString();
  return DEFAULT_CATEGORIES.map(({ key, emoji, kind }) => {
    if (!names[key]) throw new Error(`Missing name for default category: ${key}`);
    return {
      id: key === 'transfer' ? TRANSFER_CATEGORY_ID : newId(),
      name: names[key],
      emoji,
      kind,
      isDefault: true,
      updatedAt: at,
      deleted: false,
    };
  });
}

// A category created by the user (never a default one).
export function createCategory({ name, emoji = '', kind }, deps = {}) {
  const { now, newId } = { ...defaults, ...deps };
  return {
    id: newId(),
    name: String(name ?? '').trim(),
    emoji: String(emoji ?? '').trim(),
    kind,
    isDefault: false,
    updatedAt: now().toISOString(),
    deleted: false,
  };
}

const sameName = (a, b) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

// existing: the categories already in the book; a deleted one does not block
// reusing its name.
export function validateCategory(category, existing = []) {
  const errors = [];
  const name = String(category.name ?? '').trim();
  if (!name) errors.push('name_required');
  else if (existing.some((other) => !other.deleted && other.id !== category.id && sameName(other.name, name))) {
    errors.push('name_taken');
  }
  if (!CATEGORY_KINDS.includes(category.kind)) errors.push('kind_invalid');
  return errors;
}

export function canRemoveCategory(category) {
  return category.id !== TRANSFER_CATEGORY_ID && !category.deleted;
}

// Transferencia is fixed: it is neither edited nor removed.
export const canEditCategory = canRemoveCategory;

// How many active movements use a category.
export function categoryUses(category, movements) {
  return movements.filter((movement) => !movement.deleted && movement.categoryId === category.id).length;
}

// A new version of a saved category (its card in Ajustes → Categorías):
// same id; name, emoji and kind change. Validate it with validateCategoryEdit.
export function editCategory(original, { name, emoji = '', kind }, now = new Date()) {
  return {
    ...original,
    name: String(name ?? '').trim(),
    emoji: String(emoji ?? '').trim(),
    kind,
    updatedAt: now.toISOString(),
  };
}

// validateCategory, plus: Transferencia is not editable, and the kind only
// changes while no movement uses the category (they would end up with a
// category of the other type).
export function validateCategoryEdit(edited, original, { categories = [], movements = [] } = {}) {
  if (!canEditCategory(original)) return ['not_editable'];
  const errors = validateCategory(edited, categories);
  if (edited.kind !== original.kind && categoryUses(original, movements) > 0) errors.push('kind_in_use');
  return errors;
}

// How far back the use of a category counts for its place (tarea 28): what
// is used now goes first, not what was used a year ago.
export const RANK_MONTHS = 6;

// The first day that counts: today, RANK_MONTHS months ago ("2026-11-07" →
// "2026-05-07"; a day the month lacks still compares right as text).
function rankSince(today) {
  const [year, month] = today.split('-').map(Number);
  const index = year * 12 + (month - 1) - RANK_MONTHS;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-${today.slice(8, 10)}`;
}

// Categories offered for a movement type, most used first: active
// movements of that type in the last RANK_MONTHS months (today:
// YYYY-MM-DD; without it, all of them). Ties: the one used last first, then
// the book order (defaults first). Transfer is never offered by hand.
export function rankCategories(categories, movements, type, today = null) {
  const since = today ? rankSince(today) : '';
  const uses = new Map();
  const last = new Map();
  for (const movement of movements) {
    if (movement.deleted || movement.type !== type || (since && !(movement.date >= since))) continue;
    uses.set(movement.categoryId, (uses.get(movement.categoryId) ?? 0) + 1);
    if (!(last.get(movement.categoryId) >= movement.date)) last.set(movement.categoryId, movement.date ?? '');
  }
  const lastOf = (id) => last.get(id) ?? '';
  return categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => !category.deleted && category.id !== TRANSFER_CATEGORY_ID
      && (category.kind === type || category.kind === 'both'))
    .sort((a, b) => (uses.get(b.category.id) ?? 0) - (uses.get(a.category.id) ?? 0)
      || lastOf(b.category.id).localeCompare(lastOf(a.category.id))
      || a.index - b.index)
    .map(({ category }) => category);
}

// Every category a list offers (History filters, Análisis exclusions,
// Ajustes → Categorías): expenses first, then incomes, each most used
// first (rankCategories). One of both kinds is listed once, with the expenses.
export function rankAllCategories(categories, movements, today = null) {
  return [
    ...rankCategories(categories, movements, 'expense', today),
    ...rankCategories(categories, movements, 'income', today).filter((c) => c.kind !== 'both'),
  ];
}

// --- Moving a category's movements to another one (tarea 29) ---

// The types (expense, income) of the active movements of a category.
export function typesUsed(categoryId, movements) {
  return [...new Set(movements.filter((m) => !m.deleted && m.categoryId === categoryId).map((m) => m.type))];
}

// Where the movements of `origin` may go: active categories, not origin,
// not Transferencia, accepting every type its movements use (gasto → gasto
// or «ambas»; ingreso → ingreso or «ambas»).
export function moveTargets(origin, categories, movements) {
  const types = typesUsed(origin.id, movements);
  return categories.filter((c) => !c.deleted && c.id !== origin.id && c.id !== TRANSFER_CATEGORY_ID
    && types.every((type) => c.kind === 'both' || c.kind === type));
}

// Returns a list of error codes; empty means the move can be done.
export function validateMove(origin, target, { categories, movements }) {
  if (!origin || origin.deleted) return ['category_unknown'];
  if (!canRemoveCategory(origin)) return ['not_removable'];
  if (!target) return ['target_unknown'];
  if (target.id === origin.id) return ['same_category'];
  if (!moveTargets(origin, categories, movements).some((c) => c.id === target.id)) return ['target_invalid'];
  return [];
}

// What changes when the movements of `origin` go to `target`: those
// movements and the goals that use it get the new category; with remove,
// origin is marked deleted too. Deleted ones are left as they are.
// → { movements: [changed], goals: [changed], categories: [origin deleted] | [] }
export function moveCategory(origin, target, { movements, goals = [] }, { remove = false, now = new Date() } = {}) {
  const at = now.toISOString();
  const moved = (items) => items
    .filter((item) => !item.deleted && item.categoryId === origin.id)
    .map((item) => ({ ...item, categoryId: target.id, updatedAt: at }));
  return {
    movements: moved(movements),
    goals: moved(goals),
    categories: remove ? [{ ...origin, deleted: true, updatedAt: at }] : [],
  };
}
