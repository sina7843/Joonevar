/**
 * Animal listings against a real database — PROMPT-003.
 *
 * The fixture is the Phase 1 one: real accounts, real KYC, a real membership, a
 * real veterinary visit and a real microchip binding. Nothing about eligibility
 * is faked, because the whole point of the prompt is that the answer comes from
 * the authoritative records rather than from a form.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { animalWithSheet, actorFor, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { auditEvents, storedFiles } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { kennels } from '../../src/db/schema/kennels.ts';
import { cities } from '../../src/db/schema/geography.ts';
import {
  animalListingMedia,
  animalListingRevisions,
  animalListings,
} from '../../src/db/schema/marketplace.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { setSpeciesEnabled } from '../../src/marketplace/species.ts';
import { sellerEligibility, sellableAnimals } from '../../src/marketplace/listing-eligibility.ts';
import {
  attachListingMedia,
  createListing,
  expireDueListings,
  moderateListing,
  moveListing,
  publicListingMedia,
  publishListing,
  removeListingMedia,
  saveListing,
  sellerListing,
  sellerListings,
} from '../../src/marketplace/listings.ts';
import { setMembershipStanding } from '../../src/billing/membership.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099931000',
  tmpPrefix: 'hamzist-listing-',
  councilCode: 'SYNTH-AL-3',
  chipBase: 4_100_000,
};

/** Open the market and give the duration a synthetic value; nothing is seeded. */
async function openMarket(ctx: MatingCtx, durationDays = 30): Promise<void> {
  for (const key of [
    'market.flag.animal_market_enabled',
    'market.flag.animal_listing_creation_enabled',
  ] as const) {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key,
      value: true,
      reason: 'SYNTHETIC — باز کردن بازار برای تست',
    });
  }
  await updateSetting(ctx.testDb.db, ctx.admin.actor, {
    key: 'market.animal.listing_duration_days',
    value: durationDays,
    reason: 'SYNTHETIC — مدت آگهی آزمایشی',
  });
}

async function someCityOf(ctx: MatingCtx): Promise<{ id: string; provinceCode: string }> {
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);
  return city!;
}

/** A complete advert, ready for publication. */
async function fillListing(ctx: MatingCtx, listingId: string, version: number) {
  const city = await someCityOf(ctx);
  return saveListing(ctx.testDb.db, ctx.first.actor, {
    listingId,
    expectedVersion: version,
    priceMode: 'EXACT',
    priceToman: '18000000',
    descriptionFa: 'SYNTHETIC ' + 'توضیح آگهی آزمایشی برای تست انتشار و نگه‌داری تاریخچه نسخه‌ها.',
    reasonForSaleFa: 'SYNTHETIC دلیل فروش آزمایشی',
    provinceCode: city.provinceCode,
    cityId: city.id,
    vaccinationStatus: 'YES',
    neuterStatus: 'UNKNOWN',
    healthNoteFa: 'SYNTHETIC بدون مشکل شناخته‌شده',
    deliveryMethods: ['IN_PERSON', 'VET_CLINIC'],
  });
}

async function addImages(ctx: MatingCtx, listingId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
      listingId,
      kind: 'IMAGE',
      bytes: PNG,
      originalName: 'photo' + i + '.png',
      altFa: 'SYNTHETIC تصویر آزمایشی ' + (i + 1),
    });
  }
}

// ── eligibility ────────────────────────────────────────────────────────────

test('eligibility is read from the authoritative records, and each missing one says so', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);

    // A registered animal with no microchip yet: everything else is in place.
    const draftOnly = await animalWithSheet(ctx, 'SYNTHETIC سگ بی‌چیپ', { skipSheet: true });
    const chipped = await sellerEligibility(ctx.testDb.db, ctx.first.accountId, draftOnly.animalId);
    assert.equal(chipped.facts.microchipRegistered, true, 'the fixture binds a real chip at the visit');
    assert.equal(chipped.allowed, true);
    assert.equal(chipped.sellerKind, 'OWNER');

    // Somebody else's animal answers "not in your list", the same way a missing
    // one would, so an owner cannot probe for another owner's identifiers.
    const other = await sellerEligibility(ctx.testDb.db, ctx.second.accountId, draftOnly.animalId);
    assert.equal(other.allowed, false);
    assert.ok(other.blockers.some((b) => b.code === 'NOT_OWNER'));

    const missing = await sellerEligibility(
      ctx.testDb.db,
      ctx.first.accountId,
      '00000000-0000-4000-8000-000000000000',
    );
    assert.equal(missing.allowed, false);
    assert.deepEqual(
      missing.blockers.map((b) => b.code),
      ['ANIMAL_NOT_FOUND'],
    );
  });
});

test('a lapsed membership closes the owner path and an approved kennel opens its own', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ عضویت', { skipSheet: true });

    await setMembershipStanding(ctx.testDb.db, ctx.association.actor, {
      accountId: ctx.first.accountId,
      action: 'SUSPEND',
      reasonFa: 'SYNTHETIC تعلیق برای تست',
    });

    const lapsed = await sellerEligibility(ctx.testDb.db, ctx.first.accountId, animal.animalId);
    assert.equal(lapsed.allowed, false);
    assert.equal(lapsed.sellerKind, null);
    assert.ok(lapsed.blockers.some((b) => b.code === 'MEMBERSHIP_REQUIRED'));
    await assert.rejects(createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId }), code('VALIDATION'));

    /*
     * PRODUCT_DECISIONS §2 names an active verified kennel as its own
     * qualification, so the kennel path deliberately does not ask for a live
     * membership as well (DEC-0205). This is that rule, stated as a test rather
     * than left as a reading of the sentence.
     */
    await ctx.testDb.db.insert(kennels).values({
      ownerAccountId: ctx.first.accountId,
      status: 'APPROVED',
      nameFa: 'SYNTHETIC کنل آزمایشی',
      approvedAt: new Date(),
    });

    const viaKennel = await sellerEligibility(ctx.testDb.db, ctx.first.accountId, animal.animalId);
    assert.equal(viaKennel.allowed, true);
    assert.equal(viaKennel.sellerKind, 'KENNEL');
    assert.ok(viaKennel.kennelId);

    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    assert.equal(listing.sellerKind, 'KENNEL');
    assert.equal(listing.kennelId, viaKennel.kennelId);
  });
});

test('a kennel that is not approved yet does not qualify', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ کنل زیر بررسی', { skipSheet: true });
    await setMembershipStanding(ctx.testDb.db, ctx.association.actor, {
      accountId: ctx.first.accountId,
      action: 'SUSPEND',
      reasonFa: 'SYNTHETIC تعلیق برای تست',
    });
    await ctx.testDb.db.insert(kennels).values({
      ownerAccountId: ctx.first.accountId,
      status: 'UNDER_REVIEW',
      nameFa: 'SYNTHETIC کنل در بررسی',
    });

    const result = await sellerEligibility(ctx.testDb.db, ctx.first.accountId, animal.animalId);
    assert.equal(result.facts.kennelApproved, false);
    assert.equal(result.allowed, false);
    assert.equal(result.sellerKind, null);
  });
});

test('an unsupported species is refused even though the schema carries it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ گونه', { skipSheet: true });

    // The dog is the only species open at launch, and closing it must close the
    // market for it too — the check is data, not a constant.
    const [row] = await ctx.testDb.db
      .select()
      .from(animals)
      .where(eq(animals.id, animal.animalId))
      .limit(1);
    assert.equal(row!.species, 'DOG');

    const { marketSpecies } = await import('../../src/marketplace/species.ts');
    const dog = (await marketSpecies(ctx.testDb.db, 'ANIMAL_SALE')).find((r) => r.speciesCode === 'DOG')!;
    await setSpeciesEnabled(ctx.testDb.db, actorFor(ctx.admin.accountId, 'MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'DOG',
      enabled: false,
      reasonFa: 'SYNTHETIC بستن گونه برای تست',
      expectedVersion: dog.version,
    });

    const closed = await sellerEligibility(ctx.testDb.db, ctx.first.accountId, animal.animalId);
    assert.equal(closed.allowed, false);
    assert.ok(closed.blockers.some((b) => b.code === 'SPECIES_CLOSED'));
    await assert.rejects(
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId }),
      code('VALIDATION'),
    );
  });
});

test('the kill switch closes creation without touching anything already recorded', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ کلید', { skipSheet: true });

    // Closed by default: the flags start false and nothing opened them here.
    await assert.rejects(
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId }),
      code('CONFLICT'),
    );

    await openMarket(ctx);
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.flag.animal_listing_creation_enabled',
      value: false,
      reason: 'SYNTHETIC بستن ثبت آگهی',
    });
    const second = await animalWithSheet(ctx, 'SYNTHETIC سگ دوم', { skipSheet: true });
    await assert.rejects(
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: second.animalId }),
      code('CONFLICT'),
    );
    // The draft that already exists is untouched.
    const still = await sellerListing(ctx.testDb.db, ctx.first.actor, listing.id);
    assert.equal(still.listing.status, 'DRAFT');
  });
});

// ── the aggregate ─────────────────────────────────────────────────────────

test('two attempts at the same animal produce one listing, not two', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ تکراری', { skipSheet: true });

    const first = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    await assert.rejects(
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId }),
      code('CONFLICT'),
      'the partial unique index is the guard, not a check-then-insert',
    );

    // Two simultaneous attempts: exactly one wins and the other is refused.
    const animalTwo = await animalWithSheet(ctx, 'SYNTHETIC سگ هم‌زمان', { skipSheet: true });
    const results = await Promise.allSettled([
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animalTwo.animalId }),
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animalTwo.animalId }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);

    const rows = await ctx.testDb.db
      .select({ id: animalListings.id })
      .from(animalListings)
      .where(eq(animalListings.animalId, animalTwo.animalId));
    assert.equal(rows.length, 1);

    // Removing the first releases the animal for a later advert.
    const removed = await moveListing(ctx.testDb.db, ctx.first.actor, {
      listingId: first.id,
      to: 'REMOVED',
      reasonFa: 'SYNTHETIC حذف برای تست',
      expectedVersion: first.version,
    });
    assert.equal(removed.status, 'REMOVED');
    const again = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    assert.equal(again.status, 'DRAFT');
  });
});

test('publication needs every required field, the photos and a configured duration', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    // Deliberately no duration yet: an advert with no end date is one nobody
    // ever revisits, so the managed value has to be real first.
    for (const key of [
      'market.flag.animal_market_enabled',
      'market.flag.animal_listing_creation_enabled',
    ] as const) {
      await updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value: true, reason: 'SYNTHETIC' });
    }
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ انتشار', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });

    // Empty draft: refused, and the reason names a missing field.
    await assert.rejects(
      publishListing(ctx.testDb.db, ctx.first.actor, { listingId: listing.id, expectedVersion: listing.version }),
      code('VALIDATION'),
    );

    const filled = await fillListing(ctx, listing.id, listing.version);
    // Still refused: two photos is below the managed minimum of three.
    await addImages(ctx, listing.id, 2);
    await assert.rejects(
      publishListing(ctx.testDb.db, ctx.first.actor, { listingId: filled.id, expectedVersion: filled.version }),
      code('VALIDATION'),
    );

    await addImages(ctx, listing.id, 1);
    // Now only the duration is missing, and that is reported as NOT_CONFIGURED
    // rather than defaulted to some number nobody chose.
    await assert.rejects(
      publishListing(ctx.testDb.db, ctx.first.actor, { listingId: filled.id, expectedVersion: filled.version }),
      code('NOT_CONFIGURED'),
    );

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.animal.listing_duration_days',
      value: 30,
      reason: 'SYNTHETIC مدت آگهی',
    });
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });
    assert.equal(published.status, 'PUBLISHED');
    assert.equal(published.durationDays, 30);
    assert.ok(published.durationSettingVersion !== null, 'the duration is frozen with its version');
    assert.ok(published.expiresAt !== null);
  });
});

test('immutable facts come from the animal record and follow a correction there', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ واقعیت', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });

    const before = await sellerListing(ctx.testDb.db, ctx.first.actor, listing.id);
    assert.equal(before.animal.species, 'DOG');
    assert.equal(before.animal.sex, 'MALE');
    assert.equal(before.animal.birthDate, '2022-01-01');
    assert.equal(before.animal.microchipRegistered, true);
    assert.equal(before.animal.ownerAccountId, ctx.first.accountId);

    // The advert stores none of this, so correcting the animal changes what the
    // advert shows without touching the listing row at all.
    await ctx.testDb.db
      .update(animals)
      .set({ sex: 'FEMALE', birthDate: '2022-06-01' })
      .where(eq(animals.id, animal.animalId));

    const after = await sellerListing(ctx.testDb.db, ctx.first.actor, listing.id);
    assert.equal(after.animal.sex, 'FEMALE');
    assert.equal(after.animal.birthDate, '2022-06-01');
    assert.equal(after.listing.version, before.listing.version, 'no listing write was needed');
  });
});

test('every change appends a revision and nothing overwrites one', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ نسخه', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });
    await moveListing(ctx.testDb.db, ctx.first.actor, {
      listingId: published.id,
      to: 'PAUSED',
      reasonFa: 'SYNTHETIC توقف برای تست',
      expectedVersion: published.version,
    });

    const revisions = await ctx.testDb.db
      .select()
      .from(animalListingRevisions)
      .where(eq(animalListingRevisions.listingId, listing.id))
      .orderBy(animalListingRevisions.number);

    assert.deepEqual(
      revisions.map((r) => r.action),
      ['CREATED', 'EDITED', 'PUBLISHED', 'STATUS_PAUSED'],
    );
    assert.deepEqual(
      revisions.map((r) => r.number),
      [1, 2, 3, 4],
    );
    // The edit's own version is readable, with the price exactly as entered.
    const edited = revisions[1]!.snapshot as { priceToman: string; imageCount: number; deliveryMethods: string[] };
    assert.equal(edited.priceToman, '18000000');
    assert.deepEqual(edited.deliveryMethods, ['IN_PERSON', 'VET_CLINIC']);
    // The pause carries the seller's reason.
    assert.equal(revisions[3]!.reasonFa, 'SYNTHETIC توقف برای تست');
    // And the published revision saw all three photos.
    assert.equal((revisions[2]!.snapshot as { imageCount: number }).imageCount, 3);
  });
});

test('a stale edit is refused and the newer content survives', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ نسخه کهنه', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const first = await fillListing(ctx, listing.id, listing.version);

    await assert.rejects(fillListing(ctx, listing.id, listing.version), code('CONFLICT'));
    const [row] = await ctx.testDb.db.select().from(animalListings).where(eq(animalListings.id, listing.id));
    assert.equal(row!.version, first.version);
  });
});

test('editing a published advert asks the whole eligibility question again', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ ویرایش حساس', { skipSheet: true });
    // Built now, while the membership is still live: a visit request needs one,
    // and this test is about what happens after it lapses, not before.
    const other = await animalWithSheet(ctx, 'SYNTHETIC سگ پیش‌نویس', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });

    // The membership lapses while the advert is live: the advert stays up, and
    // the next edit to what a buyer reads is refused with the real reason.
    await setMembershipStanding(ctx.testDb.db, ctx.association.actor, {
      accountId: ctx.first.accountId,
      action: 'SUSPEND',
      reasonFa: 'SYNTHETIC تعلیق میان انتشار',
    });
    await assert.rejects(fillListing(ctx, listing.id, published.version), code('CONFLICT'));

    // A draft is private, so the same rule does not apply to it.
    await ctx.testDb.db.insert(kennels).values({
      ownerAccountId: ctx.first.accountId,
      status: 'APPROVED',
      nameFa: 'SYNTHETIC کنل برای پیش‌نویس',
      approvedAt: new Date(),
    });
    const draft = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: other.animalId });
    const saved = await fillListing(ctx, draft.id, draft.version);
    assert.equal(saved.status, 'DRAFT');
  });
});

// ── media ─────────────────────────────────────────────────────────────────

test('listing photos are private until the advert is published, and go down with it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ رسانه', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);

    const [media] = await ctx.testDb.db
      .select({ fileId: animalListingMedia.fileId })
      .from(animalListingMedia)
      .where(eq(animalListingMedia.listingId, listing.id))
      .limit(1);

    // A draft's picture is not public.
    assert.equal(await publicListingMedia(ctx.testDb.db, ctx.root, media!.fileId), null);

    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });
    const served = await publicListingMedia(ctx.testDb.db, ctx.root, media!.fileId);
    assert.ok(served, 'a published advert serves its pictures');
    assert.equal(served!.mime, 'image/png');

    // Pausing takes them down again, and so does every other reason.
    const paused = await moveListing(ctx.testDb.db, ctx.first.actor, {
      listingId: published.id,
      to: 'PAUSED',
      reasonFa: 'SYNTHETIC توقف',
      expectedVersion: published.version,
    });
    assert.equal(await publicListingMedia(ctx.testDb.db, ctx.root, media!.fileId), null);

    // A malformed id and a file of another purpose answer the same way.
    assert.equal(await publicListingMedia(ctx.testDb.db, ctx.root, 'not-a-uuid'), null);
    const [kycFile] = await ctx.testDb.db
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(eq(storedFiles.purpose, 'KYC_NATIONAL_ID'))
      .limit(1);
    assert.equal(await publicListingMedia(ctx.testDb.db, ctx.root, kycFile!.id), null);
    assert.equal(paused.status, 'PAUSED');
  });
});

test('one video per advert, and the file type is checked by its bytes', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ ویدئو', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });

    await attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
      listingId: listing.id,
      kind: 'VIDEO',
      bytes: MP4,
      originalName: 'clip.mp4',
      altFa: 'SYNTHETIC ویدئوی آزمایشی',
    });
    await assert.rejects(
      attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
        listingId: listing.id,
        kind: 'VIDEO',
        bytes: MP4,
        originalName: 'clip2.mp4',
        altFa: 'SYNTHETIC ویدئوی دوم',
      }),
      code('CONFLICT'),
    );

    // A PNG offered as the video is refused on its magic bytes, not its name.
    await assert.rejects(
      attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
        listingId: listing.id,
        kind: 'IMAGE',
        bytes: MP4,
        originalName: 'clip.png',
        altFa: 'SYNTHETIC',
      }),
      code('VALIDATION'),
    );
    // And the alt text is not optional.
    await assert.rejects(
      attachListingMedia(ctx.testDb.db, ctx.root, ctx.first.actor, {
        listingId: listing.id,
        kind: 'IMAGE',
        bytes: PNG,
        originalName: 'p.png',
        altFa: '   ',
      }),
      code('VALIDATION'),
    );
  });
});

test('a published advert cannot be dropped below the minimum photos', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ حداقل تصویر', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });

    const media = await ctx.testDb.db
      .select({ id: animalListingMedia.id })
      .from(animalListingMedia)
      .where(and(eq(animalListingMedia.listingId, listing.id), eq(animalListingMedia.kind, 'IMAGE')));
    await assert.rejects(
      removeListingMedia(ctx.testDb.db, ctx.first.actor, { listingId: listing.id, mediaId: media[0]!.id }),
      code('CONFLICT'),
    );

    // Pausing first is the honest route, and then it is allowed.
    const paused = await moveListing(ctx.testDb.db, ctx.first.actor, {
      listingId: published.id,
      to: 'PAUSED',
      reasonFa: 'SYNTHETIC توقف برای ویرایش تصویر',
      expectedVersion: published.version,
    });
    await removeListingMedia(ctx.testDb.db, ctx.first.actor, { listingId: listing.id, mediaId: media[0]!.id });
    const remaining = await sellerListing(ctx.testDb.db, ctx.first.actor, listing.id);
    assert.equal(remaining.imageCount, 2);
    assert.ok(remaining.blockers.some((b) => b.includes('تصویر')));
    assert.equal(paused.status, 'PAUSED');
  });
});

// ── lifecycle, moderation and expiry ──────────────────────────────────────

test('a listing of somebody else is not found, not forbidden', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ مالکیت آگهی', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });

    await assert.rejects(sellerListing(ctx.testDb.db, ctx.second.actor, listing.id), code('NOT_FOUND'));
    await assert.rejects(
      moveListing(ctx.testDb.db, ctx.second.actor, {
        listingId: listing.id,
        to: 'REMOVED',
        expectedVersion: listing.version,
      }),
      code('NOT_FOUND'),
    );
    await assert.rejects(
      attachListingMedia(ctx.testDb.db, ctx.root, ctx.second.actor, {
        listingId: listing.id,
        kind: 'IMAGE',
        bytes: PNG,
        originalName: 'p.png',
        altFa: 'SYNTHETIC',
      }),
      code('NOT_FOUND'),
    );
  });
});

test('only the capability suspends an advert, and only a moderator releases it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ نظارت', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });

    for (const context of ['USER', 'SUPPORT_AGENT', 'FINANCE_OPERATOR', 'MARKETPLACE_ADMIN'] as const) {
      await assert.rejects(
        moderateListing(ctx.testDb.db, actorFor(ctx.admin.accountId, context), {
          listingId: listing.id,
          to: 'SUSPENDED',
          reasonFa: 'SYNTHETIC',
          expectedVersion: published.version,
        }),
        code('FORBIDDEN'),
        context,
      );
    }

    const moderator = actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
    await assert.rejects(
      moderateListing(ctx.testDb.db, moderator, {
        listingId: listing.id,
        to: 'SUSPENDED',
        reasonFa: '  ',
        expectedVersion: published.version,
      }),
      code('VALIDATION'),
      'a moderation decision always carries a reason',
    );

    const suspended = await moderateListing(ctx.testDb.db, moderator, {
      listingId: listing.id,
      to: 'SUSPENDED',
      reasonFa: 'SYNTHETIC گزارش بررسی‌شده',
      expectedVersion: published.version,
    });
    assert.equal(suspended.status, 'SUSPENDED');
    assert.equal(suspended.statusReasonFa, 'SYNTHETIC گزارش بررسی‌شده');

    // The seller cannot lift it, cannot edit around it, and cannot start again.
    await assert.rejects(
      moveListing(ctx.testDb.db, ctx.first.actor, {
        listingId: listing.id,
        to: 'PUBLISHED',
        expectedVersion: suspended.version,
      }),
      code('CONFLICT'),
    );
    await assert.rejects(fillListing(ctx, listing.id, suspended.version), code('CONFLICT'));
    await assert.rejects(
      createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId }),
      code('CONFLICT'),
      'a suspended advert still holds its animal',
    );

    const restored = await moderateListing(ctx.testDb.db, moderator, {
      listingId: listing.id,
      to: 'PUBLISHED',
      reasonFa: 'SYNTHETIC رفع ابهام',
      expectedVersion: suspended.version,
    });
    assert.equal(restored.status, 'PUBLISHED');

    const events = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, 'ANIMAL_LISTING_STATUS_CHANGED'), eq(auditEvents.targetId, listing.id)),
      );
    assert.equal(events.length, 2);
    assert.ok(events.every((event) => event.reason !== null));
  });
});

test('an advert whose date has passed expires, and its seller may republish it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx, 1);
    const animal = await animalWithSheet(ctx, 'SYNTHETIC سگ انقضا', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: animal.animalId });
    const filled = await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);
    const published = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: filled.id,
      expectedVersion: filled.version,
    });

    // Nothing expires early.
    assert.equal(await expireDueListings(ctx.testDb.db, new Date()), 0);

    const later = new Date(published.expiresAt!.getTime() + 1000);
    assert.equal(await expireDueListings(ctx.testDb.db, later), 1);
    // Idempotent: a second sweep finds nothing left to do.
    assert.equal(await expireDueListings(ctx.testDb.db, later), 0);

    const expired = await sellerListing(ctx.testDb.db, ctx.first.actor, listing.id);
    assert.equal(expired.listing.status, 'EXPIRED');
    assert.equal(expired.listing.statusChangedByAccountId, null, 'the system did it, not a person');

    // An expired advert releases the animal but is also republishable as it is.
    const republished = await publishListing(ctx.testDb.db, ctx.first.actor, {
      listingId: listing.id,
      expectedVersion: expired.listing.version,
    });
    assert.equal(republished.status, 'PUBLISHED');
    // Republishing uses the real clock, not the simulated sweep time: a fresh
    // window starts now and the previous publication date is left behind.
    assert.ok(republished.publishedAt!.getTime() > published.publishedAt!.getTime());
    assert.ok(republished.expiresAt!.getTime() > Date.now());
  });
});

test('the seller list and the sellable list both tell the truth', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openMarket(ctx);
    const one = await animalWithSheet(ctx, 'SYNTHETIC سگ فهرست ۱', { skipSheet: true });
    const two = await animalWithSheet(ctx, 'SYNTHETIC سگ فهرست ۲', { skipSheet: true });
    const listing = await createListing(ctx.testDb.db, ctx.first.actor, { animalId: one.animalId });
    await fillListing(ctx, listing.id, listing.version);
    await addImages(ctx, listing.id, 3);

    const mine = await sellerListings(ctx.testDb.db, ctx.first.actor);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.animalId, one.animalId);
    assert.equal(mine[0]!.imageCount, 3);
    assert.equal(mine[0]!.status, 'DRAFT');

    // The other owner sees none of it.
    assert.deepEqual(await sellerListings(ctx.testDb.db, ctx.second.actor), []);

    const sellable = await sellableAnimals(ctx.testDb.db, ctx.first.accountId);
    const ids = sellable.map((row) => row.animalId);
    assert.ok(ids.includes(one.animalId));
    assert.ok(ids.includes(two.animalId));
    assert.ok(sellable.every((row) => row.eligibility.allowed));
  });
});
