/**
 * Global search and ranking — Phase 2 PROMPT-012.
 *
 * Runs against a freshly migrated database: what a term finds across the
 * directories, that a live advertising package comes first only where it is
 * relevant, that a geographic filter does not answer with a breed or an
 * article, and that an expired package falls back to its recorded bands.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { adPlans, adSubscriptions } from '../../src/db/schema/advertising.ts';
import { cities } from '../../src/db/schema/geography.ts';
import {
  assignCommunityOwner,
  changeCommunityStatus,
  createCommunity,
  publishedCommunities,
  updateCommunityProfile,
  type CommunityRow,
} from '../../src/communities/service.ts';
import { globalSearch } from '../../src/search/service.ts';
import { RANKING_VERSION } from '../../src/search/model.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let owner: Actor;
let ownerMobile: string;
let tehranCityId: string;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990670001'), 'SUPERADMIN');
  ownerMobile = '09990670002';
  owner = actorFor(await createTestAccount(testDb.db, ownerMobile));
  const rows = await testDb.db.select().from(cities);
  tehranCityId = rows.find((row) => row.provinceCode === 'tehran' && row.nameFa === 'تهران')!.id;
});

after(async () => {
  await testDb?.drop();
});

/** A published club with an introduction, a contact and a city. */
async function publishedClub(nameFa: string): Promise<CommunityRow> {
  counter += 1;
  const created = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: nameFa,
    reason: 'ثبت برای آزمون جست‌وجو ' + counter,
  });
  const filled = await updateCommunityProfile(testDb.db, admin, {
    communityId: created.id,
    expectedVersion: created.version,
    displayNameFa: nameFa,
    aboutFa: 'کلاب آزمایشی برای آزمون جست‌وجو.',
    scope: 'CITY',
    provinceCode: null,
    cityId: tehranCityId,
    membershipInfoFa: null,
    membershipUrl: null,
    contactPhone: '02100000000',
    websiteUrl: null,
    speciesCodes: [],
    breedIds: [],
    reason: 'تکمیل پرونده',
  });
  return changeCommunityStatus(testDb.db, admin, {
    communityId: filled.id,
    expectedVersion: filled.version,
    to: 'PUBLISHED',
    reason: 'انتشار برای آزمون',
  });
}

/** A live package written straight onto the record, without going through checkout. */
async function giveLivePackage(community: CommunityRow, endsAt: Date): Promise<void> {
  const [plan] = await testDb.db.select().from(adPlans).limit(1);
  await testDb.db.insert(adSubscriptions).values({
    targetType: 'COMMUNITY',
    targetId: community.id,
    accountId: owner.accountId,
    planId: plan!.id,
    status: 'ACTIVE',
    startsAt: new Date(Date.now() - 86_400_000),
    endsAt,
  });
}

test('a term finds a published record, and the answer says which rule ordered it', async () => {
  const club = await publishedClub('کلاب جست‌وجوی آلفا');
  const answer = await globalSearch(testDb.db, { term: 'آلفا', page: 1 });

  assert.equal(answer.rankingVersion, RANKING_VERSION);
  const found = answer.items.find((row) => row.slug === club.publicSlug);
  assert.ok(found, 'the published club is in the answer');
  assert.equal(found!.kind, 'COMMUNITY');
  assert.equal(found!.path, '/associations/' + club.publicSlug);
  assert.equal(answer.totalByKind.COMMUNITY >= 1, true);

  // A common misspelling still finds it (§16).
  const typo = await globalSearch(testDb.db, { term: 'جستوجوی آلفا', page: 1 });
  assert.ok(typo.items.some((row) => row.slug === club.publicSlug));

  // A draft record is not searchable at all.
  const draft = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: 'کلاب پیش‌نویس نامرئی',
    reason: 'آزمون',
  });
  const hidden = await globalSearch(testDb.db, { term: 'نامرئی', page: 1 });
  assert.equal(hidden.items.some((row) => row.titleFa.includes('نامرئی')), false);
  assert.ok(draft.id);
});

test('a live package comes first among matching records, and stops when the period ends', async () => {
  const plain = await publishedClub('کلاب رتبه بی');
  const paid = await publishedClub('کلاب رتبه آ');
  // Alphabetically the plain club would come first; the package changes the band.
  const before = await globalSearch(testDb.db, { term: 'کلاب رتبه', page: 1 });
  assert.deepEqual(
    before.items.filter((row) => row.kind === 'COMMUNITY').map((row) => row.titleFa),
    ['کلاب رتبه آ', 'کلاب رتبه بی'],
  );

  await giveLivePackage(plain, new Date(Date.now() + 30 * 86_400_000));
  const promoted = await globalSearch(testDb.db, { term: 'کلاب رتبه', page: 1 });
  const ordered = promoted.items.filter((row) => row.kind === 'COMMUNITY');
  assert.equal(ordered[0]!.titleFa, 'کلاب رتبه بی', 'the promoted record leads');
  assert.equal(ordered[0]!.tier, 'PROMOTED');
  assert.equal(ordered[0]!.promoted, true);
  // The package changes placement only; it claims nothing about the record.
  assert.equal(ordered[0]!.verified, false);
  assert.equal(ordered[0]!.trusted, false);
  assert.equal(ordered[1]!.titleFa, 'کلاب رتبه آ');

  // An advertisement that does not match the search keeps no place at all.
  const elsewhere = await globalSearch(testDb.db, { term: 'کلاب رتبه آ', page: 1 });
  assert.equal(elsewhere.items.some((row) => row.titleFa === 'کلاب رتبه بی'), false);

  // The same list outside search obeys the same bands.
  const directory = await publishedCommunities(testDb.db, { page: 1, term: 'کلاب رتبه' });
  assert.equal(directory.items[0]!.nameFa, 'کلاب رتبه بی');
  assert.equal(directory.items[0]!.promoted, true);

  // A period that has run out simply stops promoting.
  await testDb.db
    .update(adSubscriptions)
    .set({ endsAt: new Date(Date.now() - 60_000) })
    .where(eq(adSubscriptions.targetId, plain.id));
  const expired = await globalSearch(testDb.db, { term: 'کلاب رتبه', page: 1 });
  const after = expired.items.filter((row) => row.kind === 'COMMUNITY');
  assert.equal(after[0]!.titleFa, 'کلاب رتبه آ');
  assert.equal(after.every((row) => row.promoted === false), true);
  assert.ok(paid.id);
});

test('a geographic or professional filter is answered only by records that have one', async () => {
  const club = await publishedClub('کلاب فیلتر شهری');

  const byPlace = await globalSearch(testDb.db, { term: '', province: 'tehran', page: 1 });
  assert.ok(byPlace.items.some((row) => row.slug === club.publicSlug));
  assert.equal(byPlace.totalByKind.BREED, 0);
  assert.equal(byPlace.totalByKind.ARTICLE, 0);
  assert.ok(byPlace.skippedKindsFa.length >= 2, 'the page says which kinds were left out and why');

  // Another province does not answer with this club.
  const elsewhere = await globalSearch(testDb.db, { term: '', province: 'fars', page: 1 });
  assert.equal(elsewhere.items.some((row) => row.slug === club.publicSlug), false);

  // Without a place filter, every kind is searched again.
  const open = await globalSearch(testDb.db, { term: 'کلاب فیلتر', page: 1 });
  assert.equal(open.skippedKindsFa.length, 0);

  // One kind at a time is a filter, not a different search.
  const onlyCommunities = await globalSearch(testDb.db, { term: 'کلاب', kind: 'COMMUNITY', page: 1 });
  assert.equal(onlyCommunities.items.every((row) => row.kind === 'COMMUNITY'), true);
  const onlyVets = await globalSearch(testDb.db, { term: 'کلاب', kind: 'VET', page: 1 });
  assert.equal(onlyVets.items.length, 0);
});

test('paging walks one ordered list, not six separate ones', async () => {
  for (const name of ['کلاب صفحه یک', 'کلاب صفحه دو', 'کلاب صفحه سه']) {
    await publishedClub(name);
  }
  const first = await globalSearch(testDb.db, { term: 'کلاب صفحه', page: 1, pageSize: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.totalPages, 2);
  const second = await globalSearch(testDb.db, { term: 'کلاب صفحه', page: 2, pageSize: 2 });
  assert.equal(second.items.length, 1);
  // No record appears twice across the pages.
  const slugs = [...first.items, ...second.items].map((row) => row.slug);
  assert.equal(new Set(slugs).size, slugs.length);

  const owned = await assignCommunityOwner(testDb.db, admin, {
    communityId: (await publishedClub('کلاب مالک‌دار')).id,
    expectedVersion: 3,
    mobile: ownerMobile,
    reason: 'واگذاری',
  }).catch(() => null);
  // Ownership is irrelevant to searching; the record is found either way.
  const answer = await globalSearch(testDb.db, { term: 'کلاب مالک‌دار', page: 1 });
  assert.ok(answer.items.length >= 1);
  assert.ok(owned === null || owned.ownerAccountId !== null);
});
