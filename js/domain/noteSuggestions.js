// Note suggestions in Añadir (tarea 27): the notes used most with the
// category chosen, of that type, to fill in with a tap. The same note
// written in another way («Agua», «agua») counts once and shows as written
// last. Pure; the normalisation is that of the search (domain/search.js).

import { TRANSFER_CATEGORY_ID } from './category.js';
import { normalizeText } from './search.js';

// How many suggestions at most.
export const SUGGESTION_COUNT = 4;

const wordsOfNote = (text) => normalizeText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Whether a note answers what is typed: each word typed starts a word of
// the note («ag» → «Agua», «fact lu» → «factura luz»).
function startsWords(note, typed) {
  const noteWords = wordsOfNote(note);
  return wordsOfNote(typed).every((word) => noteWords.some((candidate) => candidate.startsWith(word)));
}

// The movements whose notes are offered: active, of the category and type
// chosen; for type 'transfer', the outgoing half of each transfer within
// the book (a transfer to another book is a movement with its own category).
function sourceOf(movements, { type, categoryId }) {
  if (type === 'transfer') {
    return movements.filter((m) => !m.deleted && m.categoryId === TRANSFER_CATEGORY_ID && m.type === 'expense');
  }
  return movements.filter((m) => !m.deleted && m.type === type && m.categoryId === categoryId);
}

// The notes to offer: most used first, then the one used last; those that
// match `typed` (all when empty), never one equal to it. type: 'expense',
// 'income' or 'transfer' (categoryId is ignored then).
export function suggestNotes(movements, { type, categoryId = null, typed = '', limit = SUGGESTION_COUNT }) {
  const notes = new Map();
  for (const movement of sourceOf(movements, { type, categoryId })) {
    const text = String(movement.note ?? '').trim();
    if (!text) continue;
    const key = normalizeText(text);
    const when = `${movement.date ?? ''}|${movement.createdAt ?? ''}`;
    const known = notes.get(key);
    if (!known) notes.set(key, { text, count: 1, when });
    else {
      known.count += 1;
      if (when > known.when) Object.assign(known, { text, when });
    }
  }
  const written = normalizeText(typed.trim());
  return [...notes]
    .filter(([key, note]) => key !== written && startsWords(note.text, typed))
    .sort(([, a], [, b]) => b.count - a.count || b.when.localeCompare(a.when))
    .slice(0, limit)
    .map(([, note]) => note.text);
}
