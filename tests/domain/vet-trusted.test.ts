/** The trusted-veterinarian conditions and declaration, without a database — Phase 2.5 PROMPT-010. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRUSTED_DECISION_OUTCOME,
  declarationProblem,
  trustedAllowed,
  trustedRequirements,
  unmetTrusted,
  type TrustedEligibilityFacts,
} from '../../src/vets/trusted-model.ts';

const facts = (patch: Partial<TrustedEligibilityFacts> = {}): TrustedEligibilityFacts => ({
  licenceActive: true,
  licenceStandingFa: 'فعال',
  membershipValid: true,
  membershipStatusFa: 'فعال',
  termsConfigured: true,
  openCaseStatus: null,
  alreadyTrusted: false,
  ...patch,
});

test('every condition answers for itself, with its own reason and its own link', () => {
  assert.equal(trustedAllowed(trustedRequirements(facts())), true);

  const noMembership = unmetTrusted(trustedRequirements(facts({ membershipValid: false, membershipStatusFa: 'منقضی' })));
  assert.deepEqual(noMembership.map((requirement) => requirement.code), ['MEMBERSHIP']);
  assert.match(noMembership[0]!.reasonFa!, /عضویت انجمن شما معتبر نیست \(منقضی\)/);
  assert.equal(noMembership[0]!.href, '/membership', 'the reason links to the membership itself');

  const noLicence = unmetTrusted(trustedRequirements(facts({ licenceActive: false, licenceStandingFa: 'منقضی' })));
  assert.deepEqual(noLicence.map((requirement) => requirement.code), ['LICENCE']);
  assert.match(noLicence[0]!.reasonFa!, /دوره فعالیت پروانه شما فعال نیست \(منقضی\)/);
  assert.equal(noLicence[0]!.href, '/account/vet-profile');

  // Both missing: both are said, not just the first one.
  const neither = unmetTrusted(trustedRequirements(facts({ licenceActive: false, membershipValid: false })));
  assert.deepEqual(neither.map((requirement) => requirement.code), ['LICENCE', 'MEMBERSHIP']);
});

test('unpublished terms, an open case and being trusted already each close the path on their own', () => {
  const noTerms = unmetTrusted(trustedRequirements(facts({ termsConfigured: false })));
  assert.deepEqual(noTerms.map((requirement) => requirement.code), ['TERMS']);
  assert.match(noTerms[0]!.reasonFa!, /تعهدنامه معتمد هنوز از پنل مدیریت ثبت نشده/);
  assert.equal(noTerms[0]!.href, null, 'the applicant can do nothing about it, so no link is offered');

  assert.deepEqual(
    unmetTrusted(trustedRequirements(facts({ openCaseStatus: 'SUBMITTED' }))).map((requirement) => requirement.code),
    ['OPEN_CASE'],
  );
  assert.deepEqual(
    unmetTrusted(trustedRequirements(facts({ alreadyTrusted: true }))).map((requirement) => requirement.code),
    ['ALREADY_TRUSTED'],
  );
});

test('the declaration must be made, and the accepted terms version must be the published one', () => {
  const good = { acceptedTermsVersion: 'v2', microchipReaderDeclared: true };
  assert.equal(declarationProblem(good, 'v2'), null);
  assert.match(declarationProblem({ ...good, microchipReaderDeclared: false }, 'v2')!, /میکروچیپ‌ریدر باید خوداظهاری شود/);
  assert.match(declarationProblem({ ...good, acceptedTermsVersion: '' }, 'v2')!, /پذیرش تعهدنامه ثبت نشده/);
  // Accepting an older version is refused rather than quietly upgraded.
  assert.match(declarationProblem({ ...good, acceptedTermsVersion: 'v1' }, 'v2')!, /نسخه تازه را بپذیرید/);
  assert.match(declarationProblem({ ...good, equipmentCodes: ['X', 'X'] }, 'v2')!, /دوبار اعلام شده/);
  assert.match(declarationProblem({ ...good, statementFa: 'x'.repeat(1001) }, 'v2')!, /۱۰۰۰ نویسه/);
  assert.equal(declarationProblem({ ...good, equipmentCodes: ['MICROSCOPE'], statementFa: 'ok' }, 'v2'), null);
});

test('an approval opens the trusted payment and grants nothing by itself', () => {
  assert.equal(TRUSTED_DECISION_OUTCOME.APPROVE, 'TRUSTED_APPROVED_AWAITING_PAYMENT');
  assert.equal(TRUSTED_DECISION_OUTCOME.REQUEST_CORRECTION, 'NEEDS_CORRECTION');
  assert.equal(TRUSTED_DECISION_OUTCOME.REJECT, 'REJECTED');
});
