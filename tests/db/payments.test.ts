import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import {
  memberships,
  paymentAttempts,
  paymentBatches,
  paymentCallbacks,
  paymentItems,
} from '../../src/db/schema/billing.ts';
import { signInWithVerifiedMobile, saveProfile } from '../../src/identity/account.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { updateSetting } from '../../src/settings/service.ts';
import {
  batchTotalToman,
  cancelAttempt,
  createBatch,
  findBatch,
  startAttempt,
  verifyAttempt,
  type PaidEffects,
} from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { findMembership, startMembershipPayment } from '../../src/billing/membership.ts';
import { tomanToRial } from '../../src/domain/money.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const VALID_ID = '0499370899';
const PROVIDER = 'test-gateway';

const actorFor = (accountId: string, context: Actor['context'] = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: context === 'USER' ? [] : [context as never],
});

/** A gateway whose answer the test controls, so verification can be steered exactly. */
function scriptedGateway(answer: { paid: boolean; amountRial: bigint; providerRef?: string }): PaymentGateway & { calls: number } {
  const gateway = {
    calls: 0,
    async start(input: { reference: string; amountRial: bigint; callbackUrl: string }) {
      return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
    },
    async verify() {
      gateway.calls += 1;
      // A little latency makes the concurrency test meaningful.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { paid: answer.paid, amountRial: answer.amountRial, providerRef: answer.providerRef ?? 'p-1' };
    },
  };
  return gateway;
}

async function withDb(fn: (testDb: TestDb) => Promise<void>) {
  const testDb = await createTestDb();
  try {
    await seedBaseline(testDb.db);
    await fn(testDb);
  } finally {
    await testDb.drop();
  }
}

/** A signed-in account with approved KYC, which is what membership eligibility needs. */
async function approvedAccount(testDb: TestDb, mobile: string, nationalId: string, root: string) {
  const account = await signInWithVerifiedMobile(testDb.db, mobile);
  const actor = actorFor(account.accountId);
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'پرداخت‌کننده',
    nationalId,
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, root, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);

  const operator = await signInWithVerifiedMobile(testDb.db, '0912' + mobile.slice(4));
  await reviewKyc(testDb.db, actorFor(operator.accountId, 'ASSOCIATION_OPERATOR'), {
    caseId: submitted.id,
    decision: 'APPROVED',
  });
  return { accountId: account.accountId, actor, operatorId: operator.accountId };
}

async function withApproved(
  fn: (testDb: TestDb, member: { accountId: string; actor: Actor; operatorId: string }, root: string) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-pay-'));
  try {
    await withDb(async (testDb) => {
      const member = await approvedAccount(testDb, '09990100001', VALID_ID, root);
      await fn(testDb, member, root);
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('the amount is taken from settings, frozen on the item and converted to Rial exactly', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const items = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));

    assert.equal(items.length, 1);
    assert.equal(items[0]?.amountToman, '300000');
    assert.equal(items[0]?.settingKey, 'fee.membership_toman');
    assert.equal(items[0]?.settingVersion, 1);
    assert.equal(await batchTotalToman(testDb.db, batch.id), 300000n);

    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(
      testDb.db,
      member.actor,
      { batchId: batch.id, callbackUrl: '/membership/return' },
      gateway,
      PROVIDER,
    );
    assert.equal(started.amountRial, tomanToRial(300000n));
    assert.equal(started.amountRial, 3_000_000n);
  });
});

test('a browser landing on the return page cannot make a payment paid', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: false, amountRial: 0n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
    assert.equal(outcome.state, 'FAILED');
    assert.equal(gateway.calls, 1, 'the server asked the gateway rather than trusting the return');

    assert.equal((await findBatch(testDb.db, batch.id))?.status, 'FAILED');
    assert.notEqual((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
  });
});

test('a duplicated callback applies the effect only once', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const first = await verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-1' }, gateway, paidEffects);
    const second = await verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-1' }, gateway, paidEffects);
    const third = await verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-1' }, gateway, paidEffects);

    assert.equal(first.state, 'PAID');
    assert.ok(first.state === 'PAID' && first.performed);
    assert.equal(second.state, 'PAID');
    assert.ok(second.state === 'PAID' && !second.performed);
    assert.ok(third.state === 'PAID' && !third.performed);

    // One activation, one notification, one audit row for the verification.
    const activations = (await testDb.db.select().from(auditEvents)).filter(
      (row) => row.action === 'MEMBERSHIP_ACTIVATED',
    );
    assert.equal(activations.length, 1);
    const verified = (await testDb.db.select().from(auditEvents)).filter((row) => row.action === 'PAYMENT_VERIFIED');
    assert.equal(verified.length, 1);
    const notified = (await testDb.db.select().from(notifications)).filter(
      (row) => row.kind === 'MEMBERSHIP_ACTIVATED',
    );
    assert.equal(notified.length, 1);
  });
});

test('concurrent callbacks for the same attempt settle it once', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const results = await Promise.all([
      verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-a' }, gateway, paidEffects),
      verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-b' }, gateway, paidEffects),
      verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'p-c' }, gateway, paidEffects),
    ]);

    const performed = results.filter((r) => r.state === 'PAID' && r.performed);
    assert.equal(performed.length, 1, 'exactly one call applied the effect');
    assert.ok(results.every((r) => r.state === 'PAID'));

    const activations = (await testDb.db.select().from(auditEvents)).filter(
      (row) => row.action === 'MEMBERSHIP_ACTIVATED',
    );
    assert.equal(activations.length, 1);
    assert.equal((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
  });
});

test('a tampered amount is refused and nothing is activated', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    // The gateway claims the payment succeeded, but for one tenth of the amount.
    const gateway = scriptedGateway({ paid: true, amountRial: 300_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
    assert.equal(outcome.state, 'FAILED');
    assert.ok(outcome.state === 'FAILED' && outcome.reasonFa.includes('یکی نیست'));

    assert.notEqual((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
    const [attempt] = await testDb.db.select().from(paymentAttempts).where(eq(paymentAttempts.batchId, batch.id));
    assert.equal(attempt?.status, 'FAILED');

    const failures = (await testDb.db.select().from(auditEvents)).filter((row) => row.action === 'PAYMENT_FAILED');
    assert.equal(failures.length, 1);
    assert.equal((failures[0]?.after as { reason: string }).reason, 'AMOUNT_MISMATCH');
  });
});

test('a cancelled payment keeps the batch and its frozen amount for a retry', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const cancelled = await cancelAttempt(testDb.db, { reference: started.reference });
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal((await findBatch(testDb.db, batch.id))?.status, 'CANCELLED');

    // The items and their amounts survive.
    const items = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));
    assert.equal(items.length, 1);
    assert.equal(items[0]?.amountToman, '300000');
    assert.equal(items[0]?.status, 'PENDING');

    // A late callback for a cancelled attempt does not activate anything.
    const late = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
    assert.equal(late.state, 'CANCELLED');
    assert.notEqual((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
  });
});

test('changing the tariff does not change an intent that was already created', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    assert.equal(await batchTotalToman(testDb.db, batch.id), 300000n);

    // An operator raises the fee after the intent exists.
    await updateSetting(testDb.db, actorFor(member.operatorId, 'SUPERADMIN'), {
      key: 'fee.membership_toman',
      value: '450000',
      reason: 'تغییر تعرفه',
    });

    // The old intent is untouched, in Toman and in the Rial actually charged.
    assert.equal(await batchTotalToman(testDb.db, batch.id), 300000n);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);
    assert.equal(started.amountRial, 3_000_000n);
    assert.equal((await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects)).state, 'PAID');

    // A new intent for another account uses the new price and the new version.
    const other = await signInWithVerifiedMobile(testDb.db, '09990100050');
    const otherBatch = await createBatch(testDb.db, actorFor(other.accountId), {
      service: 'MEMBERSHIP',
      items: [{ targetType: 'MEMBERSHIP', targetId: other.accountId, settingKey: 'fee.membership_toman' }],
      resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'REVIEW_FEE', originRoute: '/membership' },
    });
    assert.equal(await batchTotalToman(testDb.db, otherBatch.id), 450000n);
    const [newItem] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, otherBatch.id));
    assert.equal(newItem?.settingVersion, 2);
  });
});

test('a batch cannot be created for a tariff nobody has entered', async () => {
  await withApproved(async (testDb, member) => {
    // A tariff an operator cleared back to NOT_CONFIGURED, not a missing seed.
    await updateSetting(testDb.db, actorFor(member.operatorId, 'SUPERADMIN'), {
      key: 'fee.pedigree_toman',
      value: null,
      reason: 'SYNTHETIC — بازگرداندن به تعیین‌نشده',
    });
    await assert.rejects(
      () =>
        createBatch(testDb.db, member.actor, {
          service: 'PEDIGREE',
          items: [{ targetType: 'ANIMAL', targetId: 'a-1', settingKey: 'fee.pedigree_toman' }],
          resume: { entity: { type: 'ANIMAL', id: 'a-1' }, step: 'PAY', originRoute: '/pedigree/request' },
        }),
      /not configured/,
    );
    assert.equal((await testDb.db.select().from(paymentBatches)).length, 0, 'nothing is written for a missing price');
  });
});

test('a payment belongs to its payer and cannot be started by anyone else', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const stranger = await signInWithVerifiedMobile(testDb.db, '09990100051');
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    await assert.rejects(
      () =>
        startAttempt(
          testDb.db,
          actorFor(stranger.accountId),
          { batchId: batch.id, callbackUrl: '/x' },
          gateway,
          PROVIDER,
        ),
      /Not permitted/,
    );
  });
});

test('an unknown reference is reported as unknown rather than failing open', async () => {
  await withApproved(async (testDb) => {
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const outcome = await verifyAttempt(testDb.db, { reference: 'HZP-nope' }, gateway, paidEffects);
    assert.equal(outcome.state, 'UNKNOWN_REFERENCE');
    assert.equal(gateway.calls, 0, 'no gateway call is made for a reference we never issued');
  });
});

test('every callback receipt is recorded once per provider reference', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    await verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'same-ref' }, gateway, paidEffects);
    await verifyAttempt(testDb.db, { reference: started.reference, providerRef: 'same-ref' }, gateway, paidEffects);

    const receipts = await testDb.db.select().from(paymentCallbacks);
    assert.equal(receipts.length, 1, 'the same provider reference is recorded once');
  });
});

test('a paid effect that is not implemented yet records the money and issues nothing', async () => {
  await withApproved(async (testDb, member) => {
    await updateSetting(testDb.db, actorFor(member.operatorId, 'SUPERADMIN'), {
      key: 'fee.kennel_registration_toman',
      value: '120000',
    });
    const batch = await createBatch(testDb.db, member.actor, {
      service: 'KENNEL_REGISTRATION',
      items: [{ targetType: 'KENNEL', targetId: 'k-1', settingKey: 'fee.kennel_registration_toman' }],
      resume: { entity: { type: 'KENNEL', id: 'k-1' }, step: 'PAY', originRoute: '/kennels/new' },
    });
    const gateway = scriptedGateway({ paid: true, amountRial: 1_200_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const outcome = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
    assert.equal(outcome.state, 'PAID');
    // The money is recorded; no kennel and no membership is fabricated.
    const [item] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));
    assert.equal(item?.status, 'PAID');
    assert.notEqual((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
  });
});

test('the paid effect runs inside the verifying transaction', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);

    const exploding: PaidEffects = {
      async onPaid() {
        throw new Error('effect failed');
      },
    };

    await assert.rejects(() => verifyAttempt(testDb.db, { reference: started.reference }, gateway, exploding));

    // Nothing was half-applied: the batch is still awaiting payment and the
    // attempt is still pending, so a retry can settle it properly.
    assert.equal((await findBatch(testDb.db, batch.id))?.status, 'AWAITING_PAYMENT');
    const [attempt] = await testDb.db.select().from(paymentAttempts).where(eq(paymentAttempts.batchId, batch.id));
    assert.equal(attempt?.status, 'PENDING');

    const retry = await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);
    assert.equal(retry.state, 'PAID');
    assert.equal((await findMembership(testDb.db, member.accountId))?.status, 'ACTIVE');
  });
});

test('membership is lifetime: activation writes no expiry and nothing renews it', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);
    await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);

    const [row] = await testDb.db.select().from(memberships).where(eq(memberships.accountId, member.accountId));
    assert.equal(row?.status, 'ACTIVE');
    assert.ok(row?.activatedAt instanceof Date);
    // The schema has no expiry column at all, and nothing in the row implies one.
    assert.ok(!Object.keys(row!).some((key) => /expire|renew/i.test(key)));

    // Activation is not gated behind a review after payment (D04). The only
    // membership event recorded is the activation itself.
    const membershipAudits = (await testDb.db.select().from(auditEvents))
      .filter((row) => row.targetType === 'MEMBERSHIP')
      .map((row) => row.action);
    assert.deepEqual(membershipAudits, ['MEMBERSHIP_ACTIVATED']);
  });
});

test('starting a second membership payment while one is active is refused', async () => {
  await withApproved(async (testDb, member) => {
    const batch = await startMembershipPayment(testDb.db, member.actor);
    const gateway = scriptedGateway({ paid: true, amountRial: 3_000_000n });
    const started = await startAttempt(testDb.db, member.actor, { batchId: batch.id, callbackUrl: '/x' }, gateway, PROVIDER);
    await verifyAttempt(testDb.db, { reference: started.reference }, gateway, paidEffects);

    await assert.rejects(() => startMembershipPayment(testDb.db, member.actor), /از قبل فعال است/);
  });
});
