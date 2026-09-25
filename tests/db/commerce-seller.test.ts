/**
 * Seller onboarding, plans and tenant isolation against a real database —
 * PROMPT-008.
 *
 * The fixture is the Phase 1 one: real accounts with real KYC. Nothing about
 * eligibility or membership is written straight into the database, because what
 * is under test is exactly that those answers come from the real records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { commerceSellers, sellerMembers, sellerSubscriptions } from '../../src/db/schema/commerce.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import {
  acceptSellerAgreement,
  addSellerDocument,
  applicationBlockers,
  changeSellerMember,
  changeSellerStanding,
  decideSellerApplication,
  ensurePlatformSeller,
  inviteSellerMember,
  loadSeller,
  membershipOf,
  saveSellerApplication,
  sellerDetail,
  sellerReviewQueue,
  startSellerApplication,
  submitSellerApplication,
  verifySettlementAccount,
} from '../../src/commerce/sellers.ts';
import { assertSellerCapability } from '../../src/commerce/sellers.ts';
import {
  currentSubscription,
  ensureLaunchPlans,
  publishedPlans,
  startPlanPurchase,
} from '../../src/commerce/plans.ts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099938000',
  tmpPrefix: 'hamzist-seller-',
  councilCode: 'SYNTH-SL-8',
  chipBase: 5_100_000,
};

const IBAN = 'IR820540102680020817909002';
const OTHER_IBAN = 'IR060540102680020817909002';

async function openShop(ctx: MatingCtx): Promise<void> {
  const set = (key: string, value: unknown) =>
    updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
  await set('market.flag.seller_onboarding_enabled', true);
  await set('market.shop.seller_agreement_version', 'SYNTHETIC-AGREEMENT-1');
}

async function completeForm(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  sellerId: string,
  over: { identifier?: string; iban?: string } = {},
) {
  const seller = await loadSeller(ctx.testDb.db, sellerId);
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);
  return saveSellerApplication(ctx.testDb.db, actor, {
    sellerId,
    expectedVersion: seller.version,
    displayNameFa: 'SYNTHETIC فروشگاه آزمایشی',
    legalNameFa: 'SYNTHETIC کسب‌وکار آزمایشی',
    businessTypeFa: 'پت‌شاپ',
    nationalIdentifier: over.identifier ?? '10000000001',
    representativeNameFa: 'SYNTHETIC نماینده',
    representativePhone: '02100000000',
    contactEmail: '',
    licenceKindFa: 'SYNTHETIC پروانه کسب',
    licenceNumber: 'SYN-1',
    licenceIssuedOn: '1404-01-01',
    licenceExpiresOn: '1406-01-01',
    provinceCode: city!.provinceCode,
    cityId: city!.id,
    addressFa: 'SYNTHETIC نشانی فروشگاه',
    postalCode: '1234567890',
    settlementIban: over.iban ?? IBAN,
    settlementHolderNameFa: 'SYNTHETIC صاحب حساب',
    shippingPolicyFa: 'SYNTHETIC قوانین ارسال',
    returnPolicyFa: 'SYNTHETIC قوانین مرجوعی',
  });
}

/** A store whose application is complete and sent for review. */
async function submittedStore(ctx: MatingCtx, actor: ReturnType<typeof actorFor>) {
  const seller = await startSellerApplication(ctx.testDb.db, actor, {
    kind: 'PET_SHOP',
    displayNameFa: 'SYNTHETIC فروشگاه',
  });
  await completeForm(ctx, actor, seller.id);
  await acceptSellerAgreement(ctx.testDb.db, actor, { sellerId: seller.id });
  const ready = await loadSeller(ctx.testDb.db, seller.id);
  return submitSellerApplication(ctx.testDb.db, actor, {
    sellerId: seller.id,
    expectedVersion: ready.version,
  });
}

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');

// ── applying ───────────────────────────────────────────────────────────────

test('an application needs verified identity, a complete form and an accepted agreement', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);

    // The centre operator's account has no approved KYC case of its own.
    await assert.rejects(
      startSellerApplication(ctx.testDb.db, actorFor(ctx.centre.accountId), {
        kind: 'PET_SHOP',
        displayNameFa: 'SYNTHETIC بدون احراز',
      }),
      code('CONFLICT'),
    );
    // And the platform's own kind is not something anybody applies as.
    await assert.rejects(
      startSellerApplication(ctx.testDb.db, ctx.first.actor, {
        kind: 'PLATFORM',
        displayNameFa: 'SYNTHETIC پلتفرم',
      }),
      code('VALIDATION'),
    );

    const seller = await startSellerApplication(ctx.testDb.db, ctx.first.actor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه',
    });
    assert.equal(seller.status, 'DRAFT');

    // An empty form knows everything it is missing.
    const blockers = await applicationBlockers(ctx.testDb.db, seller);
    assert.ok(blockers.length >= 8);
    await assert.rejects(
      submitSellerApplication(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        expectedVersion: seller.version,
      }),
      code('VALIDATION'),
    );

    // The owner becomes a member of their own store at creation.
    const membership = await membershipOf(ctx.testDb.db, seller.id, ctx.first.accountId);
    assert.equal(membership?.role, 'OWNER');

    await completeForm(ctx, ctx.first.actor, seller.id);
    const beforeAgreement = await loadSeller(ctx.testDb.db, seller.id);
    assert.deepEqual(
      (await applicationBlockers(ctx.testDb.db, beforeAgreement)).filter((line) => line.includes('قرارداد')).length,
      1,
    );

    await acceptSellerAgreement(ctx.testDb.db, ctx.first.actor, { sellerId: seller.id });
    const ready = await loadSeller(ctx.testDb.db, seller.id);
    assert.equal(ready.agreementVersion, 'SYNTHETIC-AGREEMENT-1');

    const submitted = await submitSellerApplication(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      expectedVersion: ready.version,
    });
    assert.equal(submitted.status, 'SUBMITTED');
    assert.ok(submitted.submittedAt);
  });
});

test('one business identity and one settlement account per live store', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const first = await startSellerApplication(ctx.testDb.db, ctx.first.actor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه یک',
    });
    await completeForm(ctx, ctx.first.actor, first.id);

    const secondActor = actorFor(ctx.second.accountId);
    const second = await startSellerApplication(ctx.testDb.db, secondActor, {
      kind: 'VERIFIED_BUSINESS',
      displayNameFa: 'SYNTHETIC فروشگاه دو',
    });

    // The same national identifier is the same business applying twice.
    await assert.rejects(
      completeForm(ctx, secondActor, second.id, { identifier: '10000000001', iban: OTHER_IBAN }),
      code('CONFLICT'),
    );
    // The same IBAN is somebody else's bank account.
    await assert.rejects(
      completeForm(ctx, secondActor, second.id, { identifier: '10000000002', iban: IBAN }),
      code('CONFLICT'),
    );
    // Its own facts are accepted.
    const saved = await completeForm(ctx, secondActor, second.id, {
      identifier: '10000000002',
      iban: OTHER_IBAN,
    });
    assert.equal(saved.nationalIdentifier, '10000000002');
  });
});

test('editing the settlement account undoes its verification', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await submittedStore(ctx, ctx.first.actor);

    await verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      noteFa: 'SYNTHETIC مدرک مالکیت حساب بررسی شد.',
    });
    assert.ok((await loadSeller(ctx.testDb.db, seller.id)).ibanVerifiedAt);

    // An ordinary account cannot verify anything.
    await assert.rejects(
      verifySettlementAccount(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        noteFa: 'SYNTHETIC خودتأییدی',
      }),
      code('FORBIDDEN'),
    );

    // A correction that changes the account clears the verification with it.
    await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'NEEDS_CORRECTION',
      reasonFa: 'SYNTHETIC حساب تسویه را اصلاح کنید.',
      expectedVersion: (await loadSeller(ctx.testDb.db, seller.id)).version,
    });
    await completeForm(ctx, ctx.first.actor, seller.id, { iban: OTHER_IBAN });
    const corrected = await loadSeller(ctx.testDb.db, seller.id);
    assert.equal(corrected.settlementIban, OTHER_IBAN);
    assert.equal(corrected.ibanVerifiedAt, null, 'the verification was about the previous account');
  });
});

test('the whole settlement account never reaches the audit trail', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await submittedStore(ctx, ctx.first.actor);
    await verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      noteFa: 'SYNTHETIC بررسی مالکیت حساب',
    });

    const rows = await ctx.testDb.db
      .select({ after: auditEvents.after, metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, seller.id));
    assert.ok(rows.length > 0);
    assert.ok(!JSON.stringify(rows).includes(IBAN), 'the IBAN is recorded masked, never whole');
  });
});

// ── review ─────────────────────────────────────────────────────────────────

test('a correction round trip keeps the file and its history', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await submittedStore(ctx, ctx.first.actor);

    const queue = await sellerReviewQueue(ctx.testDb.db, reviewer(ctx));
    assert.ok(queue.some((row) => row.id === seller.id));
    // An ordinary account cannot read the queue at all.
    await assert.rejects(sellerReviewQueue(ctx.testDb.db, ctx.first.actor), code('FORBIDDEN'));

    const started = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'UNDER_REVIEW',
      expectedVersion: seller.version,
    });
    // A correction must say what to correct.
    await assert.rejects(
      decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
        sellerId: seller.id,
        to: 'NEEDS_CORRECTION',
        reasonFa: '  ',
        expectedVersion: started.version,
      }),
      code('VALIDATION'),
    );
    const corrected = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'NEEDS_CORRECTION',
      reasonFa: 'SYNTHETIC نشانی فروشگاه ناقص است.',
      expectedVersion: started.version,
    });
    assert.equal(corrected.status, 'NEEDS_CORRECTION');
    assert.match(corrected.statusReasonFa!, /SYNTHETIC/);

    // The applicant edits and sends it back through the same door.
    await completeForm(ctx, ctx.first.actor, seller.id);
    const edited = await loadSeller(ctx.testDb.db, seller.id);
    const resubmitted = await submitSellerApplication(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      expectedVersion: edited.version,
    });
    assert.equal(resubmitted.status, 'SUBMITTED');

    // Approving does not make a store trade.
    const underReview = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'UNDER_REVIEW',
      expectedVersion: resubmitted.version,
    });
    const approved = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'APPROVED',
      expectedVersion: underReview.version,
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.activatedAt, null);
  });
});

test('a business document is private, and a reviewer’s read is recorded', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await startSellerApplication(ctx.testDb.db, ctx.first.actor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه مدرک',
    });
    const document = await addSellerDocument(ctx.testDb.db, ctx.root, ctx.first.actor, {
      sellerId: seller.id,
      kind: 'BUSINESS_LICENCE',
      noteFa: 'SYNTHETIC پروانه',
      bytes: PDF,
      originalName: 'licence.pdf',
    });

    // Another ordinary account cannot read it.
    await assert.rejects(
      readPrivateFile(ctx.testDb.db, ctx.root, actorFor(ctx.second.accountId), document.fileId),
      code('FORBIDDEN'),
    );

    // The reviewer can, and that read is written down.
    const read = await readPrivateFile(ctx.testDb.db, ctx.root, reviewer(ctx), document.fileId);
    assert.equal(read.record.purpose, 'SELLER_DOCUMENT');
    const reads = await ctx.testDb.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PRIVATE_FILE_READ'));
    assert.ok(reads.length >= 1, 'opening a business document is part of the decision’s trail');

    // Replacing it supersedes rather than deletes.
    await addSellerDocument(ctx.testDb.db, ctx.root, ctx.first.actor, {
      sellerId: seller.id,
      kind: 'BUSINESS_LICENCE',
      noteFa: 'SYNTHETIC پروانه تازه',
      bytes: PDF,
      originalName: 'licence-2.pdf',
    });
    const detail = await sellerDetail(ctx.testDb.db, ctx.first.actor, seller.id);
    assert.equal(detail.documents.filter((row) => row.kind === 'BUSINESS_LICENCE').length, 1);
  });
});

// ── isolation ──────────────────────────────────────────────────────────────

test('a role in one store grants nothing in another', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const mine = await startSellerApplication(ctx.testDb.db, ctx.first.actor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه من',
    });
    const theirsActor = actorFor(ctx.second.accountId);
    const theirs = await startSellerApplication(ctx.testDb.db, theirsActor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه دیگری',
    });

    // A store nobody invited you to does not exist as far as you are concerned.
    await assert.rejects(
      assertSellerCapability(ctx.testDb.db, ctx.first.actor, theirs.id, 'STORE_VIEW'),
      code('NOT_FOUND'),
    );
    await assert.rejects(sellerDetail(ctx.testDb.db, ctx.first.actor, theirs.id), code('NOT_FOUND'));
    await assert.rejects(
      completeForm(ctx, ctx.first.actor, theirs.id, { identifier: '10000000009', iban: OTHER_IBAN }),
      code('NOT_FOUND'),
    );

    // Staff of one store are staff of that store only, and cannot edit even it.
    const staffActor = actorFor(ctx.vet.accountId);
    await inviteSellerMember(ctx.testDb.db, ctx.first.actor, {
      sellerId: mine.id,
      mobile: ctx.vet.mobile,
      role: 'STAFF',
    });
    assert.equal((await membershipOf(ctx.testDb.db, mine.id, ctx.vet.accountId))?.role, 'STAFF');
    assert.equal(await membershipOf(ctx.testDb.db, theirs.id, ctx.vet.accountId), null);
    await assert.rejects(
      assertSellerCapability(ctx.testDb.db, staffActor, mine.id, 'STORE_EDIT'),
      code('FORBIDDEN'),
    );
    await assert.rejects(
      assertSellerCapability(ctx.testDb.db, staffActor, theirs.id, 'STORE_VIEW'),
      code('NOT_FOUND'),
    );

    // An admin of the store still cannot touch billing or membership.
    const [staffRow] = await ctx.testDb.db
      .select({ id: sellerMembers.id })
      .from(sellerMembers)
      .where(and(eq(sellerMembers.sellerId, mine.id), eq(sellerMembers.accountId, ctx.vet.accountId)));
    await changeSellerMember(ctx.testDb.db, ctx.first.actor, {
      sellerId: mine.id,
      memberId: staffRow!.id,
      role: 'ADMIN',
    });
    await assert.rejects(
      assertSellerCapability(ctx.testDb.db, staffActor, mine.id, 'STORE_BILLING'),
      code('FORBIDDEN'),
    );
    await assert.rejects(
      assertSellerCapability(ctx.testDb.db, staffActor, mine.id, 'STORE_MEMBERS'),
      code('FORBIDDEN'),
    );
  });
});

// ── plans ──────────────────────────────────────────────────────────────────

test('a store trades only after a verified payment, and never because somebody said so', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
    const seller = await submittedStore(ctx, ctx.first.actor);

    const started = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'UNDER_REVIEW',
      expectedVersion: seller.version,
    });
    const approved = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'APPROVED',
      expectedVersion: started.version,
    });
    assert.equal(approved.status, 'APPROVED');

    // No reviewer path exists that makes a store active.
    await assert.rejects(
      changeSellerStanding(ctx.testDb.db, reviewer(ctx), {
        sellerId: seller.id,
        to: 'ACTIVE',
        reasonFa: 'SYNTHETIC فعال‌سازی دستی',
        expectedVersion: approved.version,
      }),
      code('CONFLICT'),
    );

    // The tariff is unset, so the purchase path is shut rather than free.
    const plans = await publishedPlans(ctx.testDb.db);
    const basic = plans.find((plan) => plan.code === 'BASIC')!;
    assert.equal(basic.priceToman, null);
    await assert.rejects(
      startPlanPurchase(ctx.testDb.db, ctx.first.actor, { sellerId: seller.id, planId: basic.id }),
      code('NOT_CONFIGURED'),
    );

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.seller_plan_basic_monthly_toman',
      value: '900000',
      reason: 'SYNTHETIC — تعرفه آزمایشی',
    });

    const { batch } = await startPlanPurchase(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      planId: basic.id,
    });
    assert.ok(batch);
    // Still not trading: the money has not been verified.
    assert.equal((await loadSeller(ctx.testDb.db, seller.id)).status, 'APPROVED');

    const gateway = payingGateway(9_000_000n);
    const attempt = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: batch!.id, callbackUrl: '/x' },
      gateway,
      'test',
    );
    assert.equal(
      (await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state,
      'PAID',
    );

    const active = await loadSeller(ctx.testDb.db, seller.id);
    assert.equal(active.status, 'ACTIVE');
    assert.ok(active.activatedAt);

    const subscription = await currentSubscription(ctx.testDb.db, seller.id);
    assert.equal(subscription.subscription?.status, 'ACTIVE');
    assert.equal(subscription.productLimit, 50);
    assert.equal(subscription.expired, false);

    // One period at a time.
    await assert.rejects(
      startPlanPurchase(ctx.testDb.db, ctx.first.actor, { sellerId: seller.id, planId: basic.id }),
      code('CONFLICT'),
    );
  });
});

test('an expired period grants nothing, decided when it is read', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.seller_plan_pro_monthly_toman',
      value: '0',
      reason: 'SYNTHETIC — پلن بدون هزینه برای آزمون',
    });

    const seller = await submittedStore(ctx, ctx.first.actor);
    const started = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'UNDER_REVIEW',
      expectedVersion: seller.version,
    });
    await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'APPROVED',
      expectedVersion: started.version,
    });

    const plans = await publishedPlans(ctx.testDb.db);
    const pro = plans.find((plan) => plan.code === 'PRO')!;
    assert.equal(pro.priceToman, 0n, 'zero is a recorded decision, not a missing price');

    const { batch, subscription } = await startPlanPurchase(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      planId: pro.id,
    });
    assert.equal(batch, null);
    assert.equal(subscription.freeOfCharge, true);
    assert.equal((await loadSeller(ctx.testDb.db, seller.id)).status, 'ACTIVE');

    const live = await currentSubscription(ctx.testDb.db, seller.id);
    assert.deepEqual(live.capabilities, { canPromote: true, maxActivePromotions: 5 });

    // Move the end date into the past: nothing has to run for it to be over.
    await ctx.testDb.db
      .update(sellerSubscriptions)
      .set({ endsAt: new Date(Date.now() - 60_000) })
      .where(eq(sellerSubscriptions.id, subscription.id));

    const expired = await currentSubscription(ctx.testDb.db, seller.id);
    assert.equal(expired.expired, true);
    assert.equal(expired.productLimit, null);
    assert.deepEqual(expired.capabilities, {}, 'an expired plan grants none of its powers');
  });
});

test('suspending a store stops it trading and deletes nothing', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.seller_plan_pro_monthly_toman',
      value: '0',
      reason: 'SYNTHETIC — پلن بدون هزینه',
    });

    const seller = await submittedStore(ctx, ctx.first.actor);
    const started = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'UNDER_REVIEW',
      expectedVersion: seller.version,
    });
    await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'APPROVED',
      expectedVersion: started.version,
    });
    const plans = await publishedPlans(ctx.testDb.db);
    await startPlanPurchase(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      planId: plans.find((plan) => plan.code === 'PRO')!.id,
    });

    const active = await loadSeller(ctx.testDb.db, seller.id);
    const suspended = await changeSellerStanding(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'SUSPENDED',
      reasonFa: 'SYNTHETIC بررسی شکایت خریداران',
      expectedVersion: active.version,
    });
    assert.equal(suspended.status, 'SUSPENDED');

    // The plan period, the documents and the members are all still there.
    const subscription = await currentSubscription(ctx.testDb.db, seller.id);
    assert.equal(subscription.subscription?.status, 'ACTIVE');
    const members = await membershipOf(ctx.testDb.db, seller.id, ctx.first.accountId);
    assert.equal(members?.role, 'OWNER');

    // And it can come back.
    const back = await changeSellerStanding(ctx.testDb.db, reviewer(ctx), {
      sellerId: seller.id,
      to: 'ACTIVE',
      reasonFa: 'SYNTHETIC شکایت بی‌مورد بود.',
      expectedVersion: suspended.version,
    });
    assert.equal(back.status, 'ACTIVE');
  });
});

test('the platform’s own store is a row like any other', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const platform = await ensurePlatformSeller(ctx.testDb.db, ctx.admin.actor);
    assert.equal(platform.kind, 'PLATFORM');
    // It starts where every other store starts and is not trading.
    assert.equal(platform.status, 'DRAFT');
    assert.notEqual(platform.status, 'ACTIVE');

    // Calling again returns the same row rather than a second platform store.
    const again = await ensurePlatformSeller(ctx.testDb.db, ctx.admin.actor);
    assert.equal(again.id, platform.id);
    const all = await ctx.testDb.db
      .select({ id: commerceSellers.id })
      .from(commerceSellers)
      .where(eq(commerceSellers.kind, 'PLATFORM'));
    assert.equal(all.length, 1);

    // Its people are scoped the same way everybody else's are.
    assert.equal((await membershipOf(ctx.testDb.db, platform.id, ctx.admin.accountId))?.role, 'OWNER');
    assert.equal(await membershipOf(ctx.testDb.db, platform.id, ctx.first.accountId), null);
  });
});
