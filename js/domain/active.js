// Deletes are logical (architecture §2): a row with deleted = true stays in
// the Sheet but no longer counts anywhere. These helpers keep that rule in
// one place.

export const isActive = (item) => !item.deleted;

export const activeOnly = (items) => items.filter(isActive);

export const activeIds = (items) => activeOnly(items).map((item) => item.id);
