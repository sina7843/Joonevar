/** The review check catalogue — Phase 2.5 PROMPT-007. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_OUTCOMES, REVIEW_CHECKS, isReviewCheckCode, isReviewCheckResult } from '../../src/vets/professional-profile-model.ts';
import { REVIEW_CASE_TYPES } from '../../src/vets/review-workbench.ts';

test('every reviewed case type has its own closed list of checks with unique codes and Persian labels', () => {
  for (const type of REVIEW_CASE_TYPES) {
    const codes = REVIEW_CHECKS[type].map((check) => check.code);
    assert.ok(codes.length > 0, type);
    assert.equal(new Set(codes).size, codes.length, type + ' codes are unique');
    assert.ok(REVIEW_CHECKS[type].every((check) => /[؀-ۿ]/.test(check.labelFa)), type + ' labels are Persian');
  }
  assert.equal(isReviewCheckCode('LICENCE', 'LICENCE_FILE_LEGIBLE'), true);
  assert.equal(isReviewCheckCode('STUDENT', 'LICENCE_FILE_LEGIBLE'), false, 'a check belongs to its case type');
  assert.equal(isReviewCheckResult('FAIL'), true);
  assert.equal(isReviewCheckResult('MAYBE'), false);
});

test('an approval never reaches a paid or active status', () => {
  assert.deepEqual([...APPROVAL_OUTCOMES].sort(), ['LICENSE_APPROVED_AWAITING_PAYMENT', 'VERIFIED_NO_LICENSE', 'VERIFIED_STUDENT']);
});
