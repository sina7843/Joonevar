/**
 * Places and local pages — Phase 2 PROMPT-015.
 *
 * Runs against a freshly migrated database: the seeded provinces and their
 * capitals, the slug the migration filled, what a place counts, and the rule
 * that a place with nothing published is not offered to a search engine.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq, isNull } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { cities, provinces } from '../../src/db/schema/geography.ts';
import {
  changeCommunityStatus,
  createCommunity,
  updateCommunityProfile,
  type CommunityRow,
} from '../../src/communities/service.ts';
import { cityPage, placeSitemapEntries, provincePage, provinceSummaries } from '../../src/geo/service.ts';
import { readSetting } from '../../src/settings/service.ts';
import { citySlug } from '../../src/geo/model.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let tehranCityId: string;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990690001'), 'SUPERADMIN');
  const rows = await testDb.db.select().from(cities);
  tehranCityId = rows.find((row) => row.provinceCode === 'tehran' && row.nameFa === 'تهران')!.id;
});

after(async () => {
  await testDb?.drop();
});

/** A published club in one city, which is what a local page counts. */
async function publishedClubIn(cityId: string | null, provinceCode: string | null): Promise<CommunityRow> {
  counter += 1;
  const created = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: 'کلاب مکان ' + counter,
    reason: 'ثبت برای آزمون صفحات محلی',
  });
  const filled = await updateCommunityProfile(testDb.db, admin, {
    communityId: created.id,
    expectedVersion: created.version,
    displayNameFa: created.displayNameFa,
    aboutFa: 'کلاب آزمایشی صفحات محلی.',
    scope: cityId === null ? 'PROVINCIAL' : 'CITY',
    provinceCode,
    cityId,
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

test('the migration gives every seeded city a stable address derived from its name', async () => {
  const rows = await testDb.db.select().from(cities);
  assert.ok(rows.length >= 31, 'the provincial capitals are seeded');
  assert.equal((await testDb.db.select().from(cities).where(isNull(cities.slug))).length, 0, 'no city is left without a slug');
  for (const row of rows) {
    assert.equal(row.slug, citySlug(row.nameFa), row.nameFa);
  }
  // Provinces keep their own latin code as their address.
  const provinceRows = await testDb.db.select().from(provinces);
  assert.equal(provinceRows.length, 31);
  assert.ok(provinceRows.every((row) => /^[a-z-]+$/.test(row.code)));
});

test('a place counts only what is published in it, and an empty place is not indexable', async () => {
  const before = await provinceSummaries(testDb.db);
  assert.equal(before.length, 31, 'every province has its page, published or not');
  assert.equal(before.every((entry) => entry.total === 0), true, 'nothing is published yet');
  assert.equal(before.find((entry) => entry.province.code === 'tehran')!.path, '/places/tehran');

  // A draft record changes nothing: only published records are counted.
  const draft = await createCommunity(testDb.db, admin, {
    kind: 'CLUB',
    displayNameFa: 'کلاب پیش‌نویس مکان',
    reason: 'آزمون',
  });
  assert.ok(draft.id);
  assert.equal((await provincePage(testDb.db, 'tehran'))!.counts.communities, 0);

  await publishedClubIn(tehranCityId, null);
  const page = await provincePage(testDb.db, 'tehran');
  assert.equal(page!.counts.communities, 1);
  assert.equal(page!.indexable, true);
  const city = page!.cities.find((entry) => entry.city.nameFa === 'تهران')!;
  assert.equal(city.total, 1);
  assert.equal(city.path, '/places/tehran/تهران');

  // Another province is untouched by it.
  const fars = await provincePage(testDb.db, 'fars');
  assert.equal(fars!.counts.communities, 0);
  assert.equal(fars!.indexable, false);
});

test('a city page answers by its slug, and an unknown place is simply not found', async () => {
  const city = await cityPage(testDb.db, 'tehran', 'تهران');
  assert.equal(city!.city.nameFa, 'تهران');
  assert.equal(city!.province.nameFa, 'تهران');
  assert.equal(city!.indexable, true);

  assert.equal(await cityPage(testDb.db, 'tehran', 'شهر-ناموجود'), null);
  assert.equal(await cityPage(testDb.db, 'no-such-province', 'تهران'), null);
  assert.equal(await provincePage(testDb.db, 'no-such-province'), null);
});

test('the sitemap offers a place only once something is published there', async () => {
  const entries = await placeSitemapEntries(testDb.db);
  const paths = entries.map((entry) => entry.path);
  assert.equal(paths[0], '/places');
  assert.ok(paths.includes('/places/tehran'));
  assert.ok(paths.includes('/places/tehran/تهران'));
  // Provinces and cities with nothing published stay out of the sitemap.
  assert.equal(paths.includes('/places/fars'), false);
  assert.equal(paths.includes('/places/tehran/دماوند'), false);
  assert.equal(new Set(paths).size, paths.length, 'no address is offered twice');
});

test('the seed leaves the map unconfigured, so no map can be drawn yet', async () => {
  // Read straight from the managed settings: the provider's URL format is not
  // in the sources and is never guessed, so both stay empty until an operator
  // records them (DEC-0175). `mapConfig` itself needs the app environment and
  // is exercised by the browser suite instead.
  const template = await readSetting(testDb.db, 'integration.map.embed_url_template');
  const key = await readSetting(testDb.db, 'integration.map.api_key');
  assert.equal(template.value, null);
  assert.equal(key.value, null);
});
