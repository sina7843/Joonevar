import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { memberships } from '../../src/db/schema/billing.ts';
import { saveProfile, signInWithVerifiedMobile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { createSession, resolveSession, setSessionContext } from '../../src/identity/session.ts';
import {
  findMembership,
  issueMembershipNumber,
  setMembershipActive,
  startMembershipPayment,
} from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import {
  assertEligible,
  eligibilityFor,
  eligibilitySummary,
  vetEligibilityFor,
} from '../../src/domain/eligibility/service.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const actorFor = (accountId: string, context: Actor['context'] = 'USER', roles: Actor['activeRoles'] = []): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: roles,
});

const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify(input) {
    return { paid: true, amountRial, providerRef: 'p-' + input.reference };
  },
});

async function withDb(fn: (testDb: TestDb, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-mem-'));
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    await fn(testDb, root);
  } finally {
    await testDb.drop();
    await fs.rm(root, { recursive: true, force: true });
  }
}

/** Signs a fixture in and takes it all the way through approved KYC. */
async function approvedMember(
  testDb: TestDb,
  root: string,
  mobile: string,
  nationalId: string,
  operatorId?: string,
) {
  const account = await signInWithVerifiedMobile(testDb.db, mobile);
  const actor = actorFor(account.accountId);
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'عضو آزمایشی',
    nationalId,
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);

  const reviewerId = operatorId ?? (await signInWithVerifiedMobile(testDb.db, '09121' + mobile.slice(5))).accountId;
  await reviewKyc(testDb.db, actorFor(reviewerId, 'ASSOCIATION_OPERATOR'), {
    caseId: submitted.id,
    decision: 'APPROVED',
  });
  return { accountId: account.accountId, actor, reviewerId };
}

async function payForMembership(testDb: TestDb, actor: Actor) {
  const batch = await startMembershipPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const started = await startAttempt(testDb.db, actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
  return batch;
}

test('approved KYC opens animal registration while membership stays separate', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200001', '0499370899');

    // Acceptance A-001: registration is open, the paid services are not.
    assert.equal((await eligibilityFor(testDb.db, member.accountId, 'ANIMAL_REGISTRATION')).allowed, true);
    assert.equal((await eligibilityFor(testDb.db, member.accountId, 'REGISTRATION_SHEET')).allowed, false);
    assert.equal(await findMembership(testDb.db, member.accountId), null);

    // The server refuses the paid service, not just the card that links to it.
    await assert.rejects(() => assertEligible(testDb.db, member.accountId, 'PEDIGREE'), /عضویت فعال/);
    await assertEligible(testDb.db, member.accountId, 'ANIMAL_REGISTRATION');
  });
});

test('a verified payment activates a lifetime membership and opens the member services', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200002', '0790419904');

    const before = await eligibilitySummary(testDb.db, member.accountId);
    assert.equal(before.services.PERSONAL_DECLARATION.allowed, false);

    await payForMembership(testDb, member.actor);

    const record = await findMembership(testDb.db, member.accountId);
    assert.equal(record?.status, 'ACTIVE');
    assert.ok(record?.activatedAt instanceof Date);

    const after = await eligibilitySummary(testDb.db, member.accountId);
    assert.equal(after.facts.membershipActive, true);
    assert.equal(after.services.PERSONAL_DECLARATION.allowed, true);
    // Still gated by their own prerequisites, not by membership any more.
    assert.equal(after.services.REGISTRATION_SHEET.allowed, false);
    assert.match(
      after.services.REGISTRATION_SHEET.allowed ? '' : after.services.REGISTRATION_SHEET.lock.cta.href,
      /animals/,
    );
  });
});

test('a membership number that is still PENDING blocks nothing', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200003', '0084575948');
    await payForMembership(testDb, member.actor);

    const record = await findMembership(testDb.db, member.accountId);
    assert.equal(record?.status, 'ACTIVE');
    assert.equal(record?.membershipNo, null);
    assert.equal(record?.numberStatus, 'PENDING');

    // Active services are open even though no number has been issued (§7).
    const summary = await eligibilitySummary(testDb.db, member.accountId);
    assert.equal(summary.facts.membershipActive, true);
    assert.equal(summary.services.PERSONAL_DECLARATION.allowed, true);

    // Issuing the number later changes nothing about eligibility.
    const issued = await issueMembershipNumber(
      testDb.db,
      actorFor(member.reviewerId, 'ASSOCIATION_OPERATOR'),
      { accountId: member.accountId, membershipNo: 'HZ-M-000123' },
    );
    assert.equal(issued.numberStatus, 'ISSUED');
    assert.equal((await eligibilitySummary(testDb.db, member.accountId)).services.PERSONAL_DECLARATION.allowed, true);
  });
});

test('only an operational context may issue a membership number', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200004', '9000000009');
    await payForMembership(testDb, member.actor);

    await assert.rejects(
      () => issueMembershipNumber(testDb.db, member.actor, { accountId: member.accountId, membershipNo: 'X-1' }),
      /محیط عملیاتی/,
    );
    await assert.rejects(
      () =>
        issueMembershipNumber(testDb.db, actorFor(member.reviewerId, 'GENETICS_OPERATOR'), {
          accountId: member.accountId,
          membershipNo: 'X-1',
        }),
      /محیط عملیاتی/,
    );
  });
});

test('membership is account level and does not change with the context', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200005', '9000001374');
    await payForMembership(testDb, member.actor);

    // Give the same account a breeder role and switch the session into it.
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: member.accountId, role: 'BREEDER', status: 'ACTIVE', grantedAt: new Date() });
    const session = await createSession(testDb.db, member.accountId, 'USER');

    const asUser = await resolveSession(testDb.db, session.token);
    assert.equal(asUser?.actor.context, 'USER');
    const userFacts = await eligibilitySummary(testDb.db, asUser!.actor.accountId);
    assert.equal(userFacts.facts.membershipActive, true);

    await setSessionContext(testDb.db, session.sessionId, 'BREEDER');
    const asBreeder = await resolveSession(testDb.db, session.token);
    assert.equal(asBreeder?.actor.context, 'BREEDER');
    const breederFacts = await eligibilitySummary(testDb.db, asBreeder!.actor.accountId);
    assert.equal(breederFacts.facts.membershipActive, true);
    assert.deepEqual(breederFacts.services.PERSONAL_DECLARATION, userFacts.services.PERSONAL_DECLARATION);
  });
});

test('an inactive membership stops new vet work but not work already active', async () => {
  await withDb(async (testDb, root) => {
    const vet = await approvedMember(testDb, root, '09990200006', '9000002745');
    await payForMembership(testDb, vet.actor);
    await testDb.db
      .insert(accountRoles)
      .values({ accountId: vet.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });

    const active = await vetEligibilityFor(testDb.db, vet.accountId);
    assert.equal(active?.canAcceptNewWork, true);
    assert.equal(active?.appearsInFinder, true);

    // Deactivating membership needs an operational context and a reason.
    const operator = actorFor(vet.reviewerId, 'ASSOCIATION_OPERATOR');
    await assert.rejects(
      () => setMembershipActive(testDb.db, vet.actor, { accountId: vet.accountId, active: false, reasonFa: 'x' }),
      /محیط عملیاتی/,
    );
    await assert.rejects(
      () => setMembershipActive(testDb.db, operator, { accountId: vet.accountId, active: false, reasonFa: '' }),
      /ثبت دلیل الزامی/,
    );

    await setMembershipActive(testDb.db, operator, {
      accountId: vet.accountId,
      active: false,
      reasonFa: 'درخواست خود عضو',
    });

    const suspended = await vetEligibilityFor(testDb.db, vet.accountId);
    assert.equal(suspended?.canAcceptNewWork, false, 'no new work is assigned');
    assert.equal(suspended?.appearsInFinder, false, 'the vet leaves the Finder');
    assert.equal(suspended?.canContinueActiveWork, true, 'work already active stays completable');

    // The role and its history survive; nothing was removed (D05).
    const [role] = await testDb.db
      .select()
      .from(accountRoles)
      .where(eq(accountRoles.accountId, vet.accountId));
    assert.ok(role);
    assert.equal(role?.status, 'ACTIVE');

    // Reactivation lifts exactly the membership restriction, with no onboarding.
    await setMembershipActive(testDb.db, operator, {
      accountId: vet.accountId,
      active: true,
      reasonFa: 'پرداخت و درخواست عضو',
    });
    const restored = await vetEligibilityFor(testDb.db, vet.accountId);
    assert.deepEqual(restored, {
      canAcceptNewWork: true,
      appearsInFinder: true,
      canContinueActiveWork: true,
      reasonFa: null,
    });

    const actions = (await testDb.db.select().from(auditEvents))
      .filter((row) => row.targetType === 'MEMBERSHIP')
      .map((row) => row.action);
    assert.deepEqual(actions, ['MEMBERSHIP_ACTIVATED', 'MEMBERSHIP_DEACTIVATED', 'MEMBERSHIP_REACTIVATED']);

    const notified = (await testDb.db.select().from(notifications)).map((row) => row.kind);
    assert.ok(notified.includes('MEMBERSHIP_DEACTIVATED'));
    assert.ok(notified.includes('MEMBERSHIP_REACTIVATED'));
  });
});

test('an inactive membership also closes the member services for that account', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200007', '9000004111');
    await payForMembership(testDb, member.actor);
    assert.equal((await eligibilityFor(testDb.db, member.accountId, 'PERSONAL_DECLARATION')).allowed, true);

    await setMembershipActive(testDb.db, actorFor(member.reviewerId, 'ASSOCIATION_OPERATOR'), {
      accountId: member.accountId,
      active: false,
      reasonFa: 'بررسی عملیاتی',
    });

    const closed = await eligibilityFor(testDb.db, member.accountId, 'PERSONAL_DECLARATION');
    assert.equal(closed.allowed, false);
    // Registering an animal never depended on membership, so it stays open.
    assert.equal((await eligibilityFor(testDb.db, member.accountId, 'ANIMAL_REGISTRATION')).allowed, true);
  });
});

test('membership cannot be deactivated before it was ever activated', async () => {
  await withDb(async (testDb, root) => {
    const member = await approvedMember(testDb, root, '09990200008', '9000005485');
    await startMembershipPayment(testDb.db, member.actor);
    const pending = await findMembership(testDb.db, member.accountId);
    assert.equal(pending?.status, 'PAYMENT_PENDING');

    await assert.rejects(
      () =>
        setMembershipActive(testDb.db, actorFor(member.reviewerId, 'ASSOCIATION_OPERATOR'), {
          accountId: member.accountId,
          active: false,
          reasonFa: 'تلاش نادرست',
        }),
      /عضویت فعال‌شده/,
    );
  });
});

test('membership payment is refused before KYC is approved', async () => {
  await withDb(async (testDb) => {
    const account = await signInWithVerifiedMobile(testDb.db, '09990200009');
    const actor = actorFor(account.accountId);
    await assert.rejects(() => startMembershipPayment(testDb.db, actor), /احراز هویت/);
    assert.equal((await testDb.db.select().from(memberships)).length, 0);
  });
});
