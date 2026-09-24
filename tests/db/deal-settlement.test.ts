/**
 * The deposit after the reservation — PROMPT-006.
 *
 * A reserved deal is built the real way in every test: real accounts, a real
 * animal through the desk, a real advert, a real request, and a deposit taken
 * through a gateway and verified server-side. Only then is there anything to
 * cancel, refund or argue about.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import {
  animalWithSheet,
  actorFor,
  payingGateway,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { animalListings } from '../../src/db/schema/marketplace.ts';
import { listingInquiries } from '../../src/db/schema/inquiry.ts';
import {
  animalCommissionRules,
  dealCancellations,
  depositRefundAttempts,
  depositRefunds,
  sellerDebts,
} from '../../src/db/schema/deals.ts';
import { publisherRestrictions } from '../../src/db/schema/moderation.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { attachListingMedia, createListing, publishListing, saveListing } from '../../src/marketplace/listings.ts';
import {
  acceptInquiry,
  createInquiry,
  startDepositPayment,
} from '../../src/marketplace/inquiries.ts';
import { publishCommissionRule, resolveCommission } from '../../src/marketplace/commission-rules.ts';
import { cancelDeal, cancellationOfDeal, sellerDebtsOf } from '../../src/marketplace/cancellations.ts';
import {
  executeRefund,
  loadRefund,
  recordManualRefund,
  refundOfDeal,
  refundQueue,
} from '../../src/marketplace/refunds.ts';
import { addDisputeEvidence, decideDispute, disputeOfDeal, disputeQueue, openDispute } from '../../src/marketplace/disputes.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099936000',
  tmpPrefix: 'hamzist-settle-',
  councilCode: 'SYNTH-ST-6',
  chipBase: 4_700_000,
};

const PRICE = 20_000_000n;
/** 100,000 fixed + 2.5% of 20,000,000. */
const DEPOSIT = 600_000n;

/** A gateway that takes the money and then refuses every refund. */
const failingRefundGateway = (amountRial: bigint): PaymentGateway => ({
  ...payingGateway(amountRial),
  async refund() {
    return { state: 'FAILED', reasonFa: 'SYNTHETIC — درگاه آزمایشی استرداد را رد کرد.' };
  },
});

/** A gateway with no refund support at all, like a real provider today. */
const noRefundGateway = (amountRial: bigint): PaymentGateway => {
  const base = payingGateway(amountRial);
  return { start: base.start, verify: base.verify };
};

async function openMarketForDeals(ctx: MatingCtx): Promise<void> {
  const set = (key: string, value: unknown) =>
    updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
  await set('market.flag.animal_market_enabled', true);
  await set('market.flag.animal_listing_creation_enabled', true);
  await set('market.animal.listing_duration_days', 30);
  await set('market.animal.commission_fixed_toman', '100000');
  await set('market.animal.commission_percent_bp', 250);
  await set('market.animal.request_payment_window_hours', 48);
  await set('market.animal.cancellation_policy_version', 'SYNTHETIC-POLICY-1');
}

async function publishedListing(ctx: MatingCtx, nameFa: string) {
  const animal = await animalWithSheet(ctx, nameFa, { skipSheet: true });
  const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);
  const saved = await saveListing(ctx.testDb.db, ctx.first.actor, {
    listingId: listing.id,
    expectedVersion: listing.version,
    priceMode: 'EXACT',
    priceToman: String(PRICE),
    descriptionFa: 'SYNTHETIC توضیح آگهی آزمایشی برای آزمون لغو، استرداد و اختلاف بیعانه.',
    reasonForSaleFa: 'SYNTHETIC دلیل فروش آزمایشی',
    provinceCode: city!.provinceCode,
    cityId: city!.id,
    vaccinationStatus: 'YES',
    neuterStatus: 'UNKNOWN',
    healthNoteFa: 'SYNTHETIC بدون مشکل شناخته‌شده',
    deliveryMethods: ['IN_PERSON'],
  });
  for (let i = 0; i < 3; i += 1) {
    await attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
      listingId: listing.id,
      kind: 'IMAGE',
      bytes: PNG,
      originalName: 'p' + i + '.png',
      altFa: 'SYNTHETIC تصویر ' + (i + 1),
    });
  }
  return publishListing(ctx.testDb.db, ctx.first.actor, {
    listingId: listing.id,
    expectedVersion: saved.version,
  });
}

/** A deal with a verified deposit: the state everything in this file starts from. */
async function reservedDeal(ctx: MatingCtx, nameFa: string, gatewayFor = payingGateway) {
  const listing = await publishedListing(ctx, nameFa);
  const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
  const accepted = await acceptInquiry(ctx.testDb.db, ctx.first.actor, {
    inquiryId: inquiry.id,
    expectedVersion: inquiry.version,
  });
  const { batch } = await startDepositPayment(ctx.testDb.db, ctx.second.actor, { inquiryId: inquiry.id });
  const gateway = gatewayFor(accepted.depositAmountToman! * 10n);
  const attempt = await startAttempt(
    ctx.testDb.db,
    ctx.second.actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test',
  );
  const outcome = await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
  return { listing, inquiryId: inquiry.id, gateway };
}

const reload = async (ctx: MatingCtx, id: string) => {
  const [row] = await ctx.testDb.db.select().from(listingInquiries).where(eq(listingInquiries.id, id));
  return row!;
};

const listingStatus = async (ctx: MatingCtx, id: string) => {
  const [row] = await ctx.testDb.db
    .select({ status: animalListings.status })
    .from(animalListings)
    .where(eq(animalListings.id, id));
  return row!.status;
};

// ── the formula ────────────────────────────────────────────────────────────

test('the published rule for a species and seller kind decides the deposit, and the deal keeps it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);

    // With no rule at all the global settings apply.
    const fallback = await resolveCommission(ctx.testDb.db, { speciesCode: 'DOG', sellerKind: 'OWNER' });
    assert.equal(fallback.ruleId, null);
    assert.equal(fallback.inputs.fixedToman, 100_000n);

    // A species-wide rule wins over the settings…
    await publishCommissionRule(ctx.testDb.db, ctx.admin.actor, {
      speciesCode: 'DOG',
      sellerKind: null,
      fixedToman: 50_000n,
      percentBp: 100,
      minToman: null,
      maxToman: null,
      noteFa: 'SYNTHETIC قاعده عمومی سگ',
    });
    const wide = await resolveCommission(ctx.testDb.db, { speciesCode: 'DOG', sellerKind: 'OWNER' });
    assert.equal(wide.inputs.fixedToman, 50_000n);
    assert.ok(wide.ruleId);

    // …and a rule for this seller kind wins over that.
    const narrow = await publishCommissionRule(ctx.testDb.db, ctx.admin.actor, {
      speciesCode: 'DOG',
      sellerKind: 'OWNER',
      fixedToman: 70_000n,
      percentBp: 300,
      minToman: 100_000n,
      maxToman: 900_000n,
      noteFa: 'SYNTHETIC قاعده مالک',
    });
    const resolved = await resolveCommission(ctx.testDb.db, { speciesCode: 'DOG', sellerKind: 'OWNER' });
    assert.equal(resolved.ruleId, narrow.id);
    assert.equal(resolved.inputs.percentBp, 300);

    // The deal freezes the rule it was priced by: 70,000 + 3% of 20,000,000.
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ قاعده');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
    assert.equal(inquiry.depositAmountToman, 670_000n);
    assert.equal(inquiry.commissionRuleId, narrow.id);

    // Publishing again archives the old row; the deal still points at its own.
    const newer = await publishCommissionRule(ctx.testDb.db, ctx.admin.actor, {
      speciesCode: 'DOG',
      sellerKind: 'OWNER',
      fixedToman: 999_000n,
      percentBp: 900,
      minToman: null,
      maxToman: null,
      noteFa: 'SYNTHETIC نسخه تازه',
    });
    assert.equal(newer.version, narrow.version + 1);
    const [archived] = await ctx.testDb.db
      .select({ status: animalCommissionRules.status })
      .from(animalCommissionRules)
      .where(eq(animalCommissionRules.id, narrow.id));
    assert.equal(archived!.status, 'ARCHIVED');
    assert.equal((await reload(ctx, inquiry.id)).depositAmountToman, 670_000n);
  });
});

// ── cancelling ─────────────────────────────────────────────────────────────

test('a buyer cancelling after the reservation pays the penalty frozen on the deal', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.buyer_cancellation_penalty_bp',
      value: 2_500,
      reason: 'SYNTHETIC — جریمه آزمایشی',
    });

    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ انصراف خریدار');
    const frozen = await reload(ctx, deal.inquiryId);
    assert.equal(frozen.buyerPenaltyBp, 2_500, 'the policy is frozen at acceptance');

    // Changing the policy afterwards must not reach into this deal.
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.buyer_cancellation_penalty_bp',
      value: 9_000,
      reason: 'SYNTHETIC — تغییر پس از انجماد',
    });

    const result = await cancelDeal(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      reason: 'BUYER_CANCELLED',
      statementFa: 'SYNTHETIC منصرف شدم',
    });
    assert.equal(result.cancellation.outcome, 'PARTIAL_REFUND');
    assert.equal(result.cancellation.penaltyAmountToman, 150_000n);
    assert.equal(result.cancellation.refundAmountToman, 450_000n);
    assert.equal(result.disputeId, null);
    assert.ok(result.refundId);

    const refund = await refundOfDeal(ctx.testDb.db, deal.inquiryId);
    assert.equal(refund!.amountToman, 450_000n);
    assert.equal(refund!.status, 'PENDING', 'deciding is not paying');

    assert.equal(await listingStatus(ctx, deal.listing.id), 'PUBLISHED', 'the animal is for sale again');
    assert.equal((await reload(ctx, deal.inquiryId)).status, 'CLOSED');

    // Asking twice is the same asking.
    await assert.rejects(
      cancelDeal(ctx.testDb.db, ctx.second.actor, { inquiryId: deal.inquiryId, reason: 'BUYER_CANCELLED' }),
      code('CONFLICT'),
    );
    // And the seller cannot cancel on the buyer's behalf.
    const other = await reservedDeal(ctx, 'SYNTHETIC سگ دلیل طرف مقابل');
    await assert.rejects(
      cancelDeal(ctx.testDb.db, ctx.first.actor, { inquiryId: other.inquiryId, reason: 'BUYER_CANCELLED' }),
      code('VALIDATION'),
    );
  });
});

test('a seller cancelling returns everything, owes a penalty and is restricted progressively', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    for (const [key, value] of [
      ['market.animal.seller_cancellation_penalty_toman', '300000'],
      ['market.animal.seller_cancellation_restriction_days', 7],
    ] as const) {
      await updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
    }

    const first = await reservedDeal(ctx, 'SYNTHETIC سگ انصراف فروشنده');
    const firstResult = await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: first.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC پشیمان شدم',
    });
    assert.equal(firstResult.cancellation.outcome, 'FULL_REFUND');
    assert.equal(firstResult.cancellation.refundAmountToman, DEPOSIT);
    assert.equal(firstResult.cancellation.penaltyAmountToman, 0n);

    const debts = await sellerDebtsOf(ctx.testDb.db, ctx.first.accountId);
    assert.equal(debts.length, 1);
    assert.equal(debts[0]!.amountToman, 300_000n);
    assert.equal(debts[0]!.status, 'OUTSTANDING');

    const restrictions = await ctx.testDb.db
      .select()
      .from(publisherRestrictions)
      .where(eq(publisherRestrictions.accountId, ctx.first.accountId));
    assert.equal(restrictions.length, 1);
    const firstWindow = restrictions[0]!.endsAt!.getTime() - restrictions[0]!.startsAt.getTime();
    assert.equal(Math.round(firstWindow / (24 * 60 * 60 * 1000)), 7);

    // A second cancellation costs twice the base period.
    const second = await reservedDeal(ctx, 'SYNTHETIC سگ انصراف دوم');
    await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: second.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC دوباره پشیمان شدم',
    });
    const both = await ctx.testDb.db
      .select()
      .from(publisherRestrictions)
      .where(eq(publisherRestrictions.accountId, ctx.first.accountId));
    assert.equal(both.length, 2);
    const windows = both
      .map((row) => Math.round((row.endsAt!.getTime() - row.startsAt.getTime()) / (24 * 60 * 60 * 1000)))
      .sort((a, b) => a - b);
    assert.deepEqual(windows, [7, 14]);

    const allDebts = await sellerDebtsOf(ctx.testDb.db, ctx.first.accountId);
    assert.equal(allDebts.length, 2);
  });
});

test('a claim is not a decision: it opens a dispute and holds the animal', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ ادعا');

    // A claimed reason needs the account of what happened.
    await assert.rejects(
      cancelDeal(ctx.testDb.db, ctx.second.actor, { inquiryId: deal.inquiryId, reason: 'HEALTH_ISSUE' }),
      code('VALIDATION'),
    );

    const result = await cancelDeal(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      reason: 'HEALTH_ISSUE',
      statementFa: 'SYNTHETIC حیوان با اطلاعات آگهی نمی‌خواند و گزارش دامپزشک دارم.',
    });
    assert.equal(result.cancellation.outcome, 'AWAITING_REVIEW');
    assert.equal(result.refundId, null, 'no money moves on one side’s account of events');
    assert.ok(result.disputeId);

    // The animal stays reserved while the argument is open.
    assert.equal(await listingStatus(ctx, deal.listing.id), 'RESERVED');
    assert.equal((await reload(ctx, deal.inquiryId)).status, 'CONVERTED');

    const reviewer = actorFor(ctx.admin.accountId, 'DISPUTE_REVIEWER');
    const queue = await disputeQueue(ctx.testDb.db, reviewer);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.id, result.disputeId);
    assert.equal(queue[0]!.scope, 'LISTING_FACTS');
  });
});

// ── arbitration ────────────────────────────────────────────────────────────

test('a reviewer decides once, with a reason, and the refund follows from the decision', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ داوری');
    const dispute = await openDispute(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      scope: 'LISTING_FACTS',
      claimFa: 'SYNTHETIC ادعای من درباره صحت اطلاعات آگهی و آنچه تحویل داده شد.',
    });

    // Both parties may bring evidence; a stranger may not even see the case.
    await addDisputeEvidence(ctx.testDb.db, ctx.root, ctx.first.actor, {
      disputeId: dispute.id,
      noteFa: 'SYNTHETIC پاسخ فروشنده',
      file: { bytes: PNG, originalName: 'proof.png' },
    });
    await assert.rejects(
      addDisputeEvidence(ctx.testDb.db, ctx.root, actorFor(ctx.centre.accountId), {
        disputeId: dispute.id,
        noteFa: 'SYNTHETIC مدرک غریبه',
      }),
      code('NOT_FOUND'),
    );

    const reviewer = actorFor(ctx.admin.accountId, 'DISPUTE_REVIEWER');
    // A reason is not optional, and an ordinary account cannot decide at all.
    await assert.rejects(
      decideDispute(ctx.testDb.db, reviewer, {
        disputeId: dispute.id,
        decision: 'BUYER_FAVOURED',
        reasonFa: 'کوتاه',
        expectedVersion: dispute.version,
      }),
      code('VALIDATION'),
    );
    await assert.rejects(
      decideDispute(ctx.testDb.db, ctx.second.actor, {
        disputeId: dispute.id,
        decision: 'BUYER_FAVOURED',
        reasonFa: 'SYNTHETIC رأی به سود خودم',
        expectedVersion: dispute.version,
      }),
      code('FORBIDDEN'),
    );

    const decided = await decideDispute(ctx.testDb.db, reviewer, {
      disputeId: dispute.id,
      decision: 'BUYER_FAVOURED',
      reasonFa: 'SYNTHETIC مدارک خریدار پذیرفته شد و بخشی از بیعانه برمی‌گردد.',
      refundToman: 400_000n,
      expectedVersion: dispute.version,
    });
    assert.equal(decided.status, 'RESOLVED');
    assert.equal(decided.refundAmountToman, 400_000n);

    const refund = await refundOfDeal(ctx.testDb.db, deal.inquiryId);
    assert.equal(refund!.amountToman, 400_000n);
    assert.equal(refund!.status, 'PENDING');
    assert.equal(await listingStatus(ctx, deal.listing.id), 'PUBLISHED');

    // A second reviewer acting on the version they read gets a conflict.
    await assert.rejects(
      decideDispute(ctx.testDb.db, reviewer, {
        disputeId: dispute.id,
        decision: 'SELLER_FAVOURED',
        reasonFa: 'SYNTHETIC رأی دوم روی همان نسخه',
        expectedVersion: dispute.version,
      }),
      code('CONFLICT'),
    );

    const decisions = await ctx.testDb.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'ANIMAL_DEAL_DISPUTE_DECIDED'));
    assert.equal(decisions.length, 1, 'the decision is audited exactly once');
  });
});

test('the remaining price is refused before a case exists', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ خارج از دامنه');
    await assert.rejects(
      openDispute(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        scope: 'REMAINING_PRICE',
        claimFa: 'SYNTHETIC باقی مبلغ را نگرفتم و می‌خواهم همزیست داوری کند.',
      }),
      code('VALIDATION'),
    );
    assert.equal(await disputeOfDeal(ctx.testDb.db, deal.inquiryId), null);
  });
});

// ── the money going back ───────────────────────────────────────────────────

test('a refund is paid only when a provider says so, and a replay pays nothing twice', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ استرداد');
    const result = await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC انصراف برای آزمون استرداد',
    });
    const refundId = result.refundId!;
    const finance = actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');

    // An ordinary account cannot send money back.
    await assert.rejects(
      executeRefund(ctx.testDb.db, ctx.second.actor, refundId, deal.gateway, 'test'),
      code('FORBIDDEN'),
    );

    const paid = await executeRefund(ctx.testDb.db, finance, refundId, deal.gateway, 'test');
    assert.equal(paid.refund.status, 'PAID');
    assert.ok(paid.refund.providerRefundRef, 'PAID without a provider reference would be a claim, not a record');
    assert.ok(paid.refund.completedAt);

    const attempts = await ctx.testDb.db
      .select()
      .from(depositRefundAttempts)
      .where(eq(depositRefundAttempts.refundId, refundId));
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]!.outcome, 'REFUNDED');

    // Asking again finds the work done.
    const replay = await executeRefund(ctx.testDb.db, finance, refundId, deal.gateway, 'test');
    assert.equal(replay.performed, false);
    assert.equal(replay.refund.status, 'PAID');
    const afterReplay = await ctx.testDb.db
      .select()
      .from(depositRefundAttempts)
      .where(eq(depositRefundAttempts.refundId, refundId));
    assert.equal(afterReplay.length, 1, 'a replay adds no second transfer');
  });
});

test('a provider that refuses leaves the money owed, retryable, and then needing a person', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ استرداد ناموفق', failingRefundGateway);
    const result = await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC انصراف برای آزمون شکست استرداد',
    });
    const refundId = result.refundId!;
    const finance = actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const failed = await executeRefund(ctx.testDb.db, finance, refundId, deal.gateway, 'test');
      assert.equal(failed.refund.status, 'FAILED');
      assert.equal(failed.refund.attempts, attempt);
      assert.match(failed.refund.lastErrorFa!, /SYNTHETIC/);
    }

    // Three tries is enough; after that a person looks at it, not a loop.
    await assert.rejects(
      executeRefund(ctx.testDb.db, finance, refundId, deal.gateway, 'test'),
      code('CONFLICT'),
    );

    // It is still visible as owed.
    const queue = await refundQueue(ctx.testDb.db, finance);
    assert.ok(queue.some((row) => row.id === refundId && !row.retryable));

    // The only way out is a real bank reference.
    await assert.rejects(
      recordManualRefund(ctx.testDb.db, finance, { refundId, bankReference: '', noteFa: 'SYNTHETIC' }),
      code('VALIDATION'),
    );
    const settled = await recordManualRefund(ctx.testDb.db, finance, {
      refundId,
      bankReference: 'SYNTHETIC-BANK-9001',
      noteFa: 'SYNTHETIC — انتقال دستی انجام شد.',
    });
    assert.equal(settled.status, 'PAID');
    assert.equal(settled.providerRefundRef, 'SYNTHETIC-BANK-9001');
  });
});

test('a gateway with no refund support says so instead of pretending', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ بدون استرداد خودکار', noRefundGateway);
    const result = await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC انصراف با درگاه بدون استرداد',
    });
    const finance = actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');
    const outcome = await executeRefund(ctx.testDb.db, finance, result.refundId!, deal.gateway, 'test');

    assert.equal(outcome.refund.status, 'MANUAL_REQUIRED');
    assert.equal(outcome.refund.providerRefundRef, null);
    assert.match(outcome.refund.lastErrorFa!, /استرداد خودکار/);

    const [attempt] = await ctx.testDb.db
      .select()
      .from(depositRefundAttempts)
      .where(eq(depositRefundAttempts.refundId, result.refundId!));
    assert.equal(attempt!.outcome, 'UNSUPPORTED');

    const stored = await loadRefund(ctx.testDb.db, result.refundId!);
    assert.notEqual(stored.status, 'PAID');
  });
});

test('two operators pressing retry together produce one attempt, not two transfers', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ استرداد هم‌زمان');
    const result = await cancelDeal(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      reason: 'SELLER_CANCELLED',
      statementFa: 'SYNTHETIC انصراف برای آزمون هم‌زمانی',
    });
    const finance = actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');

    const outcomes = await Promise.allSettled([
      executeRefund(ctx.testDb.db, finance, result.refundId!, deal.gateway, 'test'),
      executeRefund(ctx.testDb.db, finance, result.refundId!, deal.gateway, 'test'),
    ]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);

    const attempts = await ctx.testDb.db
      .select()
      .from(depositRefundAttempts)
      .where(eq(depositRefundAttempts.refundId, result.refundId!));
    assert.equal(attempts.length, 1);
    assert.equal((await loadRefund(ctx.testDb.db, result.refundId!)).status, 'PAID');
  });
});

test('nothing here is reachable before a deposit was verified', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ بدون بیعانه');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });

    await assert.rejects(
      cancelDeal(ctx.testDb.db, ctx.second.actor, { inquiryId: inquiry.id, reason: 'BUYER_CANCELLED' }),
      code('CONFLICT'),
    );
    await assert.rejects(
      openDispute(ctx.testDb.db, ctx.second.actor, {
        inquiryId: inquiry.id,
        scope: 'DEPOSIT',
        claimFa: 'SYNTHETIC ادعایی درباره معامله‌ای که هنوز بیعانه ندارد.',
      }),
      code('CONFLICT'),
    );
    assert.equal(await cancellationOfDeal(ctx.testDb.db, inquiry.id), null);
    const [refunds] = await ctx.testDb.db
      .select()
      .from(depositRefunds)
      .where(eq(depositRefunds.inquiryId, inquiry.id));
    assert.equal(refunds, undefined);
    const [debt] = await ctx.testDb.db
      .select()
      .from(sellerDebts)
      .where(eq(sellerDebts.inquiryId, inquiry.id));
    assert.equal(debt, undefined);
    const [cancellation] = await ctx.testDb.db
      .select()
      .from(dealCancellations)
      .where(eq(dealCancellations.inquiryId, inquiry.id));
    assert.equal(cancellation, undefined);
  });
});
