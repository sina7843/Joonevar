/**
 * Veterinarian application and claim rules without a database — Phase 2 PROMPT-007.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAppeal,
  canResubmit,
  canWithdraw,
  councilCodeProblem,
  decisionOutcome,
  isDocumentKind,
  normalizeCouncilCode,
} from '../../src/vets/onboarding-model.ts';
import { packagePurchaseEligibility, vetPublishBlockers } from '../../src/vets/directory-model.ts';

test('a council code is the same code whatever digits, spaces or case it is typed with', () => {
  assert.equal(normalizeCouncilCode(' syn ۱۲-۳۴ '), 'SYN12-34');
  assert.equal(normalizeCouncilCode('٥٦٧ab'), '567AB');
  assert.equal(councilCodeProblem(''), 'کد نظام دامپزشکی را بنویسید.');
  assert.ok(councilCodeProblem('AB'));
  assert.ok(councilCodeProblem('کد۱۲۳'));
  assert.ok(councilCodeProblem('A'.repeat(21)));
  assert.equal(councilCodeProblem('SYN-12345'), null);
});

test('only a submitted application is decided, and each decision has one outcome', () => {
  assert.equal(decisionOutcome('SUBMITTED', 'APPROVE'), 'APPROVED');
  assert.equal(decisionOutcome('SUBMITTED', 'REJECT'), 'REJECTED');
  assert.equal(decisionOutcome('SUBMITTED', 'REQUEST_CORRECTION'), 'NEEDS_CORRECTION');
  for (const status of ['NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
    assert.equal(decisionOutcome(status, 'APPROVE'), null, status);
  }
});

test('the applicant resubmits only a correction, withdraws only an open case and appeals a rejection once', () => {
  assert.ok(canResubmit('NEEDS_CORRECTION'));
  assert.ok(!canResubmit('SUBMITTED'));
  assert.ok(canWithdraw('SUBMITTED') && canWithdraw('NEEDS_CORRECTION'));
  assert.ok(!canWithdraw('REJECTED') && !canWithdraw('WITHDRAWN') && !canWithdraw('APPROVED'));
  assert.ok(canAppeal({ status: 'REJECTED', appealedAt: null }));
  assert.ok(!canAppeal({ status: 'REJECTED', appealedAt: new Date() }), 'one appeal only');
  assert.ok(!canAppeal({ status: 'NEEDS_CORRECTION', appealedAt: null }));
  assert.ok(isDocumentKind('COUNCIL_CARD') && !isDocumentKind('SELFIE'));
});

test('an unowned profile cannot buy a package, and publishes with a city instead of a bio', () => {
  assert.deepEqual(packagePurchaseEligibility({ accountId: 'a' }), { allowed: true });
  const unowned = packagePurchaseEligibility({ accountId: null });
  assert.equal(unowned.allowed, false);

  const empty = {
    headlineFa: null,
    bioFa: null,
    experienceFa: null,
    specialtyCount: 0,
    speciesCount: 0,
    publicLocationsWithCity: 0,
    contactShown: false,
  };
  assert.deepEqual(vetPublishBlockers(empty, { owned: false, hasListedCity: true }), []);
  assert.equal(vetPublishBlockers(empty, { owned: false, hasListedCity: false }).length, 1);
  assert.equal(vetPublishBlockers(empty).length, 2, 'an owned profile still needs a bio and a public location');
});
