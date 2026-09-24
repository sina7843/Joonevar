/**
 * Timed association membership against a real database — Phase 2.5 PROMPT-009.
 *
 * Application and review with reasons, payment only after approval, the managed
 * figures frozen on each period, idempotent server verification under concurrent
 * callbacks, renewal that stacks instead of overlapping, expiry at the boundary,
 * suspension and revocation, the lifetime memberships the migration kept, and
 * the single eligibility query the rest of the product consumes.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { becomeMember, configureMembership, payMembershipPeriod, payingGateway } from '../helpers/membership.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { memberships, membershipPeriods } from '../../src/db/schema/billing.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { saveProfile } from '../../src/identity/account.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import {
  applyForMembership,
  decideMembershipApplication,
  enforceMembershipPeriod,
  findMembership,
  hasValidMembership,
  membershipQueue,
  membershipStanding,
  reviseMembershipApplication,
  setMembershipStanding,
  startMembershipPeriodPayment,
} from '../../src/billing/membership.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import { addDays } from '../../src/domain/period.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let counter = 0;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

/** A synthetic national id whose check digit is right, so the identity rules accept it. */
function syntheticNationalId(seed: number): string {
  const body = String(100_000_000 + seed * 137).slice(0, 9);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return body + String(remainder < 2 ? remainder : 11 - remainder);
}

before(async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-membership-'));
  association = actorFor(await createTestAccount(testDb.db, '09990390001'), 'ASSOCIATION_OPERATOR');
  await configureMembership(testDb.db);
});

after(async () => {
  const fs = await import('node:fs/promises');
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

/** An account whose KYC the association approved: everything membership needs and nothing more. */
async function approvedAccount(): Promise<Actor> {
  counter += 1;
  const actor = actorFor(await createTestAccount(testDb.db, '0999039' + String(counter + 100).padStart(4, '0')), 'USER');
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'عضو ' + counter,
    displayName: 'نمایشی ' + counter,
    nationalId: syntheticNationalId(counter),
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, storage, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, association, { caseId: submitted.id, decision: 'APPROVED' });
  return actor;
}

const periodsOf = (accountId: string) => testDb.db.select().from(membershipPeriods).where(eq(membershipPeriods.accountId, accountId));
const noticesOf = (accountId: string, kind: string) =>
  testDb.db.select().from(notifications).where(and(eq(notifications.recipientAccountId, accountId), eq(notifications.kind, kind)));

// ── application and review ────────────────────────────────────────────────

test('an application is reviewed with a written reason, and payment waits for the approval', async () => {
  const actor = await approvedAccount();
  await assert.rejects(startMembershipPeriodPayment(testDb.db, actor), code('CONFLICT'), 'nothing is payable before applying');

  const application = await applyForMembership(testDb.db, actor, { statementFa: 'SYNTHETIC توضیح متقاضی' });
  assert.equal((await findMembership(testDb.db, actor.accountId))!.status, 'PENDING_REVIEW');
  await assert.rejects(applyForMembership(testDb.db, actor), code('CONFLICT'), 'one open application at a time');

  for (const context of ['USER', 'BREEDER', 'TRUSTED_VET', 'GENETICS_OPERATOR', 'CONTENT_ADMIN'] as const) {
    const outsider = actorFor(await createTestAccount(testDb.db, '0999039' + String(900 + counter++).padStart(4, '0')), context);
    await assert.rejects(membershipQueue(testDb.db, outsider), code('FORBIDDEN'), context);
    await assert.rejects(
      decideMembershipApplication(testDb.db, outsider, { applicationId: application.id, expectedVersion: application.version, decision: 'APPROVE', reasonFa: 'x' }),
      code('FORBIDDEN'),
      context,
    );
  }
  await assert.rejects(
    decideMembershipApplication(testDb.db, association, { applicationId: application.id, expectedVersion: application.version, decision: 'APPROVE', reasonFa: '  ' }),
    code('VALIDATION'),
    'a decision always carries a reason',
  );

  const queue = await membershipQueue(testDb.db, association);
  assert.ok(queue.items.some((item) => item.id === application.id));

  const corrected = await decideMembershipApplication(testDb.db, association, {
    applicationId: application.id,
    expectedVersion: application.version,
    decision: 'REQUEST_CORRECTION',
    reasonFa: 'SYNTHETIC نام خانوادگی با کارت ملی نمی‌خواند',
  });
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  assert.equal((await findMembership(testDb.db, actor.accountId))!.status, 'NEEDS_CORRECTION');
  await assert.rejects(startMembershipPeriodPayment(testDb.db, actor), code('CONFLICT'), 'a correction is not an approval');

  const answered = await reviseMembershipApplication(testDb.db, actor, {
    applicationId: corrected.id,
    expectedVersion: corrected.version,
    statementFa: 'SYNTHETIC اصلاح شد',
  });
  assert.equal(answered.status, 'SUBMITTED');
  await assert.rejects(
    decideMembershipApplication(testDb.db, association, { applicationId: answered.id, expectedVersion: answered.version - 1, decision: 'APPROVE', reasonFa: 'SYNTHETIC' }),
    code('CONFLICT'),
    'a decision on a version the reviewer did not see is refused',
  );

  const approved = await decideMembershipApplication(testDb.db, association, {
    applicationId: answered.id,
    expectedVersion: answered.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC مدارک کامل است',
  });
  assert.equal(approved.status, 'APPROVED');
  const membership = (await findMembership(testDb.db, actor.accountId))!;
  assert.equal(membership.status, 'APPROVED_AWAITING_PAYMENT');
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), false, 'an approval is not a membership');
  assert.equal((await eligibilityFor(testDb.db, actor.accountId, 'PERSONAL_DECLARATION')).allowed, false);
});

test('a rejected application says why, and the account may apply again', async () => {
  const actor = await approvedAccount();
  const application = await applyForMembership(testDb.db, actor);
  await decideMembershipApplication(testDb.db, association, {
    applicationId: application.id,
    expectedVersion: application.version,
    decision: 'REJECT',
    reasonFa: 'SYNTHETIC شرایط عضویت احراز نشد',
  });
  const standing = await membershipStanding(testDb.db, actor.accountId);
  assert.equal(standing.status, 'REJECTED');
  assert.equal(standing.statusReasonFa, 'SYNTHETIC شرایط عضویت احراز نشد');
  assert.equal(standing.canApply, true);
  assert.equal(standing.valid, false);
  const notices = await noticesOf(actor.accountId, 'MEMBERSHIP_APPLICATION_DECIDED');
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.bodyFa, 'SYNTHETIC شرایط عضویت احراز نشد');
});

// ── the managed figures and the payment ───────────────────────────────────

test('the tariff and the period length are managed data: unset closes the path, and what is charged is frozen', async () => {
  const actor = await approvedAccount();
  const application = await applyForMembership(testDb.db, actor);
  await decideMembershipApplication(testDb.db, association, { applicationId: application.id, expectedVersion: application.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC' });

  await testDb.db.execute(sql`update product_setting set value = null where key = 'membership.period_days'`);
  await assert.rejects(startMembershipPeriodPayment(testDb.db, actor), code('NOT_CONFIGURED'), 'no invented duration');
  await testDb.db.execute(sql`update product_setting set value = null where key = 'fee.membership_toman'`);
  await assert.rejects(startMembershipPeriodPayment(testDb.db, actor), code('NOT_CONFIGURED'), 'no unpriced membership');
  await configureMembership(testDb.db, { feeToman: 300_000, periodDays: 365 });

  const first = await startMembershipPeriodPayment(testDb.db, actor);
  assert.equal(first.kind, 'INITIAL');
  assert.equal(first.period.amountToman, '300000');
  assert.equal(first.period.periodDays, 365);
  assert.equal(first.period.graceDays, 10, 'the grace rule is frozen on what is being bought');
  const again = await startMembershipPeriodPayment(testDb.db, actor);
  assert.equal(again.reused, true, 'the same unpaid period is offered again');

  await configureMembership(testDb.db, { feeToman: 350_000 });
  const repriced = await startMembershipPeriodPayment(testDb.db, actor);
  assert.notEqual(repriced.period.id, first.period.id);
  assert.equal(repriced.period.amountToman, '350000');
  const rows = await periodsOf(actor.accountId);
  assert.deepEqual(rows.map((row) => row.status).sort(), ['CANCELLED', 'PENDING_PAYMENT']);
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), false, 'starting a payment grants nothing');
  await configureMembership(testDb.db);
});

test('two callbacks for one attempt activate exactly one period, and a failed one grants nothing', async () => {
  const actor = await approvedAccount();
  const application = await applyForMembership(testDb.db, actor);
  await decideMembershipApplication(testDb.db, association, { applicationId: application.id, expectedVersion: application.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC' });

  // A gateway that refuses grants nothing at all.
  const failing = { async start(input: { reference: string; amountRial: bigint; callbackUrl: string }) {
      return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
    }, async verify() {
      return { paid: false, amountRial: 0n, providerRef: 'p' };
    } };
  const refused = await startMembershipPeriodPayment(testDb.db, actor);
  const refusedAttempt = await startAttempt(testDb.db, actor, { batchId: refused.batch.id, callbackUrl: '/x' }, failing, 'test-gateway');
  assert.equal((await verifyAttempt(testDb.db, { reference: refusedAttempt.reference }, failing, paidEffects)).state, 'FAILED');
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), false);
  assert.equal((await periodsOf(actor.accountId)).filter((row) => row.status === 'ACTIVE').length, 0);

  const started = await startMembershipPeriodPayment(testDb.db, actor);
  const gateway = payingGateway(3_000_000n);
  const attempt = await startAttempt(testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  // Both callbacks arrive at once: one does the work, the other finds it done.
  const outcomes = await Promise.all([
    verifyAttempt(testDb.db, { reference: attempt.reference, providerRef: 'ref-1' }, gateway, paidEffects),
    verifyAttempt(testDb.db, { reference: attempt.reference, providerRef: 'ref-1' }, gateway, paidEffects),
  ]);
  assert.deepEqual(outcomes.map((row) => row.state), ['PAID', 'PAID']);
  assert.equal(outcomes.filter((row) => row.state === 'PAID' && row.performed).length, 1, 'exactly one callback did the work');

  const active = (await periodsOf(actor.accountId)).filter((row) => row.status === 'ACTIVE');
  assert.equal(active.length, 1);
  assert.equal((await noticesOf(actor.accountId, 'MEMBERSHIP_ACTIVATED')).length, 1);
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), true);
  const declaration = await eligibilityFor(testDb.db, actor.accountId, 'PERSONAL_DECLARATION');
  assert.equal(declaration.allowed ? '' : declaration.lock.cta.href, '/animals/new', 'membership is no longer the blocker');
});

// ── renewal, expiry, suspension ───────────────────────────────────────────

test('renewing early stacks on the live period, and the membership expires only when its window and grace are over', async () => {
  const actor = await approvedAccount();
  const start = new Date('2026-03-01T00:00:00Z');
  await becomeMember(testDb.db, actor, association, { now: start });
  const first = (await periodsOf(actor.accountId)).find((row) => row.status === 'ACTIVE')!;

  await payMembershipPeriod(testDb.db, actor, { now: new Date() });
  const periods = (await periodsOf(actor.accountId)).filter((row) => row.status === 'ACTIVE').sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime());
  assert.equal(periods.length, 2);
  assert.deepEqual(periods[1]!.startsAt, periods[0]!.endsAt, 'the new period starts where the live one ends');
  assert.deepEqual(periods[1]!.endsAt, addDays(periods[0]!.endsAt!, 365), 'a full period is added, none of it lost');
  assert.equal(periods[1]!.kind, 'RENEWAL');
  assert.equal(periods[1]!.amountToman, '200000', 'the renewal tariff is its own setting');
  assert.equal(first.id, periods[0]!.id);

  const membership = (await findMembership(testDb.db, actor.accountId))!;
  assert.deepEqual(membership.currentPeriodEndsAt, addDays(periods[1]!.endsAt!, 10), 'validity runs to the end plus the bought grace');

  // Inside the window, then inside the grace, then over.
  assert.equal(await hasValidMembership(testDb.db, actor.accountId, addDays(periods[1]!.endsAt!, -1)), true);
  const inGrace = await membershipStanding(testDb.db, actor.accountId, addDays(periods[1]!.endsAt!, 5));
  assert.equal(inGrace.valid, true, 'the bought grace still counts');
  assert.equal(inGrace.inGrace, true);
  assert.equal(inGrace.status, 'ACTIVE');

  const lapsed = addDays(periods[1]!.endsAt!, 11);
  const after = await membershipStanding(testDb.db, actor.accountId, lapsed);
  assert.equal(after.status, 'EXPIRED');
  assert.equal(after.valid, false);
  assert.equal(after.canPay, true, 'the member may buy a new period');
  assert.equal((await noticesOf(actor.accountId, 'MEMBERSHIP_EXPIRED')).length, 1);
  await membershipStanding(testDb.db, actor.accountId, addDays(lapsed, 30));
  assert.equal((await noticesOf(actor.accountId, 'MEMBERSHIP_EXPIRED')).length, 1, 'the expiry is recorded once');
  const expiries = (await testDb.db.select().from(auditEvents)).filter((row) => row.action === 'MEMBERSHIP_EXPIRED' && row.targetId === actor.accountId);
  assert.equal(expiries.length, 1);
});

test('a reminder is written once inside its window', async () => {
  const actor = await approvedAccount();
  await becomeMember(testDb.db, actor, association);
  const period = (await periodsOf(actor.accountId)).find((row) => row.status === 'ACTIVE')!;
  const inside = addDays(period.endsAt!, -20);
  await enforceMembershipPeriod(testDb.db, actor.accountId, addDays(period.endsAt!, -60));
  assert.equal((await noticesOf(actor.accountId, 'MEMBERSHIP_ENDING')).length, 0, 'outside the window nothing is sent');
  await enforceMembershipPeriod(testDb.db, actor.accountId, inside);
  await enforceMembershipPeriod(testDb.db, actor.accountId, addDays(inside, 1));
  assert.equal((await noticesOf(actor.accountId, 'MEMBERSHIP_ENDING')).length, 1);
});

test('suspension and revocation outrank a live period, and only the association may write them', async () => {
  const actor = await approvedAccount();
  await becomeMember(testDb.db, actor, association);
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), true);

  await assert.rejects(setMembershipStanding(testDb.db, actor, { accountId: actor.accountId, action: 'SUSPEND', reasonFa: 'SYNTHETIC' }), code('FORBIDDEN'));
  await setMembershipStanding(testDb.db, association, { accountId: actor.accountId, action: 'SUSPEND', reasonFa: 'SYNTHETIC بررسی انضباطی' });
  const suspended = await membershipStanding(testDb.db, actor.accountId);
  assert.equal(suspended.status, 'SUSPENDED');
  assert.equal(suspended.valid, false, 'a paid period does not survive a suspension');
  assert.equal(suspended.statusReasonFa, 'SYNTHETIC بررسی انضباطی');
  const blocked = await eligibilityFor(testDb.db, actor.accountId, 'PERSONAL_DECLARATION');
  assert.equal(blocked.allowed ? '' : blocked.lock.cta.href, '/membership', 'membership is the blocker again');
  await assert.rejects(startMembershipPeriodPayment(testDb.db, actor), code('CONFLICT'), 'a suspended membership is not renewed by paying');

  await setMembershipStanding(testDb.db, association, { accountId: actor.accountId, action: 'REINSTATE', reasonFa: 'SYNTHETIC رفع تعلیق' });
  assert.equal(await hasValidMembership(testDb.db, actor.accountId), true, 'the period it already paid for comes back');

  await setMembershipStanding(testDb.db, association, { accountId: actor.accountId, action: 'REVOKE', reasonFa: 'SYNTHETIC لغو' });
  const revoked = await membershipStanding(testDb.db, actor.accountId);
  assert.equal(revoked.status, 'REVOKED');
  assert.equal(revoked.valid, false);
  assert.equal(revoked.canApply, true, 'a revoked account may apply again');
});

// ── what the migration kept ───────────────────────────────────────────────

test('a membership that was active before Phase 2.5 stays lifetime and is never given an expiry', async () => {
  const actor = await approvedAccount();
  // Exactly what migration 0035 leaves behind for a Phase 1 member.
  await testDb.db.insert(memberships).values({ accountId: actor.accountId, status: 'ACTIVE', activatedAt: new Date('2025-01-01T00:00:00Z'), lifetime: true });

  const standing = await membershipStanding(testDb.db, actor.accountId, new Date('2099-01-01T00:00:00Z'));
  assert.equal(standing.lifetime, true);
  assert.equal(standing.valid, true, 'nothing expires a membership that was sold as lifetime');
  assert.equal(standing.endsAt, null, 'no expiry was invented for it');
  assert.equal(standing.canPay, false);
  assert.equal(standing.canApply, false);
  assert.equal((await findMembership(testDb.db, actor.accountId))!.currentPeriodEndsAt, null);
  assert.equal((await periodsOf(actor.accountId)).length, 0);

  // The database itself refuses to give a lifetime membership a window.
  await assert.rejects(
    testDb.db.update(memberships).set({ currentPeriodEndsAt: new Date() }).where(eq(memberships.accountId, actor.accountId)),
    (error: unknown) => ((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === '23514',
  );
});
