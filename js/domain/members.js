// The people of a shared book (architecture §5, tarea 18): who has access
// and how each one is named. Each person writes their own row in the tab
// Members the first time they open the book.

const defaults = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// "  Ana@Gmail.com " and "ana@gmail.com" are the same person.
export const normalizeEmail = (email) => String(email ?? '').trim().toLocaleLowerCase('en');

// A plain check: something@something.something, no spaces. Google has the
// last word when sharing.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Error codes for sharing with `email`; empty means valid. own: the email of
// the person sharing (sharing with oneself makes no sense).
export function validateShareEmail(email, own = '') {
  const value = normalizeEmail(email);
  if (!value) return ['email_required'];
  if (!EMAIL.test(value)) return ['email_invalid'];
  if (own && value === normalizeEmail(own)) return ['email_own'];
  return [];
}

// A row for the tab Members. user: { email, name } of the signed-in person.
export function createMember({ email, name = '' }, deps = {}) {
  const { now, newId } = { ...defaults, ...deps };
  return {
    id: newId(),
    email: normalizeEmail(email),
    name: String(name ?? '').trim(),
    createdAt: now().toISOString(),
  };
}

export const isMember = (members, email) => members.some((member) => normalizeEmail(member.email) === normalizeEmail(email));

// How a person is shown: the first word of their name, or their email when
// the name is empty ("Martín Caamaño" → "Martín").
export function memberName(member) {
  const first = String(member?.name ?? '').trim().split(/\s+/)[0];
  return first || String(member?.email ?? '');
}

// A Drive file the Picker returned can be opened as a shared book only when
// it is a Cartos book and not someone's personal one.
export function isSharedBookFile(file) {
  return file?.appProperties?.app === 'cartos' && file.appProperties.bookType !== 'personal';
}
