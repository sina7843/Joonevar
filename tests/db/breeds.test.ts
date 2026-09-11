/**
 * Breed bank — Phase 2 PROMPT-003.
 *
 * Runs against a freshly migrated database: the species and FCI taxonomy seed,
 * the breed row Phase 1 already uses, superadmin-only writes with version and
 * audit, publication, medical claims with source and review date, stable
 * addresses, duplicates that rewrite no animal, and the public readers.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, breedGroups, breedMedicalClaims, referenceBreeds, species } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { addBreedToRegistry } from '../../src/operations/service.ts';
import { breedOptions } from '../../src/animals/service.ts';
import {
  addMedicalClaim,
  allocateSlug,
  archiveMedicalClaim,
  breedPageBySlug,
  breedSitemapEntries,
  changeBreedStatus,
  markBreedDuplicate,
  publishedBreeds,
  updateBreedProfile,
  type BreedProfileInput,
  type BreedRow,
} from '../../src/breeds/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let user: Actor;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990700001'), 'SUPERADMIN');
  user = actorFor(await createTestAccount(testDb.db, '09990700002'));
});

after(async () => {
  await testDb?.drop();
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function newBreed(label: string): Promise<BreedRow> {
  counter += 1;
  return addBreedToRegistry(testDb.db, admin, { nameFa: label + ' ' + counter, nameEn: 'Synthetic ' + label + ' ' + counter });
}

async function reload(id: string): Promise<BreedRow> {
  const [row] = await testDb.db.select().from(referenceBreeds).where(eq(referenceBreeds.id, id));
  return row!;
}

const profile = (breed: BreedRow, patch: Partial<BreedProfileInput> = {}): BreedProfileInput => ({
  breedId: breed.id,
  expectedVersion: breed.version,
  nameFa: breed.nameFa,
  nameEn: breed.nameEn,
  slug: breed.slug,
  altNames: breed.altNames,
  speciesCode: breed.speciesCode,
  groupId: breed.groupId,
  originCountry: breed.originCountry,
  size: breed.size,
  coat: breed.coat,
  energy: breed.energy,
  trainability: breed.trainability,
  careNeed: breed.careNeed,
  withChildren: breed.withChildren,
  withOtherAnimals: breed.withOtherAnimals,
  historyFa: breed.historyFa,
  standardFa: breed.standardFa,
  standardUrl: breed.standardUrl,
  ...patch,
});

async function fciGroupId(number: number): Promise<string> {
  const [row] = await testDb.db.select().from(breedGroups).where(eq(breedGroups.fciGroup, number));
  return row!.id;
}

async function published(label: string, patch: Partial<BreedProfileInput> = {}): Promise<BreedRow> {
  const breed = await newBreed(label);
  const edited = await updateBreedProfile(testDb.db, admin, profile(breed, { historyFa: 'تاریخچه آزمایشی', ...patch }));
  return changeBreedStatus(testDb.db, admin, {
    breedId: edited.id,
    expectedVersion: edited.version,
    to: 'PUBLISHED',
    reason: 'آماده انتشار',
  });
}

test('the migration seeds the species and FCI taxonomy, and an animal species is no longer free text', async () => {
  const speciesRows = await testDb.db.select().from(species);
  assert.deepEqual(
    speciesRows.map((row) => row.code),
    ['DOG'],
  );
  const groups = await testDb.db.select().from(breedGroups).orderBy(breedGroups.fciGroup);
  assert.deepEqual(
    groups.map((row) => row.fciGroup),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.ok(groups.every((row) => row.speciesCode === 'DOG' && row.nameFa !== '' && row.nameEn !== ''));

  // The Phase 1 baseline breeds keep their ids and gain an address, a species and a draft page.
  const [shepherd] = await testDb.db.select().from(referenceBreeds).where(eq(referenceBreeds.nameEn, 'German Shepherd'));
  assert.equal(shepherd!.slug, 'german-shepherd');
  assert.equal(shepherd!.speciesCode, 'DOG');
  assert.equal(shepherd!.profileStatus, 'DRAFT');
  assert.equal(shepherd!.isActive, true);

  await assert.rejects(
    () => testDb.db.insert(animals).values({ ownerAccountId: user.accountId, species: 'NOT_A_SPECIES' }),
    (error: unknown) => JSON.stringify(error).includes('23503') || String((error as { cause?: { code?: string } }).cause?.code) === '23503',
  );
});

test('a new breed gets a free address, and a second record of the same breed is refused', async () => {
  const breed = await addBreedToRegistry(testDb.db, admin, { nameFa: 'تازی آزمایشی', nameEn: 'Synthetic Sighthound' });
  assert.equal(breed.slug, 'synthetic-sighthound');

  // Same breed, spelled differently: case, punctuation, Arabic yeh.
  await assert.rejects(
    () => addBreedToRegistry(testDb.db, admin, { nameFa: 'نام دیگر', nameEn: 'synthetic-SIGHTHOUND!' }),
    /قبلاً در فهرست مرجع/,
  );
  const arabicYeh = String.fromCharCode(0x064a);
  await assert.rejects(
    () => addBreedToRegistry(testDb.db, admin, { nameFa: 'تاز' + arabicYeh + ' آزمایشی', nameEn: 'Other Latin Name' }),
    /قبلاً در فهرست مرجع/,
  );

  // An address used by a redirect is not handed out again.
  await testDb.db.execute(
    sql`insert into breed_slug_redirect (slug, breed_id) values ('synthetic-taken', ${breed.id}::uuid)`,
  );
  assert.equal(await allocateSlug(testDb.db, 'Synthetic Taken'), 'synthetic-taken-2');
});

test('only the superadmin edits a breed; changes are audited field by field and a stale version is refused', async () => {
  const breed = await newBreed('ویرایش');
  await assert.rejects(() => updateBreedProfile(testDb.db, user, profile(breed, { size: 'LARGE' })), code('FORBIDDEN'));

  const groupId = await fciGroupId(1);
  const edited = await updateBreedProfile(
    testDb.db,
    admin,
    profile(breed, { size: 'LARGE', groupId, originCountry: 'de', altNames: ['Synthetic Alias ' + breed.id.slice(0, 4)] }),
  );
  assert.equal(edited.version, breed.version + 1);
  assert.equal(edited.originCountry, 'DE');

  const [event] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'BREED_PROFILE_UPDATED'), eq(auditEvents.targetId, breed.id)));
  assert.equal(event!.actorAccountId, admin.accountId);
  assert.equal(event!.targetVersion, edited.version);
  assert.deepEqual(event!.before, { groupId: null, originCountry: null, size: null, altNames: [] });
  assert.equal((event!.after as { size: string }).size, 'LARGE');
  assert.ok(!('nameFa' in (event!.after as object)), 'unchanged fields are not recorded as changes');

  // Someone else saved first: the older form is refused, not merged over.
  await assert.rejects(
    () => updateBreedProfile(testDb.db, admin, profile(breed, { size: 'SMALL' })),
    code('CONFLICT'),
  );

  // Saving the same values again changes nothing and records nothing.
  const same = await updateBreedProfile(testDb.db, admin, profile(edited));
  assert.equal(same.version, edited.version);
  const events = await testDb.db.select().from(auditEvents).where(eq(auditEvents.targetId, breed.id));
  assert.equal(events.filter((row) => row.action === 'BREED_PROFILE_UPDATED').length, 1);

  for (const patch of [
    { originCountry: 'QQ' },
    { standardUrl: 'javascript:alert(1)' },
    { size: 'HUGE' },
    { energy: 'EXTREME' },
    { groupId: '00000000-0000-4000-8000-000000000000' },
    { slug: 'Not A Slug' },
    { nameEn: '  ' },
    { speciesCode: 'CAT' },
  ] as Array<Partial<BreedProfileInput>>) {
    await assert.rejects(() => updateBreedProfile(testDb.db, admin, profile(edited, patch)), code('VALIDATION'), JSON.stringify(patch));
  }
});

test('a page is published only with content and a reason; drafts stay invisible and archived pages stay reachable', async () => {
  const breed = await newBreed('انتشار');
  assert.equal(await breedPageBySlug(testDb.db, breed.slug), null, 'a draft has no public page');

  await assert.rejects(
    () => changeBreedStatus(testDb.db, admin, { breedId: breed.id, expectedVersion: breed.version, to: 'PUBLISHED', reason: 'x' }),
    /تاریخچه یا خلاصه استاندارد/,
  );
  await assert.rejects(
    () => changeBreedStatus(testDb.db, admin, { breedId: breed.id, expectedVersion: breed.version, to: 'ARCHIVED', reason: 'x' }),
    code('VALIDATION'),
  );

  const withText = await updateBreedProfile(testDb.db, admin, profile(breed, { standardFa: 'خلاصه استاندارد آزمایشی' }));
  await assert.rejects(
    () => changeBreedStatus(testDb.db, admin, { breedId: breed.id, expectedVersion: withText.version, to: 'PUBLISHED', reason: ' ' }),
    code('VALIDATION'),
  );
  const live = await changeBreedStatus(testDb.db, admin, {
    breedId: breed.id,
    expectedVersion: withText.version,
    to: 'PUBLISHED',
    reason: 'مشخصات کامل شد',
  });
  assert.ok(live.publishedAt instanceof Date);

  const page = await breedPageBySlug(testDb.db, breed.slug);
  assert.equal(page?.kind, 'breed');
  const listed = await publishedBreeds(testDb.db, { term: breed.nameEn, page: 1 });
  assert.deepEqual(
    listed.items.map((item) => item.slug),
    [breed.slug],
  );
  const sitemap = await breedSitemapEntries(testDb.db);
  const entry = sitemap.find((row) => row.path === '/breeds/' + breed.slug);
  assert.ok(entry?.lastModified instanceof Date);

  // Emptying a published page's content is refused rather than leaving a thin page live.
  await assert.rejects(
    () => updateBreedProfile(testDb.db, admin, profile(live, { standardFa: '' })),
    code('VALIDATION'),
  );

  const archived = await changeBreedStatus(testDb.db, admin, {
    breedId: breed.id,
    expectedVersion: live.version,
    to: 'ARCHIVED',
    reason: 'اطلاعات قدیمی است',
  });
  const archivedPage = await breedPageBySlug(testDb.db, breed.slug);
  assert.equal(archivedPage?.kind === 'breed' && archivedPage.breed.profileStatus, 'ARCHIVED');
  assert.equal((await publishedBreeds(testDb.db, { term: breed.nameEn, page: 1 })).total, 0);
  assert.ok(!(await breedSitemapEntries(testDb.db)).some((row) => row.path === '/breeds/' + breed.slug));

  const [statusEvent] = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, breed.id), eq(auditEvents.targetVersion, archived.version)));
  assert.equal(statusEvent!.action, 'BREED_PROFILE_STATUS_CHANGED');
  assert.equal(statusEvent!.reason, 'اطلاعات قدیمی است');
  assert.deepEqual(statusEvent!.before, { profileStatus: 'PUBLISHED' });

  await assert.rejects(
    () => changeBreedStatus(testDb.db, user, { breedId: breed.id, expectedVersion: archived.version, to: 'PUBLISHED', reason: 'x' }),
    code('FORBIDDEN'),
  );
});

test('a medical claim needs its source and a past review date, and removing one archives it', async () => {
  const breed = await published('سلامت');
  const base = {
    breedId: breed.id,
    kind: 'PREDISPOSED_CONDITION',
    titleFa: 'دیسپلازی مفصل ران',
    noteFa: null,
    sourceTitle: 'SYNTHETIC منبع آزمایشی',
    sourceUrl: 'https://example.org/synthetic-source',
    reviewedOn: '2026-01-15',
  };
  for (const patch of [
    { sourceTitle: '  ' },
    { reviewedOn: '2999-01-01' },
    { reviewedOn: '2026-02-30' },
    { kind: 'CURE' },
    { sourceUrl: 'ftp://example.org' },
    { titleFa: '' },
  ]) {
    await assert.rejects(() => addMedicalClaim(testDb.db, admin, { ...base, ...patch }), code('VALIDATION'), JSON.stringify(patch));
  }
  await assert.rejects(() => addMedicalClaim(testDb.db, user, base), code('FORBIDDEN'));

  const claim = await addMedicalClaim(testDb.db, admin, base);
  let page = await breedPageBySlug(testDb.db, breed.slug);
  assert.equal(page?.kind === 'breed' && page.claims.length, 1);

  await assert.rejects(() => archiveMedicalClaim(testDb.db, admin, { claimId: claim.id, reason: '' }), code('VALIDATION'));
  await archiveMedicalClaim(testDb.db, admin, { claimId: claim.id, reason: 'منبع قدیمی شد' });
  page = await breedPageBySlug(testDb.db, breed.slug);
  assert.equal(page?.kind === 'breed' && page.claims.length, 0);

  const [kept] = await testDb.db.select().from(breedMedicalClaims).where(eq(breedMedicalClaims.id, claim.id));
  assert.ok(kept!.archivedAt instanceof Date, 'the claim row is kept');
  await assert.rejects(
    () => archiveMedicalClaim(testDb.db, admin, { claimId: claim.id, reason: 'دوباره' }),
    code('NOT_FOUND'),
  );
  const actions = (await testDb.db.select().from(auditEvents).where(eq(auditEvents.targetId, breed.id))).map((row) => row.action);
  assert.ok(actions.includes('BREED_MEDICAL_CLAIM_ADDED') && actions.includes('BREED_MEDICAL_CLAIM_ARCHIVED'));
});

test('a renamed address keeps resolving, and an address in use elsewhere is refused', async () => {
  const first = await published('نشانی');
  const renamed = await updateBreedProfile(testDb.db, admin, profile(first, { slug: first.slug + '-renamed' }));
  assert.deepEqual(await breedPageBySlug(testDb.db, first.slug), { kind: 'redirect', slug: renamed.slug });

  // Returning to the old address takes it out of the redirects.
  const back = await updateBreedProfile(testDb.db, admin, profile(renamed, { slug: first.slug }));
  assert.equal((await breedPageBySlug(testDb.db, first.slug))?.kind, 'breed');
  assert.deepEqual(await breedPageBySlug(testDb.db, renamed.slug), { kind: 'redirect', slug: first.slug });

  const other = await newBreed('نشانی دیگر');
  for (const slug of [renamed.slug, back.slug]) {
    await assert.rejects(() => updateBreedProfile(testDb.db, admin, profile(other, { slug })), code('CONFLICT'), slug);
  }
  assert.equal(await breedPageBySlug(testDb.db, 'Not-Valid'), null);
  assert.equal(await breedPageBySlug(testDb.db, 'no-such-breed-anywhere'), null);
});

test('a duplicate points at its primary, leaves new choices and rewrites no animal', async () => {
  const primary = await published('اصلی');
  const duplicate = await published('تکراری');
  const [animal] = await testDb.db
    .insert(animals)
    .values({ ownerAccountId: user.accountId, breedId: duplicate.id })
    .returning({ id: animals.id });

  await assert.rejects(
    () => markBreedDuplicate(testDb.db, admin, { breedId: duplicate.id, primaryBreedId: duplicate.id, expectedVersion: duplicate.version, reason: 'x' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => markBreedDuplicate(testDb.db, admin, { breedId: duplicate.id, primaryBreedId: primary.id, expectedVersion: duplicate.version, reason: '' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => markBreedDuplicate(testDb.db, user, { breedId: duplicate.id, primaryBreedId: primary.id, expectedVersion: duplicate.version, reason: 'x' }),
    code('FORBIDDEN'),
  );

  const merged = await markBreedDuplicate(testDb.db, admin, {
    breedId: duplicate.id,
    primaryBreedId: primary.id,
    expectedVersion: duplicate.version,
    reason: 'همان نژاد با نام دیگر',
  });
  assert.equal(merged.mergedIntoBreedId, primary.id);
  assert.equal(merged.isActive, false);

  const [unchanged] = await testDb.db.select().from(animals).where(eq(animals.id, animal!.id));
  assert.equal(unchanged!.breedId, duplicate.id, 'the recorded animal keeps its breed');
  assert.ok(!(await breedOptions(testDb.db)).some((row) => row.id === duplicate.id), 'no longer offered for new records');
  assert.equal((await publishedBreeds(testDb.db, { term: duplicate.nameEn, page: 1 })).total, 0);
  assert.ok(!(await breedSitemapEntries(testDb.db)).some((row) => row.path === '/breeds/' + duplicate.slug));

  const page = await breedPageBySlug(testDb.db, duplicate.slug);
  assert.deepEqual(page?.kind === 'breed' && page.primary, { slug: primary.slug, nameFa: primary.nameFa });

  // No chains: the primary cannot become a duplicate of its own duplicate, and nothing can point at a duplicate.
  const freshPrimary = await reload(primary.id);
  await assert.rejects(
    () => markBreedDuplicate(testDb.db, admin, { breedId: primary.id, primaryBreedId: duplicate.id, expectedVersion: freshPrimary.version, reason: 'x' }),
    code('VALIDATION'),
  );
  const third = await newBreed('سوم');
  await assert.rejects(
    () => markBreedDuplicate(testDb.db, admin, { breedId: third.id, primaryBreedId: duplicate.id, expectedVersion: third.version, reason: 'x' }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => changeBreedStatus(testDb.db, admin, { breedId: duplicate.id, expectedVersion: merged.version, to: 'DRAFT', reason: 'x' }).then(async (row) =>
      changeBreedStatus(testDb.db, admin, { breedId: duplicate.id, expectedVersion: row.version, to: 'PUBLISHED', reason: 'x' }),
    ),
    /تکراری است/,
  );
});

test('the public list finds breeds by either name, an alternative name or Arabic letter variants, and filters by FCI group', async () => {
  const groupId = await fciGroupId(8);
  const breed = await published('سرابی جستجو', { groupId, altNames: ['Synthetic Findable Alias'], size: 'MEDIUM' });
  const persianYeh = String.fromCharCode(0x06cc);
  const arabicYeh = String.fromCharCode(0x064a);

  for (const term of [breed.nameFa.replaceAll(persianYeh, arabicYeh), breed.nameEn.toUpperCase(), 'findable alias']) {
    const result = await publishedBreeds(testDb.db, { term, page: 1 });
    assert.ok(result.items.some((item) => item.slug === breed.slug), term);
  }

  const inGroup = await publishedBreeds(testDb.db, { term: breed.nameEn, fciGroup: 8, page: 1 });
  assert.deepEqual(inGroup.items[0], {
    slug: breed.slug,
    nameFa: breed.nameFa,
    nameEn: breed.nameEn,
    size: 'MEDIUM',
    fciGroup: 8,
    groupNameFa: inGroup.items[0]!.groupNameFa,
  });
  assert.equal((await publishedBreeds(testDb.db, { term: breed.nameEn, fciGroup: 1, page: 1 })).total, 0);

  const paged = await publishedBreeds(testDb.db, { page: 1, pageSize: 1 });
  assert.equal(paged.items.length, 1);
  assert.ok(paged.totalPages >= 2 && paged.publishedTotal >= 2);
});
