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

// Categories offered for a movement type, most used first; ties keep the
// book order (defaults first). Transfer is never offered by hand.
export function rankCategories(categories, movements, type) {
  const uses = new Map();
  for (const movement of movements) {
    if (!movement.deleted && movement.type === type) {
      uses.set(movement.categoryId, (uses.get(movement.categoryId) ?? 0) + 1);
    }
  }
  return categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => !category.deleted && category.id !== TRANSFER_CATEGORY_ID
      && (category.kind === type || category.kind === 'both'))
    .sort((a, b) => (uses.get(b.category.id) ?? 0) - (uses.get(a.category.id) ?? 0) || a.index - b.index)
    .map(({ category }) => category);
}

// Every category a list offers (History filters, Análisis exclusions,
// Ajustes → Categorías): expenses first, then incomes, each most used
// first. One of both kinds is listed once, with the expenses.
export function rankAllCategories(categories, movements) {
  return [
    ...rankCategories(categories, movements, 'expense'),
    ...rankCategories(categories, movements, 'income').filter((c) => c.kind !== 'both'),
  ];
}
