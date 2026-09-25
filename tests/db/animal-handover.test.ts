/**
 * Handing the animal over against a real database — PROMPT-007.
 *
 * Every test builds the whole thing the real way: an animal through the
 * veterinary desk with a real microchip, a published advert, a request, a
 * deposit taken through a gateway and verified server-side, and only then a
 * meeting. Nothing about the conditions of the transfer is written straight
 * into the database, because those conditions are what is under test.
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
import { auditEvents } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetLocations } from '../../src/db/schema/vets.ts';
import { animalListings } from '../../src/db/schema/marketplace.ts';
import { listingInquiries } from '../../src/db/schema/inquiry.ts';
import { animalOwnershipTransfers, dealHandovers } from '../../src/db/schema/handover.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { attachListingMedia, createListing, publishListing, saveListing } from '../../src/marketplace/listings.ts';
import { acceptInquiry, createInquiry, startDepositPayment } from '../../src/marketplace/inquiries.ts';
import { openDispute } from '../../src/marketplace/disputes.ts';
import {
  confirmHandover,
  endHandover,
  enterHandoverCode,
  handoverOfDeal,
  issueHandoverCode,
  ownershipHistory,
  recordHandoverByAdmin,
  releaseHandoverHold,
  scheduleHandover,
  stuckHandovers,
} from '../../src/marketplace/handover.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099937000',
  tmpPrefix: 'hamzist-handover-',
  councilCode: 'SYNTH-HO-7',
  chipBase: 4_900_000,
};

const PRICE = 20_000_000n;

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

async function publishedListing(ctx: MatingCtx, nameFa: string, options: { birthDate?: string } = {}) {
  const animal = await animalWithSheet(ctx, nameFa, { skipSheet: true });
  if (options.birthDate) {
    await ctx.testDb.db
      .update(animals)
      .set({ birthDate: options.birthDate })
      .where(eq(animals.id, animal.animalId));
  }
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
    descriptionFa: 'SYNTHETIC توضیح آگهی آزمایشی برای آزمون تحویل و انتقال مالکیت حیوان.',
    reasonForSaleFa: 'SYNTHETIC دلیل فروش آزمایشی',
    provinceCode: city!.provinceCode,
    cityId: city!.id,
    vaccinationStatus: 'YES',
    neuterStatus: 'UNKNOWN',
    healthNoteFa: 'SYNTHETIC بدون مشکل شناخته‌شده',
    deliveryMethods: ['IN_PERSON', 'VET_CLINIC'],
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
  const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
    listingId: listing.id,
    expectedVersion: saved.version,
  });
  return { listing: published, animalId: animal.animalId };
}

/** A deal whose deposit is verified: where every handover starts. */
async function reservedDeal(ctx: MatingCtx, nameFa: string, options: { birthDate?: string } = {}) {
  const { listing, animalId } = await publishedListing(ctx, nameFa, options);
  const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });
  const accepted = await acceptInquiry(ctx.testDb.db, ctx.first.actor, {
    inquiryId: inquiry.id,
    expectedVersion: inquiry.version,
  });
  const { batch } = await startDepositPayment(ctx.testDb.db, ctx.second.actor, { inquiryId: inquiry.id });
  const gateway = payingGateway(accepted.depositAmountToman! * 10n);
  const attempt = await startAttempt(
    ctx.testDb.db,
    ctx.second.actor,
    { batchId: batch.id, callbackUrl: '/x' },
    gateway,
    'test',
  );
  assert.equal(
    (await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state,
    'PAID',
  );
  return { listingId: listing.id, inquiryId: inquiry.id, animalId };
}

const laterToday = () => new Date(Date.now() + 6 * 60 * 60 * 1000);

/** Arrange, take the code, and have the seller enter it. */
async function upToSellerEntry(ctx: MatingCtx, inquiryId: string) {
  await scheduleHandover(ctx.testDb.db, ctx.second.actor, {
    inquiryId,
    method: 'IN_PERSON',
    scheduledAt: laterToday(),
  });
  const issued = await issueHandoverCode(ctx.testDb.db, ctx.second.actor, inquiryId);
  const entered = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
    inquiryId,
    code: issued.code,
  });
  assert.equal(entered.state, 'ACCEPTED');
  return { issued, handover: (await handoverOfDeal(ctx.testDb.db, inquiryId))! };
}

const reloadDeal = async (ctx: MatingCtx, id: string) => {
  const [row] = await ctx.testDb.db.select().from(listingInquiries).where(eq(listingInquiries.id, id));
  return row!;
};

const reloadAnimal = async (ctx: MatingCtx, id: string) => {
  const [row] = await ctx.testDb.db.select().from(animals).where(eq(animals.id, id));
  return row!;
};

// ── arranging the meeting ──────────────────────────────────────────────────

test('only a method the advert offered can be chosen, and a clinic is validated as a place', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ قرار تحویل');

    // SELLER_LOCATION was never offered on this advert.
    await assert.rejects(
      scheduleHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        method: 'SELLER_LOCATION',
        scheduledAt: laterToday(),
      }),
      code('VALIDATION'),
    );
    // A time in the past is not an arrangement.
    await assert.rejects(
      scheduleHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        method: 'IN_PERSON',
        scheduledAt: new Date(Date.now() - 60_000),
      }),
      code('VALIDATION'),
    );
    // A clinic has to be a real, active one.
    await assert.rejects(
      scheduleHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        method: 'VET_CLINIC',
        vetLocationId: '00000000-0000-4000-8000-000000000000',
        scheduledAt: laterToday(),
      }),
      code('NOT_FOUND'),
    );

    const [location] = await ctx.testDb.db
      .select({ id: vetLocations.id })
      .from(vetLocations)
      .where(eq(vetLocations.isActive, true))
      .limit(1);
    const atClinic = await scheduleHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      method: 'VET_CLINIC',
      vetLocationId: location!.id,
      scheduledAt: laterToday(),
    });
    assert.equal(atClinic.vetLocationId, location!.id);
    assert.equal(atClinic.status, 'SCHEDULED');

    // Rearranging edits the same meeting rather than opening a second one.
    const moved = await scheduleHandover(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      method: 'IN_PERSON',
      placeFa: 'SYNTHETIC محل تازه',
      scheduledAt: laterToday(),
    });
    assert.equal(moved.id, atClinic.id);
    assert.equal(moved.vetLocationId, null);
    assert.equal(moved.version, atClinic.version + 1);
  });
});

// ── the code ───────────────────────────────────────────────────────────────

test('the buyer holds the code, the seller enters it, and guessing is bounded', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.handover_code_max_attempts',
      value: 3,
      reason: 'SYNTHETIC — سقف تلاش آزمایشی',
    });
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ کد تحویل');
    await scheduleHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      method: 'IN_PERSON',
      scheduledAt: laterToday(),
    });

    // The seller cannot mint a code for themselves.
    await assert.rejects(
      issueHandoverCode(ctx.testDb.db, ctx.first.actor, deal.inquiryId),
      code('FORBIDDEN'),
    );
    const issued = await issueHandoverCode(ctx.testDb.db, ctx.second.actor, deal.inquiryId);
    assert.match(issued.code, /^[0-9]{6}$/);

    // The code itself never reaches the row or the audit trail.
    const stored = (await handoverOfDeal(ctx.testDb.db, deal.inquiryId))!;
    assert.ok(stored.codeHash && !stored.codeHash.includes(issued.code));
    const trail = await ctx.testDb.db
      .select({ metadata: auditEvents.metadata, after: auditEvents.after })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'ANIMAL_HANDOVER_CODE_ISSUED'));
    assert.ok(!JSON.stringify(trail).includes(issued.code), 'the code is never written down');

    // And the buyer cannot enter it on the seller's behalf.
    await assert.rejects(
      enterHandoverCode(ctx.testDb.db, ctx.second.actor, { inquiryId: deal.inquiryId, code: issued.code }),
      code('FORBIDDEN'),
    );

    // Three wrong tries lock it; the lock is time-based and needs no operator.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const wrong = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
        inquiryId: deal.inquiryId,
        code: '000000',
      });
      assert.equal(wrong.state, 'WRONG');
      if (wrong.state === 'WRONG') assert.equal(wrong.attemptsRemaining, 3 - attempt);
    }
    const locked = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: '000000',
    });
    assert.equal(locked.state, 'WRONG');

    // Once locked, even the right code is not tried.
    const afterLock = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: issued.code,
    });
    assert.equal(afterLock.state, 'LOCKED');

    // Issuing a fresh code clears the attempts, and the old code stops working.
    await ctx.testDb.db
      .update(dealHandovers)
      .set({ codeLockedUntil: null })
      .where(eq(dealHandovers.inquiryId, deal.inquiryId));
    const second = await issueHandoverCode(ctx.testDb.db, ctx.second.actor, deal.inquiryId);
    const stale = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: issued.code,
    });
    assert.equal(stale.state, 'WRONG', 'the superseded code is no longer accepted');
    const accepted = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: second.code,
    });
    assert.equal(accepted.state, 'ACCEPTED');
  });
});

test('an expired code is refused and the meeting says so', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ کد منقضی');
    await scheduleHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      method: 'IN_PERSON',
      scheduledAt: laterToday(),
    });
    const issued = await issueHandoverCode(ctx.testDb.db, ctx.second.actor, deal.inquiryId);

    await ctx.testDb.db
      .update(dealHandovers)
      .set({ codeExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(dealHandovers.inquiryId, deal.inquiryId));

    const outcome = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: issued.code,
    });
    assert.equal(outcome.state, 'EXPIRED');
    assert.equal((await handoverOfDeal(ctx.testDb.db, deal.inquiryId))!.status, 'EXPIRED');

    // A fresh code puts the meeting back on.
    const again = await issueHandoverCode(ctx.testDb.db, ctx.second.actor, deal.inquiryId);
    const accepted = await enterHandoverCode(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      code: again.code,
    });
    assert.equal(accepted.state, 'ACCEPTED');
  });
});

// ── the transfer ───────────────────────────────────────────────────────────

test('the buyer’s confirmation moves the ownership, the advert and the deal together', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ انتقال');
    const { handover } = await upToSellerEntry(ctx, deal.inquiryId);

    // The seller cannot complete it, whatever they entered a moment ago.
    await assert.rejects(
      confirmHandover(ctx.testDb.db, ctx.first.actor, {
        inquiryId: deal.inquiryId,
        expectedVersion: handover.version,
      }),
      code('FORBIDDEN'),
    );

    const result = await confirmHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      expectedVersion: handover.version,
    });
    assert.equal(result.handover.status, 'COMPLETED');
    assert.ok(result.handover.statementFa?.includes('صورت‌جلسه تحویل'));
    assert.equal(result.handover.statementVersion, 'HANDOVER-STATEMENT-V1');
    assert.equal(result.transfer.fromAccountId, ctx.first.accountId);
    assert.equal(result.transfer.toAccountId, ctx.second.accountId);
    assert.equal(result.transfer.priceToman, PRICE);

    assert.equal((await reloadAnimal(ctx, deal.animalId)).ownerAccountId, ctx.second.accountId);
    assert.equal((await reloadDeal(ctx, deal.inquiryId)).status, 'COMPLETED');
    const [listing] = await ctx.testDb.db
      .select({ status: animalListings.status })
      .from(animalListings)
      .where(eq(animalListings.id, deal.listingId));
    assert.equal(listing!.status, 'SOLD');

    // The previous owner stays in the record as a row of its own.
    const history = await ownershipHistory(ctx.testDb.db, deal.animalId);
    assert.equal(history.length, 1);
    assert.equal(history[0]!.fromAccountId, ctx.first.accountId);
    assert.equal(history[0]!.reason, 'MARKETPLACE_SALE');

    const transfers = await ctx.testDb.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'ANIMAL_OWNERSHIP_TRANSFERRED'));
    assert.equal(transfers.length, 1, 'the transfer is audited exactly once');

    // Nothing happens twice.
    await assert.rejects(
      confirmHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        expectedVersion: result.handover.version,
      }),
      code('CONFLICT'),
    );
  });
});

test('two confirmations arriving together leave exactly one transfer', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ انتقال هم‌زمان');
    const { handover } = await upToSellerEntry(ctx, deal.inquiryId);

    const outcomes = await Promise.allSettled([
      confirmHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        expectedVersion: handover.version,
      }),
      confirmHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        expectedVersion: handover.version,
      }),
    ]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);

    const transfers = await ctx.testDb.db
      .select()
      .from(animalOwnershipTransfers)
      .where(eq(animalOwnershipTransfers.inquiryId, deal.inquiryId));
    assert.equal(transfers.length, 1);
    assert.equal((await reloadAnimal(ctx, deal.animalId)).ownerAccountId, ctx.second.accountId);
  });
});

test('every condition is read again at the last moment, and a failure changes nothing', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);

    // An animal that is below the minimum handover age can be advertised and
    // reserved, but not handed over (PRODUCT_DECISIONS §3).
    const today = new Date();
    const born = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    const young = await reservedDeal(ctx, 'SYNTHETIC توله کم‌سن', {
      birthDate: born.toISOString().slice(0, 10),
    });
    const youngHandover = await upToSellerEntry(ctx, young.inquiryId);
    await assert.rejects(
      confirmHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: young.inquiryId,
        expectedVersion: youngHandover.handover.version,
      }),
      code('CONFLICT'),
    );
    // Nothing moved.
    assert.equal((await reloadAnimal(ctx, young.animalId)).ownerAccountId, ctx.first.accountId);
    assert.equal((await reloadDeal(ctx, young.inquiryId)).status, 'CONVERTED');
    assert.equal((await handoverOfDeal(ctx.testDb.db, young.inquiryId))!.status, 'SELLER_ENTERED');
    assert.equal((await ownershipHistory(ctx.testDb.db, young.animalId)).length, 0);

    // An animal that changed hands between the deal and the meeting is not the
    // seller's to give.
    const moved = await reservedDeal(ctx, 'SYNTHETIC سگ مالک عوض‌شده');
    const movedHandover = await upToSellerEntry(ctx, moved.inquiryId);
    await ctx.testDb.db
      .update(animals)
      .set({ ownerAccountId: ctx.vet.accountId })
      .where(eq(animals.id, moved.animalId));
    await assert.rejects(
      confirmHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: moved.inquiryId,
        expectedVersion: movedHandover.handover.version,
      }),
      code('CONFLICT'),
    );
    assert.equal((await reloadAnimal(ctx, moved.animalId)).ownerAccountId, ctx.vet.accountId);
    assert.equal((await ownershipHistory(ctx.testDb.db, moved.animalId)).length, 0);
  });
});

test('a disputed deal holds the meeting until an administrator releases it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ اختلاف تحویل');
    await scheduleHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      method: 'IN_PERSON',
      scheduledAt: laterToday(),
    });

    await openDispute(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      scope: 'HANDOVER',
      claimFa: 'SYNTHETIC ادعای من درباره جلسه تحویل و آنچه آنجا گذشت.',
    });
    assert.equal((await handoverOfDeal(ctx.testDb.db, deal.inquiryId))!.status, 'ON_HOLD');

    // Nothing moves while the case is open.
    await assert.rejects(
      issueHandoverCode(ctx.testDb.db, ctx.second.actor, deal.inquiryId),
      code('CONFLICT'),
    );
    const reviewer = actorFor(ctx.admin.accountId, 'DISPUTE_REVIEWER');
    await assert.rejects(
      releaseHandoverHold(ctx.testDb.db, reviewer, {
        inquiryId: deal.inquiryId,
        reasonFa: 'SYNTHETIC رفع توقف زودهنگام',
      }),
      code('CONFLICT'),
    );

    // The queue shows it as stuck, which is what the recovery page reads.
    const queue = await stuckHandovers(ctx.testDb.db, reviewer);
    assert.ok(queue.some((row) => row.inquiryId === deal.inquiryId && row.status === 'ON_HOLD'));
    // And an ordinary account cannot read that queue at all.
    await assert.rejects(stuckHandovers(ctx.testDb.db, ctx.second.actor), code('FORBIDDEN'));
  });
});

test('an administrator can record a meeting that happened, and only that', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ ثبت دستی');
    const { handover } = await upToSellerEntry(ctx, deal.inquiryId);
    const reviewer = actorFor(ctx.admin.accountId, 'DISPUTE_REVIEWER');

    // A reason is required, and an ordinary account cannot do this at all.
    await assert.rejects(
      recordHandoverByAdmin(ctx.testDb.db, reviewer, {
        inquiryId: deal.inquiryId,
        reasonFa: 'کوتاه',
        expectedVersion: handover.version,
      }),
      code('VALIDATION'),
    );
    await assert.rejects(
      recordHandoverByAdmin(ctx.testDb.db, ctx.second.actor, {
        inquiryId: deal.inquiryId,
        reasonFa: 'SYNTHETIC ثبت دستی توسط خریدار',
        expectedVersion: handover.version,
      }),
      code('FORBIDDEN'),
    );

    const result = await recordHandoverByAdmin(ctx.testDb.db, reviewer, {
      inquiryId: deal.inquiryId,
      reasonFa: 'SYNTHETIC تحویل انجام شده بود و کد منقضی شد؛ با مدارک پشتیبانی ثبت می‌شود.',
      expectedVersion: handover.version,
    });
    assert.equal(result.handover.status, 'COMPLETED');
    // The recovery says who did it and why, on the transfer itself.
    assert.equal(result.transfer.reason, 'ADMIN_CORRECTION');
    assert.equal(result.transfer.recordedByAccountId, ctx.admin.accountId);
    assert.match(result.transfer.noteFa!, /SYNTHETIC/);
    assert.equal((await reloadAnimal(ctx, deal.animalId)).ownerAccountId, ctx.second.accountId);
  });
});

test('refusing at the door ends the meeting, not the deal', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const deal = await reservedDeal(ctx, 'SYNTHETIC سگ تحویل‌نشده');
    await upToSellerEntry(ctx, deal.inquiryId);

    const refused = await endHandover(ctx.testDb.db, ctx.second.actor, {
      inquiryId: deal.inquiryId,
      to: 'REFUSED',
      reasonFa: 'SYNTHETIC حیوان با آنچه دیدم نمی‌خواند.',
    });
    assert.equal(refused.status, 'REFUSED');
    assert.equal(refused.codeHash, null, 'the code of a refused meeting stops working');

    // The deposit, the deal and the advert are untouched: where the money goes
    // is decided through the cancellation and dispute path, not here.
    const afterwards = await reloadDeal(ctx, deal.inquiryId);
    assert.equal(afterwards.status, 'CONVERTED');
    assert.ok(afterwards.reservedAt);
    const [listing] = await ctx.testDb.db
      .select({ status: animalListings.status })
      .from(animalListings)
      .where(eq(animalListings.id, deal.listingId));
    assert.equal(listing!.status, 'RESERVED');

    // And they can arrange another meeting.
    const again = await scheduleHandover(ctx.testDb.db, ctx.first.actor, {
      inquiryId: deal.inquiryId,
      method: 'IN_PERSON',
      scheduledAt: laterToday(),
    });
    assert.equal(again.status, 'SCHEDULED');
  });
});

test('nothing here is reachable before the deposit was verified', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarketForDeals(ctx);
    const { listing } = await publishedListing(ctx, 'SYNTHETIC سگ بدون رزرو');
    const inquiry = await createInquiry(ctx.testDb.db, ctx.second.actor, { listingId: listing.id });

    await assert.rejects(
      scheduleHandover(ctx.testDb.db, ctx.second.actor, {
        inquiryId: inquiry.id,
        method: 'IN_PERSON',
        scheduledAt: laterToday(),
      }),
      code('CONFLICT'),
    );
    await assert.rejects(issueHandoverCode(ctx.testDb.db, ctx.second.actor, inquiry.id), code('CONFLICT'));
    assert.equal(await handoverOfDeal(ctx.testDb.db, inquiry.id), null);

    // A third account is told the deal does not exist rather than that it is
    // not theirs.
    await assert.rejects(
      scheduleHandover(ctx.testDb.db, actorFor(ctx.centre.accountId), {
        inquiryId: inquiry.id,
        method: 'IN_PERSON',
        scheduledAt: laterToday(),
      }),
      code('NOT_FOUND'),
    );
  });
});
