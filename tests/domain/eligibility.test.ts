import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  evaluateAll,
  NO_FACTS,
  vetWorkEligibility,
  type EligibilityFacts,
} from '../../src/domain/eligibility/rules.ts';

const facts = (overrides: Partial<EligibilityFacts>): EligibilityFacts => ({ ...NO_FACTS, ...overrides });

const KYC_ONLY = facts({ kycApproved: true });
const MEMBER = facts({ kycApproved: true, membershipActive: true });
const WITH_SHEET = facts({ kycApproved: true, membershipActive: true, registeredAnimals: 1, animalsWithRegistrationSheet: 1 });
const WITH_PEDIGREE = facts({ ...WITH_SHEET, animalsWithPedigree: 1 });

test('registering an animal needs approved KYC and does not need membership', () => {
  // Acceptance A-001, §9.1.
  assert.equal(evaluate('ANIMAL_REGISTRATION', NO_FACTS).allowed, false);
  assert.equal(evaluate('ANIMAL_REGISTRATION', KYC_ONLY).allowed, true);
  assert.equal(evaluate('ANIMAL_REGISTRATION', MEMBER).allowed, true);

  const locked = evaluate('ANIMAL_REGISTRATION', NO_FACTS);
  assert.ok(!locked.allowed);
  assert.equal(locked.lock.cta.href, '/account/kyc');
});

test('before KYC every locked service points at identity verification', () => {
  const all = evaluateAll(NO_FACTS);
  for (const service of ['ANIMAL_REGISTRATION', 'MEMBERSHIP', 'REGISTRATION_SHEET', 'PEDIGREE', 'KENNEL', 'MATING_PERMIT', 'PERSONAL_DECLARATION'] as const) {
    const result = all[service];
    assert.ok(!result.allowed, service + ' must be locked');
    assert.equal(result.lock.cta.href, '/account/kyc', service + ' must send the person to KYC');
  }
});

test('after KYC without membership the paid services ask for membership, not for anything else', () => {
  const all = evaluateAll(KYC_ONLY);
  for (const service of ['REGISTRATION_SHEET', 'PEDIGREE', 'KENNEL', 'MATING_PERMIT', 'PERSONAL_DECLARATION', 'VET_VISIT_REQUEST'] as const) {
    const result = all[service];
    assert.ok(!result.allowed, service + ' must be locked');
    assert.equal(result.lock.cta.href, '/membership', service + ' must ask for membership');
  }
  // Membership itself is reachable, and so is registration.
  assert.equal(all.MEMBERSHIP.allowed, true);
  assert.equal(all.ANIMAL_REGISTRATION.allowed, true);
});

test('an active member still needs the concrete prerequisite of each service', () => {
  const all = evaluateAll(MEMBER);

  // §20: the personal declaration needs KYC, membership and existing animals; it
  // has no payment and no document prerequisite.
  assert.equal(all.PERSONAL_DECLARATION.allowed, true);

  const sheet = all.REGISTRATION_SHEET;
  assert.ok(!sheet.allowed);
  assert.equal(sheet.lock.cta.href, '/animals/new');

  const pedigree = all.PEDIGREE;
  assert.ok(!pedigree.allowed);
  assert.match(pedigree.lock.reason, /برگه ثبتی/);

  const kennel = all.KENNEL;
  assert.ok(!kennel.allowed);
  assert.match(kennel.lock.reason, /شروع ثبت کنل/);

  const permit = all.MATING_PERMIT;
  assert.ok(!permit.allowed);
  assert.match(permit.lock.reason, /شجره‌دار/);
});

test('the chain opens one step at a time exactly as the dependency map says', () => {
  assert.equal(evaluate('REGISTRATION_SHEET', facts({ kycApproved: true, membershipActive: true, registeredAnimals: 1 })).allowed, true);
  assert.equal(evaluate('PEDIGREE', WITH_SHEET).allowed, true);
  assert.equal(evaluate('KENNEL', WITH_SHEET).allowed, true);
  assert.equal(evaluate('MATING_PERMIT', WITH_SHEET).allowed, false);
  assert.equal(evaluate('MATING_PERMIT', WITH_PEDIGREE).allowed, true);
});

test('the puppy card needs an issued permit and a final two-sided allocation', () => {
  const withPermit = facts({ ...WITH_PEDIGREE, issuedMatingPermits: 1 });
  const blocked = evaluate('PUPPY_CARD', withPermit);
  assert.ok(!blocked.allowed);
  assert.match(blocked.lock.reason, /تخصیص دوطرفه/);

  assert.equal(evaluate('PUPPY_CARD', facts({ ...withPermit, puppiesWithFinalAllocation: 1 })).allowed, true);

  // A registration sheet for the puppy is not a prerequisite (§19.4).
  const noSheet = facts({ kycApproved: true, issuedMatingPermits: 1, puppiesWithFinalAllocation: 1 });
  assert.equal(evaluate('PUPPY_CARD', noSheet).allowed, true);
});

test('the Hamzist contract stays disabled rather than locked behind a prerequisite', () => {
  const result = evaluate('HAMZIST_CONTRACT', WITH_PEDIGREE);
  assert.ok(!result.allowed);
  assert.equal(result.comingSoon, true);
});

test('the dashboard is never locked', () => {
  assert.equal(evaluate('DASHBOARD', NO_FACTS).allowed, true);
});

test('every lock carries a reason, a next prerequisite and a direct CTA', () => {
  for (const snapshot of [NO_FACTS, KYC_ONLY, MEMBER, WITH_SHEET, WITH_PEDIGREE]) {
    for (const [service, result] of Object.entries(evaluateAll(snapshot))) {
      if (result.allowed) continue;
      assert.ok(result.lock.reason.length > 5, service + ' needs a reason');
      assert.ok(result.lock.nextPrerequisite.length > 5, service + ' needs a next prerequisite');
      assert.match(result.lock.cta.href, /^\//, service + ' needs a direct CTA');
      assert.ok(result.lock.cta.label.length > 2, service + ' needs a CTA label');
    }
  }
});

test('a vet without membership keeps active work but takes no new work', () => {
  // §7.1 and D05.
  const inactive = vetWorkEligibility({ roleStatus: 'ACTIVE', membershipActive: false });
  assert.equal(inactive.canAcceptNewWork, false);
  assert.equal(inactive.appearsInFinder, false);
  assert.equal(inactive.canContinueActiveWork, true);
  assert.match(inactive.reasonFa ?? '', /کارهای فعال قبلی قابل تکمیل/);

  // Reactivating membership restores exactly this and nothing else.
  const reactivated = vetWorkEligibility({ roleStatus: 'ACTIVE', membershipActive: true });
  assert.deepEqual(reactivated, {
    canAcceptNewWork: true,
    appearsInFinder: true,
    canContinueActiveWork: true,
    reasonFa: null,
  });
});

test('a rejected professional approval is a different state from an inactive membership', () => {
  const rejected = vetWorkEligibility({ roleStatus: 'REJECTED', membershipActive: true });
  assert.equal(rejected.canAcceptNewWork, false);
  assert.equal(rejected.canContinueActiveWork, false);
  assert.match(rejected.reasonFa ?? '', /تأیید حرفه‌ای/);

  const pending = vetWorkEligibility({ roleStatus: 'PENDING', membershipActive: true });
  assert.equal(pending.canContinueActiveWork, false);
});

test('cooldown is never part of eligibility', () => {
  // §17.2: the cooldown is advisory. Nothing in the facts can express it, and
  // the permit stays open for an eligible member.
  assert.equal(evaluate('MATING_PERMIT', WITH_PEDIGREE).allowed, true);
  assert.ok(!Object.keys(NO_FACTS).some((key) => key.toLowerCase().includes('cooldown')));
});
