// Pure logic of the people of a shared book (js/domain/members.js), with
// invented people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail, validateShareEmail, createMember, isMember, memberName, isSharedBookFile,
  defaultPersonId, personName,
} from '../js/domain/members.js';

// --- normalizeEmail ---

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Ana@Gmail.COM '), 'ana@gmail.com');
  assert.equal(normalizeEmail('ana@gmail.com'), 'ana@gmail.com');
});

test('normalizeEmail of missing values is an empty string', () => {
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail('   '), '');
});

// --- validateShareEmail ---

test('validateShareEmail: empty or only spaces is email_required', () => {
  for (const email of ['', '   ', null, undefined]) {
    assert.deepEqual(validateShareEmail(email, 'martin@example.com'), ['email_required'], JSON.stringify(email));
  }
});

test('validateShareEmail: not an email is email_invalid', () => {
  for (const email of ['ana', 'ana@', '@example.com', 'ana@example', 'ana example@x.com', 'ana@@example.com', 'ana@exa mple.com']) {
    assert.deepEqual(validateShareEmail(email, 'martin@example.com'), ['email_invalid'], email);
  }
});

test('validateShareEmail: the own email, ignoring case and spaces, is email_own', () => {
  assert.deepEqual(validateShareEmail('martin@example.com', 'martin@example.com'), ['email_own']);
  assert.deepEqual(validateShareEmail('  MARTIN@Example.com ', 'martin@example.com'), ['email_own']);
  assert.deepEqual(validateShareEmail('martin@example.com', ' Martin@EXAMPLE.com '), ['email_own']);
});

test('validateShareEmail: a different valid email is valid', () => {
  assert.deepEqual(validateShareEmail('ana@example.com', 'martin@example.com'), []);
  assert.deepEqual(validateShareEmail('  Ana.Perez+casa@sub.example.org ', 'martin@example.com'), []);
});

test('validateShareEmail without own email only checks the format', () => {
  assert.deepEqual(validateShareEmail('ana@example.com'), []);
  assert.deepEqual(validateShareEmail('ana@example.com', ''), []);
});

// --- createMember ---

const deps = { now: () => new Date('2026-10-31T09:15:00.000Z'), newId: () => 'member-1' };

test('createMember uses the injected id and clock, normalizes the email and trims the name', () => {
  assert.deepEqual(createMember({ email: '  Ana@Example.COM ', name: '  Ana Pérez  ' }, deps), {
    id: 'member-1',
    email: 'ana@example.com',
    name: 'Ana Pérez',
    createdAt: '2026-10-31T09:15:00.000Z',
  });
});

test('createMember without a name keeps it empty', () => {
  assert.equal(createMember({ email: 'ana@example.com' }, deps).name, '');
  assert.equal(createMember({ email: 'ana@example.com', name: null }, deps).name, '');
  assert.equal(createMember({ email: 'ana@example.com', name: '   ' }, deps).name, '');
});

test('createMember without deps makes a UUID and an ISO date', () => {
  const member = createMember({ email: 'ana@example.com', name: 'Ana' });
  assert.match(member.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(member.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.notEqual(createMember({ email: 'ana@example.com' }).id, member.id);
});

// --- isMember ---

const members = [
  { id: 'm-1', email: 'martin@example.com', name: 'Martín' },
  { id: 'm-2', email: 'Ana@Example.com', name: 'Ana' },
];

test('isMember compares emails ignoring case and spaces', () => {
  assert.equal(isMember(members, 'martin@example.com'), true);
  assert.equal(isMember(members, ' MARTIN@example.com '), true);
  assert.equal(isMember(members, 'ana@example.com'), true, 'stored with capitals');
});

test('isMember is false for someone else or an empty list', () => {
  assert.equal(isMember(members, 'luis@example.com'), false);
  assert.equal(isMember([], 'martin@example.com'), false);
});

// --- memberName ---

test('memberName is the first word of the name', () => {
  assert.equal(memberName({ email: 'martin@example.com', name: 'Martín Caamaño' }), 'Martín');
  assert.equal(memberName({ email: 'ana@example.com', name: '  Ana   María  Pérez ' }), 'Ana');
  assert.equal(memberName({ email: 'ana@example.com', name: 'Ana' }), 'Ana');
});

test('memberName falls back to the email when the name is empty', () => {
  assert.equal(memberName({ email: 'ana@example.com', name: '' }), 'ana@example.com');
  assert.equal(memberName({ email: 'ana@example.com', name: '   ' }), 'ana@example.com');
  assert.equal(memberName({ email: 'ana@example.com' }), 'ana@example.com');
});

test('memberName of a missing member is an empty string', () => {
  assert.equal(memberName(undefined), '');
  assert.equal(memberName(null), '');
  assert.equal(memberName({}), '');
});

// --- isSharedBookFile ---

test('isSharedBookFile: a Cartos shared book is true', () => {
  assert.equal(isSharedBookFile({ id: 'f-1', appProperties: { app: 'cartos', bookType: 'shared', name: 'Casa' } }), true);
});

test('isSharedBookFile: a Cartos book with no bookType is not personal, so true', () => {
  assert.equal(isSharedBookFile({ id: 'f-1', appProperties: { app: 'cartos' } }), true);
});

test('isSharedBookFile: personal books, other apps and missing data are false', () => {
  const cases = [
    { id: 'f-1', appProperties: { app: 'cartos', bookType: 'personal' } },
    { id: 'f-2', appProperties: { app: 'other', bookType: 'shared' } },
    { id: 'f-3', appProperties: {} },
    { id: 'f-4' },
    {},
    null,
    undefined,
  ];
  for (const file of cases) assert.equal(isSharedBookFile(file), false, JSON.stringify(file));
});

// --- defaultPersonId and personName (tarea 18b) ---

const people = [
  { id: 'p-1', email: 'martin@example.com', name: 'Martín Inventado', createdAt: 't0' },
  { id: 'p-2', email: 'Ana@Example.com', name: '  Ana  María ', createdAt: 't1' },
  { id: 'p-3', email: 'luis@example.com', name: '', createdAt: 't2' },
];

test('defaultPersonId finds the member id by email', () => {
  assert.equal(defaultPersonId(people, 'martin@example.com'), 'p-1');
  assert.equal(defaultPersonId(people, 'luis@example.com'), 'p-3');
});

test('defaultPersonId ignores case and surrounding spaces on both sides', () => {
  assert.equal(defaultPersonId(people, '  MARTIN@example.COM '), 'p-1');
  assert.equal(defaultPersonId(people, 'ana@example.com'), 'p-2');
});

test('defaultPersonId is empty when the email is not a member or missing', () => {
  assert.equal(defaultPersonId(people, 'otra@example.com'), '');
  assert.equal(defaultPersonId(people, ''), '');
  assert.equal(defaultPersonId(people, null), '');
  assert.equal(defaultPersonId(people, undefined), '');
  assert.equal(defaultPersonId([], 'martin@example.com'), '');
});

test('defaultPersonId with an empty email does not match a member with an empty email', () => {
  // A broken row without email must not become the default payer.
  const withBlank = [{ id: 'p-x', email: '', name: 'Nadie' }, ...people];
  assert.equal(defaultPersonId(withBlank, ''), '', 'an anonymous row is never the default');
});

test('personName gives the first name of the member', () => {
  assert.equal(personName(people, 'p-1'), 'Martín');
  assert.equal(personName(people, 'p-2'), 'Ana');
});

test('personName of a member without name falls back to the email (as memberName)', () => {
  assert.equal(personName(people, 'p-3'), 'luis@example.com');
});

test('personName is empty for Común, unknown ids or no members', () => {
  assert.equal(personName(people, ''), '');
  assert.equal(personName(people, null), '');
  assert.equal(personName(people, undefined), '');
  assert.equal(personName(people, 'p-9'), '');
  assert.equal(personName([], 'p-1'), '');
});

test('defaultPersonId and personName do not mutate the members', () => {
  const before = structuredClone(people);
  defaultPersonId(people, 'ANA@example.com');
  personName(people, 'p-2');
  assert.deepEqual(people, before);
});
