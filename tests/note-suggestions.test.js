import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestNotes, SUGGESTION_COUNT } from '../js/domain/noteSuggestions.js';

let seq = 0;
const mov = (fields) => {
  seq += 1;
  return {
    id: `m${seq}`,
    type: 'expense',
    amount: 10,
    date: '2026-11-01',
    createdAt: '2026-11-01T10:00:00.000Z',
    categoryId: 'food',
    note: '',
    transferId: '',
    deleted: false,
    ...fields,
  };
};

const food = { type: 'expense', categoryId: 'food' };

// --- rules ---

test('SUGGESTION_COUNT is 4', () => {
  assert.equal(SUGGESTION_COUNT, 4);
});

// --- order ---

test('most used note comes first', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-11-05' }),
    mov({ note: 'Leche', date: '2026-11-01' }),
    mov({ note: 'Leche', date: '2026-11-02' }),
    mov({ note: 'Fruta', date: '2026-11-01' }),
    mov({ note: 'Fruta', date: '2026-11-02' }),
    mov({ note: 'Fruta', date: '2026-11-03' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Fruta', 'Leche', 'Pan']);
});

test('on a tie, the one used last by date comes first', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-10-31' }),
    mov({ note: 'Leche', date: '2026-11-30' }),
    mov({ note: 'Fruta', date: '2026-11-01' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Leche', 'Fruta', 'Pan']);
});

test('on a tie with the same date, the one created last comes first', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-11-01', createdAt: '2026-11-01T09:00:00.000Z' }),
    mov({ note: 'Leche', date: '2026-11-01', createdAt: '2026-11-01T18:00:00.000Z' }),
    mov({ note: 'Fruta', date: '2026-11-01', createdAt: '2026-11-01T12:00:00.000Z' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Leche', 'Fruta', 'Pan']);
});

test('the date wins over createdAt (a later date created earlier goes first)', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-11-02', createdAt: '2026-11-01T08:00:00.000Z' }),
    mov({ note: 'Leche', date: '2026-11-01', createdAt: '2026-11-03T08:00:00.000Z' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Pan', 'Leche']);
});

// --- category and type ---

test('only notes of the given category are offered; others never fill in', () => {
  const movements = [
    mov({ note: 'Pan' }),
    mov({ note: 'Gasolina', categoryId: 'car' }),
    mov({ note: 'Gasolina', categoryId: 'car' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Pan']);
  assert.deepEqual(suggestNotes(movements, { type: 'expense', categoryId: 'car' }), ['Gasolina']);
});

test('same category, income and expense are kept apart', () => {
  const movements = [
    mov({ note: 'Cena', type: 'expense', categoryId: 'misc' }),
    mov({ note: 'Bizum Ana', type: 'income', categoryId: 'misc' }),
  ];
  assert.deepEqual(suggestNotes(movements, { type: 'expense', categoryId: 'misc' }), ['Cena']);
  assert.deepEqual(suggestNotes(movements, { type: 'income', categoryId: 'misc' }), ['Bizum Ana']);
});

test('a category without notes gives []', () => {
  const movements = [mov({ note: '' }), mov({ note: 'Gasolina', categoryId: 'car' })];
  assert.deepEqual(suggestNotes(movements, food), []);
  assert.deepEqual(suggestNotes([], food), []);
});

// --- ignored and trimmed ---

test('deleted movements are ignored', () => {
  const movements = [
    mov({ note: 'Pan' }),
    mov({ note: 'Leche', deleted: true }),
    mov({ note: 'Leche', deleted: true }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Pan']);
});

test('deleted uses do not count towards frequency', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-11-01' }),
    mov({ note: 'Leche', date: '2026-11-02' }),
    mov({ note: 'Pan', date: '2026-11-03', deleted: true }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Leche', 'Pan']);
});

test('empty, blank, null and missing notes are ignored', () => {
  const movements = [
    mov({ note: '' }),
    mov({ note: '   ' }),
    mov({ note: null }),
    mov({ note: undefined }),
    mov({ note: 'Pan' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Pan']);
});

test('notes are trimmed and the trimmed form counts with the plain one', () => {
  const movements = [
    mov({ note: '  Pan  ', date: '2026-11-02' }),
    mov({ note: 'Pan', date: '2026-11-01' }),
    mov({ note: 'Leche', date: '2026-11-03' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Pan', 'Leche']);
});

// --- spelling ---

test('the same note in other capitals counts once, shown as written last', () => {
  const movements = [
    mov({ note: 'agua', date: '2026-11-01' }),
    mov({ note: 'Agua', date: '2026-11-02' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Agua']);
  const reversed = [
    mov({ note: 'Agua', date: '2026-11-01' }),
    mov({ note: 'agua', date: '2026-11-02' }),
  ];
  assert.deepEqual(suggestNotes(reversed, food), ['agua']);
});

test('the same note with or without accents counts once, latest by createdAt on the same date', () => {
  const movements = [
    mov({ note: 'Cafe', createdAt: '2026-11-01T18:00:00.000Z' }),
    mov({ note: 'Café', createdAt: '2026-11-01T08:00:00.000Z' }),
    mov({ note: 'CAFÉ', createdAt: '2026-11-01T12:00:00.000Z' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['Cafe']);
});

test('merged spellings add up their uses', () => {
  const movements = [
    mov({ note: 'Pan', date: '2026-11-05' }),
    mov({ note: 'Pan', date: '2026-11-05' }),
    mov({ note: 'agua', date: '2026-11-01' }),
    mov({ note: 'Agua', date: '2026-11-02' }),
    mov({ note: 'ÁGUA', date: '2026-11-03' }),
  ];
  assert.deepEqual(suggestNotes(movements, food), ['ÁGUA', 'Pan']);
});

// --- typed filter ---

const typedSet = [
  mov({ note: 'Agua', date: '2026-11-03' }),
  mov({ note: 'Factura luz', date: '2026-11-02' }),
  mov({ note: 'Fruta', date: '2026-11-01' }),
  mov({ note: 'Guantes', date: '2026-10-30' }),
];

test('typed word prefix matches («ag» → «Agua»)', () => {
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'ag' }), ['Agua']);
});

test('several typed words each start a word of the note («fact lu» → «Factura luz»)', () => {
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'fact lu' }), ['Factura luz']);
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'lu fact' }), ['Factura luz']);
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'fact xx' }), []);
});

test('a typed text inside a word, not at its start, does not match («gua» ≠ «Agua»)', () => {
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'gua' }), ['Guantes']);
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'ua' }), []);
});

test('typed ignores capitals and accents («ÁG» → «Agua»)', () => {
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'ÁG' }), ['Agua']);
  const accented = [mov({ note: 'Café' })];
  assert.deepEqual(suggestNotes(accented, { ...food, typed: 'cafe' }), []); // equal, not offered
  assert.deepEqual(suggestNotes(accented, { ...food, typed: 'caf' }), ['Café']);
});

test('typed prefix shared by several notes keeps the order', () => {
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: 'f' }), ['Factura luz', 'Fruta']);
});

test('empty or blank typed returns all notes', () => {
  const all = ['Agua', 'Factura luz', 'Fruta', 'Guantes'];
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: '' }), all);
  assert.deepEqual(suggestNotes(typedSet, { ...food, typed: '   ' }), all);
  assert.deepEqual(suggestNotes(typedSet, food), all);
});

test('a suggestion equal to what is typed (normalised) is not offered', () => {
  const movements = [mov({ note: 'Agua' }), mov({ note: 'Agua mineral' })];
  assert.deepEqual(suggestNotes(movements, { ...food, typed: 'Agua' }), ['Agua mineral']);
  assert.deepEqual(suggestNotes(movements, { ...food, typed: 'ÁGUA ' }), ['Agua mineral']);
  // «Agua» lacks a word starting with «mineral», and «Agua mineral» is equal: nothing left.
  assert.deepEqual(suggestNotes(movements, { ...food, typed: 'agua mineral' }), []);
});

// --- limit ---

const many = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'].map((note, i) =>
  mov({ note, date: `2026-11-${String(10 - i).padStart(2, '0')}` }));

test('by default at most SUGGESTION_COUNT notes', () => {
  assert.deepEqual(suggestNotes(many, food), ['A1', 'B2', 'C3', 'D4']);
});

test('a custom limit is honoured', () => {
  assert.deepEqual(suggestNotes(many, { ...food, limit: 2 }), ['A1', 'B2']);
  assert.deepEqual(suggestNotes(many, { ...food, limit: 1 }), ['A1']);
  assert.deepEqual(suggestNotes(many, { ...food, limit: 10 }), ['A1', 'B2', 'C3', 'D4', 'E5', 'F6']);
  assert.deepEqual(suggestNotes(many, { ...food, limit: 0 }), []);
});

test('the limit applies after the typed filter', () => {
  const movements = [
    mov({ note: 'Agua', date: '2026-11-05' }),
    mov({ note: 'Ajo', date: '2026-11-04' }),
    mov({ note: 'Arroz', date: '2026-11-03' }),
    mov({ note: 'Atún', date: '2026-11-02' }),
    mov({ note: 'Avena', date: '2026-11-01' }),
    mov({ note: 'Pan', date: '2026-11-06' }),
  ];
  assert.deepEqual(suggestNotes(movements, { ...food, typed: 'a' }), ['Agua', 'Ajo', 'Arroz', 'Atún']);
});

// --- transfers ---

const transferPair = (note, fields = {}, inNote = note) => {
  const transferId = `t${seq + 1}`;
  return [
    mov({ type: 'expense', categoryId: 'transfer', transferId, note, ...fields }),
    mov({ type: 'income', categoryId: 'transfer', transferId, note: inNote, ...fields }),
  ];
};

test('type transfer offers notes of in-book transfers, each transfer once', () => {
  const movements = [
    ...transferPair('Ahorro', { date: '2026-11-01' }),
    ...transferPair('Hucha', { date: '2026-11-02' }),
    ...transferPair('Hucha', { date: '2026-11-03' }),
  ];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer' }), ['Hucha', 'Ahorro']);
});

test('a transfer with both halves noted counts once (only the outgoing half)', () => {
  // «Ahorro» used in 2 transfers (4 halves), «Hucha» in 3 transfers: Hucha first.
  const movements = [
    ...transferPair('Ahorro', { date: '2026-11-05' }),
    ...transferPair('Ahorro', { date: '2026-11-05' }),
    ...transferPair('Hucha', { date: '2026-11-01' }),
    ...transferPair('Hucha', { date: '2026-11-01' }),
    ...transferPair('Hucha', { date: '2026-11-01' }),
  ];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer' }), ['Hucha', 'Ahorro']);
});

test('a note only on the incoming half of a transfer is not offered', () => {
  const movements = transferPair('', {}, 'Solo entrada');
  assert.deepEqual(suggestNotes(movements, { type: 'transfer' }), []);
});

test('type transfer ignores categoryId', () => {
  const movements = [...transferPair('Ahorro'), mov({ note: 'Pan' })];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer', categoryId: 'food' }), ['Ahorro']);
  assert.deepEqual(suggestNotes(movements, { type: 'transfer', categoryId: null }), ['Ahorro']);
});

test('deleted transfers are ignored', () => {
  const movements = [...transferPair('Ahorro', { deleted: true }), ...transferPair('Hucha')];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer' }), ['Hucha']);
});

test('type transfer applies the typed filter and limit', () => {
  const movements = [
    ...transferPair('Ahorro', { date: '2026-11-02' }),
    ...transferPair('Hucha', { date: '2026-11-01' }),
  ];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer', typed: 'hu' }), ['Hucha']);
  assert.deepEqual(suggestNotes(movements, { type: 'transfer', limit: 1 }), ['Ahorro']);
});

test('cross-book halves are not transfer suggestions but count for their own category and type', () => {
  const movements = [
    ...transferPair('Ahorro'),
    mov({ type: 'expense', categoryId: 'family', transferId: 'x1', note: 'A casa' }),
    mov({ type: 'income', categoryId: 'salary', transferId: 'x2', note: 'Desde empresa' }),
  ];
  assert.deepEqual(suggestNotes(movements, { type: 'transfer' }), ['Ahorro']);
  assert.deepEqual(suggestNotes(movements, { type: 'expense', categoryId: 'family' }), ['A casa']);
  assert.deepEqual(suggestNotes(movements, { type: 'income', categoryId: 'salary' }), ['Desde empresa']);
  assert.deepEqual(suggestNotes(movements, { type: 'income', categoryId: 'family' }), []);
});

test('in-book transfer notes never fill in an expense or income category', () => {
  const movements = [...transferPair('Ahorro'), mov({ note: 'Pan' })];
  assert.deepEqual(suggestNotes(movements, food), ['Pan']);
  assert.deepEqual(suggestNotes(movements, { type: 'income', categoryId: 'food' }), []);
});

// --- input is not changed ---

test('the movements are not mutated', () => {
  const movements = [mov({ note: '  Pan  ' }), mov({ note: 'pan', date: '2026-11-09' })];
  const copy = structuredClone(movements);
  suggestNotes(movements, food);
  assert.deepEqual(movements, copy);
});
