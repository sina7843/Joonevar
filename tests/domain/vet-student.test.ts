/**
 * Veterinary student application rules without a database — Phase 2.5 PROMPT-004.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { vetCaseMove } from '../../src/vets/professional-model.ts';
import {
  STUDENT_DECISIONS,
  STUDENT_DECISION_OUTCOME,
  normalizeStudentNumber,
  studentFieldProblems,
} from '../../src/vets/professional-profile-model.ts';

const valid = { displayNameFa: 'نام آزمایشی', studentNumber: '98123456', universityFa: 'دانشگاه آزمایشی' };

test('a complete student application has no problem', () => {
  assert.deepEqual(studentFieldProblems(valid), []);
});

test('student number and university are both required, and the name too', () => {
  assert.equal(studentFieldProblems({ ...valid, studentNumber: '' }).length, 1);
  assert.equal(studentFieldProblems({ ...valid, universityFa: '   ' }).length, 1);
  assert.equal(studentFieldProblems({ ...valid, displayNameFa: '' }).length, 1);
  assert.equal(studentFieldProblems({ displayNameFa: '', studentNumber: '', universityFa: '' }).length, 3, 'every missing field is named at once');
});

test('a student number is read the same however it is typed, and only a plausible shape is accepted', () => {
  assert.equal(normalizeStudentNumber('۹۸ ۱۲۳ ۴۵۶'), '98123456');
  assert.equal(normalizeStudentNumber('٩٨١٢abc'), '9812ABC');
  for (const bad of ['123', '98/123456', '<script>', 'x'.repeat(21)]) {
    assert.ok(studentFieldProblems({ ...valid, studentNumber: normalizeStudentNumber(bad) }).length > 0, bad);
  }
});

test('each decision is a legal reviewer move from review, and none of them is a doctor status', () => {
  for (const decision of STUDENT_DECISIONS) {
    const outcome = STUDENT_DECISION_OUTCOME[decision];
    assert.ok(vetCaseMove('UNDER_REVIEW', outcome, 'REVIEWER'), decision);
    assert.equal(vetCaseMove('UNDER_REVIEW', outcome, 'APPLICANT'), null, 'an applicant never decides');
    assert.ok(!['VERIFIED_NO_LICENSE', 'LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET'].includes(outcome));
  }
});
