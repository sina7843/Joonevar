/**
 * Veterinary Role, Tag and Status rules without a database — Phase 2.5 PROMPT-002.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canEnterContext, switchableContexts } from '../../src/authz/actor.ts';
import {
  LEGACY_APPLICATION_STATUS,
  NOT_PROFESSIONAL_TAGS,
  VET_CASE_STATUSES,
  isTerminalVetCase,
  isVetTag,
  tagForCaseStatus,
  tagScopeProblem,
  vetCaseMove,
  vetCaseMoves,
  vetTagLabel,
} from '../../src/vets/professional-model.ts';

test('there are exactly four tags, each with the one label the spec gives it', () => {
  assert.equal(vetTagLabel('STUDENT', null), 'دانشجوی دامپزشکی');
  assert.equal(vetTagLabel('UNLICENSED', 'GENERAL'), 'دکتر دامپزشک - عمومی - بدون پروانه فعالیت');
  assert.equal(vetTagLabel('LICENSED', 'SPECIALIST'), 'دکتر دامپزشک - متخصص - دارای پروانه فعالیت');
  assert.equal(vetTagLabel('TRUSTED', 'GENERAL'), 'دکتر دامپزشک معتمد - عمومی');
  // An undeclared scope is omitted, never guessed.
  assert.equal(vetTagLabel('UNLICENSED', 'NOT_DECLARED'), 'دکتر دامپزشک - بدون پروانه فعالیت');
});

test('advertising, an unowned page and moderation are not professional tags, and there is no badge', () => {
  for (const label of [...NOT_PROFESSIONAL_TAGS, 'BADGE', 'VERIFIED', 'GENERAL', 'SPECIALIST']) {
    assert.equal(isVetTag(label), false, label);
  }
});

test('a student has no scope, a doctor must have one, and «not declared» belongs to legacy records only', () => {
  assert.equal(tagScopeProblem('STUDENT', null, 'REVIEW_DECISION'), null);
  assert.ok(tagScopeProblem('STUDENT', 'GENERAL', 'REVIEW_DECISION'));
  assert.ok(tagScopeProblem('LICENSED', null, 'PAYMENT_VERIFIED'));
  assert.equal(tagScopeProblem('LICENSED', 'SPECIALIST', 'PAYMENT_VERIFIED'), null);
  assert.ok(tagScopeProblem('UNLICENSED', 'NOT_DECLARED', 'REVIEW_DECISION'));
  assert.equal(tagScopeProblem('UNLICENSED', 'NOT_DECLARED', 'LEGACY_VET_APPLICATION'), null);
  assert.equal(tagScopeProblem('UNLICENSED', 'NOT_DECLARED', 'BACKFILL_VET_PROFILE'), null);
});

test('each actor moves a case only along its own transitions, and a decision needs a reason', () => {
  assert.deepEqual(vetCaseMoves('DRAFT', 'APPLICANT'), ['SUBMITTED', 'WITHDRAWN']);
  assert.equal(vetCaseMove('SUBMITTED', 'UNDER_REVIEW', 'APPLICANT'), null, 'an applicant cannot start their own review');
  assert.equal(vetCaseMove('UNDER_REVIEW', 'VERIFIED_NO_LICENSE', 'REVIEWER')?.reasonRequired, true);
  assert.equal(vetCaseMove('UNDER_REVIEW', 'ACTIVE_LICENSED_VET', 'REVIEWER'), null, 'a reviewer never activates a licence');
  assert.equal(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'REVIEWER'), null);
  assert.ok(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'SYSTEM'), 'only a verified payment does');
  assert.equal(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'EXPIRED', 'SYSTEM'), null, 'waiting for payment has no deadline');
  assert.ok(vetCaseMove('EXPIRED', 'ACTIVE_LICENSED_VET', 'SYSTEM'), 'renewal');
  assert.equal(vetCaseMove('NEEDS_CORRECTION', 'SUBMITTED', 'APPLICANT')?.reasonRequired, false);
});

test('rejected and withdrawn cases are final; every other status has a way on', () => {
  for (const status of VET_CASE_STATUSES) {
    assert.equal(isTerminalVetCase(status), status === 'REJECTED' || status === 'WITHDRAWN', status);
  }
});

test('an approved but unpaid licence keeps the unlicensed tag; only an active licence is licensed', () => {
  assert.equal(tagForCaseStatus('VERIFIED_STUDENT', 'STUDENT'), 'STUDENT');
  assert.equal(tagForCaseStatus('VERIFIED_NO_LICENSE', 'DOCTOR'), 'UNLICENSED');
  assert.equal(tagForCaseStatus('LICENSE_APPROVED_AWAITING_PAYMENT', 'DOCTOR'), 'UNLICENSED');
  assert.equal(tagForCaseStatus('ACTIVE_LICENSED_VET', 'DOCTOR'), 'LICENSED');
  for (const status of ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUSPENDED'] as const) {
    assert.equal(tagForCaseStatus(status, 'DOCTOR'), null, status);
  }
});

test('a Phase 2 approval reads as a verified council code, never as a licence or trust', () => {
  assert.deepEqual(LEGACY_APPLICATION_STATUS, {
    SUBMITTED: 'SUBMITTED',
    NEEDS_CORRECTION: 'NEEDS_CORRECTION',
    APPROVED: 'VERIFIED_NO_LICENSE',
    REJECTED: 'REJECTED',
    WITHDRAWN: 'WITHDRAWN',
  });
});

test('access comes from roles alone: no tag appears among the inputs that open a context', () => {
  // The only input is the list of active roles; a tag cannot be passed, so it cannot open anything.
  assert.equal(canEnterContext([], 'TRUSTED_VET'), false);
  assert.deepEqual(switchableContexts([]), ['USER']);
  assert.equal(canEnterContext(['TRUSTED_VET'], 'TRUSTED_VET'), true);
});
