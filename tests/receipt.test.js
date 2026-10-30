import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMovement } from '../js/domain/movement.js';
import { buildTransfer, groupEntries } from '../js/domain/transfer.js';
import { historyEntries } from '../js/domain/history.js';

// Importing the module must not touch the DOM: if it did, this static import
// would already throw in Node (there is no `document` here).
import { movementLineModel, movementLine, lookupsOf } from '../js/ui/receipt.js';

// Deterministic deps for the domain builders.
let counter = 0;
const deps = { now: () => new Date('2026-10-25T10:00:00.000Z'), newId: () => `id-${++counter}` };

const accounts = [
  { id: 'acc-abanca', name: 'Abanca', emoji: '🏦' },
  { id: 'acc-cash', name: 'Efectivo', emoji: '💶' },
];
const categories = [
  { id: 'cat-groceries', name: 'Supermercado', emoji: '🛒' },
  { id: 'cat-salary', name: 'Nómina', emoji: '💼' },
  { id: 'transfer', name: 'Transferencia', emoji: '🔁' },
];
const lookups = lookupsOf({ accounts, categories });

const expense = (extra = {}) =>
  createMovement({ accountId: 'acc-abanca', type: 'expense', amount: 42.5, date: '2026-10-20', categoryId: 'cat-groceries', ...extra }, deps);
const income = (extra = {}) =>
  createMovement({ accountId: 'acc-abanca', type: 'income', amount: 1500, date: '2026-10-01', categoryId: 'cat-salary', ...extra }, deps);
const transfer = (extra = {}) =>
  buildTransfer({ fromAccountId: 'acc-abanca', toAccountId: 'acc-cash', amount: 60, date: '2026-10-22', ...extra }, deps);

const onlyEntry = (movements) => {
  const entries = groupEntries(movements);
  assert.equal(entries.length, 1);
  return entries[0];
};

test('importing js/ui/receipt.js in Node does not touch document', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const mod = await import('../js/ui/receipt.js');
  assert.equal(typeof mod.movementLineModel, 'function');
  assert.equal(typeof mod.lookupsOf, 'function');
});

test('lookupsOf builds Maps by id', () => {
  assert.ok(lookups.accountById instanceof Map);
  assert.ok(lookups.categoryById instanceof Map);
  assert.equal(lookups.accountById.size, 2);
  assert.equal(lookups.categoryById.size, 3);
  assert.equal(lookups.accountById.get('acc-cash').name, 'Efectivo');
  assert.equal(lookups.categoryById.get('cat-groceries').emoji, '🛒');
  assert.equal(lookups.accountById.get('missing'), undefined);
});

test('lookupsOf with empty lists gives empty Maps', () => {
  const empty = lookupsOf({ accounts: [], categories: [] });
  assert.equal(empty.accountById.size, 0);
  assert.equal(empty.categoryById.size, 0);
});

test('expense: category label, negative amount, expense tone', () => {
  const model = movementLineModel(onlyEntry([expense()]), lookups);
  assert.deepEqual(model, { label: '20/10  🛒 Supermercado', amount: -42.5, tone: 'expense', note: '' });
});

test('income: positive amount, income tone', () => {
  const model = movementLineModel(onlyEntry([income()]), lookups);
  assert.deepEqual(model, { label: '01/10  💼 Nómina', amount: 1500, tone: 'income', note: '' });
});

test('transfer: from → to label, positive amount, no tone', () => {
  const entry = onlyEntry(transfer());
  assert.equal(entry.kind, 'transfer');
  const model = movementLineModel(entry, lookups);
  assert.deepEqual(model, { label: '22/10  🏦 Abanca → 💶 Efectivo', amount: 60, tone: '', note: '' });
});

test('transfer ignores withAccount (accounts are already in the label)', () => {
  const model = movementLineModel(onlyEntry(transfer()), lookups, { withAccount: true });
  assert.equal(model.label, '22/10  🏦 Abanca → 💶 Efectivo');
});

test('loose half of a transfer shows as an ordinary movement', () => {
  const [outgoing, incoming] = transfer();
  const outEntry = onlyEntry([outgoing]);
  assert.equal(outEntry.kind, 'movement');
  assert.deepEqual(movementLineModel(outEntry, lookups), { label: '22/10  🔁 Transferencia', amount: -60, tone: 'expense', note: '' });

  const inEntry = onlyEntry([{ ...incoming }]);
  assert.deepEqual(movementLineModel(inEntry, lookups), { label: '22/10  🔁 Transferencia', amount: 60, tone: 'income', note: '' });
});

test('half whose pair is deleted shows as an ordinary movement', () => {
  const [outgoing, incoming] = transfer();
  const entry = onlyEntry([outgoing, { ...incoming, deleted: true }]);
  assert.equal(entry.kind, 'movement');
  assert.equal(movementLineModel(entry, lookups).tone, 'expense');
});

test('withAccount appends " · account" after the category', () => {
  const model = movementLineModel(onlyEntry([expense()]), lookups, { withAccount: true });
  assert.equal(model.label, '20/10  🛒 Supermercado · 🏦 Abanca');
});

test('withAccount false (explicit or default) adds nothing', () => {
  const entry = onlyEntry([expense()]);
  assert.equal(movementLineModel(entry, lookups, { withAccount: false }).label, '20/10  🛒 Supermercado');
  assert.equal(movementLineModel(entry, lookups, {}).label, '20/10  🛒 Supermercado');
});

test('entries from historyEntries work the same', () => {
  const movements = [expense(), income(), ...transfer()];
  const models = historyEntries(movements).map((entry) => movementLineModel(entry, lookups, { withAccount: true }));
  assert.deepEqual(models, [
    { label: '22/10  🏦 Abanca → 💶 Efectivo', amount: 60, tone: '', note: '' },
    { label: '20/10  🛒 Supermercado · 🏦 Abanca', amount: -42.5, tone: 'expense', note: '' },
    { label: '01/10  💼 Nómina · 🏦 Abanca', amount: 1500, tone: 'income', note: '' },
  ]);
});

test('missing category leaves an empty label in its place, without throwing', () => {
  const entry = onlyEntry([expense({ categoryId: 'cat-removed' })]);
  assert.deepEqual(movementLineModel(entry, lookups), { label: '20/10  ', amount: -42.5, tone: 'expense', note: '' });
});

test('missing account with withAccount leaves an empty label, without throwing', () => {
  const entry = onlyEntry([expense({ accountId: 'acc-removed' })]);
  assert.equal(movementLineModel(entry, lookups, { withAccount: true }).label, '20/10  🛒 Supermercado · ');
});

test('transfer with missing accounts leaves empty labels, without throwing', () => {
  const entry = onlyEntry(transfer({ fromAccountId: 'acc-gone', toAccountId: 'acc-cash' }));
  assert.equal(movementLineModel(entry, lookups).label, '22/10   → 💶 Efectivo');
  const both = onlyEntry(transfer({ fromAccountId: 'acc-gone', toAccountId: 'acc-gone-too' }));
  assert.equal(movementLineModel(both, lookups).label, '22/10   → ');
});

test('empty lookups do not throw', () => {
  const empty = lookupsOf({ accounts: [], categories: [] });
  const model = movementLineModel(onlyEntry([income()]), empty, { withAccount: true });
  assert.deepEqual(model, { label: '01/10   · ', amount: 1500, tone: 'income', note: '' });
});

test('date is DD/MM with leading zeros, year left out', () => {
  const cases = [
    ['2026-01-01', '01/01'],
    ['2026-01-31', '31/01'],
    ['2028-02-29', '29/02'],
    ['2026-12-31', '31/12'],
  ];
  for (const [date, expected] of cases) {
    const label = movementLineModel(onlyEntry([expense({ date })]), lookups).label;
    assert.equal(label, `${expected}  🛒 Supermercado`, date);
  }
});

test('amount keeps cents exactly', () => {
  const cases = [
    [0.1, -0.1],
    [0.01, -0.01],
    [0.3, -0.3],
    [1250.5, -1250.5],
    [999999.99, -999999.99],
  ];
  for (const [amount, expected] of cases) {
    assert.equal(movementLineModel(onlyEntry([expense({ amount })]), lookups).amount, expected, String(amount));
  }
  assert.equal(movementLineModel(onlyEntry([income({ amount: 0.1 })]), lookups).amount, 0.1);
  assert.equal(movementLineModel(onlyEntry(transfer({ amount: 0.01 })), lookups).amount, 0.01);
});

test('model does not mutate the entry or the lookups', () => {
  const entry = onlyEntry([expense()]);
  const snapshot = structuredClone(entry);
  movementLineModel(entry, lookups, { withAccount: true });
  assert.deepEqual(entry, snapshot);
  assert.equal(lookups.accountById.size, 2);
});

// --- note (tarea 20b) ---

test('model carries the movement note, for expense and income', () => {
  assert.equal(movementLineModel(onlyEntry([expense({ note: 'cena con Ana' })]), lookups).note, 'cena con Ana');
  assert.equal(movementLineModel(onlyEntry([income({ note: 'octubre' })]), lookups, { withAccount: true }).note, 'octubre');
});

test('model note is empty when the movement has none', () => {
  assert.equal(movementLineModel(onlyEntry([expense()]), lookups).note, '');
});

test('transfer model carries the note of its first half', () => {
  const entry = onlyEntry(transfer({ note: 'ahorro' }));
  assert.equal(entry.kind, 'transfer');
  assert.equal(movementLineModel(entry, lookups).note, 'ahorro');
  // Halves with different notes: the first half (the outgoing one) wins.
  const [outgoing, incoming] = transfer({ note: 'out' });
  const mixed = onlyEntry([outgoing, { ...incoming, note: 'in' }]);
  assert.equal(mixed.halves[0], outgoing);
  assert.equal(movementLineModel(mixed, lookups).note, 'out');
});

test('loose transfer half keeps its own note', () => {
  const [, incoming] = transfer({ note: 'suelta' });
  assert.equal(movementLineModel(onlyEntry([incoming]), lookups).note, 'suelta');
});

// Minimal fake DOM, installed only while a test runs, to see whether
// movementLine passes the note on to receiptLine.
function fakeElement(tag) {
  return {
    tag, className: '', textContent: '', href: '', children: [],
    appendChild(child) { this.children.push(child); return child; },
  };
}
function withFakeDocument(fn) {
  globalThis.document = { createElement: fakeElement };
  try {
    return fn();
  } finally {
    delete globalThis.document;
  }
}
const noteOf = (line) => line.children.find((c) => c.className === 'receipt-label').children.find((c) => c.className === 'receipt-note');

test('movementLine shows the note only with withNote', () => {
  const entry = onlyEntry([expense({ note: 'cena' })]);
  withFakeDocument(() => {
    const plain = movementLine(entry, lookups);
    assert.equal(noteOf(plain), undefined);
    const explicitOff = movementLine(entry, lookups, { withNote: false });
    assert.equal(noteOf(explicitOff), undefined);
    const withNote = movementLine(entry, lookups, { withNote: true, withAccount: true });
    const note = noteOf(withNote);
    assert.equal(note.tag, 'small');
    assert.equal(note.textContent, ' cena');
    const label = withNote.children.find((c) => c.className === 'receipt-label');
    assert.equal(label.textContent, '20/10  🛒 Supermercado · 🏦 Abanca');
    const amount = withNote.children.find((c) => c.className.startsWith('receipt-amount'));
    assert.equal(amount.textContent, '−42,50 €');
    assert.equal(amount.className, 'receipt-amount amount-expense');
  });
});

test('movementLine with withNote and an empty note adds no note element', () => {
  withFakeDocument(() => {
    assert.equal(noteOf(movementLine(onlyEntry([expense()]), lookups, { withNote: true })), undefined);
  });
});

test('movementLine with withNote shows a transfer note', () => {
  withFakeDocument(() => {
    const line = movementLine(onlyEntry(transfer({ note: 'ahorro' })), lookups, { withNote: true });
    assert.equal(noteOf(line).textContent, ' ahorro');
  });
  assert.equal(typeof globalThis.document, 'undefined');
});
