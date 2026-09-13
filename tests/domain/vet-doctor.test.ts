/**
 * Doctor-without-licence application rules without a database — Phase 2.5 PROMPT-005.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCouncilCode } from '../../src/vets/onboarding-model.ts';
import { tagForCaseStatus, vetCaseMove, vetTagLabel } from '../../src/vets/professional-model.ts';
import {
  DOCTOR_DECISIONS,
  DOCTOR_DECISION_OUTCOME,
  DOCTOR_DOCUMENT_KINDS,
  doctorFieldProblems,
  type DoctorFields,
} from '../../src/vets/professional-profile-model.ts';

const valid: DoctorFields = {
  displayNameFa: 'دکتر آزمایشی',
  practiceScope: 'GENERAL',
  councilCode: 'SYN-100',
  phone: null,
  cityId: null,
  statementFa: null,
};

test('a complete doctor application has no problem, and a council code reads the same however it is typed', () => {
  assert.deepEqual(doctorFieldProblems(valid), []);
  assert.equal(normalizeCouncilCode(' syn ۱۲ ٣4 '), 'SYN1234');
  assert.deepEqual(doctorFieldProblems({ ...valid, councilCode: normalizeCouncilCode('syn-۴۵۶') }), []);
});

test('general or specialist must be declared; «not declared» is never a choice', () => {
  for (const scope of ['', 'NOT_DECLARED', 'STUDENT', 'general']) {
    assert.ok(doctorFieldProblems({ ...valid, practiceScope: scope }).length > 0, scope);
  }
  assert.deepEqual(doctorFieldProblems({ ...valid, practiceScope: 'SPECIALIST' }), []);
});

test('the council code is required and has a plausible shape', () => {
  for (const code of ['', 'AB', 'A/B-12', 'X'.repeat(21)]) {
    assert.ok(doctorFieldProblems({ ...valid, councilCode: code }).length > 0, code);
  }
});

test('no licence document belongs to this path', () => {
  assert.equal((DOCTOR_DOCUMENT_KINDS as readonly string[]).includes('PRACTICE_LICENCE'), false);
});

test('verification reaches the unlicensed standing and nothing beyond it', () => {
  assert.equal(DOCTOR_DECISION_OUTCOME.VERIFY, 'VERIFIED_NO_LICENSE');
  for (const decision of DOCTOR_DECISIONS) assert.ok(vetCaseMove('UNDER_REVIEW', DOCTOR_DECISION_OUTCOME[decision], 'REVIEWER'), decision);
  assert.equal(tagForCaseStatus('VERIFIED_NO_LICENSE', 'DOCTOR'), 'UNLICENSED');
  assert.equal(vetCaseMove('VERIFIED_NO_LICENSE', 'ACTIVE_LICENSED_VET', 'REVIEWER'), null, 'no licence is activated from here');
  assert.equal(vetCaseMove('VERIFIED_NO_LICENSE', 'ACTIVE_LICENSED_VET', 'SYSTEM'), null);
  assert.equal(vetTagLabel('UNLICENSED', 'SPECIALIST'), 'دکتر دامپزشک - متخصص - بدون پروانه فعالیت');
});
