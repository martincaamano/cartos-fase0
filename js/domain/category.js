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

export function validateCategory(category) {
  const errors = [];
  if (!String(category.name ?? '').trim()) errors.push('name_required');
  if (!CATEGORY_KINDS.includes(category.kind)) errors.push('kind_invalid');
  return errors;
}
