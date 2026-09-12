/**
 * Verification rules — Phase 2 PROMPT-014.
 *
 * The pure half of §17: how a code typed from paper or scanned from a QR is
 * read, and how little the answer is allowed to say.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_KIND_FA,
  NEVER_DISCLOSED,
  VERIFICATION_STATES,
  VERIFICATION_STATE_FA,
  normalizeCode,
  publicAnimalFacts,
  readCode,
} from '../../src/verification/model.ts';

test('a code is read the same whether it is typed, pasted or scanned', () => {
  assert.equal(normalizeCode('RS-ABCD2345'), 'RS-ABCD2345');
  assert.equal(normalizeCode('  rs-abcd2345 '), 'RS-ABCD2345');
  // A QR carries the address of this page; only the code inside it matters.
  assert.equal(normalizeCode('https://hamzist.example/verify/PD-ABCD2345'), 'PD-ABCD2345');
  assert.equal(normalizeCode('https://hamzist.example/verify/PD-ABCD2345?utm=qr'), 'PD-ABCD2345');
  assert.equal(normalizeCode('/verify/PC-ABCD2345'), 'PC-ABCD2345');
  // Persian digits and stray characters are read, not refused.
  assert.equal(normalizeCode('RS-ABC۲۳۴۵'), 'RS-ABC2345');
  assert.equal(normalizeCode('RS ABCD 2345'), 'RSABCD2345');
  assert.equal(normalizeCode(''), '');
});

test('a prefix says which document a code belongs to, and a stub is not a code', () => {
  assert.deepEqual(readCode('RS-ABCD2345'), { kind: 'REGISTRATION_SHEET', byPetId: false, code: 'RS-ABCD2345' });
  assert.deepEqual(readCode('PD-ABCD2345'), { kind: 'PEDIGREE', byPetId: false, code: 'PD-ABCD2345' });
  assert.deepEqual(readCode('PC-ABCD2345'), { kind: 'PUPPY_CARD', byPetId: false, code: 'PC-ABCD2345' });
  // The animal's own identifier answers with its registration sheet (§13).
  assert.deepEqual(readCode('PET-ABCD2345'), { kind: 'REGISTRATION_SHEET', byPetId: true, code: 'PET-ABCD2345' });

  assert.equal(readCode('XX-ABCD2345'), null, 'an unknown prefix is not a document code');
  assert.equal(readCode('RS-AB'), null, 'too short to be a code');
  assert.equal(readCode(''), null);
  assert.equal(readCode('   '), null);
});

test('the answer carries the least that §17 asks, and never a person', () => {
  const facts = publicAnimalFacts({ speciesFa: 'سگ', breedFa: 'ژرمن شپرد', sex: 'FEMALE', birthDate: '2022-03-14' });
  assert.deepEqual(facts, { speciesFa: 'سگ', breedFa: 'ژرمن شپرد', sexFa: 'ماده', birthYear: '2022' });
  // The year only: a full birth date narrows one animal down further than asked.
  assert.equal(facts.birthYear, '2022');
  assert.equal(Object.keys(facts).some((key) => NEVER_DISCLOSED.includes(key)), false);

  const unknown = publicAnimalFacts({ speciesFa: null, breedFa: null, sex: null, birthDate: null });
  assert.deepEqual(unknown, { speciesFa: null, breedFa: null, sexFa: null, birthYear: null });
  assert.equal(publicAnimalFacts({ speciesFa: null, breedFa: null, sex: 'OTHER', birthDate: null }).sexFa, null);
});

test('every state a visitor can be told has Persian wording, and «باطل» is not one of them', () => {
  assert.deepEqual([...VERIFICATION_STATES], ['VALID', 'REPLACED', 'NOT_FOUND', 'RATE_LIMITED']);
  for (const state of VERIFICATION_STATES) {
    assert.ok(VERIFICATION_STATE_FA[state].trim() !== '', state);
  }
  // Phase 1 records no revocation of an issued document, so none is claimed.
  assert.equal(Object.values(VERIFICATION_STATE_FA).includes('باطل'), false);
  assert.deepEqual(Object.values(DOCUMENT_KIND_FA), ['برگه ثبتی', 'شجره‌نامه', 'کارت توله']);
});
