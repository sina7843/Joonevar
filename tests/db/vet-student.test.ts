/**
 * The veterinary student path against a real database — Phase 2.5 PROMPT-004.
 *
 * Missing fields; a duplicate or open application in every form it takes; a
 * reviewer who is not the association admin; the correction loop; rejection;
 * verification; and a verified student refused everything a doctor has.
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
import { accountRoles, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetProfessionalCases, vetProfessionalSubmissions, vetProfiles } from '../../src/db/schema/vets.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import { createSession, setSessionContext } from '../../src/identity/session.ts';
import { associationQueues } from '../../src/operations/service.ts';
import { findTarget, myTargets } from '../../src/advertising/service.ts';
import { addOwnLocation, changeVetPublicStatus, ownVetDirectory } from '../../src/vets/directory.ts';
import { submitVetApplication } from '../../src/vets/onboarding.ts';
import { currentVetTag, replaceVetTag } from '../../src/vets/professional-tags.ts';
import { professionalDashboard } from '../../src/vets/professional-profile.ts';
import {
  decideStudentCase,
  myStudentCase,
  resubmitStudentApplication,
  studentCaseForReview,
  studentCaseQueue,
  submitStudentApplication,
  type StudentApplicationInput,
} from '../../src/vets/student-application.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let superadmin: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-student-'));
  association = actorFor(await createTestAccount(testDb.db, '09990290001'), 'ASSOCIATION_OPERATOR');
  superadmin = actorFor(await createTestAccount(testDb.db, '09990290002'), 'SUPERADMIN');
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
  return actorFor(await createTestAccount(testDb.db, '0999030' + String(counter).padStart(4, '0')), context);
}

const input = (patch: Partial<StudentApplicationInput> = {}): StudentApplicationInput => ({
  displayNameFa: 'دانشجوی آزمایشی ' + counter,
  studentNumber: '9800' + String(counter).padStart(4, '0'),
  universityFa: 'دانشگاه آزمایشی',
  ...patch,
});

const apply = (actor: Actor, patch: Partial<StudentApplicationInput> = {}) => submitStudentApplication(testDb.db, storage, actor, input(patch));

const decide = (row: { id: string; version: number }, decision: string, who: Actor = association, reasonFa = 'SYNTHETIC دلیل انجمن') =>
  decideStudentCase(testDb.db, who, { caseId: row.id, expectedVersion: row.version, decision, reasonFa });

async function verifiedStudent(): Promise<Actor> {
  const student = await newApplicant();
  const row = await apply(student);
  await decide(row, 'VERIFY', association, 'SYNTHETIC کارت دانشجویی بررسی شد');
  return student;
}

// ── missing fields ─────────────────────────────────────────────────────────

test('student number and university are required, and a refused application stores nothing', async () => {
  const student = await newApplicant();
  for (const patch of [{ studentNumber: '' }, { universityFa: '' }, { displayNameFa: ' ' }, { studentNumber: '98/12' }]) {
    await assert.rejects(apply(student, patch), code('VALIDATION'), JSON.stringify(patch));
  }
  assert.equal((await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.accountId, student.accountId))).length, 0);
});

// ── duplicate and open applications ────────────────────────────────────────

test('an open student case, a doctor application, a doctor profile or the trusted role each close the student path', async () => {
  const student = await newApplicant();
  const first = await apply(student, { document: { bytes: PNG, originalName: 'card.png' } });
  assert.deepEqual([first.caseType, first.status, first.currentSubmissionVersion], ['STUDENT', 'SUBMITTED', 1]);
  await assert.rejects(apply(student), code('CONFLICT'), 'a second open student case');
  await assert.rejects(
    submitVetApplication(testDb.db, storage, student, {
      kind: 'PROFILE',
      displayNameFa: 'دکتر هم‌زمان',
      councilCode: 'SYN-STU-' + counter,
      cityId: tehranCityId,
      documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
    }),
    code('CONFLICT'),
    'a doctor application while the student case is open',
  );

  const doctorApplicant = await newApplicant();
  await submitVetApplication(testDb.db, storage, doctorApplicant, {
    kind: 'PROFILE',
    displayNameFa: 'دکتر متقاضی',
    councilCode: 'SYN-DOC-' + counter,
    cityId: tehranCityId,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
  });
  await assert.rejects(apply(doctorApplicant), code('CONFLICT'), 'a student application while a doctor application is open');

  const doctor = await newApplicant();
  await testDb.db.insert(vetProfiles).values({ accountId: doctor.accountId, displayNameFa: 'دکتر ثبت‌شده', councilCode: 'SYN-HAS-' + counter, applicantType: 'DOCTOR', practiceScope: 'GENERAL' });
  await assert.rejects(apply(doctor), code('CONFLICT'), 'a doctor profile');

  const trusted = await newApplicant();
  await testDb.db.insert(accountRoles).values({ accountId: trusted.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
  await assert.rejects(apply(trusted), code('CONFLICT'), 'the trusted veterinarian role');

  await assert.rejects(apply(await newApplicant('ASSOCIATION_OPERATOR')), code('FORBIDDEN'), 'not from an operational environment');

  // Two submissions at the same moment: one wins, the other is a conflict, never two open cases.
  const racer = await newApplicant();
  const results = await Promise.allSettled([apply(racer), apply(racer)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as { code?: string }).code, 'CONFLICT');
});

// ── unauthorized reviewer ──────────────────────────────────────────────────

test('only the association admin decides, never on their own case, always with a reason and on the current version', async () => {
  const student = await newApplicant();
  const row = await apply(student);
  for (const context of ['USER', 'TRUSTED_VET', 'REVIEW_OPERATOR', 'GENETICS_OPERATOR', 'CONTENT_ADMIN'] as const) {
    const outsider = await newApplicant(context);
    await assert.rejects(decide(row, 'VERIFY', outsider), code('FORBIDDEN'), context);
    await assert.rejects(studentCaseQueue(testDb.db, outsider, { view: 'OPEN', page: 1 }), code('FORBIDDEN'), context + ' queue');
    await assert.rejects(studentCaseForReview(testDb.db, outsider, row.id), code('FORBIDDEN'), context + ' detail');
  }
  // An association operator who applied from their own account cannot verify themselves.
  const operator = await newApplicant();
  const own = await apply(operator);
  await assert.rejects(decide(own, 'VERIFY', actorFor(operator.accountId, 'ASSOCIATION_OPERATOR')), code('FORBIDDEN'));

  await assert.rejects(decide(row, 'VERIFY', association, '  '), code('VALIDATION'), 'a decision without a reason');
  await assert.rejects(decide(row, 'APPROVE_AS_DOCTOR'), code('VALIDATION'), 'an unknown decision');
  await assert.rejects(decide({ id: row.id, version: row.version + 1 }, 'VERIFY'), code('CONFLICT'), 'a stale version');
  assert.equal((await currentVetTag(testDb.db, student.accountId)), null, 'nothing was granted by any refused decision');
});

// ── correction loop and verification ───────────────────────────────────────

test('a correction is answered with a new version, verified, and the whole history reads back without reviewer identities', async () => {
  const student = await newApplicant();
  const submitted = await apply(student, { universityFa: 'دانشگاه اشتباه' });
  const queued = await studentCaseQueue(testDb.db, association, { view: 'OPEN', page: 1 });
  assert.ok(queued.items.some((item) => item.id === submitted.id));
  assert.ok((await associationQueues(testDb.db, association)).find((queue) => queue.key === 'vet-students')!.waiting >= 1);

  const correction = await decide(submitted, 'REQUEST_CORRECTION', association, 'SYNTHETIC نام دانشگاه با کارت نمی‌خواند');
  assert.equal(correction.status, 'NEEDS_CORRECTION');
  await assert.rejects(decide(correction, 'VERIFY'), code('CONFLICT'), 'a case waiting for the applicant is not decided');
  await assert.rejects(
    resubmitStudentApplication(testDb.db, storage, await newApplicant(), { ...input(), caseId: correction.id, expectedVersion: correction.version }),
    code('NOT_FOUND'),
    'another account cannot answer it',
  );

  const resubmitted = await resubmitStudentApplication(testDb.db, storage, student, {
    ...input({ universityFa: 'دانشگاه درست', document: { bytes: PNG, originalName: 'card.png' } }),
    caseId: correction.id,
    expectedVersion: correction.version,
  });
  assert.deepEqual([resubmitted.status, resubmitted.currentSubmissionVersion], ['SUBMITTED', 2]);
  await assert.rejects(
    resubmitStudentApplication(testDb.db, storage, student, { ...input(), caseId: resubmitted.id, expectedVersion: resubmitted.version }),
    code('CONFLICT'),
    'only a case in correction is resubmitted',
  );
  const versions = await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, submitted.id));
  assert.deepEqual(versions.sort((a, b) => a.version - b.version).map((v) => (v.payload as { universityFa: string }).universityFa), ['دانشگاه اشتباه', 'دانشگاه درست']);

  const verified = await decide(resubmitted, 'VERIFY', association, 'SYNTHETIC تأیید شد');
  assert.equal(verified.status, 'VERIFIED_STUDENT');
  const tag = await currentVetTag(testDb.db, student.accountId);
  assert.deepEqual([tag!.tag, tag!.practiceScope, tag!.sourceType, tag!.sourceId], ['STUDENT', null, 'VET_STUDENT_CASE', submitted.id]);
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, student.accountId));
  assert.deepEqual([profile!.applicantType, profile!.universityFa, profile!.councilCode, profile!.publicStatus], ['STUDENT', 'دانشگاه درست', null, 'DRAFT']);

  const mine = await myStudentCase(testDb.db, student);
  assert.deepEqual(
    mine!.history.map((event) => [event.toStatus, event.reasonFa]),
    [
      ['SUBMITTED', null],
      ['NEEDS_CORRECTION', 'SYNTHETIC نام دانشگاه با کارت نمی‌خواند'],
      ['SUBMITTED', null],
      ['VERIFIED_STUDENT', 'SYNTHETIC تأیید شد'],
    ],
  );
  const dashboard = await professionalDashboard(testDb.db, student);
  assert.equal(dashboard.currentTag!.labelFa, 'دانشجوی دامپزشکی');
  assert.equal(dashboard.cases[0]!.history.length, 4, 'the dashboard carries the same history');
  assert.equal(JSON.stringify(dashboard).includes(association.accountId), false, 'no reviewer identity reaches the applicant');

  const notices = await testDb.db.select().from(notifications).where(eq(notifications.recipientAccountId, student.accountId));
  assert.equal(notices.filter((row) => row.kind === 'VET_STUDENT_CASE_DECIDED').length, 2, 'the correction and the verification were both announced');
});

test('a rejection is final for that case, gives nothing, and a new application may follow', async () => {
  const student = await newApplicant();
  const row = await apply(student);
  const rejected = await decide(row, 'REJECT', superadmin, 'SYNTHETIC شماره دانشجویی معتبر نیست');
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(await currentVetTag(testDb.db, student.accountId), null);
  assert.equal((await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, student.accountId))).length, 0);
  await assert.rejects(
    resubmitStudentApplication(testDb.db, storage, student, { ...input(), caseId: rejected.id, expectedVersion: rejected.version }),
    code('CONFLICT'),
  );
  await assert.rejects(decide(rejected, 'VERIFY'), code('CONFLICT'), 'a rejected case is not reopened by a decision');
  const again = await apply(student);
  assert.notEqual(again.id, rejected.id);
});

// ── the student tag and professional actions ───────────────────────────────

test('the student tag follows only a verified student case, never a request or another case', async () => {
  const student = await newApplicant();
  const open = await apply(student);
  const attempt = (source: { type: string; id?: string | null }) =>
    testDb.db.transaction((tx) => replaceVetTag(tx, association, { accountId: student.accountId, tag: 'STUDENT', practiceScope: null, reasonFa: 'SYNTHETIC', source }));
  await assert.rejects(attempt({ type: 'CLIENT_REQUEST' }), code('CONFLICT'));
  await assert.rejects(attempt({ type: 'VET_STUDENT_CASE', id: open.id }), code('CONFLICT'), 'a case still in review');
  const otherStudent = await verifiedStudent();
  const [otherCase] = await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.accountId, otherStudent.accountId));
  await assert.rejects(attempt({ type: 'VET_STUDENT_CASE', id: otherCase!.id }), code('CONFLICT'), "another account's verified case");
  assert.equal(await currentVetTag(testDb.db, student.accountId), null);
});

test('a verified student gets nothing a doctor has: no doctor tag, role, directory page, location, package or doctor application', async () => {
  const student = await verifiedStudent();
  const [profile] = await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, student.accountId));

  await assert.rejects(
    testDb.db.transaction((tx) => replaceVetTag(tx, superadmin, { accountId: student.accountId, tag: 'LICENSED', practiceScope: 'GENERAL', reasonFa: 'SYNTHETIC', source: { type: 'TEST' } })),
    code('CONFLICT'),
    'no doctor tag',
  );
  const roles = await testDb.db.select().from(accountRoles).where(eq(accountRoles.accountId, student.accountId));
  assert.equal(roles.length, 0, 'no role of any kind');
  const session = await createSession(testDb.db, student.accountId, 'USER');
  await assert.rejects(setSessionContext(testDb.db, session.sessionId, 'TRUSTED_VET'), code('FORBIDDEN'), 'no trusted veterinarian context');

  assert.equal(await ownVetDirectory(testDb.db, student), null, 'no directory editor');
  for (const who of [student, superadmin]) {
    await assert.rejects(
      changeVetPublicStatus(testDb.db, who, { profileId: profile!.id, expectedVersion: profile!.version, to: 'PUBLISHED', reason: 'SYNTHETIC' }),
      code('FORBIDDEN'),
      'no directory page, even from ' + who.context,
    );
  }
  await assert.rejects(addOwnLocation(testDb.db, student, { nameFa: 'مطب', kind: 'CLINIC', cityId: tehranCityId, isPublic: true }), code('FORBIDDEN'), 'no place of practice');
  assert.deepEqual(await myTargets(testDb.db, student), [], 'nothing to promote');
  assert.equal(await findTarget(testDb.db, 'VET', profile!.id), null, 'no package purchase target');
  await assert.rejects(
    submitVetApplication(testDb.db, storage, student, {
      kind: 'PROFILE',
      displayNameFa: 'دانشجو به‌عنوان دکتر',
      councilCode: 'SYN-FAKE-' + counter,
      cityId: tehranCityId,
      documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
    }),
    code('CONFLICT'),
    'no doctor application',
  );
  await assert.rejects(apply(student), code('CONFLICT'), 'no second student case once verified');
});

// ── the private card ───────────────────────────────────────────────────────

test('the student card is read by the student and the association admin only, and every read is recorded', async () => {
  const student = await newApplicant();
  const row = await apply(student, { document: { bytes: PNG, originalName: 'card.png' } });
  const detail = await studentCaseForReview(testDb.db, association, row.id);
  const fileId = detail!.documents[0]!.fileId;
  await readPrivateFile(testDb.db, storage, student, fileId);
  await readPrivateFile(testDb.db, storage, association, fileId);
  for (const context of ['USER', 'TRUSTED_VET', 'GENETICS_OPERATOR'] as const) {
    await assert.rejects(readPrivateFile(testDb.db, storage, await newApplicant(context), fileId), code('FORBIDDEN'), context);
  }
  const reads = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'PRIVATE_FILE_READ'), eq(auditEvents.targetId, fileId)));
  assert.equal(reads.length, 2);
});
