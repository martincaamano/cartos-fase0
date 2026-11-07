import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText, wordsOf, editDistance, wordMatches, wordsNeeded, matchNote, isSearching, markedParts,
  MIN_WORD, TYPO_ONE, TYPO_TWO,
} from '../js/domain/search.js';

// --- rules ---

test('the rules are the documented ones', () => {
  assert.equal(MIN_WORD, 3);
  assert.equal(TYPO_ONE, 5);
  assert.equal(TYPO_TWO, 8);
});

// --- normalizeText ---

test('normalizeText lowercases and strips accents', () => {
  assert.equal(normalizeText('Peña Álvarez'), 'pena alvarez');
  assert.equal(normalizeText('CAFÉ Ñandú ÜBER'), 'cafe nandu uber');
  assert.equal(normalizeText('Año'), 'ano');
});

test('normalizeText keeps punctuation, digits and spaces', () => {
  assert.equal(normalizeText('Gasolina, 2026!'), 'gasolina, 2026!');
});

test('normalizeText of empty, null or undefined is an empty string; numbers become text', () => {
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText(42), '42');
});

// --- wordsOf ---

test('wordsOf splits on spaces and punctuation, normalised', () => {
  assert.deepEqual(wordsOf('Gasolina, Andorra! (viaje)'), ['gasolina', 'andorra', 'viaje']);
  assert.deepEqual(wordsOf('auto-escuela/clase'), ['auto', 'escuela', 'clase']);
  assert.deepEqual(wordsOf('  Peña   Álvarez  '), ['pena', 'alvarez']);
});

test('wordsOf drops words shorter than MIN_WORD and keeps those of exactly 3', () => {
  assert.deepEqual(wordsOf('viaje a Andorra de el Ana'), ['viaje', 'andorra', 'ana']);
  assert.deepEqual(wordsOf('a de el'), []);
  assert.deepEqual(wordsOf('pago 2026 n 12'), ['pago', '2026']);
});

test('wordsOf of empty, null or punctuation-only text is an empty list', () => {
  assert.deepEqual(wordsOf(''), []);
  assert.deepEqual(wordsOf(null), []);
  assert.deepEqual(wordsOf(undefined), []);
  assert.deepEqual(wordsOf('  ,;!? -- '), []);
});

// --- editDistance ---

test('editDistance basic cases', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('andorra', 'andorra'), 0);
  assert.equal(editDistance('andorro', 'andorra'), 1); // change
  assert.equal(editDistance('andora', 'andorra'), 1); // add
  assert.equal(editDistance('andorrra', 'andorra'), 1); // remove
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('flaw', 'lawn'), 2);
  assert.equal(editDistance('ab', 'ba'), 2); // a swap is two edits
});

test('editDistance is symmetric', () => {
  assert.equal(editDistance('restaurante', 'restauranet'), editDistance('restauranet', 'restaurante'));
  assert.equal(editDistance('casa', 'cosas'), editDistance('cosas', 'casa'));
});

// --- wordMatches ---

test('wordMatches: an exact word', () => {
  assert.equal(wordMatches('andorra', 'andorra'), true);
  assert.equal(wordMatches('ana', 'ana'), true);
});

test('wordMatches: a fragment inside a longer word', () => {
  assert.equal(wordMatches('andorra', 'gasolinaandorra'), true);
  assert.equal(wordMatches('ana', 'mariana'), true);
  assert.equal(wordMatches('casa', 'casamiento'), true);
  // The other way round is not a fragment: the note word is shorter.
  assert.equal(wordMatches('gasolinaandorra', 'andorra'), false);
});

test('wordMatches: 5 to 7 letters forgive one typo, not two', () => {
  assert.equal(wordMatches('andorro', 'andorra'), true); // distance 1
  assert.equal(wordMatches('andora', 'andorra'), true); // distance 1
  assert.equal(wordMatches('regal', 'regalo'), true); // fragment
  assert.equal(wordMatches('rigalo', 'regalo'), true); // distance 1, 6 letters
  assert.equal(wordMatches('andarro', 'andorra'), false); // distance 2, 7 letters
  assert.equal(wordMatches('hptel', 'hotel'), true); // 5 letters, distance 1
  assert.equal(wordMatches('hptdl', 'hotel'), false); // 5 letters, distance 2
});

test('wordMatches: 8 or more letters forgive two typos, not three', () => {
  assert.equal(editDistance('restaurante', 'restauranet'), 2);
  assert.equal(wordMatches('restauranet', 'restaurante'), true);
  assert.equal(wordMatches('gasolona', 'gasolina'), true); // 8 letters, distance 1
  assert.equal(wordMatches('gesolona', 'gasolina'), true); // 8 letters, distance 2
  assert.equal(editDistance('rxstxurxnte', 'restaurante'), 3);
  assert.equal(wordMatches('rxstxurxnte', 'restaurante'), false);
});

test('wordMatches: words of 3 or 4 letters forgive no typo', () => {
  assert.equal(wordMatches('casa', 'cosa'), false);
  assert.equal(wordMatches('cena', 'cenas'), true); // fragment, not a typo
  assert.equal(wordMatches('cosa', 'casamiento'), false);
  assert.equal(wordMatches('ana', 'ano'), false);
  assert.equal(wordMatches('ana', 'eva'), false);
});

test('wordMatches: a typo against the start of a longer word', () => {
  // Whole word: distance 3; its start «andorr»: distance 1 (6 letters, 1 allowed).
  assert.equal(editDistance('andoro', 'andorrano'), 3);
  assert.equal(editDistance('andoro', 'andorr'), 1);
  assert.equal(wordMatches('andoro', 'andorrano'), true);
  // «andorro» against «andorra…» (start «andorra»): distance 1.
  assert.equal(wordMatches('andorro', 'andorrano'), true);
  // Start two letters off with 7 letters: no.
  assert.equal(wordMatches('andarro', 'andorrano'), false);
  // The start, not the middle: «andorro» is not near the start of «gasolinaandorra».
  assert.equal(wordMatches('andorro', 'gasolinaandorra'), false);
});

test('wordMatches: a typo against a shorter note word', () => {
  assert.equal(wordMatches('andorra', 'andorr'), true); // distance 1
  assert.equal(wordMatches('andorra', 'ando'), false); // distance 3
});

// --- wordsNeeded ---

test('wordsNeeded: all of one or two, one may be missing from three on', () => {
  assert.equal(wordsNeeded(0), 0);
  assert.equal(wordsNeeded(1), 1);
  assert.equal(wordsNeeded(2), 2);
  assert.equal(wordsNeeded(3), 2);
  assert.equal(wordsNeeded(4), 3);
  assert.equal(wordsNeeded(5), 4);
});

// --- matchNote ---

const sorted = (set) => [...set].sort();

test('matchNote: word order does not matter', () => {
  const result = matchNote('Andorra viaje', 'viaje a Andorra');
  assert.equal(result.matches, true);
  assert.deepEqual(sorted(result.words), ['andorra', 'viaje']);
});

test('matchNote ignores capitals and accents on both sides', () => {
  assert.equal(matchNote('Regalo para Ana', 'REGALO aná').matches, true);
  assert.equal(matchNote('Cena con Peña', 'pena').matches, true);
  assert.equal(matchNote('Cena con Pena', 'PEÑA').matches, true);
});

test('matchNote ignores short words of the search', () => {
  // «a» and «de» are not searched: only «gasolina» counts, and it is there.
  assert.equal(matchNote('Gasolina', 'a de gasolina').matches, true);
  assert.deepEqual(sorted(matchNote('Gasolina', 'a de gasolina').words), ['gasolina']);
});

test('matchNote: 4 of 5 words is enough', () => {
  const note = 'Cena cumpleaños de Ana en el restaurante';
  const result = matchNote(note, 'cena cumpleaños ana restaurante xyzw');
  assert.equal(result.matches, true);
  assert.deepEqual(sorted(result.words), ['ana', 'cena', 'cumpleanos', 'restaurante']);
  // 3 of 5 is not.
  assert.equal(matchNote(note, 'cena cumpleaños ana qqqq xyzw').matches, false);
});

test('matchNote: 1 of 3 is not enough, 2 of 3 is', () => {
  assert.equal(matchNote('gasolina andorra', 'andorra hotel cena').matches, false);
  assert.equal(matchNote('gasolina andorra', 'andorra gasolina cena').matches, true);
});

test('matchNote: with 2 words both are required', () => {
  assert.equal(matchNote('gasolina andorra', 'andorra hotel').matches, false);
  assert.equal(matchNote('gasolina andorra', 'andorra gasolina').matches, true);
});

test('matchNote counts a repeated search word once', () => {
  // [andorra, hotel]: 2 words, both needed; repeating andorra does not help.
  assert.equal(matchNote('gasolina andorra', 'andorra andorra hotel').matches, false);
  assert.equal(matchNote('gasolina andorra', 'andorra Andorra').matches, true);
});

test('matchNote with an empty or only-short search matches everything, marking nothing', () => {
  for (const query of ['', '   ', 'a de el', null, undefined, ',;!']) {
    const result = matchNote('Gasolina Andorra', query);
    assert.equal(result.matches, true, `query ${JSON.stringify(query)}`);
    assert.equal(result.words.size, 0);
  }
  assert.equal(matchNote('', '').matches, true);
  assert.equal(matchNote(null, 'de').matches, true);
});

test('matchNote returns the normalised note words that matched', () => {
  assert.deepEqual(sorted(matchNote('Gasolina Andorra; Andorra la Vella', 'andorro').words), ['andorra']);
  assert.deepEqual(sorted(matchNote('GasolinaAndorra', 'andorra').words), ['gasolinaandorra']);
  assert.deepEqual(sorted(matchNote('Viaje a Andorra, gasolina', 'gasolina andorra').words), ['andorra', 'gasolina']);
  // A failed search may still report the words it did find.
  const failed = matchNote('gasolina andorra', 'andorra hotel');
  assert.equal(failed.matches, false);
  assert.deepEqual(sorted(failed.words), ['andorra']);
});

test('matchNote: a null or empty note never matches a real search', () => {
  for (const note of [null, undefined, '', '   ', 'a de']) {
    const result = matchNote(note, 'andorra');
    assert.equal(result.matches, false, `note ${JSON.stringify(note)}`);
    assert.equal(result.words.size, 0);
  }
});

// --- isSearching ---

test('isSearching only when a word is long enough', () => {
  assert.equal(isSearching('andorra'), true);
  assert.equal(isSearching('ana'), true);
  assert.equal(isSearching('  a ana '), true);
  assert.equal(isSearching(''), false);
  assert.equal(isSearching('   '), false);
  assert.equal(isSearching('a de'), false);
  assert.equal(isSearching(null), false);
  assert.equal(isSearching(undefined), false);
});

// --- markedParts ---

test('markedParts keeps the note spelling and punctuation, and flags matched words', () => {
  assert.deepEqual(markedParts('Gasolina, Andorra!', new Set(['andorra'])), [
    { text: 'Gasolina, ', hit: false },
    { text: 'Andorra', hit: true },
    { text: '!', hit: false },
  ]);
});

test('markedParts matches accented note words by their normalised form', () => {
  assert.deepEqual(markedParts('Cena con Peña', new Set(['pena'])), [
    { text: 'Cena con ', hit: false },
    { text: 'Peña', hit: true },
  ]);
});

test('markedParts merges consecutive pieces with the same flag', () => {
  // Non-hit words and separators merge; two hits split by a space stay apart.
  assert.deepEqual(markedParts('Viaje Andorra en coche', new Set(['viaje', 'andorra'])), [
    { text: 'Viaje', hit: true },
    { text: ' ', hit: false },
    { text: 'Andorra', hit: true },
    { text: ' en coche', hit: false },
  ]);
  assert.deepEqual(markedParts('Sin nada que marcar.', new Set()), [{ text: 'Sin nada que marcar.', hit: false }]);
  assert.deepEqual(markedParts('Andorra', new Set(['andorra'])), [{ text: 'Andorra', hit: true }]);
});

test('markedParts joined back gives the note unchanged', () => {
  const note = '  Regalo (Ana) — 2026, ¡sorpresa!  ';
  const parts = markedParts(note, matchNote(note, 'regalo ana').words);
  assert.equal(parts.map((p) => p.text).join(''), note);
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ['Regalo', 'Ana']);
});

test('markedParts of an empty or null note is an empty list', () => {
  assert.deepEqual(markedParts('', new Set(['andorra'])), []);
  assert.deepEqual(markedParts(null, new Set()), []);
  assert.deepEqual(markedParts(undefined, new Set()), []);
});
