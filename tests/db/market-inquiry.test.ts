/**
 * Requests, negotiation and the reservation against a real database — PROMPT-005.
 *
 * One fixture builds the whole world once per file: two KYC-verified members, a
 * registered and microchipped animal, a published advert and the managed values
 * a deal needs. Everything after that is a different question asked of the same
 * world, which is what keeps this file affordable to run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import {
  animalWithSheet,
  actorFor,
  payingGateway,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { animalListings } from '../../src/db/schema/marketplace.ts';
import { inquiryMessages, listingInquiries, listingOffers } from '../../src/db/schema/inquiry.ts';
import { moderationReports } from '../../src/db/schema/moderation.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { attachListingMedia, publishListing, saveListing, createListing } from '../../src/marketplace/listings.ts';
import {
  acceptInquiry,
  blockThread,
  buyerRisk,
  closeInquiry,
  createInquiry,
  inquiryThread,
  postMessage,
  proposeOffer,
  releaseExpiredInquiries,
  respondToOffer,
  startDepositPayment,
} from '../../src/marketplace/inquiries.ts';
import {
  decideMessageReport,
  messageReportQueue,
  reportInquiryMessage,
} from '../../src/marketplace/listing-moderation.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099935000',
  tmpPrefix: 'hamzist-inquiry-',
  councilCode: 'SYNTH-IQ-5',
  chipBase: 4_500_000,
};

const PRICE = 20_000_000n;

/** The managed values a deal needs. None of them is seeded by the product. */
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

/** A published advert with a real animal behind it. */
async function publishedListing(ctx: MatingCtx, nameFa: string, priceMode: 'EXACT' | 'NEGOTIABLE') {
  const animal = await animalWithSheet(ctx, nameFa, { skipSheet: true });
  const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);

  const saved = await saveListing(ctx.testDb.db, ctx.first.actor, {
    listingId: listing.id,
    expectedVersion: listing.version,
    priceMode,
    priceToman: priceMode === 'EXACT' ? String(PRICE) : '',
    descriptionFa: 'SYNTHETIC توضیح آگهی آزمایشی برای آزمون درخواست خرید و مذاکره و رزرو.',
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

/** Pay the deposit of one request, the way the return page does. */
async function payDeposit(ctx: MatingCtx, inquiryId: string, amountToman: bigint) {
  const { batch } = await startDepositPayment(ctx.testDb.db, ctx.second.actor, { inquiryId });
  const gateway = payingGateway(amountToman * 10n);
  const attempt = await startAttempt(
    ctx.testDb.db,
    ctx.second.actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test',
  );
  return { gateway, attempt };
}

const reload = async (ctx: MatingCtx, id: string) => {
  const [row] = await ctx.testDb.db.select().from(listingInquiries).where(eq(listingInquiries.id, id));
  return row!;
};

test('an exact-price request locks the price and freezes the commission it produces', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ قیمت مقطوع', 'EXACT');

    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, {
      listingId: listing.id,
      messageFa: 'SYNTHETIC سلام، هنوز موجود است؟',
    });

    assert.equal(inquiry.status, 'OPEN');
    assert.equal(inquiry.finalPriceToman, PRICE);
    assert.ok(inquiry.finalPriceLockedAt);
    // 2.5% of 20,000,000 plus the fixed 100,000.
    assert.equal(inquiry.depositAmountToman, 600_000n);
    assert.equal(inquiry.commissionPercentBp, 250);
    assert.ok(inquiry.commissionSettingVersions?.includes('market.animal.commission_fixed_toman'));

    // A later tariff change never rewrites a deal somebody already has.
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.commission_fixed_toman',
      value: '900000',
      reason: 'SYNTHETIC — تغییر تعرفه پس از انجماد',
    });
    assert.equal((await reload(ctx, inquiry.id)).depositAmountToman, 600_000n);

    // The seller cannot buy their own animal, and one buyer asks once.
    await assert.rejects(
      createInquiry(ctx.testDb.db, ctx.first.actor, { listingId: listing.id }),
      code('VALIDATION'),
    );
    await assert.rejects(
      createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id }),
      code('CONFLICT'),
    );
  });
});

test('a request needs a verified identity, although reading the advert does not', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ احراز هویت', 'EXACT');
    // The centre operator's account has no approved KYC case of its own.
    const stranger = actorFor(ctx.centre.accountId);
    await assert.rejects(
      createInquiry(ctx.testDb.db, stranger, { listingId: listing.id }),
      code('CONFLICT'),
    );
  });
});

test('offers supersede, a stale one cannot be answered, and only the other side accepts', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ توافقی', 'NEGOTIABLE');

    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, {
      listingId: listing.id,
      offerToman: 15_000_000n,
    });
    assert.equal(inquiry.finalPriceToman, null, 'a negotiable advert locks nothing at the start');

    const [firstOffer] = await ctx.testDb.db
      .select()
      .from(listingOffers)
      .where(eq(listingOffers.inquiryId, inquiry.id));

    // The buyer cannot accept their own offer.
    await assert.rejects(
      respondToOffer(ctx.testDb.db, ctx.second.actor, {
        inquiryId: inquiry.id,
        offerId: firstOffer!.id,
        accept: true,
      }),
      code('VALIDATION'),
    );

    // The seller counters; the first offer is superseded, not edited away.
    const counter = await proposeOffer(ctx.testDb.db, ctx.first.actor, {
      inquiryId: inquiry.id,
      amountToman: 18_000_000n,
    });
    const ladder = await ctx.testDb.db
      .select()
      .from(listingOffers)
      .where(eq(listingOffers.inquiryId, inquiry.id));
    assert.equal(ladder.length, 2);
    assert.equal(ladder.find((row) => row.id === firstOffer!.id)!.status, 'SUPERSEDED');

    // A stale tab answering the superseded offer is refused.
    await assert.rejects(
      respondToOffer(ctx.testDb.db, ctx.first.actor, {
        inquiryId: inquiry.id,
        offerId: firstOffer!.id,
        accept: true,
      }),
      code('CONFLICT'),
    );

    const locked = await respondToOffer(ctx.testDb.db, ctx.second.actor, {
      inquiryId: inquiry.id,
      offerId: counter.id,
      accept: true,
    });
    assert.equal(locked.finalPriceToman, 18_000_000n);
    assert.equal(locked.depositAmountToman, 550_000n);

    // A locked price is locked for both sides.
    await assert.rejects(
      proposeOffer(ctx.testDb.db, ctx.second.actor, { inquiryId: inquiry.id, amountToman: 1_000_000n }),
      code('CONFLICT'),
    );
  });
});

test('two sellers pressing accept together leave exactly one acceptance', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ رقابت پذیرش', 'EXACT');

    const buyerA = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
    // A third party with an approved KYC case: the veterinarian's own account.
    const buyerBActor = actorFor(ctx.vet.accountId);
    const buyerB = await createInquiry(ctx.testDb.db, buyerBActor, { listingId: listing.id });

    const results = await Promise.allSettled([
      acceptInquiry(ctx.testDb.db, ctx.first.actor, { inquiryId: buyerA.id, expectedVersion: buyerA.version }),
      acceptInquiry(ctx.testDb.db, ctx.first.actor, { inquiryId: buyerB.id, expectedVersion: buyerB.version }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);

    const rows = await ctx.testDb.db
      .select()
      .from(listingInquiries)
      .where(eq(listingInquiries.listingId, listing.id));
    assert.equal(rows.filter((row) => row.status === 'ACCEPTED').length, 1);
    // The one that lost stays open: it was never rejected, it simply did not win.
    assert.equal(rows.filter((row) => row.status === 'OPEN').length, 1);

    const accepted = rows.find((row) => row.status === 'ACCEPTED')!;
    assert.ok(accepted.paymentDeadlineAt);
    assert.equal(accepted.paymentWindowHours, 48);
    assert.equal(accepted.cancellationPolicyVersion, 'SYNTHETIC-POLICY-1');
  });
});

test('a verified deposit reserves the animal, closes the others and reveals contact — once', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ رزرو', 'EXACT');

    const mine = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
    const otherActor = actorFor(ctx.vet.accountId);
    const other = await createInquiry(ctx.testDb.db, otherActor, { listingId: listing.id });

    await acceptInquiry(ctx.testDb.db, ctx.first.actor, {
      inquiryId: mine.id,
      expectedVersion: mine.version,
    });

    // Before the deposit the counterpart's number is not in the view at all.
    const before = await inquiryThread(ctx.testDb.db, ctx.second.actor, mine.id);
    assert.equal(before.counterpartMobile, null);

    const { gateway, attempt } = await payDeposit(ctx, mine.id, 600_000n);
    const outcome = await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects);
    assert.equal(outcome.state, 'PAID');

    const converted = await reload(ctx, mine.id);
    assert.equal(converted.status, 'CONVERTED');
    assert.ok(converted.reservedAt);
    assert.ok(converted.contactRevealedAt);

    const [advert] = await ctx.testDb.db
      .select({ status: animalListings.status })
      .from(animalListings)
      .where(eq(animalListings.id, listing.id));
    assert.equal(advert!.status, 'RESERVED');

    const closed = await reload(ctx, other.id);
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closedReasonFa);

    const after = await inquiryThread(ctx.testDb.db, ctx.second.actor, mine.id);
    assert.equal(after.counterpartMobile, ctx.first.mobile);
    assert.equal(after.writable, false, 'the transcript freezes once the deal exists');

    // A replayed callback finds the work done and does nothing again.
    const replay = await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects);
    assert.equal(replay.state, 'PAID');
    assert.equal(replay.performed, false);
    const reserved = await ctx.testDb.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'ANIMAL_LISTING_RESERVED'));
    assert.equal(reserved.length, 1, 'the reservation is recorded exactly once');
  });
});

test('a passed deadline releases the acceptance and counts towards the buyer’s limit', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ مهلت', 'EXACT');

    const mine = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
    const otherActor = actorFor(ctx.vet.accountId);
    const other = await createInquiry(ctx.testDb.db, otherActor, { listingId: listing.id });
    const accepted = await acceptInquiry(ctx.testDb.db, ctx.first.actor, {
      inquiryId: mine.id,
      expectedVersion: mine.version,
    });

    // Nothing is due yet, so nothing is released.
    assert.equal(await releaseExpiredInquiries(ctx.testDb.db, new Date()), 0);

    const past = new Date(accepted.paymentDeadlineAt!.getTime() + 60_000);
    assert.equal(await releaseExpiredInquiries(ctx.testDb.db, past), 1);
    assert.equal((await reload(ctx, mine.id)).status, 'EXPIRED');

    // The advert is free again: the request that stayed open can now be accepted.
    const stillOpen = await reload(ctx, other.id);
    const second = await acceptInquiry(ctx.testDb.db, ctx.first.actor, {
      inquiryId: other.id,
      expectedVersion: stillOpen.version,
    });
    assert.equal(second.status, 'ACCEPTED');

    // The expiry is what the bounded risk control counts — once both managed
    // values exist. Until then nothing is enforced.
    const unset = await buyerRisk(ctx.testDb.db, ctx.second.accountId);
    assert.equal(unset.blocked, false);
    assert.equal(unset.limit, null);

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.failed_deposit_limit',
      value: 1,
      reason: 'SYNTHETIC — سقف آزمایشی',
    });
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.failed_deposit_window_days',
      value: 30,
      reason: 'SYNTHETIC — بازه آزمایشی',
    });

    const risk = await buyerRisk(ctx.testDb.db, ctx.second.accountId);
    assert.equal(risk.failures, 1);
    assert.equal(risk.blocked, true);

    const another = await publishedListing(ctx, 'SYNTHETIC سگ دوم', 'EXACT');
    await assert.rejects(
      createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: another.id }),
      code('CONFLICT'),
    );
  });
});

test('the transcript belongs to its two parties, and the policy is applied and logged', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ گفت‌وگو', 'EXACT');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, {
      listingId: listing.id,
      messageFa: 'SYNTHETIC سلام',
    });

    await postMessage(ctx.testDb.db, ctx.root, ctx.second.actor, {
      inquiryId: inquiry.id,
      bodyFa: 'شماره من 09121234567 است، زنگ بزن',
    });

    const rows = await ctx.testDb.db
      .select()
      .from(inquiryMessages)
      .where(eq(inquiryMessages.inquiryId, inquiry.id));
    const redacted = rows.find((row) => row.redactedNoteFa !== null)!;
    assert.ok(redacted, 'the policy applied to a message that carried a number');
    assert.ok(!redacted.bodyFa!.includes('09121234567'), 'the number is not stored');

    const enforcement = await ctx.testDb.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, 'INQUIRY_CONTACT_REDACTED'), eq(auditEvents.targetId, inquiry.id)),
      );
    assert.equal(enforcement.length, 1, 'every enforcement is recorded');

    // A third account is told the thread does not exist, not that it is not theirs.
    await assert.rejects(
      inquiryThread(ctx.testDb.db, actorFor(ctx.centre.accountId), inquiry.id),
      code('NOT_FOUND'),
    );

    // The listing moderator may read it, because a report has to be decidable.
    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const seen = await inquiryThread(ctx.testDb.db, moderator, inquiry.id);
    assert.equal(seen.role, 'MODERATOR');
    assert.equal(seen.counterpartMobile, null, 'a moderator reads the thread, not the phone book');
  });
});

test('a report reaches the moderator, hiding keeps the row, and a block stops the thread', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ گزارش', 'EXACT');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });

    const offensive = await postMessage(ctx.testDb.db, ctx.root, ctx.first.actor, {
      inquiryId: inquiry.id,
      bodyFa: 'SYNTHETIC پیام نامناسب آزمایشی',
    });

    // Only the other party reports, and only once.
    await assert.rejects(
      reportInquiryMessage(ctx.testDb.db, ctx.first.actor, {
        inquiryId: inquiry.id,
        messageId: offensive.id,
        reason: 'OFFENSIVE',
        details: null,
      }),
      code('VALIDATION'),
    );
    await reportInquiryMessage(ctx.testDb.db, ctx.second.actor, {
      inquiryId: inquiry.id,
      messageId: offensive.id,
      reason: 'OFFENSIVE',
      details: 'SYNTHETIC توضیح گزارش',
    });
    await assert.rejects(
      reportInquiryMessage(ctx.testDb.db, ctx.second.actor, {
        inquiryId: inquiry.id,
        messageId: offensive.id,
        reason: 'OFFENSIVE',
        details: null,
      }),
      code('CONFLICT'),
    );

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const queue = await messageReportQueue(ctx.testDb.db, moderator);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.messageId, offensive.id);

    await decideMessageReport(ctx.testDb.db, moderator, {
      reportId: queue[0]!.reportId,
      decision: 'HIDE',
      reasonFa: 'SYNTHETIC دلیل پنهان‌سازی',
    });

    // The row is still there — the transcript is what a dispute is argued from.
    const [stored] = await ctx.testDb.db
      .select()
      .from(inquiryMessages)
      .where(eq(inquiryMessages.id, offensive.id));
    assert.ok(stored!.bodyFa, 'the text is kept for the review and the audit trail');
    assert.ok(stored!.hiddenAt);

    const thread = await inquiryThread(ctx.testDb.db, ctx.second.actor, inquiry.id);
    const view = thread.messages.find((message) => message.id === offensive.id)!;
    assert.equal(view.bodyFa, null, 'it is not rendered to either party');
    assert.ok(view.hiddenReasonFa);

    const [report] = await ctx.testDb.db
      .select({ status: moderationReports.status, decision: moderationReports.decision })
      .from(moderationReports)
      .where(eq(moderationReports.inquiryMessageId, offensive.id));
    assert.equal(report!.status, 'ACTIONED');
    assert.equal(report!.decision, 'HIDE');

    // Blocking closes the thread to new messages from both directions.
    await blockThread(ctx.testDb.db, ctx.second.actor, {
      inquiryId: inquiry.id,
      reasonFa: 'SYNTHETIC دلیل بستن',
    });
    await assert.rejects(
      postMessage(ctx.testDb.db, ctx.root, ctx.second.actor, {
        inquiryId: inquiry.id,
        bodyFa: 'SYNTHETIC پیام پس از بستن',
      }),
      code('CONFLICT'),
    );
    await assert.rejects(
      postMessage(ctx.testDb.db, ctx.root, ctx.first.actor, {
        inquiryId: inquiry.id,
        bodyFa: 'SYNTHETIC پیام فروشنده پس از بستن',
      }),
      code('CONFLICT'),
    );
  });
});

test('withdrawing frees the advert for the next request', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const listing = await publishedListing(ctx, 'SYNTHETIC سگ انصراف', 'EXACT');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });

    const withdrawn = await closeInquiry(ctx.testDb.db, ctx.second.actor, {
      inquiryId: inquiry.id,
      to: 'WITHDRAWN',
      reasonFa: 'SYNTHETIC منصرف شدم',
      expectedVersion: inquiry.version,
    });
    assert.equal(withdrawn.status, 'WITHDRAWN');

    // The one-live-request index only counts live ones, so asking again works.
    const again = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
    assert.equal(again.status, 'OPEN');

    // And the seller cannot withdraw on the buyer's behalf.
    await assert.rejects(
      closeInquiry(ctx.testDb.db, ctx.first.actor, {
        inquiryId: again.id,
        to: 'WITHDRAWN',
        expectedVersion: again.version,
      }),
      code('CONFLICT'),
    );
  });
});
