/**
 * The public marketplace, moderation and promotions against a real database —
 * PROMPT-004.
 *
 * The risks worth a database for: that the four reasons an advert is hidden all
 * really hide it, that a filter reaches SQL as a parameter and not as text, that
 * a duplicate report is refused by the database, that a decision moves the
 * advert and closes its reports together, and that a promotion changes
 * placement and nothing else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { animalWithSheet, actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { moderationAppeals, moderationReports, publisherRestrictions } from '../../src/db/schema/moderation.ts';
import { animalListingMedia, animalListings, listingPromotions } from '../../src/db/schema/marketplace.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { marketSpecies, setSpeciesEnabled } from '../../src/marketplace/species.ts';
import {
  attachListingMedia,
  createListing,
  publishListing,
  saveListing,
} from '../../src/marketplace/listings.ts';
import {
  listingSitemapEntries,
  publicListing,
  publicListings,
} from '../../src/marketplace/public-listings.ts';
import { EMPTY_FILTER, parseListingFilter } from '../../src/marketplace/discovery-model.ts';
import {
  appealableReports,
  appealQueue,
  decideAppeal,
  decideListingReports,
  listingReportQueue,
  submitAppeal,
  submitMarketReport,
} from '../../src/marketplace/listing-moderation.ts';
import {
  livePromotedListingIds,
  promotionPackages,
  startPromotionPurchase,
} from '../../src/marketplace/promotions.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099932000',
  tmpPrefix: 'hamzist-discovery-',
  councilCode: 'SYNTH-AL-4',
  chipBase: 4_200_000,
};

const filterOf = (raw: Record<string, string>) => parseListingFilter(raw);

async function openMarket(ctx: MatingCtx): Promise<void> {
  for (const key of ['market.flag.animal_market_enabled', 'market.flag.animal_listing_creation_enabled'] as const) {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value: true, reason: 'SYNTHETIC' });
  }
  await updateSetting(ctx.testDb.db, ctx.admin.actor, {
    key: 'market.animal.listing_duration_days',
    value: 30,
    reason: 'SYNTHETIC',
  });
}

/** One published advert of the first owner, ready to be found. */
async function publishedListing(
  ctx: MatingCtx,
  name: string,
  overrides: { priceToman?: string; priceMode?: string; description?: string } = {},
): Promise<{ listingId: string; animalId: string }> {
  const animal = await animalWithSheet(ctx, name, { skipSheet: true });
  const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);
  const filled = await saveListing(ctx.testDb.db, ctx.first.actor, {
    listingId: listing.id,
    expectedVersion: listing.version,
    priceMode: overrides.priceMode ?? 'EXACT',
    priceToman: overrides.priceToman ?? '18000000',
    descriptionFa: overrides.description ?? 'SYNTHETIC توضیح آگهی آزمایشی برای آزمودن جست‌وجو و فیلترها.',
    reasonForSaleFa: 'SYNTHETIC دلیل فروش',
    provinceCode: city!.provinceCode,
    cityId: city!.id,
    vaccinationStatus: 'YES',
    neuterStatus: 'NO',
    healthNoteFa: '',
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
  await publishListing(ctx.testDb.db, ctx.first.actor, {
    listingId: filled.id,
    expectedVersion: filled.version,
  });
  return { listingId: listing.id, animalId: animal.animalId };
}

// ── visibility ─────────────────────────────────────────────────────────────

test('the four reasons an advert is hidden all really hide it, and none is distinguishable', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const { listingId } = await publishedListing(ctx, 'SYNTHETIC سگ عمومی');

    const visible = await publicListings(ctx.testDb.db, EMPTY_FILTER);
    assert.equal(visible.total, 1);
    assert.ok(await publicListing(ctx.testDb.db, listingId));

    // 1. The market's kill switch.
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.flag.animal_market_enabled',
      value: false,
      reason: 'SYNTHETIC',
    });
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 0);
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).marketOpen, false);
    assert.equal(await publicListing(ctx.testDb.db, listingId), null);
    assert.deepEqual(await listingSitemapEntries(ctx.testDb.db), []);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.flag.animal_market_enabled',
      value: true,
      reason: 'SYNTHETIC',
    });

    // 2. The species is closed for animal sale.
    const dog = (await marketSpecies(ctx.testDb.db, 'ANIMAL_SALE')).find((r) => r.speciesCode === 'DOG')!;
    const closed = await setSpeciesEnabled(ctx.testDb.db, actorFor(ctx.admin.accountId, 'MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'DOG',
      enabled: false,
      reasonFa: 'SYNTHETIC بستن گونه',
      expectedVersion: dog.version,
    });
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 0);
    assert.equal(await publicListing(ctx.testDb.db, listingId), null);
    await setSpeciesEnabled(ctx.testDb.db, actorFor(ctx.admin.accountId, 'MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'DOG',
      enabled: true,
      reasonFa: 'SYNTHETIC باز کردن دوباره',
      expectedVersion: closed.version,
    });

    // 3. The seller is under an active publisher restriction.
    const [restriction] = await ctx.testDb.db
      .insert(publisherRestrictions)
      .values({ accountId: ctx.first.accountId, reason: 'SYNTHETIC محدودیت' })
      .returning({ id: publisherRestrictions.id });
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 0);
    assert.equal(await publicListing(ctx.testDb.db, listingId), null);
    await ctx.testDb.db
      .update(publisherRestrictions)
      .set({ liftedAt: new Date() })
      .where(eq(publisherRestrictions.id, restriction!.id));
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 1);

    // 4. The advert's own status.
    await ctx.testDb.db
      .update(animalListings)
      .set({ status: 'PAUSED' })
      .where(eq(animalListings.id, listingId));
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 0);
    assert.equal(await publicListing(ctx.testDb.db, listingId), null);

    // A reserved advert stays readable but leaves the sitemap.
    await ctx.testDb.db
      .update(animalListings)
      .set({ status: 'RESERVED' })
      .where(eq(animalListings.id, listingId));
    const reserved = await publicListing(ctx.testDb.db, listingId);
    assert.ok(reserved);
    assert.equal(reserved!.reserved, true);
    assert.deepEqual(await listingSitemapEntries(ctx.testDb.db), []);

    // A malformed id answers exactly the same way as a hidden one.
    assert.equal(await publicListing(ctx.testDb.db, 'not-a-uuid'), null);
  });
});

test('the sitemap lists published adverts only, at their canonical address', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const { listingId } = await publishedListing(ctx, 'SYNTHETIC سگ نقشه');
    const entries = await listingSitemapEntries(ctx.testDb.db);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.path, '/animals-market/' + listingId);
    assert.ok(entries[0]!.lastModified instanceof Date);
  });
});

// ── filters ────────────────────────────────────────────────────────────────

test('filters narrow the result and a hostile query string finds nothing unexpected', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    await publishedListing(ctx, 'SYNTHETIC سگ ارزان', { priceToman: '5000000' });
    await publishedListing(ctx, 'SYNTHETIC سگ گران', { priceToman: '90000000' });
    await publishedListing(ctx, 'SYNTHETIC سگ توافقی', { priceMode: 'NEGOTIABLE' });

    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 3);

    // A price bound only ever matches adverts that have a price: a negotiable
    // advert is unpriced, not cheap.
    const cheap = await publicListings(ctx.testDb.db, filterOf({ maxPrice: '10000000' }));
    assert.equal(cheap.total, 1);
    assert.equal(cheap.items[0]!.titleFa, 'SYNTHETIC سگ ارزان');

    const negotiable = await publicListings(ctx.testDb.db, filterOf({ priceMode: 'NEGOTIABLE' }));
    assert.equal(negotiable.total, 1);

    // The term is a parameter: the wildcard and the quote are searched for, not
    // interpreted, and the injection attempt simply matches nothing.
    assert.equal((await publicListings(ctx.testDb.db, filterOf({ q: '%' }))).total, 0);
    assert.equal((await publicListings(ctx.testDb.db, filterOf({ q: '_' }))).total, 0);
    assert.equal(
      (await publicListings(ctx.testDb.db, filterOf({ q: "'; delete from animal_listing; --" }))).total,
      0,
    );
    // And a real term still works.
    assert.equal((await publicListings(ctx.testDb.db, filterOf({ q: 'ارزان' }))).total, 1);

    // The rows are all still there: nothing was deleted by the attempt.
    const rows = await ctx.testDb.db.select({ id: animalListings.id }).from(animalListings);
    assert.equal(rows.length, 3);

    // A filter nobody matches is an honest empty page, not an error.
    const none = await publicListings(ctx.testDb.db, filterOf({ sex: 'FEMALE' }));
    assert.equal(none.total, 0);
    assert.equal(none.items.length, 0);
  });
});

test('sorting is stable and an unpriced advert is neither cheapest nor dearest', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    await publishedListing(ctx, 'SYNTHETIC سگ ۳۰', { priceToman: '30000000' });
    await publishedListing(ctx, 'SYNTHETIC سگ ۱۰', { priceToman: '10000000' });
    await publishedListing(ctx, 'SYNTHETIC سگ توافقی', { priceMode: 'NEGOTIABLE' });

    const asc = await publicListings(ctx.testDb.db, filterOf({ sort: 'PRICE_ASC' }));
    assert.deepEqual(asc.items.map((row) => row.titleFa), [
      'SYNTHETIC سگ ۱۰',
      'SYNTHETIC سگ ۳۰',
      'SYNTHETIC سگ توافقی',
    ]);

    const desc = await publicListings(ctx.testDb.db, filterOf({ sort: 'PRICE_DESC' }));
    assert.deepEqual(desc.items.map((row) => row.titleFa), [
      'SYNTHETIC سگ ۳۰',
      'SYNTHETIC سگ ۱۰',
      'SYNTHETIC سگ توافقی',
    ]);

    // Paging is stable: the two pages together are the whole set with no
    // duplicate and no missing row.
    const first = await publicListings(ctx.testDb.db, filterOf({ pageSize: '2', page: '1' }));
    const second = await publicListings(ctx.testDb.db, filterOf({ pageSize: '2', page: '2' }));
    const seen = [...first.items, ...second.items].map((row) => row.id);
    assert.equal(new Set(seen).size, 3);
    assert.equal(first.totalPages, 2);
  });
});

// ── promotion ──────────────────────────────────────────────────────────────

test('a promotion is placement only: paid for, labelled, ranked first, and it expires', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const plain = await publishedListing(ctx, 'SYNTHETIC سگ عادی');
    const promoted = await publishedListing(ctx, 'SYNTHETIC سگ تبلیغ');

    // The tariff starts unset, so nothing can be bought.
    const unpriced = await promotionPackages(ctx.testDb.db);
    assert.equal(unpriced.length, 2);
    assert.ok(unpriced.every((row) => row.priceToman === null));
    await assert.rejects(
      startPromotionPurchase(ctx.testDb.db, ctx.first.actor, {
        listingId: promoted.listingId,
        packageId: unpriced[0]!.id,
      }),
      code('NOT_CONFIGURED'),
    );

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.promotion_7_toman',
      value: '300000',
      reason: 'SYNTHETIC تعرفه تبلیغ',
    });
    const packages = await promotionPackages(ctx.testDb.db);
    const seven = packages.find((row) => row.code === 'LISTING_7')!;
    assert.equal(seven.priceToman, 300_000n);

    // Somebody else's advert cannot be promoted.
    await assert.rejects(
      startPromotionPurchase(ctx.testDb.db, ctx.second.actor, {
        listingId: promoted.listingId,
        packageId: seven.id,
      }),
      code('NOT_FOUND'),
    );

    const started = await startPromotionPurchase(ctx.testDb.db, ctx.first.actor, {
      listingId: promoted.listingId,
      packageId: seven.id,
    });
    assert.equal(started.promotion.status, 'PENDING_PAYMENT');
    // Buying is not being promoted: nothing is live until the money is verified.
    assert.equal((await livePromotedListingIds(ctx.testDb.db, [promoted.listingId])).size, 0);

    // A second purchase while one is pending is refused.
    await assert.rejects(
      startPromotionPurchase(ctx.testDb.db, ctx.first.actor, {
        listingId: promoted.listingId,
        packageId: seven.id,
      }),
      code('CONFLICT'),
    );

    const gateway = payingGateway(3_000_000n);
    const attempt = await startAttempt(
      ctx.testDb.db,
      ctx.first.actor,
      { batchId: started.batch.id, callbackUrl: '/x' },
      gateway,
      'test',
    );
    assert.equal(
      (await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state,
      'PAID',
    );

    const live = await livePromotedListingIds(ctx.testDb.db, [promoted.listingId, plain.listingId]);
    assert.equal(live.has(promoted.listingId), true);
    assert.equal(live.has(plain.listingId), false);

    // It is placed first, and the labelled flag is on the card.
    const page = await publicListings(ctx.testDb.db, EMPTY_FILTER);
    assert.equal(page.items[0]!.id, promoted.listingId);
    assert.equal(page.items[0]!.promoted, true);
    assert.equal(page.items[1]!.promoted, false);
    // Both are still there: a promotion moved one, it did not add or remove any.
    assert.equal(page.total, 2);

    // It only places among results that already match: a filter the promoted
    // advert fails does not bring it back.
    const filtered = await publicListings(ctx.testDb.db, filterOf({ q: 'عادی' }));
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0]!.id, plain.listingId);

    // And it ends on its own date, read rather than swept.
    const [row] = await ctx.testDb.db
      .select()
      .from(listingPromotions)
      .where(eq(listingPromotions.listingId, promoted.listingId))
      .limit(1);
    const after = new Date(row!.endsAt!.getTime() + 1000);
    assert.equal((await livePromotedListingIds(ctx.testDb.db, [promoted.listingId], after)).size, 0);
    const later = await publicListings(ctx.testDb.db, EMPTY_FILTER, after);
    assert.ok(later.items.every((item) => item.promoted === false));
  });
});

// ── reports and moderation ────────────────────────────────────────────────

test('a report names a real subject, refuses a duplicate and refuses self-reporting', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const { listingId } = await publishedListing(ctx, 'SYNTHETIC سگ گزارش');

    await assert.rejects(
      submitMarketReport(ctx.testDb.db, ctx.first.actor, {
        target: 'ANIMAL_LISTING',
        listingId,
        reason: 'SPAM',
        details: null,
      }),
      code('VALIDATION'),
      'a seller cannot report their own advert',
    );
    await assert.rejects(
      submitMarketReport(ctx.testDb.db, ctx.second.actor, {
        target: 'NONSENSE',
        listingId,
        reason: 'SPAM',
        details: null,
      }),
      code('VALIDATION'),
    );
    await assert.rejects(
      submitMarketReport(ctx.testDb.db, ctx.second.actor, {
        target: 'ANIMAL_LISTING',
        listingId,
        reason: 'OTHER',
        details: '   ',
      }),
      code('VALIDATION'),
      'the other reason needs a description',
    );

    const first = await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'ANIMAL_LISTING',
      listingId,
      reason: 'INCORRECT_INFO',
      details: 'SYNTHETIC اطلاعات نادرست',
    });
    assert.ok(first.id);

    // A second open report from the same account about the same advert is a
    // duplicate, refused by the database rather than by a lookup.
    await assert.rejects(
      submitMarketReport(ctx.testDb.db, ctx.second.actor, {
        target: 'ANIMAL_LISTING',
        listingId,
        reason: 'SPAM',
        details: null,
      }),
      code('CONFLICT'),
    );

    // The same person may still report a different subject of the same advert.
    const [media] = await ctx.testDb.db
      .select({ id: animalListingMedia.id })
      .from(animalListingMedia)
      .where(eq(animalListingMedia.listingId, listingId))
      .limit(1);
    const mediaReport = await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'LISTING_MEDIA',
      listingId,
      mediaId: media!.id,
      reason: 'COPYRIGHT',
      details: null,
    });
    assert.ok(mediaReport.id);
    const sellerReport = await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'SELLER',
      listingId,
      reason: 'SPAM',
      details: null,
    });
    assert.ok(sellerReport.id);

    // A hidden advert is not reportable, so this cannot be used to discover one.
    await ctx.testDb.db.update(animalListings).set({ status: 'PAUSED' }).where(eq(animalListings.id, listingId));
    await assert.rejects(
      submitMarketReport(ctx.testDb.db, ctx.vet.actor, {
        target: 'ANIMAL_LISTING',
        listingId,
        reason: 'SPAM',
        details: null,
      }),
      code('NOT_FOUND'),
    );
  });
});

test('the queue is ordered by real numbers, and it says they are signals rather than findings', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const quiet = await publishedListing(ctx, 'SYNTHETIC سگ کم‌گزارش');
    const loud = await publishedListing(ctx, 'SYNTHETIC سگ پرگزارش');

    await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'ANIMAL_LISTING',
      listingId: quiet.listingId,
      reason: 'SPAM',
      details: null,
    });
    for (const reporter of [ctx.second, ctx.vet]) {
      await submitMarketReport(ctx.testDb.db, reporter.actor, {
        target: 'ANIMAL_LISTING',
        listingId: loud.listingId,
        reason: 'INCORRECT_INFO',
        details: null,
      });
    }

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const queue = await listingReportQueue(ctx.testDb.db, moderator);
    assert.equal(queue.length, 2);
    assert.equal(queue[0]!.listingId, loud.listingId, 'more distinct reporters come first');
    assert.equal(queue[0]!.signals.openReporters, 2);
    assert.equal(queue[0]!.signals.openReports, 2);
    assert.equal(queue[1]!.signals.openReporters, 1);
    // Nothing about the advert changed: a signal is not an action.
    assert.equal(queue[0]!.status, 'PUBLISHED');
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 2);

    // Only the capability opens the queue.
    for (const context of ['USER', 'SUPPORT_AGENT', 'MARKETPLACE_ADMIN', 'FINANCE_OPERATOR'] as const) {
      await assert.rejects(
        listingReportQueue(ctx.testDb.db, actorFor(ctx.admin.accountId, context)),
        code('FORBIDDEN'),
        context,
      );
    }
  });
});

test('a decision moves the advert, closes its reports and deletes nothing', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const { listingId } = await publishedListing(ctx, 'SYNTHETIC سگ تصمیم');
    await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'ANIMAL_LISTING',
      listingId,
      reason: 'INCORRECT_INFO',
      details: 'SYNTHETIC',
    });
    await submitMarketReport(ctx.testDb.db, ctx.vet.actor, {
      target: 'ANIMAL_LISTING',
      listingId,
      reason: 'SPAM',
      details: null,
    });

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const [before] = await ctx.testDb.db
      .select({ version: animalListings.version })
      .from(animalListings)
      .where(eq(animalListings.id, listingId))
      .limit(1);

    await assert.rejects(
      decideListingReports(ctx.testDb.db, moderator, {
        listingId,
        decision: 'HIDE',
        reasonFa: '  ',
        expectedListingVersion: before!.version,
      }),
      code('VALIDATION'),
      'a decision always carries a reason',
    );

    const result = await decideListingReports(ctx.testDb.db, moderator, {
      listingId,
      decision: 'HIDE',
      reasonFa: 'SYNTHETIC اطلاعات آگهی با پرونده نمی‌خواند',
      expectedListingVersion: before!.version,
    });
    assert.equal(result.closed, 2, 'one decision closes the whole group');
    assert.equal(result.listingStatus, 'SUSPENDED');
    assert.equal(await publicListing(ctx.testDb.db, listingId), null);

    // Every report is still a row, with its own reason, reporter and decision.
    const reports = await ctx.testDb.db
      .select()
      .from(moderationReports)
      .where(eq(moderationReports.listingId, listingId));
    assert.equal(reports.length, 2);
    assert.ok(reports.every((row) => row.status === 'ACTIONED'));
    assert.ok(reports.every((row) => row.decision === 'HIDE'));
    assert.ok(reports.every((row) => row.decisionReason !== null));
    assert.ok(reports.every((row) => row.listingRevision !== null), 'the revision each reporter saw is kept');

    // And the advert itself, its media and its revisions are all still there.
    const media = await ctx.testDb.db
      .select({ id: animalListingMedia.id })
      .from(animalListingMedia)
      .where(eq(animalListingMedia.listingId, listingId));
    assert.equal(media.length, 3);

    const audit = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'MARKET_REPORTS_DECIDED'), eq(auditEvents.targetId, listingId)));
    assert.equal(audit.length, 1);
    assert.ok(audit[0]!.reason);
  });
});

test('restricting a seller hides every advert of that seller and is lifted the same way', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const one = await publishedListing(ctx, 'SYNTHETIC سگ فروشنده ۱');
    const two = await publishedListing(ctx, 'SYNTHETIC سگ فروشنده ۲');
    await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'SELLER',
      listingId: one.listingId,
      reason: 'SPAM',
      details: null,
    });

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const [row] = await ctx.testDb.db
      .select({ version: animalListings.version })
      .from(animalListings)
      .where(eq(animalListings.id, one.listingId))
      .limit(1);

    await decideListingReports(ctx.testDb.db, moderator, {
      listingId: one.listingId,
      decision: 'RESTRICT_PUBLISHER',
      reasonFa: 'SYNTHETIC رفتار تکراری',
      expectedListingVersion: row!.version,
    });

    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 0, 'both adverts go dark');
    assert.equal(await publicListing(ctx.testDb.db, two.listingId), null);

    // The adverts themselves are untouched: this is visibility, not deletion.
    const live = await ctx.testDb.db
      .select({ status: animalListings.status })
      .from(animalListings)
      .where(eq(animalListings.sellerAccountId, ctx.first.accountId));
    assert.ok(live.every((r) => r.status === 'PUBLISHED'));

    await ctx.testDb.db.update(publisherRestrictions).set({ liftedAt: new Date() });
    assert.equal((await publicListings(ctx.testDb.db, EMPTY_FILTER)).total, 2);
  });
});

test('an appeal is its own row, and accepting one restores the advert without rewriting the decision', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const { listingId } = await publishedListing(ctx, 'SYNTHETIC سگ اعتراض');
    await submitMarketReport(ctx.testDb.db, ctx.second.actor, {
      target: 'ANIMAL_LISTING',
      listingId,
      reason: 'INCORRECT_INFO',
      details: null,
    });

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    const [before] = await ctx.testDb.db
      .select({ version: animalListings.version })
      .from(animalListings)
      .where(eq(animalListings.id, listingId))
      .limit(1);
    await decideListingReports(ctx.testDb.db, moderator, {
      listingId,
      decision: 'HIDE',
      reasonFa: 'SYNTHETIC توقف برای بررسی',
      expectedListingVersion: before!.version,
    });

    const appealable = await appealableReports(ctx.testDb.db, ctx.first.actor, listingId);
    assert.equal(appealable.length, 1);

    // Only the seller the decision was about may object.
    await assert.rejects(
      submitAppeal(ctx.testDb.db, ctx.second.actor, {
        reportId: appealable[0]!.id,
        statementFa: 'SYNTHETIC',
      }),
      code('NOT_FOUND'),
    );
    await assert.rejects(
      submitAppeal(ctx.testDb.db, ctx.first.actor, { reportId: appealable[0]!.id, statementFa: '  ' }),
      code('VALIDATION'),
    );

    const appeal = await submitAppeal(ctx.testDb.db, ctx.first.actor, {
      reportId: appealable[0]!.id,
      statementFa: 'SYNTHETIC اطلاعات آگهی درست است و مدرک دارم',
    });
    // A second objection about the same decision is the same objection.
    await assert.rejects(
      submitAppeal(ctx.testDb.db, ctx.first.actor, {
        reportId: appealable[0]!.id,
        statementFa: 'SYNTHETIC دوباره',
      }),
      code('CONFLICT'),
    );
    // And it is no longer offered as appealable.
    assert.deepEqual(await appealableReports(ctx.testDb.db, ctx.first.actor, listingId), []);

    const queue = await appealQueue(ctx.testDb.db, moderator);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.id, appeal.id);

    const outcome = await decideAppeal(ctx.testDb.db, moderator, {
      appealId: appeal.id,
      uphold: false,
      reasonFa: 'SYNTHETIC مدرک پذیرفته شد',
    });
    assert.equal(outcome.status, 'OVERTURNED');
    assert.ok(await publicListing(ctx.testDb.db, listingId), 'the advert is back');

    // The original decision is still readable, and so is the reversal.
    const [report] = await ctx.testDb.db
      .select()
      .from(moderationReports)
      .where(eq(moderationReports.listingId, listingId))
      .limit(1);
    assert.equal(report!.decision, 'HIDE');
    assert.equal(report!.status, 'ACTIONED');
    const [stored] = await ctx.testDb.db
      .select()
      .from(moderationAppeals)
      .where(eq(moderationAppeals.id, appeal.id))
      .limit(1);
    assert.equal(stored!.status, 'OVERTURNED');
    assert.equal(stored!.decisionReasonFa, 'SYNTHETIC مدرک پذیرفته شد');
    // Answering it twice is refused.
    await assert.rejects(
      decideAppeal(ctx.testDb.db, moderator, {
        appealId: appeal.id,
        uphold: true,
        reasonFa: 'SYNTHETIC دوباره',
      }),
      code('CONFLICT'),
    );
  });
});
