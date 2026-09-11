/**
 * Veterinarian applications, review and claims — Phase 2 PROMPT-007.
 *
 * Runs against a freshly migrated database: submission with council code and
 * private documents; the duplicate states; review by the review operator only,
 * with reasons, correction, resubmission, rejection, one appeal and withdrawal;
 * unowned profiles and their claim, including two approvals at once; the owner
 * managing the same profile without reaching the Finder or undoing moderation;
 * and no advertising purchase before a claim.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, auditEvents, notifications, storedFiles } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetApplicationDocuments, vetProfiles } from '../../src/db/schema/vets.ts';
import { canReadFile } from '../../src/authz/policy.ts';
import { searchFinder, upsertVetProfile } from '../../src/vets/registry.ts';
import {
  addOwnLocation,
  changeVetPublicStatus,
  publishedVets,
  updateLocationPublic,
  updateVetPublicProfile,
  vetPageBySlug,
  type VetPublicProfileInput,
} from '../../src/vets/directory.ts';
import { packagePurchaseEligibility } from '../../src/vets/directory-model.ts';
import {
  appealVetApplication,
  createUnownedVetProfile,
  decideVetApplication,
  myVetApplications,
  resubmitVetApplication,
  submitVetApplication,
  vetApplicationForReview,
  vetApplicationQueue,
  withdrawVetApplication,
  type UnownedVetInput,
  type VetApplicationInput,
  type VetApplicationRow,
} from '../../src/vets/onboarding.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let admin: Actor;
let reviewer: Actor;
let tehranCityId: string;
let counter = 0;

/** A PNG signature: enough for the upload check, which reads the real bytes. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-onboarding-'));
  admin = actorFor(await createTestAccount(testDb.db, '09990620001'), 'SUPERADMIN');
  reviewer = actorFor(await createTestAccount(testDb.db, '09990620002'), 'REVIEW_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const message = (expected: string, pattern: RegExp) => (error: unknown) => code(expected)(error) && pattern.test((error as Error).message);

async function newAccount(context: Actor['context'] = 'USER'): Promise<Actor & { mobile: string }> {
  counter += 1;
  const mobile = '0999063' + String(counter).padStart(4, '0');
  return { ...actorFor(await createTestAccount(testDb.db, mobile), context), mobile };
}

const document = (kind = 'COUNCIL_CARD') => ({ kind, bytes: PNG, originalName: kind.toLowerCase() + '.png' });

const applicationInput = (patch: Partial<VetApplicationInput> = {}): VetApplicationInput => ({
  kind: 'PROFILE',
  displayNameFa: 'دامپزشک متقاضی ' + counter,
  councilCode: 'SYN-APP-' + counter,
  phone: '02100000000',
  cityId: tehranCityId,
  statementFa: null,
  documents: [document()],
  ...patch,
});

const submit = (actor: Actor, patch: Partial<VetApplicationInput> = {}) =>
  submitVetApplication(testDb.db, storage, actor, applicationInput(patch));

const decide = (row: VetApplicationRow, decision: string, who: Actor = reviewer, reasonFa = 'SYNTHETIC دلیل بررسی') =>
  decideVetApplication(testDb.db, who, { applicationId: row.id, expectedVersion: row.version, decision, reasonFa });

const unowned = (displayNameFa: string, patch: Partial<UnownedVetInput> = {}) =>
  createUnownedVetProfile(testDb.db, reviewer, {
    displayNameFa,
    cityId: tehranCityId,
    contactFa: 'مطب خیابان آزمایشی',
    sourceFa: 'SYNTHETIC منبع عمومی',
    reason: 'SYNTHETIC بررسی منبع',
    confirmedNotDuplicate: true,
    ...patch,
  });

const content = (profileId: string, expectedVersion: number, patch: Partial<VetPublicProfileInput> = {}): VetPublicProfileInput => ({
  profileId,
  expectedVersion,
  headlineFa: null,
  bioFa: 'معرفی',
  experienceFa: null,
  showPhone: false,
  showCouncilCode: false,
  specialtyCodes: [],
  speciesCodes: [],
  reason: 'SYNTHETIC',
  ...patch,
});

async function events(action: string, targetId: string) {
  return testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, action), eq(auditEvents.targetId, targetId)));
}

test('an applicant submits the council code and documents, and the documents stay private', async () => {
  const applicant = await newAccount();
  await assert.rejects(() => submit(actorFor(applicant.accountId, 'AUTHOR')), code('FORBIDDEN'));
  await assert.rejects(() => submit(applicant, { kind: 'SOMETHING' }), code('VALIDATION'));
  await assert.rejects(() => submit(applicant, { documents: [] }), code('VALIDATION'));
  await assert.rejects(() => submit(applicant, { documents: [document('IDENTITY')] }), message('VALIDATION', /کارت نظام/));
  await assert.rejects(() => submit(applicant, { councilCode: 'ab' }), code('VALIDATION'));
  await assert.rejects(
    () => submit(applicant, { documents: [{ kind: 'COUNCIL_CARD', bytes: new TextEncoder().encode('not an image'), originalName: 'card.png' }] }),
    code('VALIDATION'),
  );

  const row = await submit(applicant, { councilCode: ' syn app ۹۰' + counter, documents: [document(), document('IDENTITY')] });
  assert.equal(row.status, 'SUBMITTED');
  assert.equal(row.councilCode, 'SYNAPP90' + counter);
  assert.equal((await events('VET_APPLICATION_SUBMITTED', row.id)).length, 1);

  const docs = await testDb.db.select().from(vetApplicationDocuments).where(eq(vetApplicationDocuments.applicationId, row.id));
  assert.deepEqual(docs.map((d) => d.kind).sort(), ['COUNCIL_CARD', 'IDENTITY']);
  const [file] = await testDb.db.select().from(storedFiles).where(eq(storedFiles.id, docs[0]!.fileId));
  assert.equal(file!.purpose, 'VET_APPLICATION_DOCUMENT');
  const record = { ownerAccountId: file!.ownerAccountId, purpose: file!.purpose };
  const stranger = await newAccount();
  assert.ok(canReadFile(applicant, record));
  assert.ok(canReadFile(reviewer, record));
  assert.ok(canReadFile(admin, record));
  assert.ok(!canReadFile(stranger, record));
  assert.ok(!canReadFile(actorFor(stranger.accountId, 'CONTENT_ADMIN'), record));
  assert.ok(!canReadFile(actorFor(stranger.accountId, 'ASSOCIATION_OPERATOR'), record));

  await assert.rejects(() => submit(applicant), message('CONFLICT', /در حال بررسی/), 'one open application per account');
  const mine = await myVetApplications(testDb.db, applicant);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.documents.length, 2);
});

test('duplicates are refused: a code another profile holds, an account that already has one, an unowned profile to claim', async () => {
  const phaseOne = await newAccount('TRUSTED_VET');
  await testDb.db.insert(accountRoles).values({ accountId: phaseOne.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
  const phaseOneCode = 'SYN-P1-' + counter;
  await upsertVetProfile(testDb.db, admin, { mobile: phaseOne.mobile, displayNameFa: 'دامپزشک فاز یک', councilCode: phaseOneCode });
  await assert.rejects(() => submit(phaseOne), message('CONFLICT', /پروفایل دامپزشک دارد/));

  const other = await newAccount();
  await assert.rejects(() => submit(other, { councilCode: phaseOneCode }), message('CONFLICT', /قبلاً برای پروفایل دیگری/));

  const unownedCode = 'SYN-UN-' + counter;
  await unowned('دامپزشک بدون مالک کددار ' + counter, { councilCode: unownedCode });
  await assert.rejects(() => submit(other, { councilCode: unownedCode }), message('CONFLICT', /Claim کنید/));
  await assert.rejects(() => unowned('دامپزشک دیگر ' + counter, { councilCode: unownedCode }), code('CONFLICT'));
});

test('only a review operator decides, never on their own application, always with a reason; a correction returns to the same case', async () => {
  const applicant = await newAccount();
  const stranger = await newAccount();
  const row = await submit(applicant);
  await assert.rejects(() => decide(row, 'APPROVE', applicant), code('FORBIDDEN'));
  await assert.rejects(() => decide(row, 'APPROVE', actorFor(stranger.accountId, 'CONTENT_ADMIN')), code('FORBIDDEN'));
  await assert.rejects(() => decide(row, 'APPROVE', reviewer, '  '), code('VALIDATION'));
  await assert.rejects(() => decide(row, 'MAYBE'), code('VALIDATION'));
  await assert.rejects(() => vetApplicationQueue(testDb.db, applicant, { view: 'OPEN', page: 1 }), code('FORBIDDEN'));
  assert.equal(await vetApplicationForReview(testDb.db, reviewer, 'not-a-uuid'), null);

  // A reviewer who applies from their own account cannot decide that application.
  const selfApplied = await submit(actorFor(reviewer.accountId, 'USER'), { councilCode: 'SYN-SELF-1', displayNameFa: 'اپراتور متقاضی' });
  await assert.rejects(() => decide(selfApplied, 'APPROVE'), message('FORBIDDEN', /خودتان/));

  const queue = await vetApplicationQueue(testDb.db, reviewer, { view: 'OPEN', page: 1 });
  assert.ok(queue.items.some((item) => item.id === row.id));

  const corrected = await decide(row, 'REQUEST_CORRECTION', reviewer, 'تصویر کارت خوانا نیست');
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  const [notice] = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, applicant.accountId));
  assert.equal(notice!.originRoute, '/account/vet-profile');
  assert.equal(notice!.bodyFa, 'تصویر کارت خوانا نیست');
  assert.equal(notice!.entityType, 'VET_APPLICATION');

  const resubmit = {
    applicationId: row.id,
    expectedVersion: corrected.version,
    displayNameFa: 'نام اصلاح‌شده ' + row.councilCode,
    councilCode: row.councilCode,
    phone: row.phone,
    cityId: row.cityId,
    statementFa: 'کارت دوباره پیوست شد',
    documents: [document('IDENTITY')],
  };
  // Someone else's application is not found; an old version is stale.
  await assert.rejects(() => resubmitVetApplication(testDb.db, storage, stranger, resubmit), code('NOT_FOUND'));
  await assert.rejects(() => resubmitVetApplication(testDb.db, storage, applicant, { ...resubmit, expectedVersion: row.version }), code('CONFLICT'));
  const resubmitted = await resubmitVetApplication(testDb.db, storage, applicant, resubmit);
  assert.equal(resubmitted.status, 'SUBMITTED');
  const [event] = await events('VET_APPLICATION_RESUBMITTED', row.id);
  assert.equal((event!.before as Record<string, unknown>).displayNameFa, row.displayNameFa);
  assert.equal((event!.after as Record<string, unknown>).displayNameFa, resubmit.displayNameFa);
  await assert.rejects(() => decide(corrected, 'APPROVE'), code('CONFLICT'), 'a decision on the older version is refused');
  assert.equal((await vetApplicationForReview(testDb.db, reviewer, row.id))!.documents.length, 2);

  const approved = await decide(resubmitted, 'APPROVE', reviewer, 'کارت نظام با کد تطبیق داده شد');
  assert.equal(approved.status, 'APPROVED');
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, applicant.accountId));
  assert.equal(profile!.id, approved.vetProfileId);
  assert.equal(profile!.councilCode, row.councilCode);
  assert.ok(profile!.councilVerifiedAt instanceof Date);
  assert.equal(profile!.publicStatus, 'DRAFT');
  assert.equal(profile!.displayNameFa, resubmit.displayNameFa);
  // Professional Verification only: the Phase 1 trusted role is not granted (DEC-0145).
  assert.equal((await testDb.db.select().from(accountRoles).where(eq(accountRoles.accountId, applicant.accountId))).length, 0);
  assert.equal((await events('VET_PROFILE_CREATED', profile!.id))[0]!.reason, 'کارت نظام با کد تطبیق داده شد');
  await assert.rejects(() => decide(approved, 'REJECT'), code('CONFLICT'));
  assert.ok(packagePurchaseEligibility(profile!).allowed);
});

test('a rejection is appealed once, and withdrawing archives an open application', async () => {
  const applicant = await newAccount();
  const row = await submit(applicant);
  const rejected = await decide(row, 'REJECT', reviewer, 'مدرک با کد نمی‌خواند');
  await assert.rejects(
    () => appealVetApplication(testDb.db, applicant, { applicationId: row.id, expectedVersion: rejected.version, appealFa: ' ' }),
    code('VALIDATION'),
  );
  const appealed = await appealVetApplication(testDb.db, applicant, {
    applicationId: row.id,
    expectedVersion: rejected.version,
    appealFa: 'کارت تازه صادر شده است',
  });
  assert.equal(appealed.status, 'SUBMITTED');
  assert.ok(appealed.appealedAt instanceof Date);
  assert.equal((await events('VET_APPLICATION_APPEALED', row.id))[0]!.reason, 'کارت تازه صادر شده است');
  const final = await decide(appealed, 'REJECT', reviewer, 'پس از تجدیدنظر هم تأیید نشد');
  await assert.rejects(
    () => appealVetApplication(testDb.db, applicant, { applicationId: row.id, expectedVersion: final.version, appealFa: 'دوباره' }),
    message('CONFLICT', /یک‌بار/),
  );

  const second = await submit(applicant, { councilCode: 'SYN-W-' + counter });
  const withdrawn = await withdrawVetApplication(testDb.db, applicant, { applicationId: second.id, expectedVersion: second.version });
  assert.equal(withdrawn.status, 'WITHDRAWN');
  await assert.rejects(
    () => withdrawVetApplication(testDb.db, applicant, { applicationId: second.id, expectedVersion: withdrawn.version }),
    code('CONFLICT'),
  );
  const decided = await vetApplicationQueue(testDb.db, reviewer, { view: 'DECIDED', page: 1 });
  assert.ok(decided.items.some((item) => item.id === second.id));
  // An archived application does not block a new one.
  assert.equal((await submit(applicant, { councilCode: 'SYN-N-' + counter })).status, 'SUBMITTED');
});

test('a reviewer publishes an unowned profile: duplicates need confirmation, it is listed as unowned and cannot buy a package', async () => {
  const user = await newAccount();
  const input: UnownedVetInput = {
    displayNameFa: 'دامپزشک پیشنهادی ' + counter,
    cityId: tehranCityId,
    contactFa: 'مطب خیابان آزمایشی',
    sourceFa: 'SYNTHETIC وب‌سایت مطب',
    reason: 'SYNTHETIC بررسی منبع',
  };
  await assert.rejects(() => createUnownedVetProfile(testDb.db, user, input), code('FORBIDDEN'));
  await assert.rejects(() => createUnownedVetProfile(testDb.db, reviewer, { ...input, sourceFa: '' }), code('VALIDATION'));
  const profile = await createUnownedVetProfile(testDb.db, reviewer, input);
  assert.equal(profile.accountId, null);
  assert.equal(profile.councilVerifiedAt, null);
  assert.equal(profile.publicStatus, 'PUBLISHED');
  await assert.rejects(() => createUnownedVetProfile(testDb.db, reviewer, input), message('CONFLICT', /مشابه/));
  await createUnownedVetProfile(testDb.db, reviewer, { ...input, confirmedNotDuplicate: true });

  const page = await vetPageBySlug(testDb.db, profile.publicSlug!);
  assert.equal(page!.owned, false);
  assert.equal(page!.verified, false);
  assert.deepEqual(page!.listed, { cityNameFa: 'تهران', provinceNameFa: 'تهران', contactFa: 'مطب خیابان آزمایشی' });
  const cards = (await publishedVets(testDb.db, { term: input.displayNameFa, cityId: tehranCityId, page: 1 })).items;
  assert.equal(cards.length, 2);
  assert.ok(cards.every((card) => !card.owned && card.placesFa.includes('تهران')));
  assert.equal(packagePurchaseEligibility(profile).allowed, false);

  // The review operator publishes or hides; content waits for an owner.
  await assert.rejects(() => updateVetPublicProfile(testDb.db, reviewer, content(profile.id, profile.version)), code('FORBIDDEN'));
  await assert.rejects(() => updateVetPublicProfile(testDb.db, user, content(profile.id, profile.version)), code('FORBIDDEN'));
  await assert.rejects(
    () => changeVetPublicStatus(testDb.db, reviewer, { profileId: profile.id, expectedVersion: profile.version, to: 'HIDDEN', reason: '' }),
    code('VALIDATION'),
  );
  const hidden = await changeVetPublicStatus(testDb.db, reviewer, {
    profileId: profile.id,
    expectedVersion: profile.version,
    to: 'HIDDEN',
    reason: 'SYNTHETIC منبع نامعتبر',
  });
  assert.equal(hidden.hiddenByReview, true);
  assert.equal(await vetPageBySlug(testDb.db, profile.publicSlug!), null);
});

test('a claim transfers control of the same profile, keeps its history, and only one claim can win', async () => {
  const listed = await unowned('دامپزشک برای Claim ' + counter);
  const a = await newAccount();
  const b = await newAccount();
  await assert.rejects(() => submit(a, { kind: 'CLAIM', claimSlug: 'vet-0000000000' }), code('NOT_FOUND'));
  const claim = await submit(a, { kind: 'CLAIM', claimSlug: listed.publicSlug, councilCode: 'SYN-CLAIM-' + counter });
  assert.equal(claim.vetProfileId, listed.id);
  await assert.rejects(
    () => submit(b, { kind: 'CLAIM', claimSlug: listed.publicSlug, councilCode: 'SYN-CLAIM-B' + counter }),
    message('CONFLICT', /Claim دیگری/),
  );
  const coded = await unowned('دامپزشک کددار ' + counter, { councilCode: 'SYN-CODED-' + counter });
  await assert.rejects(
    () => submit(b, { kind: 'CLAIM', claimSlug: coded.publicSlug, councilCode: 'SYN-OTHER-' + counter }),
    message('VALIDATION', /نمی‌خواند/),
  );

  const approved = await decide(claim, 'APPROVE', reviewer, 'هویت و کارت نظام تطبیق داده شد');
  assert.equal(approved.vetProfileId, listed.id);
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, listed.id));
  assert.equal(profile!.accountId, a.accountId);
  assert.equal(profile!.publicSlug, listed.publicSlug, 'the same record and address');
  assert.equal(profile!.councilCode, claim.councilCode);
  assert.ok(profile!.claimedAt instanceof Date && profile!.councilVerifiedAt instanceof Date);
  // The suggestion's history stays; the claim is added to it.
  assert.equal((await events('VET_PROFILE_UNOWNED_PUBLISHED', listed.id)).length, 1);
  const [claimed] = await events('VET_PROFILE_CLAIMED', listed.id);
  assert.equal((claimed!.before as { accountId: unknown }).accountId, null);
  assert.equal(claimed!.reason, 'هویت و کارت نظام تطبیق داده شد');
  assert.equal((await vetPageBySlug(testDb.db, listed.publicSlug!))!.owned, true);
  assert.ok(packagePurchaseEligibility(profile!).allowed);
  await assert.rejects(
    () => submit(b, { kind: 'CLAIM', claimSlug: listed.publicSlug, councilCode: 'SYN-CLAIM-C' + counter }),
    code('NOT_FOUND'),
    'an owned profile is not claimable',
  );

  // Two reviewers approving the same claim at once: one applies, the other is told it is stale.
  const contested = await unowned('دامپزشک هم‌زمان ' + counter);
  const c = await newAccount();
  const race = await submit(c, { kind: 'CLAIM', claimSlug: contested.publicSlug, councilCode: 'SYN-RACE-' + counter });
  const secondReviewer = actorFor(await createTestAccount(testDb.db, '09990620003'), 'REVIEW_OPERATOR');
  const results = await Promise.allSettled([decide(race, 'APPROVE'), decide(race, 'APPROVE', secondReviewer)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  assert.ok(code('CONFLICT')(rejected!.reason));
});

test('the owner manages the profile and its own locations, which never reach the Finder, and cannot undo a review hide', async () => {
  const owner = await newAccount();
  const stranger = await newAccount();
  await decide(await submit(owner), 'APPROVE');
  let [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, owner.accountId));

  const place = { nameFa: 'مطب مالک', kind: 'CLINIC', cityId: tehranCityId, addressFa: 'نشانی مطب', phone: '02100000001', hoursNoteFa: 'عصرها', isPublic: true };
  await assert.rejects(() => addOwnLocation(testDb.db, actorFor(owner.accountId, 'AUTHOR'), place), code('FORBIDDEN'));
  await assert.rejects(() => addOwnLocation(testDb.db, stranger, place), code('FORBIDDEN'));
  await assert.rejects(() => addOwnLocation(testDb.db, owner, { ...place, cityId: '' }), code('VALIDATION'));
  const location = await addOwnLocation(testDb.db, owner, place);
  assert.equal(location.licenceStatus, 'NONE');
  assert.ok(!location.canImplantMicrochip && !location.canDrawBloodSample && !location.canPregnancyCheck);
  assert.equal(location.cityFa, 'تهران');
  assert.equal(location.provinceCode, 'tehran');
  for (const context of ['MICROCHIP', 'DNA', 'PREGNANCY'] as const) {
    assert.ok(!(await searchFinder(testDb.db, { context })).some((row) => row.location.id === location.id), context);
  }
  await assert.rejects(
    () =>
      updateLocationPublic(testDb.db, stranger, {
        locationId: location.id,
        expectedVersion: location.version,
        isPublic: false,
        provinceCode: null,
        cityId: tehranCityId,
        hoursNoteFa: null,
      }),
    code('FORBIDDEN'),
  );

  profile = await updateVetPublicProfile(
    testDb.db,
    owner,
    content(profile!.id, profile!.version, { headlineFa: 'دامپزشک', bioFa: 'معرفی مالک', showPhone: true, specialtyCodes: ['SURGERY'], speciesCodes: ['DOG'], reason: null }),
  );
  const [ownerEdit] = await events('VET_PUBLIC_PROFILE_UPDATED', profile.id);
  assert.equal(ownerEdit!.actorAccountId, owner.accountId);
  assert.equal(ownerEdit!.reason, null, 'the owner editing their own page needs no reason');
  await assert.rejects(() => updateVetPublicProfile(testDb.db, reviewer, content(profile!.id, profile!.version)), code('FORBIDDEN'));

  const id = profile.id;
  const status = (who: Actor, to: string, expectedVersion: number, reason?: string) =>
    changeVetPublicStatus(testDb.db, who, { profileId: id, expectedVersion, to, reason });
  let current = await status(owner, 'PUBLISHED', profile.version);
  current = await status(reviewer, 'HIDDEN', current.version, 'SYNTHETIC گزارش تأییدشده');
  assert.equal(current.hiddenByReview, true);
  await assert.rejects(() => status(owner, 'PUBLISHED', current.version), message('CONFLICT', /بررسی همزیست/));
  current = await status(reviewer, 'PUBLISHED', current.version, 'SYNTHETIC اصلاح شد');
  assert.equal(current.hiddenByReview, false);
  current = await status(owner, 'HIDDEN', current.version);
  assert.equal(current.hiddenByReview, false, 'an owner hiding their own page is not moderation');
  current = await status(owner, 'PUBLISHED', current.version);

  const page = await vetPageBySlug(testDb.db, current.publicSlug!);
  assert.equal(page!.owned, true);
  assert.equal(page!.verified, true);
  assert.equal(page!.trusted, false, 'verification does not make a veterinarian trusted');
  assert.equal(page!.locations.length, 1);
  assert.equal(page!.listed, null, 'a real location replaces the listed city');
});
