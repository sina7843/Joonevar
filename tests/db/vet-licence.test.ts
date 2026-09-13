/**
 * The licensed veterinarian submission against a real database — Phase 2.5 PROMPT-006.
 *
 * Files (real signature, size, safe name, private and audited reads), mandatory
 * components and dates, cross-field rules, revisions that never overwrite what
 * was reviewed, and the state transitions — approval reaches
 * LICENSE_APPROVED_AWAITING_PAYMENT and the licensed tag does not exist yet.
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
import { auditEvents, storedFiles } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import {
  vetProfessionalCases,
  vetProfessionalDocuments,
  vetProfessionalSubmissions,
  vetProfileCertificates,
  vetProfiles,
  vetProfileServices,
} from '../../src/db/schema/vets.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import { MB } from '../../src/files/signature.ts';
import { decideDoctorCase, submitDoctorApplication } from '../../src/vets/doctor-application.ts';
import { submitStudentApplication } from '../../src/vets/student-application.ts';
import { currentVetTag, replaceVetTag } from '../../src/vets/professional-tags.ts';
import { professionalDashboard, publicProfessionalProfile } from '../../src/vets/professional-profile.ts';
import { PUBLIC_FORBIDDEN_KEYS } from '../../src/vets/professional-profile-model.ts';
import {
  decideLicenceCase,
  licenceCaseForReview,
  licenceCaseQueue,
  reviseLicenceApplication,
  submitLicenceApplication,
  tehranToday,
  type LicenceApplicationInput,
  type LicencePayload,
} from '../../src/vets/licence-application.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let tehranCityId: string;
/**
 * Every new account takes the next number. A test that needs a value it built
 * from the counter must capture it once: creating another account later moves
 * the counter, and a later `'X' + counter` is no longer the same value.
 */
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.4 synthetic licence');
const doc = (kind: string, bytes: Uint8Array = PDF, extra: { originalName?: string; titleFa?: string } = {}) => ({ kind, bytes, originalName: kind.toLowerCase() + '.pdf', ...extra });

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-licence-'));
  association = actorFor(await createTestAccount(testDb.db, '09990330001'), 'ASSOCIATION_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function newAccount(context: Actor['context'] = 'USER'): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999034' + String(counter).padStart(4, '0')), context);
}

const input = (patch: Partial<LicenceApplicationInput> = {}): LicenceApplicationInput => ({
  displayNameFa: 'دکتر دارای پروانه ' + counter,
  practiceScope: 'SPECIALIST',
  councilCode: 'SYN-LC-' + counter,
  licenceCode: 'LIC-' + counter + '/1403',
  licenceDate: '2024-05-01',
  phone: '021-5555',
  cityId: tehranCityId,
  websiteUrl: 'clinic-' + counter + '.example.org',
  instagramHandle: '@clinic.' + counter,
  clinicNameFa: 'کلینیک آزمایشی',
  serviceCodes: ['MICROCHIP_IMPLANT', 'PREGNANCY_CHECK'],
  documents: [doc('PRACTICE_LICENCE'), doc('COUNCIL_CARD', PNG)],
  ...patch,
});

const submit = (actor: Actor, patch: Partial<LicenceApplicationInput> = {}) => submitLicenceApplication(testDb.db, storage, actor, input(patch));
const decide = (row: { id: string; version: number }, decision: string, who: Actor = association, reasonFa = 'SYNTHETIC دلیل انجمن') =>
  decideLicenceCase(testDb.db, who, { caseId: row.id, expectedVersion: row.version, decision, reasonFa });

/** A doctor whose council code the association already verified through PROMPT-005. */
async function verifiedDoctor(scope = 'GENERAL'): Promise<{ actor: Actor; councilCode: string }> {
  const actor = await newAccount();
  const councilCode = 'SYN-VD-' + counter;
  const row = await submitDoctorApplication(testDb.db, storage, actor, {
    displayNameFa: 'دکتر تأییدشده ' + counter,
    practiceScope: scope,
    councilCode,
    cityId: tehranCityId,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
  });
  await decideDoctorCase(testDb.db, association, { caseId: row.id, expectedVersion: row.version, decision: 'VERIFY', reasonFa: 'SYNTHETIC کد نظام تأیید شد' });
  return { actor, councilCode };
}

const casesOf = (accountId: string) => testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.accountId, accountId));

// ── files ──────────────────────────────────────────────────────────────────

test('files are checked by their bytes and size, keep only a safe name, and are read only by the owner and the association', async () => {
  const doctor = await newAccount();
  await assert.rejects(submit(doctor, { documents: [doc('PRACTICE_LICENCE', new TextEncoder().encode('not a pdf at all')), doc('COUNCIL_CARD', PNG)] }), code('VALIDATION'), 'a renamed text file');
  const big = new Uint8Array(10 * MB + 1);
  big.set(PNG);
  await assert.rejects(submit(doctor, { documents: [doc('PRACTICE_LICENCE', big), doc('COUNCIL_CARD', PNG)] }), code('VALIDATION'), 'more than 10 MB');
  assert.equal((await casesOf(doctor.accountId)).length, 0, 'a refused file leaves no case behind');

  const row = await submit(doctor, { documents: [doc('PRACTICE_LICENCE', PDF, { originalName: '../../etc/lic‮enc.pdf' }), doc('COUNCIL_CARD', PNG)] });
  const [licenceDoc] = await testDb.db.select().from(vetProfessionalDocuments).where(and(eq(vetProfessionalDocuments.caseId, row.id), eq(vetProfessionalDocuments.kind, 'PRACTICE_LICENCE')));
  const [file] = await testDb.db.select().from(storedFiles).where(eq(storedFiles.id, licenceDoc!.fileId));
  assert.equal(file!.mime, 'application/pdf');
  assert.equal(file!.purpose, 'VET_PROFESSIONAL_DOCUMENT');
  assert.equal(file!.originalName, 'licenc.pdf', 'no path and no bidi override survive in the name');
  assert.ok(!file!.storageKey.includes('lic'), 'the storage key is not derived from the name');

  await readPrivateFile(testDb.db, storage, doctor, file!.id);
  await readPrivateFile(testDb.db, storage, association, file!.id);
  for (const context of ['USER', 'TRUSTED_VET', 'GENETICS_OPERATOR', 'CONTENT_ADMIN'] as const) {
    await assert.rejects(readPrivateFile(testDb.db, storage, await newAccount(context), file!.id), code('FORBIDDEN'), context);
  }
  const reads = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'PRIVATE_FILE_READ'), eq(auditEvents.targetId, file!.id)));
  assert.equal(reads.length, 2);
});

// ── mandatory components, dates and cross-field rules ──────────────────────

test('a submission without every mandatory licence component is impossible', async () => {
  const doctor = await newAccount();
  const refused: Array<[string, Partial<LicenceApplicationInput>]> = [
    ['no licence file', { documents: [doc('COUNCIL_CARD', PNG)] }],
    ['no licence code', { licenceCode: '' }],
    ['no licence date', { licenceDate: '' }],
    ['no council code', { councilCode: '' }],
    ['no general or specialist', { practiceScope: '' }],
    ['a new doctor without a council card', { documents: [doc('PRACTICE_LICENCE')] }],
    ['a certificate without a title', { documents: [doc('PRACTICE_LICENCE'), doc('COUNCIL_CARD', PNG), doc('CERTIFICATE', PDF, { titleFa: ' ' })] }],
    ['two licence files', { documents: [doc('PRACTICE_LICENCE'), doc('PRACTICE_LICENCE'), doc('COUNCIL_CARD', PNG)] }],
    ['an unknown service', { serviceCodes: ['TELEPORTATION'] }],
    ['a website that is not http', { websiteUrl: 'javascript:alert(1)' }],
    ['a future licence date', { licenceDate: '2999-01-01' }],
    ['an impossible licence date', { licenceDate: '2025-02-30' }],
    ['a licence older than 1950', { licenceDate: '1949-12-31' }],
  ];
  for (const [label, patch] of refused) await assert.rejects(submit(doctor, patch), code('VALIDATION'), label);
  assert.equal((await casesOf(doctor.accountId)).length, 0);
  // A licence dated today, as Tehran reads today, is accepted.
  const ok = await submit(doctor, { licenceDate: tehranToday(new Date()) });
  assert.equal(ok.status, 'SUBMITTED');
});

test('the council code of a verified doctor cannot change, and the path is closed to students, open cases and held licences', async () => {
  const { actor: doctor, councilCode } = await verifiedDoctor();
  await assert.rejects(submit(doctor, { councilCode: 'SYN-OTHER-' + counter, documents: [doc('PRACTICE_LICENCE')] }), code('VALIDATION'), 'a different council code');
  const row = await submit(doctor, { councilCode, displayNameFa: null, documents: [doc('PRACTICE_LICENCE')] });
  assert.ok(row.vetProfileId, 'the case belongs to the verified profile');
  await assert.rejects(submit(doctor, { councilCode, documents: [doc('PRACTICE_LICENCE')] }), code('CONFLICT'), 'a second open case');

  const student = await newAccount();
  await submitStudentApplication(testDb.db, storage, student, { displayNameFa: 'دانشجو', studentNumber: '9822' + counter, universityFa: 'دانشگاه' });
  await assert.rejects(submit(student), code('CONFLICT'), 'a student in review');

  const newcomer = await newAccount();
  await assert.rejects(submit(newcomer, { councilCode }), code('CONFLICT'), 'a code another profile holds');

  await decide(row, 'APPROVE');
  await assert.rejects(submit(doctor, { councilCode, documents: [doc('PRACTICE_LICENCE')] }), code('CONFLICT'), 'a licence already approved and awaiting payment');
});

// ── revisions ──────────────────────────────────────────────────────────────

test('an edit is a new version that keeps the earlier ones and the reviewed file, and a decision on an unseen version is refused', async () => {
  const { actor: doctor, councilCode } = await verifiedDoctor();
  const n = counter;
  const oldCode = 'LIC-OLD-' + n;
  const newCode = 'LIC-NEW-' + n;
  const v1 = await submit(doctor, { councilCode, displayNameFa: null, licenceCode: oldCode, documents: [doc('PRACTICE_LICENCE'), doc('CERTIFICATE', PDF, { titleFa: 'دوره جراحی' })] });
  const reviewerSaw = { id: v1.id, version: v1.version };

  // Before review: the applicant fixes the code without a new file.
  const v2 = await reviseLicenceApplication(testDb.db, storage, doctor, { ...input({ councilCode, displayNameFa: null, licenceCode: newCode, documents: [] }), caseId: v1.id, expectedVersion: v1.version });
  assert.deepEqual([v2.status, v2.currentSubmissionVersion], ['SUBMITTED', 2]);
  await assert.rejects(decide(reviewerSaw, 'APPROVE'), code('CONFLICT'), 'the reviewer saw version 1');

  const correction = await decide(v2, 'REQUEST_CORRECTION', association, 'SYNTHETIC تصویر پروانه خوانا نیست');
  await assert.rejects(decide(correction, 'APPROVE'), code('CONFLICT'), 'a case waiting for the applicant is not decided');
  await assert.rejects(
    reviseLicenceApplication(testDb.db, storage, await newAccount(), { ...input({ documents: [] }), caseId: correction.id, expectedVersion: correction.version }),
    code('NOT_FOUND'),
    'another account cannot edit it',
  );
  const v3 = await reviseLicenceApplication(testDb.db, storage, doctor, {
    ...input({ councilCode, displayNameFa: null, licenceCode: newCode, licenceDate: '2023-01-10', documents: [doc('PRACTICE_LICENCE', PNG)] }),
    caseId: correction.id,
    expectedVersion: correction.version,
  });
  assert.deepEqual([v3.status, v3.currentSubmissionVersion], ['SUBMITTED', 3]);

  const versions = (await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, v1.id))).sort((a, b) => a.version - b.version);
  const [p1, p2, p3] = versions.map((v) => v.payload as LicencePayload);
  assert.equal(p1!.licenceCode, oldCode, 'version 1 still says what was first submitted');
  assert.equal(p2!.licenceCode, newCode);
  assert.equal(p2!.licenceFileId, p1!.licenceFileId, 'an edit without a file keeps the reviewed file');
  assert.notEqual(p3!.licenceFileId, p1!.licenceFileId, 'a new file replaces it only in the new version');
  assert.equal(p3!.certificates.length, 1, 'certificates carry forward');
  const documents = await testDb.db.select().from(vetProfessionalDocuments).where(eq(vetProfessionalDocuments.caseId, v1.id));
  assert.equal(documents.filter((d) => d.kind === 'PRACTICE_LICENCE').length, 2, 'both licence files are still evidence');

  const detail = await licenceCaseForReview(testDb.db, association, v1.id);
  assert.equal(detail!.submissions.length, 3);
  assert.ok((await licenceCaseQueue(testDb.db, association, { view: 'OPEN', page: 1 })).items.some((item) => item.id === v1.id));

  const approved = await decide(v3, 'APPROVE', association, 'SYNTHETIC پروانه و تاریخ تطبیق داده شد');
  await assert.rejects(
    reviseLicenceApplication(testDb.db, storage, doctor, { ...input({ councilCode, documents: [] }), caseId: approved.id, expectedVersion: approved.version }),
    code('CONFLICT'),
    'reviewed facts are not rewritten after approval',
  );
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId));
  assert.equal(profile!.licenceCode, newCode);
  assert.equal(profile!.licenceDate, '2023-01-10');
  assert.equal(profile!.licenceFileId, p3!.licenceFileId, 'the profile carries the file of the approved version');
});

// ── state transitions and the tag ──────────────────────────────────────────

test('approval reaches LICENSE_APPROVED_AWAITING_PAYMENT and never the licensed tag, for a verified doctor and for a new one', async () => {
  // A verified doctor with a general scope declares specialist in the licence.
  const { actor: doctor, councilCode } = await verifiedDoctor('GENERAL');
  const n = counter;
  const row = await submit(doctor, { councilCode, displayNameFa: null, documents: [doc('PRACTICE_LICENCE'), doc('CERTIFICATE', PDF, { titleFa: 'گواهی تخصص' })] });
  for (const context of ['USER', 'REVIEW_OPERATOR', 'TRUSTED_VET', 'GENETICS_OPERATOR'] as const) {
    await assert.rejects(decide(row, 'APPROVE', await newAccount(context)), code('FORBIDDEN'), context);
  }
  await assert.rejects(decide(row, 'APPROVE', actorFor(doctor.accountId, 'ASSOCIATION_OPERATOR')), code('FORBIDDEN'), 'not on their own case');
  const approved = await decide(row, 'APPROVE');
  assert.equal(approved.status, 'LICENSE_APPROVED_AWAITING_PAYMENT');
  await assert.rejects(decide(approved, 'REJECT'), code('CONFLICT'), 'a decided case is not decided again');

  const tag = await currentVetTag(testDb.db, doctor.accountId);
  assert.deepEqual([tag!.tag, tag!.practiceScope, tag!.sourceType], ['UNLICENSED', 'SPECIALIST', 'VET_LICENCE_CASE'], 'the scope follows the licence; the tag stays unlicensed');
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId));
  assert.equal(profile!.hasLicence, true);
  assert.ok(profile!.licenceVerifiedAt);
  assert.equal(profile!.licenceVerifiedByAccountId, association.accountId);
  assert.equal(profile!.websiteUrl, 'https://clinic-' + n + '.example.org/');
  assert.equal(profile!.instagramHandle, 'clinic.' + n);
  const services = await testDb.db.select().from(vetProfileServices).where(eq(vetProfileServices.vetProfileId, profile!.id));
  assert.deepEqual(services.map((s) => s.serviceCode).sort(), ['MICROCHIP_IMPLANT', 'PREGNANCY_CHECK']);
  const certificates = await testDb.db.select().from(vetProfileCertificates).where(eq(vetProfileCertificates.vetProfileId, profile!.id));
  assert.deepEqual(certificates.map((c) => c.titleFa), ['گواهی تخصص']);

  // A new doctor: council code and licence verified together, still unlicensed.
  const newcomer = await newAccount();
  const fresh = await submit(newcomer);
  assert.equal(fresh.vetProfileId, null);
  await decide(fresh, 'APPROVE', association, 'SYNTHETIC کد نظام و پروانه تطبیق داده شد');
  const [created] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, newcomer.accountId));
  assert.deepEqual([created!.applicantType, created!.practiceScope, created!.hasLicence], ['DOCTOR', 'SPECIALIST', true]);
  assert.ok(created!.councilVerifiedAt);
  assert.equal((await currentVetTag(testDb.db, newcomer.accountId))!.tag, 'UNLICENSED');
});

test('an undeclared Phase 2 scope is declared by the licence, and a rejection changes nothing', async () => {
  const legacy = await newAccount();
  const councilCode = 'SYN-LEG-' + counter;
  const [profile] = await testDb.db
    .insert(vetProfiles)
    .values({ accountId: legacy.accountId, displayNameFa: 'دکتر فاز دو', councilCode, councilVerifiedAt: new Date(), applicantType: 'DOCTOR', practiceScope: 'NOT_DECLARED' })
    .returning();
  await testDb.db.transaction((tx) =>
    replaceVetTag(tx, null, { accountId: legacy.accountId, tag: 'UNLICENSED', practiceScope: 'NOT_DECLARED', reasonFa: 'SYNTHETIC', source: { type: 'BACKFILL_VET_PROFILE', id: profile!.id } }),
  );

  const rejectedCase = await submit(legacy, { councilCode, displayNameFa: null, documents: [doc('PRACTICE_LICENCE')] });
  await decide(rejectedCase, 'REJECT', association, 'SYNTHETIC پروانه با سامانه نمی‌خواند');
  const [untouched] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, profile!.id));
  assert.deepEqual([untouched!.hasLicence, untouched!.licenceCode, untouched!.practiceScope], [null, null, 'NOT_DECLARED'], 'a rejection writes nothing to the profile');

  const second = await submit(legacy, { councilCode, displayNameFa: null, practiceScope: 'GENERAL', documents: [doc('PRACTICE_LICENCE')] });
  await decide(second, 'APPROVE');
  const tag = await currentVetTag(testDb.db, legacy.accountId);
  assert.deepEqual([tag!.tag, tag!.practiceScope], ['UNLICENSED', 'GENERAL']);
});

// ── privacy of the read models ─────────────────────────────────────────────

test('the owner sees the licence; the public never does', async () => {
  const { actor: doctor, councilCode } = await verifiedDoctor('GENERAL');
  const n = counter;
  // The licence keeps the verified general scope, so the public label is unchanged by approval.
  const row = await submit(doctor, { councilCode, displayNameFa: null, practiceScope: 'GENERAL', licenceCode: 'LIC-PRIV-' + n, documents: [doc('PRACTICE_LICENCE')] });
  await decide(row, 'APPROVE');
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, doctor.accountId));
  await testDb.db.update(vetProfiles).set({ publicStatus: 'PUBLISHED', publicSlug: 'vet-' + ('c' + n + '000000000').slice(0, 10) }).where(eq(vetProfiles.id, profile!.id));

  const own = await professionalDashboard(testDb.db, doctor);
  assert.equal(own.profile!.licenceCode, 'LIC-PRIV-' + n);
  assert.equal(own.cases.find((item) => item.caseType === 'LICENCE')!.status, 'LICENSE_APPROVED_AWAITING_PAYMENT');

  const [published] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.id, profile!.id));
  const view = await publicProfessionalProfile(testDb.db, published!.publicSlug!);
  assert.ok(view);
  assert.equal(view.tagFa, 'دکتر دامپزشک - عمومی - بدون پروانه فعالیت', 'the public still reads the unlicensed tag');
  const text = JSON.stringify(view);
  assert.equal(text.includes('LIC-PRIV'), false);
  assert.equal(text.includes(profile!.licenceFileId ?? 'none'), false);
  for (const key of PUBLIC_FORBIDDEN_KEYS) assert.equal(text.includes('"' + key + '"'), false, key);
});
