/**
 * The canonical veterinary professional profile in the database — Phase 2.5 PROMPT-003.
 *
 *  - old data: 0032 on a database that already holds Phase 1 and Phase 2 vets,
 *    applications and documents; nothing about a licence, a speciality or a
 *    student is invented, and the applications stay as they were;
 *  - invalid cross-field combinations refused by the database itself;
 *  - evidence that cannot be rewritten, and a correction that adds a version;
 *  - privacy of the three read models, and payloads a mobile client can take as they are;
 *  - every read of a professional document recorded.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { createDatabase } from '../../src/db/client.ts';
import { MIGRATIONS_FOLDER, migrateTo } from '../../src/db/migrate.ts';
import { accountRoles, auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import {
  vetProfessionalCases,
  vetProfessionalDocuments,
  vetProfessionalSubmissions,
  vetProfileEquipment,
  vetProfiles,
  vetProfileServices,
} from '../../src/db/schema/vets.ts';
import { putPrivateFile, readPrivateFile } from '../../src/files/storage.ts';
import { decideVetApplication, resubmitVetApplication, submitVetApplication } from '../../src/vets/onboarding.ts';
import { upsertVetProfile } from '../../src/vets/registry.ts';
import { currentVetTag, replaceVetTag } from '../../src/vets/professional-tags.ts';
import { professionalDashboard, professionalProfileForReview, publicProfessionalProfile } from '../../src/vets/professional-profile.ts';
import { PUBLIC_FORBIDDEN_KEYS } from '../../src/vets/professional-profile-model.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let reviewer: Actor;
let superadmin: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-profile-'));
  reviewer = actorFor(await createTestAccount(testDb.db, '09990270001'), 'REVIEW_OPERATOR');
  superadmin = actorFor(await createTestAccount(testDb.db, '09990270002'), 'SUPERADMIN');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const pgCode = (error: unknown): string | undefined =>
  (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
const appCode = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function newAccount(): Promise<{ id: string; mobile: string }> {
  counter += 1;
  const mobile = '0999028' + String(counter).padStart(4, '0');
  return { id: await createTestAccount(testDb.db, mobile), mobile };
}

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key);
      keysDeep(inner, out);
    }
  }
  return out;
}

/** A payload a mobile client can take as it is: plain JSON, no Date, no bigint, no undefined. */
function assertMobileSafe(payload: unknown, maxBytes: number): void {
  const text = JSON.stringify(payload);
  assert.deepEqual(JSON.parse(text), payload, 'survives a JSON round trip unchanged');
  assert.ok(Buffer.byteLength(text) <= maxBytes, 'payload is ' + Buffer.byteLength(text) + ' bytes');
}

// ── old data ───────────────────────────────────────────────────────────────

test('0032 on Phase 1 and Phase 2 data: profiles typed only where the data says so, applications become cases with their evidence', async () => {
  const upgraded = await createTestDb({ migrate: false });
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-migrations-0031-'));
  try {
    await fs.cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = path.join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as { entries: { tag: string }[] };
    // The release before 0032 has neither 0032 nor anything written after it.
    const cut = journal.entries.findIndex((entry) => entry.tag === '0032_vet-professional-profile');
    for (const entry of journal.entries.slice(cut)) await fs.rm(path.join(folder, entry.tag + '.sql'));
    journal.entries = journal.entries.slice(0, cut);
    await fs.writeFile(journalPath, JSON.stringify(journal));
    const previous = createDatabase(upgraded.url);
    try {
      await migrate(previous.db, { migrationsFolder: folder });
    } finally {
      await previous.pool.end();
    }

    const { db, pool } = createDatabase(upgraded.url);
    const ids: Record<string, string> = {};
    try {
      const one = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows[0]!;
      const account = async (mobile: string) => (await one<{ id: string }>(sql`insert into account (mobile, status) values (${mobile}, 'ACTIVE') returning id`)).id;
      ids.reviewer = await account('09990279000');
      ids.registry = await account('09990279001');
      ids.approved = await account('09990279002');
      ids.correcting = await account('09990279003');
      ids.claimant = await account('09990279004');
      const profile = async (accountId: string | null, code: string | null, verified: boolean) =>
        (
          await one<{ id: string }>(
            sql`insert into vet_profile (account_id, display_name_fa, council_code, council_verified_at)
                values (${accountId}, ${'دامپزشک ' + (code ?? 'بدون مالک')}, ${code}, ${verified ? sql`now()` : null}) returning id`,
          )
        ).id;
      ids.registryProfile = await profile(ids.registry, 'SYN-OLD-1', true);
      ids.approvedProfile = await profile(ids.approved, 'SYN-OLD-2', true);
      ids.unowned = await profile(null, null, false);
      await db.execute(sql`insert into vet_profile_specialty (vet_profile_id, specialty_code) values (${ids.registryProfile}, 'SURGERY')`);

      const application = async (accountId: string, kind: string, status: string, code: string, profileId: string | null, reviewed: boolean) =>
        (
          await one<{ id: string }>(
            sql`insert into vet_application (account_id, kind, vet_profile_id, display_name_fa, council_code, phone, status, review_note_fa, reviewed_by_account_id, reviewed_at)
                values (${accountId}, ${kind}, ${profileId}, ${'متقاضی ' + code}, ${code}, '02100000000', ${status}, ${reviewed ? 'SYNTHETIC دلیل' : null},
                        ${reviewed ? ids.reviewer : null}, ${reviewed ? sql`now()` : null}) returning id`,
          )
        ).id;
      ids.approvedApp = await application(ids.approved, 'PROFILE', 'APPROVED', 'SYN-OLD-2', ids.approvedProfile, true);
      ids.correctingApp = await application(ids.correcting, 'PROFILE', 'NEEDS_CORRECTION', 'SYN-OLD-3', null, true);
      ids.claimApp = await application(ids.claimant, 'CLAIM', 'REJECTED', 'SYN-OLD-4', ids.unowned, true);
      ids.file = (
        await one<{ id: string }>(
          sql`insert into stored_file (owner_account_id, purpose, mime, size_bytes, sha256, storage_key)
              values (${ids.correcting}, 'VET_APPLICATION_DOCUMENT', 'image/png', 12, ${'0'.repeat(64)}, 'synthetic/old-council-card.png') returning id`,
        )
      ).id;
      await db.execute(sql`insert into vet_application_document (application_id, file_id, kind) values (${ids.correctingApp}, ${ids.file}, 'COUNCIL_CARD')`);
    } finally {
      await pool.end();
    }

    await migrateTo(upgraded.url);

    const after = createDatabase(upgraded.url);
    try {
      const profiles = await after.db.select().from(vetProfiles);
      const byId = new Map(profiles.map((row) => [row.id, row]));
      for (const id of [ids.registryProfile!, ids.approvedProfile!]) {
        const row = byId.get(id)!;
        assert.equal(row.applicantType, 'DOCTOR');
        assert.equal(row.practiceScope, 'NOT_DECLARED', 'general or specialist is not guessed, even from a listed speciality');
        assert.equal(row.hasLicence, null, 'no licence answer is invented');
        assert.equal(row.licenceCode, null);
        assert.equal(row.licenceDate, null);
        assert.equal(row.studentNumber, null);
      }
      assert.equal(byId.get(ids.registryProfile!)!.councilVerifiedByAccountId, null, 'the Phase 1 registry recorded no verifier');
      assert.equal(byId.get(ids.approvedProfile!)!.councilVerifiedByAccountId, ids.reviewer, 'the approving reviewer is known');
      assert.equal(byId.get(ids.unowned!)!.applicantType, null, 'an unowned page is nobody yet');

      const cases = await after.db.select().from(vetProfessionalCases);
      assert.equal(cases.length, 3);
      const caseOf = (applicationId: string) => cases.find((row) => row.legacyApplicationId === applicationId)!;
      assert.deepEqual([caseOf(ids.approvedApp!).caseType, caseOf(ids.approvedApp!).status], ['COUNCIL', 'VERIFIED_NO_LICENSE']);
      assert.deepEqual([caseOf(ids.correctingApp!).caseType, caseOf(ids.correctingApp!).status], ['COUNCIL', 'NEEDS_CORRECTION']);
      assert.deepEqual([caseOf(ids.claimApp!).caseType, caseOf(ids.claimApp!).status], ['CLAIM', 'REJECTED']);
      assert.equal(caseOf(ids.claimApp!).vetProfileId, ids.unowned, 'the claim keeps the page it was about');

      const submissions = await after.db.select().from(vetProfessionalSubmissions);
      assert.equal(submissions.length, 3);
      const correcting = submissions.find((row) => row.caseId === caseOf(ids.correctingApp!).id)!;
      assert.equal(correcting.version, 1);
      assert.equal((correcting.payload as { councilCode: string }).councilCode, 'SYN-OLD-3');

      const documents = await after.db.select().from(vetProfessionalDocuments);
      assert.deepEqual(
        documents.map((row) => [row.caseId, row.fileId, row.kind, row.submissionVersion]),
        [[caseOf(ids.correctingApp!).id, ids.file, 'COUNCIL_CARD', 1]],
      );

      const applications = await after.db.execute<{ status: string }>(sql`select status::text from vet_application order by status`);
      assert.deepEqual(applications.rows.map((row) => row.status), ['APPROVED', 'NEEDS_CORRECTION', 'REJECTED'], 'applications are not rewritten');
      assert.equal((await after.db.select().from(vetProfileServices)).length, 0, 'no service is claimed for anyone');
      assert.equal((await after.db.select().from(vetProfileEquipment)).length, 0, 'no equipment is declared for anyone');
      const specialties = await after.db.execute<{ count: string }>(sql`select count(*)::text as count from vet_profile_specialty`);
      assert.equal(specialties.rows[0]!.count, '1', 'listed specialities stay as they were');
    } finally {
      await after.pool.end();
    }
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
    await upgraded.drop();
  }
});

// ── invalid combinations ───────────────────────────────────────────────────

test('the database refuses every cross-field combination the product rules out', async () => {
  const { id: accountId } = await newAccount();
  const [profile] = await testDb.db
    .insert(vetProfiles)
    .values({ accountId, displayNameFa: 'دامپزشک ترکیب نامعتبر', councilCode: 'SYN-MIX-' + counter, applicantType: 'DOCTOR', practiceScope: 'GENERAL' })
    .returning();
  const [file] = await testDb.db.execute<{ id: string }>(
    sql`insert into stored_file (owner_account_id, purpose, mime, size_bytes, sha256, storage_key)
        values (${accountId}, 'VET_PROFESSIONAL_DOCUMENT', 'image/png', 12, ${'1'.repeat(64)}, ${'synthetic/mix-' + counter + '.png'}) returning id`,
  ).then((result) => result.rows);
  const set = (patch: Partial<typeof vetProfiles.$inferInsert>) => testDb.db.update(vetProfiles).set(patch).where(eq(vetProfiles.id, profile!.id));
  const refused = async (label: string, patch: Partial<typeof vetProfiles.$inferInsert>) =>
    assert.rejects(set(patch), (error) => pgCode(error) === '23514', label);

  await refused('a student with a council code', { applicantType: 'STUDENT', practiceScope: null });
  await refused('a doctor with a student number', { studentNumber: '981234' });
  await refused('no applicant type with a student number', { applicantType: null, practiceScope: null, studentNumber: '981234' });
  await refused('no applicant type with a scope', { applicantType: null });
  await refused('a licence code while declaring no licence', { hasLicence: false, licenceCode: 'LIC-1' });
  await refused('a licence code with the question unanswered', { licenceCode: 'LIC-1' });
  await refused('a licence verified without its file', { hasLicence: true, licenceCode: 'LIC-1', licenceDate: '2025-04-01', licenceVerifiedAt: new Date() });
  await refused('a council code verified without a code', { councilCode: null, councilVerifiedAt: new Date() });

  // And the full, valid licence is accepted.
  await set({ hasLicence: true, licenceCode: 'LIC-1', licenceDate: '2025-04-01', licenceFileId: file!.id, licenceVerifiedAt: new Date(), licenceVerifiedByAccountId: reviewer.accountId });
});

// ── evidence and versions ──────────────────────────────────────────────────

test('a correction adds a version; the evidence reviewed before cannot be rewritten or deleted', async () => {
  const applicant = await newAccount();
  const actor = actorFor(applicant.id, 'USER');
  const submitted = await submitVetApplication(testDb.db, storage, actor, {
    kind: 'PROFILE',
    displayNameFa: 'دامپزشک نسخه ' + counter,
    councilCode: 'SYN-VER-' + counter,
    cityId: tehranCityId,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
  });
  const [caseRow] = await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.legacyApplicationId, submitted.id));
  assert.deepEqual([caseRow!.caseType, caseRow!.status, caseRow!.currentSubmissionVersion], ['COUNCIL', 'SUBMITTED', 1]);

  const correction = await decideVetApplication(testDb.db, reviewer, { applicationId: submitted.id, expectedVersion: submitted.version, decision: 'REQUEST_CORRECTION', reasonFa: 'SYNTHETIC کارت خوانا نیست' });
  const resubmitted = await resubmitVetApplication(testDb.db, storage, actor, {
    applicationId: correction.id,
    expectedVersion: correction.version,
    displayNameFa: 'دامپزشک نسخه ' + counter,
    councilCode: 'SYN-VER-FIXED-' + counter,
    cityId: tehranCityId,
    documents: [{ kind: 'IDENTITY', bytes: PNG, originalName: 'id.png' }],
  });
  await decideVetApplication(testDb.db, reviewer, { applicationId: resubmitted.id, expectedVersion: resubmitted.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC تأیید' });

  const [final] = await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, caseRow!.id));
  assert.deepEqual([final!.status, final!.currentSubmissionVersion], ['VERIFIED_NO_LICENSE', 2]);
  const versions = await testDb.db.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, caseRow!.id));
  assert.deepEqual(
    versions.sort((a, b) => a.version - b.version).map((row) => [row.version, (row.payload as { councilCode: string }).councilCode]),
    [[1, 'SYN-VER-' + counter], [2, 'SYN-VER-FIXED-' + counter]],
    'the first submission still says what it said',
  );
  const documents = await testDb.db.select().from(vetProfessionalDocuments).where(eq(vetProfessionalDocuments.caseId, caseRow!.id));
  assert.deepEqual(documents.map((row) => [row.kind, row.submissionVersion]).sort(), [['COUNCIL_CARD', 1], ['IDENTITY', 2]]);

  const first = versions.find((row) => row.version === 1)!;
  await assert.rejects(testDb.db.execute(sql`update vet_professional_submission set payload = '{}'::jsonb where id = ${first.id}`), (error) => pgCode(error) === '23001');
  await assert.rejects(testDb.db.execute(sql`delete from vet_professional_submission where id = ${first.id}`), (error) => pgCode(error) === '23001');
  await assert.rejects(testDb.db.execute(sql`update vet_professional_document set kind = 'OTHER' where id = ${documents[0]!.id}`), (error) => pgCode(error) === '23001');
  await assert.rejects(testDb.db.execute(sql`delete from vet_professional_document where id = ${documents[0]!.id}`), (error) => pgCode(error) === '23001');
});

// ── read models ────────────────────────────────────────────────────────────

async function publishedDoctor() {
  const owner = await newAccount();
  const [licence] = await testDb.db.execute<{ id: string }>(
    sql`insert into stored_file (owner_account_id, purpose, mime, size_bytes, sha256, storage_key)
        values (${owner.id}, 'VET_PROFESSIONAL_DOCUMENT', 'image/png', 12, ${'2'.repeat(64)}, ${'synthetic/licence-' + counter + '.png'}) returning id`,
  ).then((result) => result.rows);
  const slug = 'vet-' + (counter.toString(16) + '0000000000').slice(0, 10);
  const [profile] = await testDb.db
    .insert(vetProfiles)
    .values({
      accountId: owner.id,
      displayNameFa: 'دکتر عمومی ' + counter,
      councilCode: 'SYN-PUB-' + counter,
      councilVerifiedAt: new Date(),
      applicantType: 'DOCTOR',
      practiceScope: 'SPECIALIST',
      hasLicence: true,
      licenceCode: 'LIC-SECRET-' + counter,
      licenceDate: '2025-04-01',
      licenceFileId: licence!.id,
      licenceVerifiedAt: new Date(),
      clinicNameFa: 'کلینیک آزمایشی',
      websiteUrl: 'https://clinic.example.org/',
      instagramHandle: 'clinic.vet',
      phone: '02100000009',
      publicSlug: slug,
      publicStatus: 'PUBLISHED',
    })
    .returning();
  await testDb.db.insert(vetProfileServices).values({ vetProfileId: profile!.id, serviceCode: 'MICROCHIP_IMPLANT' });
  await testDb.db.insert(vetProfileEquipment).values({ vetProfileId: profile!.id, equipmentCode: 'MICROCHIP_READER' });
  await testDb.db.transaction((tx) =>
    replaceVetTag(tx, null, { accountId: owner.id, tag: 'LICENSED', practiceScope: 'SPECIALIST', reasonFa: 'SYNTHETIC پرداخت', source: { type: 'TEST' } }),
  );
  return { owner, profile: profile!, slug };
}

test('the public reads the one tag and what was published, never a licence detail, a document or a workflow state', async () => {
  const { profile, slug } = await publishedDoctor();
  const view = await publicProfessionalProfile(testDb.db, slug);
  assert.ok(view);
  assert.equal(view.tagFa, 'دکتر دامپزشک - متخصص - دارای پروانه فعالیت');
  assert.deepEqual(view.servicesFa, ['کاشت میکروچیپ']);
  assert.deepEqual(view.declaredEquipmentFa, ['دستگاه میکروچیپ‌ریدر']);
  assert.equal(view.councilCode, null, 'no consent, no council code');
  assert.equal(view.phone, null, 'no consent, no phone');
  const keys = keysDeep(view);
  for (const forbidden of PUBLIC_FORBIDDEN_KEYS) assert.equal(keys.includes(forbidden), false, forbidden);
  const text = JSON.stringify(view);
  assert.equal(text.includes('LIC-SECRET'), false, 'the licence code appears nowhere in the payload');
  assert.equal(text.includes(profile.licenceFileId!), false, 'nor does the licence file');
  assertMobileSafe(view, 2_048);

  await testDb.db.update(vetProfiles).set({ showCouncilCode: true, showPhone: true }).where(eq(vetProfiles.id, profile.id));
  const consented = await publicProfessionalProfile(testDb.db, slug);
  assert.equal(consented!.councilCode, profile.councilCode);
  assert.equal(consented!.phone, '02100000009');

  await testDb.db.update(vetProfiles).set({ hiddenByReview: true }).where(eq(vetProfiles.id, profile.id));
  assert.equal(await publicProfessionalProfile(testDb.db, slug), null, 'a hidden page is not there');
  assert.equal(await publicProfessionalProfile(testDb.db, 'not-a-slug'), null);
});

test('the dashboard answers only about the caller, and never names who reviewed them', async () => {
  const { owner } = await publishedDoctor();
  const own = await professionalDashboard(testDb.db, actorFor(owner.id, 'USER'));
  assert.equal(own.profile!.licenceCode?.startsWith('LIC-SECRET'), true, 'the account sees its own licence code');
  assert.equal(own.currentTag!.tag, 'LICENSED');
  assert.equal(own.tagHistory.length, 1);
  const keys = keysDeep(own);
  for (const internal of ['reviewedByAccountId', 'grantedByAccountId', 'endedByAccountId', 'councilVerifiedByAccountId', 'licenceVerifiedByAccountId', 'payload', 'duplicates']) {
    assert.equal(keys.includes(internal), false, internal);
  }
  assertMobileSafe(own, 16_384);

  const stranger = await newAccount();
  const theirs = await professionalDashboard(testDb.db, actorFor(stranger.id, 'USER'));
  assert.deepEqual(theirs, { profile: null, currentTag: null, tagHistory: [], cases: [] }, 'another account sees nothing of the first');
});

test('the reviewer view is for the reviewer side only, shows every version and the shared codes, and is audited', async () => {
  const { owner, profile } = await publishedDoctor();
  const twin = await newAccount();
  await testDb.db.insert(vetProfiles).values({ accountId: twin.id, displayNameFa: 'پروفایل هم‌پروانه', applicantType: 'DOCTOR', practiceScope: 'GENERAL', hasLicence: true, licenceCode: profile.licenceCode });

  for (const context of ['USER', 'TRUSTED_VET', 'ASSOCIATION_OPERATOR', 'CONTENT_ADMIN'] as const) {
    await assert.rejects(professionalProfileForReview(testDb.db, actorFor((await newAccount()).id, context), owner.id), appCode('FORBIDDEN'), context);
  }
  const view = await professionalProfileForReview(testDb.db, reviewer, owner.id);
  assert.ok(view);
  assert.equal(view.profile!.licenceVerifiedAt !== null, true);
  assert.deepEqual(view.duplicates.map((row) => row.accountId), [twin.id], 'a licence code held twice is shown');
  assert.equal(view.tagHistory[0]!.sourceType, 'TEST');
  assertMobileSafe(view, 32_768);
  const audit = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'VET_PROFESSIONAL_PROFILE_VIEWED'), eq(auditEvents.targetId, owner.id)));
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.actorAccountId, reviewer.accountId);
  assert.equal(await professionalProfileForReview(testDb.db, reviewer, 'not-a-uuid'), null);
});

test('a professional document is read only by its owner and the reviewer side, and every read is recorded', async () => {
  const owner = await newAccount();
  const ownerActor = actorFor(owner.id, 'USER');
  const stored = await testDb.db.transaction((tx) =>
    putPrivateFile(tx, storage, ownerActor, { ownerAccountId: owner.id, purpose: 'VET_PROFESSIONAL_DOCUMENT', bytes: PNG, originalName: 'licence.png' }),
  );
  await readPrivateFile(testDb.db, storage, ownerActor, stored.id);
  await readPrivateFile(testDb.db, storage, reviewer, stored.id);
  for (const context of ['USER', 'TRUSTED_VET', 'ASSOCIATION_OPERATOR'] as const) {
    await assert.rejects(readPrivateFile(testDb.db, storage, actorFor((await newAccount()).id, context), stored.id), appCode('FORBIDDEN'), context);
  }
  const reads = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'PRIVATE_FILE_READ'), eq(auditEvents.targetId, stored.id)));
  assert.deepEqual(reads.map((row) => row.actorAccountId).sort(), [owner.id, reviewer.accountId].sort(), 'two allowed reads, two records; refused reads read nothing');
});

// ── the Phase 1 registry ───────────────────────────────────────────────────

test('the superadmin registry gives a new vet the unlicensed tag once, and never lowers a later tag', async () => {
  const vet = await newAccount();
  await testDb.db.insert(accountRoles).values({ accountId: vet.id, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: new Date() });
  await upsertVetProfile(testDb.db, superadmin, { mobile: vet.mobile, displayNameFa: 'دامپزشک ثبت فاز یک', councilCode: 'SYN-REG-' + counter, phone: null });
  const first = await currentVetTag(testDb.db, vet.id);
  assert.deepEqual([first!.tag, first!.practiceScope, first!.sourceType], ['UNLICENSED', 'NOT_DECLARED', 'LEGACY_VET_REGISTRY']);

  await testDb.db.transaction((tx) =>
    replaceVetTag(tx, null, { accountId: vet.id, tag: 'LICENSED', practiceScope: 'GENERAL', reasonFa: 'SYNTHETIC پرداخت', source: { type: 'TEST' } }),
  );
  await upsertVetProfile(testDb.db, superadmin, { mobile: vet.mobile, displayNameFa: 'دامپزشک ثبت فاز یک - ویرایش', councilCode: 'SYN-REG-' + counter, phone: null });
  assert.equal((await currentVetTag(testDb.db, vet.id))!.tag, 'LICENSED', 'editing the registry entry does not lower the tag');
});
