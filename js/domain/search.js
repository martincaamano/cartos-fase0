// Searching the notes (tarea 26): «Andorra», «regalo Ana». Words in any
// order, without caring about capitals or accents, as a fragment
// («Andorra» finds «gasolina Andorra») and forgiving a typo («Andorro»
// finds «Andorra»). Most of the words are enough. Pure; the text
// normalisation is shared with the note suggestions (tarea 27).

// The rules, in one place to adjust them.
// Words shorter than this are ignored («a», «de», «el»).
export const MIN_WORD = 3;
// A typo is forgiven from this length on: one letter off; from TYPO_TWO
// letters on, two.
export const TYPO_ONE = 5;
export const TYPO_TWO = 8;

// Lowercase and without accents: «Peña Álvarez» → «pena alvarez».
export function normalizeText(text) {
  return String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

// The words of a text, normalised, the short ones left out.
export function wordsOf(text) {
  return normalizeText(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_WORD);
}

// Letters to change, add or remove to turn a into b (Levenshtein).
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

const typosAllowed = (word) => (word.length >= TYPO_TWO ? 2 : word.length >= TYPO_ONE ? 1 : 0);

// Whether a word of the note answers a word searched (both normalised): it
// contains it, or it (or its start) is a typo away from it.
export function wordMatches(searched, word) {
  if (word.includes(searched)) return true;
  const allowed = typosAllowed(searched);
  if (allowed === 0) return false;
  if (editDistance(searched, word) <= allowed) return true;
  return word.length > searched.length && editDistance(searched, word.slice(0, searched.length)) <= allowed;
}

// How many of `count` words searched must be found: all of one or two,
// one may be missing from three on.
export const wordsNeeded = (count) => (count <= 2 ? count : count - 1);

// Whether a note answers a search, and which of its words did (normalised,
// to mark them). An empty search (no word long enough) answers every note.
// → { matches, words: Set }
export function matchNote(note, query) {
  const searched = [...new Set(wordsOf(query))];
  if (searched.length === 0) return { matches: true, words: new Set() };
  const noteWords = wordsOf(note);
  const words = new Set();
  let found = 0;
  for (const word of searched) {
    const hits = noteWords.filter((candidate) => wordMatches(word, candidate));
    if (hits.length > 0) found += 1;
    for (const hit of hits) words.add(hit);
  }
  return { matches: found >= wordsNeeded(searched.length), words };
}

// Whether there is anything to search for.
export const isSearching = (query) => wordsOf(query).length > 0;

// A note cut into pieces, those to mark flagged: [{ text, hit }]. words:
// from matchNote. The note keeps its own spelling.
export function markedParts(note, words) {
  const parts = [];
  for (const piece of String(note ?? '').split(/([\p{L}\p{N}]+)/u)) {
    if (!piece) continue;
    const hit = words.has(normalizeText(piece));
    const last = parts.at(-1);
    if (last && last.hit === hit) last.text += piece;
    else parts.push({ text: piece, hit });
  }
  return parts;
}
