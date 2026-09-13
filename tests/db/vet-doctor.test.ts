/**
 * The doctor-without-licence path against a real database — Phase 2.5 PROMPT-005.
 *
 * Normalisation; duplicates in every form they take; claims that must never seize
 * an owned record; correction and rejection; manual verification by the
 * association admin that gives exactly the unlicensed tag and directory
 * introduction; the trusted and licensed paths staying shut; and a later licence
 * upgrade that keeps the earlier evidence and tag history.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { accountRoles, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetApplications, vetProfessionalCases, vetProfessionalSubmissions, vetProfiles, vetTagAssignments } from '../../src/db/schema/vets.ts';
import { createSession, setSessionContext } from '../../src/identity/session.ts';
import { vetEligibilityFor } from '../../src/domain/eligibility/service.ts';
import { searchFinder } from '../../src/vets/registry.ts';
import { addOwnLocation, changeVetPublicStatus, ownVetDirectory } from '../../src/vets/directory.ts';
import { createUnownedVetProfile } from '../../src/vets/onboarding.ts';
import { submitStudentApplication } from '../../src/vets/student-application.ts';
import { currentVetTag, replaceVetTag, vetTagHistory } from '../../src/vets/professional-tags.ts';
import {
  decideDoctorCase,
  doctorCaseForReview,
  doctorCaseQueue,
  resubmitDoctorApplication,
  submitDoctorApplication,
  type DoctorApplicationInput,
} from '../../src/vets/doctor-application.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let reviewOperator: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const card = (kind = 'COUNCIL_CARD') => ({ kind, bytes: PNG, originalName: kind.toLowerCase() + '.png' });

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-doctor-'));
  association = actorFor(await createTestAccount(testDb.db, '09990310001'), 'ASSOCIATION_OPERATOR');
  reviewOperator = actorFor(await createTestAccount(testDb.db, '09990310002'), 'REVIEW_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function newApplicant(context: Actor['context'] = 'USER'): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999032' + String(counter).padStart(4, '0')), context);
}

const input = (patch: Partial<DoctorApplicationInput> = {}): DoctorApplicationInput => ({
  displayNameFa: 'دکتر متقاضی ' + counter,
  practiceScope: 'GENERAL',
  councilCode: 'SYN-DR-' + counter,
  phone: '02100000000',
  cityId: tehranCityId,
  statementFa: null,
  documents: [card()],
  ...patch,
});

const apply = (actor: Actor, patch: Partial<DoctorApplicationInput> = {}) => submitDoctorApplication(testDb.db, storage, actor, input(patch));
const decide = (row: { id: string; version: number }, decision: string, who: Actor = association, reasonFa = 'SYNTHETIC دلیل انجمن') =>
  decideDoctorCase(testDb.db, who, { caseId: row.id, expectedVersion: row.version, decision, reasonFa });

async function unownedPage(councilCode: string | null = null) {
  counter += 1;
  return createUnownedVetProfile(testDb.db, reviewOperator, {
    displayNameFa: 'دامپزشک بدون مالک ' + counter,
    cityId: tehranCityId,
    contactFa: 'SYNTHETIC خیابان',
    sourceFa: 'SYNTHETIC منبع',
    councilCode,
    reason: 'SYNTHETIC',
    confirmedNotDuplicate: true,
  });
}

// ── normalisation ──────────────────────────────────────────────────────────

test('the council code is normalised, general or specialist is required, and no licence evidence is accepted here', async () => {
  const doctor = await newApplicant();
  const raw = ' syn dr ۷۷' + counter + ' ';
  const row = await apply(doctor, { councilCode: raw, practiceScope: 'SPECIALIST' });
  const [submission] = await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id));
  const payload = submission!.payload as { councilCode: string; practiceScope: string; declaredLicence: boolean };
  assert.equal(payload.councilCode, 'SYNDR77' + counter);
  assert.equal(payload.practiceScope, 'SPECIALIST');
  assert.equal(payload.declaredLicence, false);

  const other = await newApplicant();
  for (const patch of [{ practiceScope: '' }, { practiceScope: 'NOT_DECLARED' }, { councilCode: '' }, { councilCode: 'A/B' }, { documents: [] }, { documents: [card(), card('PRACTICE_LICENCE')] }]) {
    await assert.rejects(apply(other, patch), code('VALIDATION'), JSON.stringify(Object.keys(patch)));
  }
  assert.equal((await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.accountId, other.accountId))).length, 0);
});

// ── duplicates ─────────────────────────────────────────────────────────────

test('duplicates are refused: an open case, a student case, an open Phase 2 application, an owned profile, a held code, the trusted role', async () => {
  const doctor = await newApplicant();
  await apply(doctor);
  await assert.rejects(apply(doctor), code('CONFLICT'), 'a second open case');

  const student = await newApplicant();
  await submitStudentApplication(testDb.db, storage, student, { displayNameFa: 'دانشجو', studentNumber: '9811' + counter, universityFa: 'دانشگاه' });
  await assert.rejects(apply(student), code('CONFLICT'), 'a student case in review');

  const legacy = await newApplicant();
  await testDb.db.insert(vetApplications).values({ accountId: legacy.accountId, kind: 'PROFILE', displayNameFa: 'قدیمی', councilCode: 'SYN-LEG-' + counter });
  await assert.rejects(apply(legacy), code('CONFLICT'), 'a Phase 2 application still open');

  const owner = await newApplicant();
  await testDb.db.insert(vetProfiles).values({ accountId: owner.accountId, displayNameFa: 'دارنده', councilCode: 'SYN-OWN-' + counter, applicantType: 'DOCTOR', practiceScope: 'GENERAL' });
  await assert.rejects(apply(owner), code('CONFLICT'), 'an account that already has a profile');
  await assert.rejects(apply(await newApplicant(), { councilCode: 'SYN-OWN-' + (counter - 1) }), code('CONFLICT'), 'a code another owned profile holds');

  const page = await unownedPage('SYN-UNO-' + counter);
  await assert.rejects(apply(await newApplicant(), { councilCode: page.councilCode! }), (error: unknown) => {
    const detail = (error as { detail?: { claimSlug?: string } }).detail;
    return code('CONFLICT')(error) && detail?.claimSlug === page.publicSlug;
  }, 'a code held by an unowned page points to its claim');

  const trusted = await newApplicant();
  await testDb.db.insert(accountRoles).values({ accountId: trusted.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
  await assert.rejects(apply(trusted), code('CONFLICT'));

  await assert.rejects(apply(await newApplicant('REVIEW_OPERATOR')), code('FORBIDDEN'), 'not from an operational environment');
  const racer = await newApplicant();
  const results = await Promise.allSettled([apply(racer), apply(racer)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'two simultaneous submissions leave one case');
});

// ── claims ─────────────────────────────────────────────────────────────────

test('a claim targets only a published unowned page, matches its code, and is one at a time', async () => {
  const page = await unownedPage('SYN-CLM-' + counter);
  const claimant = await newApplicant();
  await assert.rejects(apply(claimant, { claimSlug: 'vet-0000000000' }), code('NOT_FOUND'), 'an address that is no page');
  await assert.rejects(apply(claimant, { claimSlug: page.publicSlug!, councilCode: 'SYN-OTHER-' + counter }), code('VALIDATION'), 'a code that is not the page code');
  const claim = await apply(claimant, { claimSlug: page.publicSlug!, councilCode: page.councilCode! });
  assert.equal(claim.vetProfileId, page.id);
  await assert.rejects(apply(await newApplicant(), { claimSlug: page.publicSlug!, councilCode: page.councilCode! }), code('CONFLICT'), 'a second claim of the same page');

  const verified = await decide(claim, 'VERIFY', association, 'SYNTHETIC هویت و کارت تطبیق شد');
  const [after] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, page.id));
  assert.equal(after!.accountId, claimant.accountId, 'the same row changed hands');
  assert.equal(after!.publicSlug, page.publicSlug, 'the address stays');
  assert.ok(after!.claimedAt);
  assert.equal(verified.vetProfileId, page.id);
  await assert.rejects(apply(await newApplicant(), { claimSlug: page.publicSlug!, councilCode: page.councilCode! }), code('NOT_FOUND'), 'an owned page is not claimable');
});

test('an approval never seizes a page that became owned while the claim waited', async () => {
  const page = await unownedPage(null);
  const claimant = await newApplicant();
  const claim = await apply(claimant, { claimSlug: page.publicSlug!, councilCode: 'SYN-SEIZE-' + counter });
  const firstOwner = await newApplicant();
  await testDb.db.update(vetProfiles).set({ accountId: firstOwner.accountId }).where(eq(vetProfiles.id, page.id));

  await assert.rejects(decide(claim, 'VERIFY'), code('CONFLICT'));
  const [still] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, page.id));
  assert.equal(still!.accountId, firstOwner.accountId, 'the owner is unchanged');
  assert.equal(await currentVetTag(testDb.db, claimant.accountId), null, 'the claimant gained nothing');
  const [waiting] = await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, claim.id));
  assert.equal(waiting!.status, 'SUBMITTED', 'the failed approval rolled back entirely');
});

// ── correction, rejection, reviewers ───────────────────────────────────────

test('correction adds a version, rejection is final, and only the association admin decides', async () => {
  const doctor = await newApplicant();
  const row = await apply(doctor, { practiceScope: 'GENERAL' });
  for (const context of ['USER', 'TRUSTED_VET', 'REVIEW_OPERATOR', 'GENETICS_OPERATOR'] as const) {
    const outsider = await newApplicant(context);
    await assert.rejects(decide(row, 'VERIFY', outsider), code('FORBIDDEN'), context);
    await assert.rejects(doctorCaseQueue(testDb.db, outsider, { view: 'OPEN', page: 1 }), code('FORBIDDEN'), context);
  }
  await assert.rejects(decide(row, 'VERIFY', actorFor(doctor.accountId, 'ASSOCIATION_OPERATOR')), code('FORBIDDEN'), 'not on their own case');
  await assert.rejects(decide(row, 'VERIFY', association, ' '), code('VALIDATION'));

  const correction = await decide(row, 'REQUEST_CORRECTION', association, 'SYNTHETIC کارت نظام خوانا نیست');
  const resubmitted = await resubmitDoctorApplication(testDb.db, storage, doctor, {
    ...input({ practiceScope: 'SPECIALIST' }),
    caseId: correction.id,
    expectedVersion: correction.version,
    documents: [card('IDENTITY')],
  });
  const versions = await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id));
  assert.deepEqual(versions.sort((a, b) => a.version - b.version).map((v) => (v.payload as { practiceScope: string }).practiceScope), ['GENERAL', 'SPECIALIST']);

  const detail = await doctorCaseForReview(testDb.db, association, row.id);
  assert.equal(detail!.submissions.length, 2);
  assert.deepEqual(detail!.documents.map((document) => [document.kind, document.submissionVersion]), [['COUNCIL_CARD', 1], ['IDENTITY', 2]]);

  const rejected = await decide(resubmitted, 'REJECT', association, 'SYNTHETIC کد نظام در سامانه نظام پیدا نشد');
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(await currentVetTag(testDb.db, doctor.accountId), null);
  assert.equal((await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId))).length, 0);
  await assert.rejects(resubmitDoctorApplication(testDb.db, storage, doctor, { ...input(), caseId: rejected.id, expectedVersion: rejected.version, documents: [] }), code('CONFLICT'));
  assert.notEqual((await apply(doctor)).id, rejected.id, 'a new application may follow a rejection');
});

test('a mirrored Phase 2 application is not decided from the association queue', async () => {
  const legacy = await newApplicant();
  const [application] = await testDb.db.insert(vetApplications).values({ accountId: legacy.accountId, kind: 'PROFILE', displayNameFa: 'قدیمی', councilCode: 'SYN-MIR-' + counter }).returning();
  const [mirrored] = await testDb.db
    .insert(vetProfessionalCases)
    .values({ accountId: legacy.accountId, caseType: 'COUNCIL', status: 'SUBMITTED', currentSubmissionVersion: 1, legacyApplicationId: application!.id })
    .returning();
  await assert.rejects(decide(mirrored!, 'VERIFY'), code('NOT_FOUND'));
  assert.equal(await doctorCaseForReview(testDb.db, association, mirrored!.id), null);
});

// ── verification and what it does not give ────────────────────────────────

test('verification gives exactly the unlicensed tag with the declared scope and a directory introduction, and infers nothing else', async () => {
  const doctor = await newApplicant();
  const row = await apply(doctor, { practiceScope: 'SPECIALIST' });
  const verified = await decide(row, 'VERIFY', association, 'SYNTHETIC کد نظام و کارت تطبیق شد');
  assert.equal(verified.status, 'VERIFIED_NO_LICENSE');

  const tag = await currentVetTag(testDb.db, doctor.accountId);
  assert.deepEqual([tag!.tag, tag!.practiceScope, tag!.sourceType, tag!.sourceId], ['UNLICENSED', 'SPECIALIST', 'VET_COUNCIL_CASE', row.id]);
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId));
  assert.equal(profile!.applicantType, 'DOCTOR');
  assert.equal(profile!.practiceScope, 'SPECIALIST');
  assert.equal(profile!.councilCode, 'SYN-DR-' + (counter));
  assert.equal(profile!.councilVerifiedByAccountId, association.accountId);
  assert.equal(profile!.hasLicence, false, 'the declared absence of a licence, not a guess');
  assert.equal(profile!.licenceCode, null);
  assert.equal(profile!.licenceVerifiedAt, null);
  const notices = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, doctor.accountId));
  assert.ok(notices.some((notice) => notice.kind === 'VET_DOCTOR_CASE_DECIDED'));

  // Directory introduction: the page is theirs to write and publish.
  const own = await ownVetDirectory(testDb.db, doctor);
  assert.ok(own, 'the directory editor opens');
  await addOwnLocation(testDb.db, doctor, { nameFa: 'مطب ' + counter, kind: 'CLINIC', cityId: tehranCityId, isPublic: true });
  await testDb.db.update(vetProfiles).set({ bioFa: 'SYNTHETIC معرفی' }).where(eq(vetProfiles.id, profile!.id));
  const [fresh] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, profile!.id));
  const published = await changeVetPublicStatus(testDb.db, doctor, { profileId: fresh!.id, expectedVersion: fresh!.version, to: 'PUBLISHED' });
  assert.equal(published.publicStatus, 'PUBLISHED');

  // Nothing trusted or licensed follows.
  assert.equal((await testDb.db.select().from(accountRoles).where(eq(accountRoles.accountId, doctor.accountId))).length, 0, 'no role');
  const session = await createSession(testDb.db, doctor.accountId, 'USER');
  await assert.rejects(setSessionContext(testDb.db, session.sessionId, 'TRUSTED_VET'), code('FORBIDDEN'), 'no trusted context');
  assert.equal(await vetEligibilityFor(testDb.db, doctor.accountId), null, 'no trusted work eligibility');
  const finder = await searchFinder(testDb.db, { context: 'MICROCHIP', term: 'مطب ' + counter });
  assert.equal(finder.length, 0, 'a published location does not reach the Finder');
});

test('a later licence upgrade adds evidence and a new tag while the council evidence and tag history stay', async () => {
  const doctor = await newApplicant();
  const row = await apply(doctor, { practiceScope: 'GENERAL' });
  await decide(row, 'VERIFY', association, 'SYNTHETIC تأیید');
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId));

  // The shape PROMPT-006 will fill: a licence case may open beside the closed council case.
  const [licenceCase] = await testDb.db
    .insert(vetProfessionalCases)
    .values({ accountId: doctor.accountId, vetProfileId: profile!.id, caseType: 'LICENCE', status: 'SUBMITTED', currentSubmissionVersion: 1 })
    .returning();
  const [file] = await testDb.db
    .execute<{ id: string }>(
      sql`insert into stored_file (owner_account_id, purpose, mime, size_bytes, sha256, storage_key)
          values (${doctor.accountId}, 'VET_PROFESSIONAL_DOCUMENT', 'image/png', 12, ${'3'.repeat(64)}, ${'synthetic/upgrade-' + counter + '.png'}) returning id`,
    )
    .then((result) => result.rows);
  await testDb.db
    .update(vetProfiles)
    .set({ hasLicence: true, licenceCode: 'LIC-UP-' + counter, licenceDate: '2026-01-01', licenceFileId: file!.id, licenceVerifiedAt: new Date(), licenceVerifiedByAccountId: association.accountId })
    .where(eq(vetProfiles.id, profile!.id));
  await testDb.db.transaction((tx) =>
    replaceVetTag(tx, null, { accountId: doctor.accountId, tag: 'LICENSED', practiceScope: 'GENERAL', reasonFa: 'SYNTHETIC پرداخت تأییدشده', source: { type: 'TEST', id: licenceCase!.id } }),
  );

  const history = await vetTagHistory(testDb.db, association, doctor.accountId);
  assert.deepEqual(history.map((entry) => [entry.tag, entry.endedAt === null]), [['UNLICENSED', false], ['LICENSED', true]]);
  const [council] = await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, row.id));
  assert.equal(council!.status, 'VERIFIED_NO_LICENSE', 'the council case is not rewritten');
  const councilSubmissions = await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id));
  assert.equal((councilSubmissions[0]!.payload as { declaredLicence: boolean }).declaredLicence, false, 'what was declared then is still what was declared then');
  const tags = await testDb.db.select().from(vetTagAssignments).where(eq(vetTagAssignments.accountId, doctor.accountId));
  assert.equal(tags.length, 2);
});
