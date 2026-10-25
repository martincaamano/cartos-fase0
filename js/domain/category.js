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
