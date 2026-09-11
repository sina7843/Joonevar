/**
 * Veterinary centres — Phase 2 PROMPT-008.
 *
 * Runs against a freshly migrated database: the seeded taxonomies; who may
 * create, edit, verify and publish a centre; branches that are Phase 1
 * location rows yet never reach the Finder; announced hours; the professional
 * team that appears only after the veterinarian accepts; the owner handover;
 * and the public readers with their filters.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { centreFacilities, centreServices, centreTypes, centres, locationHours, vetLocations } from '../../src/db/schema/vets.ts';
import { addLocation, locationsOfVet, searchFinder, upsertVetProfile } from '../../src/vets/registry.ts';
import {
  addCentreBranch,
  assignCentreOwner,
  attachLocationToCentre,
  centreEditor,
  centrePageBySlug,
  centreReferenceData,
  centreSitemapEntries,
  changeCentreStatus,
  createCentre,
  inviteCentreMember,
  manageableCentres,
  myCentreInvitations,
  publishedCentres,
  removeCentreMember,
  respondToCentreInvitation,
  setCentreLicence,
  updateCentreBranch,
  updateCentreProfile,
  type CentreProfileInput,
  type CentreRecord,
} from '../../src/centres/service.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let admin: Actor;
let reviewer: Actor;
let user: Actor;
let tehranCityId: string;
let shirazCityId: string;
let counter = 0;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  admin = actorFor(await createTestAccount(testDb.db, '09990640001'), 'SUPERADMIN');
  reviewer = actorFor(await createTestAccount(testDb.db, '09990640002'), 'REVIEW_OPERATOR');
  user = actorFor(await createTestAccount(testDb.db, '09990640003'));
  const rows = await testDb.db.select().from(cities);
  tehranCityId = rows.find((row) => row.provinceCode === 'tehran' && row.nameFa === 'تهران')!.id;
  shirazCityId = rows.find((row) => row.provinceCode === 'fars' && row.nameFa === 'شیراز')!.id;
});

after(async () => {
  await testDb?.drop();
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const message = (expected: string, pattern: RegExp) => (error: unknown) => code(expected)(error) && pattern.test((error as Error).message);

async function newCentre(label: string, patch: Record<string, unknown> = {}): Promise<CentreRecord> {
  counter += 1;
  return createCentre(testDb.db, admin, {
    typeCode: 'CLINIC',
    displayNameFa: label + ' ' + counter,
    cityId: tehranCityId,
    contactFa: 'تماس آزمایشی',
    sourceFa: 'SYNTHETIC منبع',
    reason: 'SYNTHETIC ثبت مرکز',
    confirmedNotDuplicate: true,
    ...patch,
  });
}

const profileInput = (centre: CentreRecord, patch: Partial<CentreProfileInput> = {}): CentreProfileInput => ({
  centreId: centre.id,
  expectedVersion: centre.version,
  typeCode: centre.typeCode,
  displayNameFa: centre.displayNameFa,
  aboutFa: 'معرفی مرکز آزمایشی',
  phone: '02100000000',
  websiteUrl: null,
  serviceCodes: ['EXAMINATION'],
  speciesCodes: ['DOG'],
  facilityCodes: ['PARKING'],
  reason: 'SYNTHETIC ویرایش',
  ...patch,
});

const branchInput = (patch: Record<string, unknown> = {}) => ({
  nameFa: 'شعبه مرکزی',
  kind: 'CLINIC',
  cityId: tehranCityId,
  addressFa: 'نشانی آزمایشی',
  phone: '02100000001',
  isPublic: true,
  ...patch,
});

/** A centre with a description and a public branch: ready to publish. */
async function publishableCentre(label: string, patch: Record<string, unknown> = {}) {
  const centre = await newCentre(label, patch);
  const branch = await addCentreBranch(testDb.db, admin, centre.id, branchInput());
  const saved = await updateCentreProfile(testDb.db, admin, profileInput(centre));
  return { centre: saved, branch };
}

async function publish(centre: CentreRecord): Promise<CentreRecord> {
  return changeCentreStatus(testDb.db, admin, { centreId: centre.id, expectedVersion: centre.version, to: 'PUBLISHED', reason: 'SYNTHETIC انتشار' });
}

async function phaseOneVet(label: string) {
  counter += 1;
  const mobile = '0999065' + String(counter).padStart(4, '0');
  const accountId = await createTestAccount(testDb.db, mobile);
  await testDb.db.insert(accountRoles).values({ accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
  const profile = await upsertVetProfile(testDb.db, admin, {
    mobile,
    displayNameFa: label + ' ' + counter,
    councilCode: 'SYN-CEN-' + counter,
  });
  const location = await addLocation(testDb.db, admin, accountId, {
    nameFa: 'کلینیک ' + label + ' ' + counter,
    cityFa: 'تهران',
    addressFa: 'نشانی فاز یک',
    phone: '02100000002',
    licenceStatus: 'VALID',
    canImplantMicrochip: true,
    canDrawBloodSample: true,
  });
  return { accountId, profile, location, actor: actorFor(accountId) };
}

async function events(action: string, targetId: string) {
  return testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, action), eq(auditEvents.targetId, targetId)));
}

test('the migration seeds the centre kinds, services and amenities', async () => {
  assert.equal((await testDb.db.select().from(centreTypes)).length, 10);
  assert.equal((await testDb.db.select().from(centreServices)).length, 14);
  assert.equal((await testDb.db.select().from(centreFacilities)).length, 10);
  const reference = await centreReferenceData(testDb.db);
  assert.ok(reference.types.some((row) => row.code === 'HOSPITAL' && row.nameFa === 'بیمارستان دامپزشکی'));
  assert.ok(reference.services.some((row) => row.code === 'EMERGENCY'));
  assert.ok(reference.facilities.some((row) => row.code === 'PARKING'));
});

test('only the superadmin or the review operator records a centre, and a repeated name needs confirmation', async () => {
  await assert.rejects(() => createCentre(testDb.db, user, { typeCode: 'CLINIC', displayNameFa: 'x', reason: 'x' }), code('FORBIDDEN'));
  await assert.rejects(() => createCentre(testDb.db, admin, { typeCode: 'CLINIC', displayNameFa: ' ', reason: 'x' }), code('VALIDATION'));
  await assert.rejects(() => createCentre(testDb.db, admin, { typeCode: 'NOT_A_TYPE', displayNameFa: 'مرکز', reason: 'x' }), code('VALIDATION'));
  await assert.rejects(() => createCentre(testDb.db, admin, { typeCode: 'CLINIC', displayNameFa: 'مرکز', reason: '' }), code('VALIDATION'));

  const centre = await newCentre('مرکز آزمایشی');
  assert.equal(centre.publicStatus, 'DRAFT');
  assert.equal(centre.ownerAccountId, null);
  assert.equal(centre.licenceStatus, 'NONE');
  assert.equal((await events('CENTRE_CREATED', centre.id))[0]!.reason, 'SYNTHETIC ثبت مرکز');

  const same = { typeCode: 'CLINIC', displayNameFa: centre.displayNameFa, reason: 'SYNTHETIC' };
  await assert.rejects(() => createCentre(testDb.db, reviewer, same), message('CONFLICT', /مشابه|همین نام/));
  const confirmed = await createCentre(testDb.db, reviewer, { ...same, confirmedNotDuplicate: true });
  assert.equal(confirmed.displayNameFa, centre.displayNameFa);
});

test('the content belongs to the superadmin and the owner; the review operator publishes but does not rewrite', async () => {
  const centre = await newCentre('مرکز ویرایش');
  await assert.rejects(() => updateCentreProfile(testDb.db, user, profileInput(centre)), code('FORBIDDEN'));
  await assert.rejects(() => updateCentreProfile(testDb.db, reviewer, profileInput(centre)), code('FORBIDDEN'));
  await assert.rejects(() => updateCentreProfile(testDb.db, admin, profileInput(centre, { serviceCodes: ['NOT_A_SERVICE'] })), code('VALIDATION'));
  await assert.rejects(() => updateCentreProfile(testDb.db, admin, profileInput(centre, { websiteUrl: 'example.com' })), code('VALIDATION'));
  await assert.rejects(() => updateCentreProfile(testDb.db, admin, profileInput(centre, { reason: '' })), code('VALIDATION'));

  const saved = await updateCentreProfile(
    testDb.db,
    admin,
    profileInput(centre, { serviceCodes: ['SURGERY', 'EXAMINATION', 'SURGERY'], speciesCodes: ['CAT', 'DOG'], facilityCodes: ['PARKING', 'AMBULANCE'] }),
  );
  assert.equal(saved.version, centre.version + 1);
  const [event] = await events('CENTRE_PROFILE_UPDATED', centre.id);
  assert.deepEqual((event!.after as { serviceCodes: string[] }).serviceCodes, ['EXAMINATION', 'SURGERY']);
  assert.equal((event!.before as { aboutFa: unknown }).aboutFa, null);

  await assert.rejects(() => updateCentreProfile(testDb.db, admin, profileInput(centre, { aboutFa: 'دیگر' })), code('CONFLICT'));
  const again = await updateCentreProfile(
    testDb.db,
    admin,
    profileInput(saved, { serviceCodes: ['EXAMINATION', 'SURGERY'], speciesCodes: ['CAT', 'DOG'], facilityCodes: ['AMBULANCE', 'PARKING'] }),
  );
  assert.equal(again.version, saved.version, 'the same values change nothing');
  assert.equal((await events('CENTRE_PROFILE_UPDATED', centre.id)).length, 1);
});

test('a branch is a Phase 1 location row with no owner, no licence and no capability, so the Finder never sees it', async () => {
  const centre = await newCentre('مرکز شعبه');
  await assert.rejects(() => addCentreBranch(testDb.db, user, centre.id, branchInput()), code('FORBIDDEN'));
  await assert.rejects(() => addCentreBranch(testDb.db, reviewer, centre.id, branchInput()), code('FORBIDDEN'));
  await assert.rejects(() => addCentreBranch(testDb.db, admin, centre.id, branchInput({ cityId: '' })), code('VALIDATION'));
  await assert.rejects(() => addCentreBranch(testDb.db, admin, centre.id, branchInput({ kind: 'LAB' })), code('VALIDATION'));

  const finderBefore = (await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id);
  const branch = await addCentreBranch(testDb.db, admin, centre.id, branchInput({ latitude: 35.7, longitude: 51.4 }));
  assert.equal(branch.vetAccountId, null);
  assert.equal(branch.centreId, centre.id);
  assert.equal(branch.licenceStatus, 'NONE');
  assert.ok(!branch.canImplantMicrochip && !branch.canDrawBloodSample && !branch.canPregnancyCheck);
  assert.equal(branch.cityFa, 'تهران');
  assert.equal(branch.provinceCode, 'tehran');
  for (const context of ['MICROCHIP', 'DNA', 'PREGNANCY'] as const) {
    assert.ok(!(await searchFinder(testDb.db, { context })).some((row) => row.location.id === branch.id), context);
  }
  assert.deepEqual((await searchFinder(testDb.db, { context: 'MICROCHIP' })).map((row) => row.location.id), finderBefore);

  // Announced hours: a half-filled or reversed day is refused.
  const update = {
    locationId: branch.id,
    expectedVersion: branch.version,
    ...branchInput({ nameFa: branch.nameFa }),
    reason: 'SYNTHETIC ساعات',
  };
  await assert.rejects(
    () => updateCentreBranch(testDb.db, admin, { ...update, hours: [{ weekday: 0, opensAt: '09:00', closesAt: null }] }),
    code('VALIDATION'),
  );
  await assert.rejects(
    () => updateCentreBranch(testDb.db, admin, { ...update, hours: [{ weekday: 0, opensAt: 'صبح', closesAt: '17:00' }] }),
    code('VALIDATION'),
  );
  const withHours = await updateCentreBranch(testDb.db, admin, {
    ...update,
    hours: [
      { weekday: 0, opensAt: '۰۹:۰۰', closesAt: '17:00' },
      { weekday: 1, opensAt: null, closesAt: null },
    ],
  });
  const hours = await testDb.db.select().from(locationHours).where(eq(locationHours.locationId, branch.id));
  assert.equal(hours.length, 1);
  assert.equal(hours[0]!.opensAt, '09:00');
  const [branchEvent] = await events('CENTRE_BRANCH_UPDATED', branch.id);
  assert.equal(branchEvent!.reason, 'SYNTHETIC ساعات');

  // A branch that is closed down is history: it cannot stay public.
  await assert.rejects(
    () =>
      updateCentreBranch(testDb.db, admin, {
        ...update,
        expectedVersion: withHours.version,
        isActive: false,
        isPublic: true,
      }),
    code('VALIDATION'),
  );
  const closed = await updateCentreBranch(testDb.db, admin, {
    ...update,
    expectedVersion: withHours.version,
    isActive: false,
    isPublic: false,
  });
  assert.equal(closed.isActive, false);
});

test('publishing needs a description and a public branch, and a review hide is not undone by the owner', async () => {
  const { centre } = await publishableCentre('مرکز انتشار');
  // An unowned, reviewed suggestion publishes with its city alone (§10); without a city it does not.
  const noCity = await newCentre('مرکز بدون شهر', { cityId: null });
  await assert.rejects(
    () => changeCentreStatus(testDb.db, reviewer, { centreId: noCity.id, expectedVersion: noCity.version, to: 'PUBLISHED', reason: 'x' }),
    message('VALIDATION', /شهر/),
  );
  await assert.rejects(
    () => changeCentreStatus(testDb.db, admin, { centreId: noCity.id, expectedVersion: noCity.version, to: 'HIDDEN', reason: 'x' }),
    code('VALIDATION'),
  );
  const suggestion = await newCentre('مرکز پیشنهادی');
  const suggestionPublished = await changeCentreStatus(testDb.db, reviewer, {
    centreId: suggestion.id,
    expectedVersion: suggestion.version,
    to: 'PUBLISHED',
    reason: 'SYNTHETIC انتشار پیشنهاد',
  });
  assert.equal(suggestionPublished.publicStatus, 'PUBLISHED');

  const published = await publish(centre);
  assert.match(published.publicSlug!, /^centre-[0-9a-f]{10}$/);
  assert.ok(published.publicPublishedAt instanceof Date);
  assert.ok(await centrePageBySlug(testDb.db, published.publicSlug!));
  assert.ok((await centreSitemapEntries(testDb.db)).some((entry) => entry.path === '/centers/' + published.publicSlug));

  const ownerMobile = '0999066' + String(++counter).padStart(4, '0');
  const owner = actorFor(await createTestAccount(testDb.db, ownerMobile));
  await assert.rejects(
    () => assignCentreOwner(testDb.db, reviewer, { centreId: centre.id, expectedVersion: published.version, mobile: '0999066', reason: 'x' }),
    code('FORBIDDEN'),
  );
  const handed = await assignCentreOwner(testDb.db, admin, {
    centreId: centre.id,
    expectedVersion: published.version,
    mobile: ownerMobile,
    reason: 'SYNTHETIC واگذاری',
  });
  assert.equal(handed.ownerAccountId, owner.accountId);
  assert.ok(handed.claimedAt instanceof Date);
  const [notice] = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, owner.accountId));
  assert.equal(notice!.entityType, 'CENTRE');
  await assert.rejects(
    () => assignCentreOwner(testDb.db, admin, { centreId: centre.id, expectedVersion: handed.version, mobile: '09990640003', reason: 'x' }),
    code('CONFLICT'),
  );

  // Once it has a manager, a centre needs its description and a public branch like any other.
  const ownedBare = await newCentre('مرکز مدیردار بدون معرفی', { cityId: null });
  const ownedAssigned = await assignCentreOwner(testDb.db, admin, {
    centreId: ownedBare.id,
    expectedVersion: ownedBare.version,
    mobile: ownerMobile,
    reason: 'SYNTHETIC واگذاری دوم',
  });
  await assert.rejects(
    () => changeCentreStatus(testDb.db, admin, { centreId: ownedBare.id, expectedVersion: ownedAssigned.version, to: 'PUBLISHED', reason: 'x' }),
    message('VALIDATION', /معرفی|شعبه/),
  );

  // The owner writes the content without a reason, but never records the licence.
  const edited = await updateCentreProfile(testDb.db, owner, profileInput(handed, { aboutFa: 'معرفی مدیر', reason: null }));
  const [ownerEvent] = (await events('CENTRE_PROFILE_UPDATED', centre.id)).filter((event) => event.actorAccountId === owner.accountId);
  assert.equal(ownerEvent!.reason, null);
  await assert.rejects(
    () => setCentreLicence(testDb.db, owner, { centreId: centre.id, expectedVersion: edited.version, licenceNumber: 'X', licenceStatus: 'VALID', reason: 'x' }),
    code('FORBIDDEN'),
  );

  const hidden = await changeCentreStatus(testDb.db, reviewer, {
    centreId: centre.id,
    expectedVersion: edited.version,
    to: 'HIDDEN',
    reason: 'SYNTHETIC گزارش بررسی‌شده',
  });
  assert.equal(hidden.hiddenByReview, true);
  assert.equal(await centrePageBySlug(testDb.db, published.publicSlug!), null);
  await assert.rejects(
    () => changeCentreStatus(testDb.db, owner, { centreId: centre.id, expectedVersion: hidden.version, to: 'PUBLISHED' }),
    message('CONFLICT', /بررسی همزیست/),
  );
  const republished = await changeCentreStatus(testDb.db, reviewer, {
    centreId: centre.id,
    expectedVersion: hidden.version,
    to: 'PUBLISHED',
    reason: 'SYNTHETIC اصلاح شد',
  });
  assert.equal(republished.hiddenByReview, false);
  assert.equal(republished.publicSlug, published.publicSlug, 'the address never changes');
});

test('a licence is recorded only by a reviewer, exactly as it was seen', async () => {
  const { centre } = await publishableCentre('مرکز مجوز');
  await assert.rejects(
    () => setCentreLicence(testDb.db, admin, { centreId: centre.id, expectedVersion: centre.version, licenceNumber: null, licenceStatus: 'VALID', reason: 'x' }),
    message('VALIDATION', /شماره/),
  );
  await assert.rejects(
    () => setCentreLicence(testDb.db, admin, { centreId: centre.id, expectedVersion: centre.version, licenceNumber: 'X', licenceStatus: 'MAYBE', reason: 'x' }),
    code('VALIDATION'),
  );
  const verified = await setCentreLicence(testDb.db, reviewer, {
    centreId: centre.id,
    expectedVersion: centre.version,
    licenceNumber: 'SYN-LIC-1',
    licenceStatus: 'VALID',
    reason: 'SYNTHETIC مدارک دیده شد',
  });
  assert.equal(verified.licenceStatus, 'VALID');
  assert.ok(verified.licenceVerifiedAt instanceof Date);
  const [event] = await events('CENTRE_LICENCE_RECORDED', centre.id);
  assert.equal((event!.before as { licenceStatus: string }).licenceStatus, 'NONE');

  const revoked = await setCentreLicence(testDb.db, reviewer, {
    centreId: centre.id,
    expectedVersion: verified.version,
    licenceNumber: 'SYN-LIC-1',
    licenceStatus: 'REVOKED',
    reason: 'SYNTHETIC ابطال',
  });
  assert.equal(revoked.licenceVerifiedAt, null, 'only a valid licence carries a verification time');
});

test('a veterinarian appears on a centre page only after accepting the invitation', async () => {
  const { centre } = await publishableCentre('مرکز تیم');
  const published = await publish(centre);
  const vet = await phaseOneVet('دامپزشک عضو');

  await assert.rejects(() => inviteCentreMember(testDb.db, user, { centreId: centre.id, vetRef: vet.profile.councilCode!, reason: 'SYNTHETIC' }), code('FORBIDDEN'));
  await assert.rejects(() => inviteCentreMember(testDb.db, admin, { centreId: centre.id, vetRef: 'NOBODY', reason: 'SYNTHETIC' }), code('NOT_FOUND'));

  const invited = await inviteCentreMember(testDb.db, admin, {
    centreId: centre.id,
    vetRef: vet.profile.councilCode!,
    roleFa: 'جراح',
    reason: 'SYNTHETIC دعوت',
  });
  assert.equal(invited.status, 'INVITED');
  await assert.rejects(
    () => inviteCentreMember(testDb.db, admin, { centreId: centre.id, vetRef: vet.profile.councilCode!, reason: 'SYNTHETIC' }),
    code('CONFLICT'),
  );
  assert.deepEqual((await centrePageBySlug(testDb.db, published.publicSlug!))!.team, [], 'an invitation alone shows nobody');

  // Only the veterinarian themselves answers.
  await assert.rejects(
    () => respondToCentreInvitation(testDb.db, user, { memberId: invited.id, expectedVersion: invited.version, accept: true }),
    code('NOT_FOUND'),
  );
  const mine = await myCentreInvitations(testDb.db, vet.actor);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.centreNameFa, centre.displayNameFa);

  const accepted = await respondToCentreInvitation(testDb.db, vet.actor, { memberId: invited.id, expectedVersion: invited.version, accept: true });
  assert.equal(accepted.status, 'ACCEPTED');
  await assert.rejects(
    () => respondToCentreInvitation(testDb.db, vet.actor, { memberId: invited.id, expectedVersion: accepted.version, accept: false }),
    code('CONFLICT'),
  );
  const withTeam = await centrePageBySlug(testDb.db, published.publicSlug!);
  assert.equal(withTeam!.team.length, 1);
  assert.equal(withTeam!.team[0]!.nameFa, vet.profile.displayNameFa);
  assert.equal(withTeam!.team[0]!.roleFa, 'جراح');
  assert.equal(withTeam!.team[0]!.slug, null, 'an unpublished profile is named but not linked');

  const removed = await removeCentreMember(testDb.db, admin, { memberId: accepted.id, expectedVersion: accepted.version, reason: 'SYNTHETIC پایان همکاری' });
  assert.equal(removed.status, 'REMOVED');
  assert.deepEqual((await centrePageBySlug(testDb.db, published.publicSlug!))!.team, []);
  assert.equal((await events('CENTRE_MEMBER_REMOVED', accepted.id))[0]!.reason, 'SYNTHETIC پایان همکاری');
});

test('an existing Phase 1 location is linked to a centre, not copied, and keeps its place in the Finder', async () => {
  const { centre } = await publishableCentre('مرکز پیوند');
  const vet = await phaseOneVet('دامپزشک پیوند');
  const before = await searchFinder(testDb.db, { context: 'MICROCHIP' });

  await assert.rejects(
    () => attachLocationToCentre(testDb.db, reviewer, { centreId: centre.id, locationId: vet.location.id, reason: 'x' }),
    code('FORBIDDEN'),
  );
  const linked = await attachLocationToCentre(testDb.db, admin, {
    centreId: centre.id,
    locationId: vet.location.id,
    reason: 'SYNTHETIC همان محل کار است',
  });
  assert.equal(linked.centreId, centre.id);
  assert.equal(linked.vetAccountId, vet.accountId, 'the place still belongs to its veterinarian');
  assert.equal(linked.licenceStatus, 'VALID');
  assert.ok(linked.canImplantMicrochip);
  const after = await searchFinder(testDb.db, { context: 'MICROCHIP' });
  assert.deepEqual(after.map((row) => row.location.id), before.map((row) => row.location.id));
  assert.ok((await locationsOfVet(testDb.db, vet.accountId)).some((row) => row.id === vet.location.id));
  await assert.rejects(
    () => attachLocationToCentre(testDb.db, admin, { centreId: centre.id, locationId: vet.location.id, reason: 'x' }),
    code('CONFLICT'),
  );

  const editor = await centreEditor(testDb.db, admin, centre.id);
  assert.ok(editor!.facts.branches.some((branch) => branch.id === vet.location.id));
  assert.equal(editor!.completeness.total, 9);
  await assert.rejects(() => centreEditor(testDb.db, user, centre.id), code('FORBIDDEN'));
  assert.equal(await centreEditor(testDb.db, admin, 'not-a-uuid'), null);
});

test('the public list filters by type, service, species, place, hours and licence', async () => {
  const tag = 'فهرست' + ++counter;
  const a = await publishableCentre('بیمارستان ' + tag, { typeCode: 'HOSPITAL' });
  await updateCentreProfile(testDb.db, admin, profileInput(a.centre, { serviceCodes: ['EMERGENCY'], speciesCodes: ['DOG'] }));
  const [aReady] = await testDb.db.select().from(centres).where(eq(centres.id, a.centre.id));
  const aPublished = await publish(aReady!);
  await setCentreLicence(testDb.db, reviewer, {
    centreId: aPublished.id,
    expectedVersion: aPublished.version,
    licenceNumber: 'SYN-A',
    licenceStatus: 'VALID',
    reason: 'SYNTHETIC',
  });
  await updateCentreBranch(testDb.db, admin, {
    locationId: a.branch.id,
    expectedVersion: a.branch.version,
    ...branchInput({ nameFa: a.branch.nameFa }),
    isOpen24h: true,
    reason: 'SYNTHETIC شبانه‌روزی',
  });

  const b = await publishableCentre('آزمایشگاه ' + tag, { typeCode: 'LABORATORY' });
  await updateCentreProfile(testDb.db, admin, profileInput(b.centre, { serviceCodes: ['LABORATORY'], speciesCodes: ['CAT'] }));
  const [bReady] = await testDb.db.select().from(centres).where(eq(centres.id, b.centre.id));
  await updateCentreBranch(testDb.db, admin, {
    locationId: b.branch.id,
    expectedVersion: b.branch.version,
    ...branchInput({ nameFa: b.branch.nameFa, cityId: shirazCityId }),
    reason: 'SYNTHETIC شیراز',
  });
  const bPublished = await publish(bReady!);
  await newCentre('پیش‌نویس ' + tag);

  const slugs = async (query: Record<string, unknown>) =>
    (await publishedCentres(testDb.db, { term: tag, page: 1, ...query })).items.map((item) => item.slug).sort();
  const A = aPublished.publicSlug!;
  const B = bPublished.publicSlug!;

  assert.deepEqual(await slugs({}), [A, B].sort(), 'a draft is never listed');
  assert.deepEqual(await slugs({ type: 'HOSPITAL' }), [A]);
  assert.deepEqual(await slugs({ service: 'LABORATORY' }), [B]);
  assert.deepEqual(await slugs({ species: 'CAT' }), [B]);
  assert.deepEqual(await slugs({ province: 'fars' }), [B]);
  assert.deepEqual(await slugs({ cityId: tehranCityId }), [A]);
  assert.deepEqual(await slugs({ open24h: true }), [A]);
  assert.deepEqual(await slugs({ verified: true }), [A]);

  const [card] = (await publishedCentres(testDb.db, { term: 'بیمارستان ' + tag, page: 1 })).items;
  assert.equal(card!.verified, true);
  assert.equal(card!.open24h, true);
  assert.equal(card!.owned, false, 'a centre with no manager is shown as unowned');
  assert.deepEqual(card!.placesFa, ['تهران']);

  const page = await centrePageBySlug(testDb.db, A);
  assert.equal(page!.typeFa, 'بیمارستان دامپزشکی');
  assert.deepEqual(page!.servicesFa, ['اورژانس']);
  assert.equal(page!.branches.length, 1);
  assert.equal(page!.branches[0]!.isOpen24h, true);
  assert.deepEqual(page!.licence, { statusFa: 'معتبر', number: 'SYN-A' });
  assert.equal(await centrePageBySlug(testDb.db, 'centre-0000000000'), null);
  assert.equal(await centrePageBySlug(testDb.db, aPublished.id), null, 'an internal id is not an address');

  const mine = await manageableCentres(testDb.db, admin);
  assert.ok(mine.some((row) => row.centre.id === aPublished.id));
  assert.equal((await manageableCentres(testDb.db, user)).length, 0);
});
