/**
 * Veterinary directory — Phase 2 PROMPT-006.
 *
 * Runs against a freshly migrated database: the place, specialty and species
 * seed and the backfill of Phase 1 free text; superadmin-only writes with
 * reason, version and field-by-field audit; publication with a stable address;
 * consent-gated contact; inactive locations; filters over separate status axes;
 * and the Phase 1 registry and Finder left as they were.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, accounts, auditEvents, species } from '../../src/db/schema/core.ts';
import { cities, provinces } from '../../src/db/schema/geography.ts';
import { vetLocations, vetSpecialties } from '../../src/db/schema/vets.ts';
import { addLocation, searchFinder, updateLocation, upsertVetProfile } from '../../src/vets/registry.ts';
import {
  addCity,
  changeVetPublicStatus,
  publishedVets,
  updateLocationPublic,
  updateVetPublicProfile,
  vetDirectoryEditor,
  vetPageBySlug,
  vetSitemapEntries,
  type VetDirectoryQuery,
  type VetPublicProfileInput,
} from '../../src/vets/directory.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let user: Actor;
let counter = 0;
let tehranCityId: string;
let shirazCityId: string;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990600001'), 'SUPERADMIN');
  user = actorFor(await createTestAccount(testDb.db, '09990600002'));
  const rows = await testDb.db.select().from(cities);
  tehranCityId = rows.find((row) => row.provinceCode === 'tehran' && row.nameFa === 'تهران')!.id;
  shirazCityId = rows.find((row) => row.provinceCode === 'fars' && row.nameFa === 'شیراز')!.id;
});

after(async () => {
  await testDb?.drop();
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const ARABIC_YEH = String.fromCharCode(0x064a);

async function newVet(label: string, options: { role?: 'ACTIVE' | 'SUSPENDED'; kind?: 'CLINIC' | 'HOSPITAL' } = {}) {
  counter += 1;
  const mobile = '0999061' + String(counter).padStart(4, '0');
  const accountId = await createTestAccount(testDb.db, mobile);
  await testDb.db
    .insert(accountRoles)
    .values({ accountId, role: 'TRUSTED_VET', status: options.role ?? 'ACTIVE', grantedAt: new Date() });
  const profile = await upsertVetProfile(testDb.db, admin, {
    mobile,
    displayNameFa: label + ' ' + counter,
    councilCode: 'SYN-DIR-' + counter,
    phone: '0210000' + String(counter).padStart(4, '0'),
  });
  const location = await addLocation(testDb.db, admin, accountId, {
    nameFa: 'کلینیک ' + label + ' ' + counter,
    kind: options.kind ?? 'CLINIC',
    provinceFa: 'تهران',
    cityFa: 'تهران',
    addressFa: 'نشانی آزمایشی',
    phone: '02100000000',
    licenceStatus: 'VALID',
    canImplantMicrochip: true,
    canDrawBloodSample: true,
  });
  return { mobile, accountId, profile, location };
}

const profileInput = (
  profileId: string,
  expectedVersion: number,
  patch: Partial<VetPublicProfileInput> = {},
): VetPublicProfileInput => ({
  profileId,
  expectedVersion,
  headlineFa: null,
  bioFa: null,
  experienceFa: null,
  showPhone: false,
  showCouncilCode: false,
  specialtyCodes: [],
  speciesCodes: [],
  reason: 'SYNTHETIC دلیل آزمایشی',
  ...patch,
});

async function publishedVet(
  label: string,
  options: { profile?: Partial<VetPublicProfileInput>; cityId?: string; role?: 'ACTIVE' | 'SUSPENDED'; kind?: 'CLINIC' | 'HOSPITAL' } = {},
) {
  const vet = await newVet(label, options);
  const location = await updateLocationPublic(testDb.db, admin, {
    locationId: vet.location.id,
    expectedVersion: vet.location.version,
    isPublic: true,
    provinceCode: null,
    cityId: options.cityId ?? tehranCityId,
    hoursNoteFa: null,
    reason: 'SYNTHETIC',
  });
  const saved = await updateVetPublicProfile(
    testDb.db,
    admin,
    profileInput(vet.profile.id, vet.profile.version, { bioFa: 'معرفی آزمایشی', ...options.profile }),
  );
  const profile = await changeVetPublicStatus(testDb.db, admin, {
    profileId: vet.profile.id,
    expectedVersion: saved.version,
    to: 'PUBLISHED',
    reason: 'SYNTHETIC',
  });
  return { ...vet, location, profile };
}

async function events(action: string, targetId: string) {
  return testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), eq(auditEvents.targetId, targetId)));
}

test('the migration seeds places, specialties and the cat, and links Phase 1 free text without rewriting it', async () => {
  const provinceRows = await testDb.db.select().from(provinces);
  assert.equal(provinceRows.length, 31);
  const cityRows = await testDb.db.select().from(cities);
  assert.ok(provinceRows.every((p) => cityRows.some((c) => c.provinceCode === p.code)), 'every province has its capital');
  assert.equal((await testDb.db.select().from(vetSpecialties)).length, 15);
  assert.deepEqual((await testDb.db.select().from(species)).map((row) => row.code).sort(), ['CAT', 'DOG']);

  // A location recorded before this migration, spelled with an Arabic yeh.
  const vet = await newVet('پیوند');
  const spelled = 'ش' + ARABIC_YEH + 'راز';
  await testDb.db
    .update(vetLocations)
    .set({ provinceFa: 'فارس', cityFa: spelled, provinceCode: null, cityId: null })
    .where(eq(vetLocations.id, vet.location.id));
  const unknown = await addLocation(testDb.db, admin, vet.accountId, {
    nameFa: 'مطب شهر ناشناخته',
    provinceFa: 'استان ناشناخته',
    cityFa: 'شهر ناشناخته',
  });

  // The backfill statements exactly as the migration runs them.
  const migration = await fs.readFile('src/db/migrations/0020_vet-directory.sql', 'utf8');
  const backfill = migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.includes('UPDATE "vet_location"'));
  assert.equal(backfill.length, 2);
  for (const statement of backfill) await testDb.db.execute(sql.raw(statement));

  const [linked] = await testDb.db.select().from(vetLocations).where(eq(vetLocations.id, vet.location.id));
  assert.equal(linked!.provinceCode, 'fars');
  assert.equal(linked!.cityId, shirazCityId);
  assert.equal(linked!.cityFa, spelled, 'the recorded text stays as history');
  const [unlinked] = await testDb.db.select().from(vetLocations).where(eq(vetLocations.id, unknown.id));
  assert.equal(unlinked!.provinceCode, null);
  assert.equal(unlinked!.cityId, null);
});

test('only the superadmin edits the directory', async () => {
  const vet = await newVet('دسترسی');
  const vetActor = actorFor(vet.accountId, 'TRUSTED_VET');
  await assert.rejects(
    () => updateVetPublicProfile(testDb.db, user, profileInput(vet.profile.id, vet.profile.version, { bioFa: 'x' })),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => updateVetPublicProfile(testDb.db, actorFor(user.accountId, 'TRUSTED_VET'), profileInput(vet.profile.id, vet.profile.version, { bioFa: 'x' })),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () =>
      changeVetPublicStatus(testDb.db, user, {
        profileId: vet.profile.id,
        expectedVersion: vet.profile.version,
        to: 'PUBLISHED',
        reason: 'x',
      }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () =>
      updateLocationPublic(testDb.db, user, {
        locationId: vet.location.id,
        expectedVersion: vet.location.version,
        isPublic: true,
        provinceCode: null,
        cityId: tehranCityId,
        hoursNoteFa: null,
        reason: 'x',
      }),
    code('FORBIDDEN'),
  );
  await assert.rejects(() => addCity(testDb.db, user, { provinceCode: 'tehran', nameFa: 'x' }), code('FORBIDDEN'));
  await assert.rejects(() => vetDirectoryEditor(testDb.db, vetActor, vet.accountId), code('FORBIDDEN'));
  // An address that is not a veterinarian is not found, whatever it looks like.
  assert.equal(await vetDirectoryEditor(testDb.db, admin, 'not-a-uuid'), null);
  assert.equal(await vetDirectoryEditor(testDb.db, admin, user.accountId), null);
});

test('a profile change needs a reason, is audited field by field and refuses a stale version', async () => {
  const vet = await newVet('ویرایش');
  const { accountId } = vet;
  const profileId = vet.profile.id;
  await assert.rejects(
    () => updateVetPublicProfile(testDb.db, admin, profileInput(profileId, vet.profile.version, { bioFa: 'x', reason: '  ' })),
    code('VALIDATION'),
  );
  await assert.rejects(
    () =>
      updateVetPublicProfile(
        testDb.db,
        admin,
        profileInput(profileId, vet.profile.version, { specialtyCodes: ['NOT_A_SPECIALTY'] }),
      ),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => updateVetPublicProfile(testDb.db, admin, profileInput(profileId, vet.profile.version, { speciesCodes: ['HORSE'] })),
    code('VALIDATION'),
  );

  const patch = {
    headlineFa: 'دامپزشک حیوانات کوچک',
    bioFa: 'معرفی',
    specialtyCodes: ['SURGERY', 'DERMATOLOGY', 'SURGERY'],
    speciesCodes: ['DOG', 'CAT'],
    showPhone: true,
  };
  const saved = await updateVetPublicProfile(
    testDb.db,
    admin,
    profileInput(profileId, vet.profile.version, { ...patch, reason: 'اطلاعات اعلام‌شده دامپزشک' }),
  );
  assert.equal(saved.version, vet.profile.version + 1);

  const [event] = await events('VET_PUBLIC_PROFILE_UPDATED', saved.id);
  assert.equal(event!.actorAccountId, admin.accountId);
  assert.equal(event!.reason, 'اطلاعات اعلام‌شده دامپزشک');
  assert.equal(event!.targetVersion, saved.version);
  assert.deepEqual(event!.before, { headlineFa: null, bioFa: null, showPhone: false, specialtyCodes: [], speciesCodes: [] });
  assert.deepEqual(event!.after, {
    headlineFa: 'دامپزشک حیوانات کوچک',
    bioFa: 'معرفی',
    showPhone: true,
    specialtyCodes: ['DERMATOLOGY', 'SURGERY'],
    speciesCodes: ['CAT', 'DOG'],
  });

  // Someone saved first: the older form is refused, not merged over.
  await assert.rejects(
    () => updateVetPublicProfile(testDb.db, admin, profileInput(profileId, vet.profile.version, { bioFa: 'دیگر' })),
    code('CONFLICT'),
  );
  // The same values again change nothing and record nothing.
  const same = await updateVetPublicProfile(testDb.db, admin, profileInput(profileId, saved.version, patch));
  assert.equal(same.version, saved.version);
  assert.equal((await events('VET_PUBLIC_PROFILE_UPDATED', saved.id)).length, 1);

  // Saving the Phase 1 registry form, which has no bio field, keeps the directory's bio.
  const registry = await upsertVetProfile(testDb.db, admin, {
    mobile: vet.mobile,
    displayNameFa: saved.displayNameFa,
    councilCode: saved.councilCode!,
    phone: saved.phone,
  });
  assert.equal(registry.bioFa, 'معرفی');
  const editor = await vetDirectoryEditor(testDb.db, admin, accountId);
  assert.deepEqual(editor!.facts.specialtyCodes, ['DERMATOLOGY', 'SURGERY']);
  assert.equal(editor!.completeness.complete, false);
});

test('a location is placed and shown without touching what the Finder reads', async () => {
  const vet = await newVet('محل');
  const base = { locationId: vet.location.id, expectedVersion: vet.location.version, hoursNoteFa: null, reason: 'SYNTHETIC' };
  await assert.rejects(
    () => updateLocationPublic(testDb.db, admin, { ...base, isPublic: true, provinceCode: null, cityId: null }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => updateLocationPublic(testDb.db, admin, { ...base, isPublic: false, provinceCode: 'tehran', cityId: shirazCityId }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => updateLocationPublic(testDb.db, admin, { ...base, isPublic: false, provinceCode: 'nowhere', cityId: null }),
    code('VALIDATION'),
  );

  const finderBefore = (await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id);
  const saved = await updateLocationPublic(testDb.db, admin, {
    ...base,
    isPublic: true,
    provinceCode: null,
    cityId: tehranCityId,
    hoursNoteFa: 'شنبه تا پنجشنبه، ۹ تا ۱۷',
  });
  assert.equal(saved.provinceCode, 'tehran', 'the province follows the city');
  assert.equal(saved.version, vet.location.version + 1);
  for (const key of [
    'licenceStatus',
    'canImplantMicrochip',
    'canDrawBloodSample',
    'canPregnancyCheck',
    'provinceFa',
    'cityFa',
    'addressFa',
    'phone',
    'isActive',
  ] as const) {
    assert.equal(saved[key], vet.location[key], key);
  }
  assert.deepEqual((await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id), finderBefore);

  const [event] = await events('VET_LOCATION_PUBLIC_UPDATED', saved.id);
  assert.equal(event!.reason, 'SYNTHETIC');
  assert.deepEqual(event!.before, { isPublic: false, provinceCode: null, cityId: null, hoursNoteFa: null });
  assert.equal((event!.after as { isPublic: boolean }).isPublic, true);

  await assert.rejects(
    () => updateLocationPublic(testDb.db, admin, { ...base, isPublic: false, provinceCode: null, cityId: tehranCityId }),
    code('CONFLICT'),
  );

  // A location Phase 1 closed is history: it cannot be made public.
  const closed = await updateLocation(testDb.db, admin, saved.id, { nameFa: saved.nameFa, isActive: false }, saved.version);
  await assert.rejects(
    () =>
      updateLocationPublic(testDb.db, admin, {
        ...base,
        expectedVersion: closed.version,
        isPublic: true,
        provinceCode: null,
        cityId: tehranCityId,
      }),
    code('VALIDATION'),
  );
});

test('publishing needs the essentials, keeps one address, and a hidden page is not found', async () => {
  const vet = await newVet('انتشار');
  const status = (to: string, expectedVersion: number) =>
    changeVetPublicStatus(testDb.db, admin, { profileId: vet.profile.id, expectedVersion, to, reason: 'SYNTHETIC' });

  await assert.rejects(
    () => status('PUBLISHED', vet.profile.version),
    (error: unknown) => code('VALIDATION')(error) && /معرفی/.test(String(error)) && /محل کار/.test(String(error)),
  );
  await assert.rejects(() => status('HIDDEN', vet.profile.version), code('VALIDATION'));
  await assert.rejects(() => status('DRAFT', vet.profile.version), code('VALIDATION'));
  await assert.rejects(
    () => changeVetPublicStatus(testDb.db, admin, { profileId: vet.profile.id, expectedVersion: vet.profile.version, to: 'PUBLISHED', reason: '' }),
    code('VALIDATION'),
  );

  await updateLocationPublic(testDb.db, admin, {
    locationId: vet.location.id,
    expectedVersion: vet.location.version,
    isPublic: true,
    provinceCode: null,
    cityId: tehranCityId,
    hoursNoteFa: null,
    reason: 'SYNTHETIC',
  });
  const saved = await updateVetPublicProfile(testDb.db, admin, profileInput(vet.profile.id, vet.profile.version, { bioFa: 'معرفی' }));
  const finderBefore = (await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id);
  const published = await status('PUBLISHED', saved.version);
  assert.match(published.publicSlug!, /^vet-[0-9a-f]{10}$/);
  assert.ok(published.publicPublishedAt instanceof Date);
  assert.ok(await vetPageBySlug(testDb.db, published.publicSlug!));
  assert.ok((await vetSitemapEntries(testDb.db)).some((entry) => entry.path === '/veterinarians/' + published.publicSlug));
  // Publishing makes nobody eligible for new work.
  assert.deepEqual((await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id), finderBefore);

  await assert.rejects(() => status('PUBLISHED', published.version), code('VALIDATION'));
  const hidden = await status('HIDDEN', published.version);
  assert.equal(await vetPageBySlug(testDb.db, hidden.publicSlug!), null);
  assert.ok(!(await vetSitemapEntries(testDb.db)).some((entry) => entry.path.endsWith(hidden.publicSlug!)));

  const again = await status('PUBLISHED', hidden.version);
  assert.equal(again.publicSlug, published.publicSlug);
  assert.equal(again.publicPublishedAt!.getTime(), published.publicPublishedAt!.getTime());
  const statusEvents = await events('VET_PUBLIC_STATUS_CHANGED', again.id);
  assert.equal(statusEvents.length, 3);
  assert.ok(statusEvents.every((event) => event.reason === 'SYNTHETIC' && event.actorAccountId === admin.accountId));

  // Internal ids and made-up addresses are not pages.
  assert.equal(await vetPageBySlug(testDb.db, again.id), null);
  assert.equal(await vetPageBySlug(testDb.db, 'vet-0000000000'), null);

  // Two simultaneous decisions: one is applied, the other is told it is stale.
  const results = await Promise.allSettled([status('HIDDEN', again.version), status('HIDDEN', again.version)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  assert.ok(code('CONFLICT')(rejected!.reason));
});

test('the public page shows contact only with consent and only active public locations', async () => {
  const vet = await publishedVet('نمایش', {
    profile: { headlineFa: 'جراح', specialtyCodes: ['SURGERY'], speciesCodes: ['CAT'] },
  });
  const slug = vet.profile.publicSlug!;
  let page = await vetPageBySlug(testDb.db, slug);
  assert.equal(page!.phone, null);
  assert.equal(page!.councilCode, null);
  assert.deepEqual(page!.specialtiesFa, ['جراحی']);
  assert.deepEqual(page!.speciesFa, ['گربه']);
  assert.equal(page!.verified, true);
  assert.equal(page!.trusted, true);
  assert.equal(page!.locations.length, 1);
  assert.equal(page!.locations[0]!.cityNameFa, 'تهران');
  assert.equal(page!.locations[0]!.provinceNameFa, 'تهران');

  const consent = await updateVetPublicProfile(
    testDb.db,
    admin,
    profileInput(vet.profile.id, vet.profile.version, {
      bioFa: 'معرفی آزمایشی',
      headlineFa: 'جراح',
      specialtyCodes: ['SURGERY'],
      speciesCodes: ['CAT'],
      showPhone: true,
      showCouncilCode: true,
    }),
  );
  page = await vetPageBySlug(testDb.db, slug);
  assert.equal(page!.phone, consent.phone);
  assert.equal(page!.councilCode, consent.councilCode);

  // A location not marked public stays private; one Phase 1 closes disappears.
  await addLocation(testDb.db, admin, vet.accountId, { nameFa: 'مطب خصوصی', cityFa: 'تهران' });
  assert.equal((await vetPageBySlug(testDb.db, slug))!.locations.length, 1);
  await updateLocation(testDb.db, admin, vet.location.id, { nameFa: vet.location.nameFa, isActive: false }, vet.location.version);
  assert.equal((await vetPageBySlug(testDb.db, slug))!.locations.length, 0);

  // A disabled account takes its page with it.
  await testDb.db.update(accounts).set({ status: 'DISABLED' }).where(eq(accounts.id, vet.accountId));
  assert.equal(await vetPageBySlug(testDb.db, slug), null);
  assert.ok(!(await vetSitemapEntries(testDb.db)).some((entry) => entry.path.endsWith(slug)));
});

test('the list filters by specialty, species, place, kind, each status axis and name', async () => {
  const a = await publishedVet('یاسمن فیلتری', { profile: { specialtyCodes: ['DERMATOLOGY'], speciesCodes: ['DOG'] } });
  const b = await publishedVet('کیان فیلتری', {
    profile: { specialtyCodes: ['SURGERY'], speciesCodes: ['CAT'] },
    cityId: shirazCityId,
    kind: 'HOSPITAL',
    role: 'SUSPENDED',
  });
  await newVet('پیش‌نویس فیلتری');
  const A = a.profile.publicSlug!;
  const B = b.profile.publicSlug!;
  const slugs = async (query: Partial<VetDirectoryQuery>) =>
    (await publishedVets(testDb.db, { term: 'فیلتری', page: 1, ...query })).items.map((item) => item.slug).sort();

  assert.deepEqual(await slugs({}), [A, B].sort(), 'a draft is never listed');
  assert.deepEqual(await slugs({ specialty: 'DERMATOLOGY' }), [A]);
  assert.deepEqual(await slugs({ species: 'CAT' }), [B]);
  assert.deepEqual(await slugs({ province: 'fars' }), [B]);
  assert.deepEqual(await slugs({ cityId: tehranCityId }), [A]);
  assert.deepEqual(await slugs({ kind: 'HOSPITAL' }), [B]);
  assert.deepEqual(await slugs({ status: 'TRUSTED' }), [A], 'a suspended role is not Trusted');
  assert.deepEqual(await slugs({ status: 'VERIFIED' }), [A, B].sort(), 'verification does not depend on the role');
  assert.deepEqual(await slugs({ province: 'fars', kind: 'CLINIC' }), [], 'place and kind match the same location');
  assert.deepEqual(await slugs({ term: ARABIC_YEH + 'اسمن فیلتری' }), [A]);

  const [card] = (await publishedVets(testDb.db, { term: 'کیان فیلتری', page: 1 })).items;
  assert.equal(card!.verified, true);
  assert.equal(card!.trusted, false);
  assert.deepEqual(card!.placesFa, ['شیراز']);
  assert.deepEqual(card!.specialtiesFa, ['جراحی']);

  const paged = await publishedVets(testDb.db, { term: 'فیلتری', page: 2, pageSize: 1 });
  assert.equal(paged.total, 2);
  assert.equal(paged.items.length, 1);
});

test('a city is added once per province', async () => {
  const city = await addCity(testDb.db, admin, { provinceCode: 'tehran', nameFa: '  شهر   ر' + ARABIC_YEH + '  ' });
  assert.equal(city.nameFa, 'شهر ری');
  assert.equal(city.provinceCode, 'tehran');
  await assert.rejects(() => addCity(testDb.db, admin, { provinceCode: 'tehran', nameFa: 'شهر ری' }), code('CONFLICT'));
  // The same name in another province is another city.
  await addCity(testDb.db, admin, { provinceCode: 'fars', nameFa: 'شهر ری' });
  await assert.rejects(() => addCity(testDb.db, admin, { provinceCode: 'nowhere', nameFa: 'شهر' }), code('VALIDATION'));
  await assert.rejects(() => addCity(testDb.db, admin, { provinceCode: 'tehran', nameFa: ' ' }), code('VALIDATION'));
  assert.equal((await events('CITY_CREATED', city.id)).length, 1);
});
