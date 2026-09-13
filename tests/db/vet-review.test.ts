/**
 * The association review workbench against a real database — Phase 2.5 PROMPT-007.
 *
 * Role isolation, claim and release under concurrency, structured checks tied to
 * a submission version, correction and resubmission, the audit trail of every
 * document view and decision (and that it cannot be changed), and the payment
 * boundary: no reviewer or association admin marks anything paid or grants the
 * licensed or trusted tag by hand.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, asc, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetCaseReviewChecks, vetProfessionalCases, vetProfessionalDocuments } from '../../src/db/schema/vets.ts';
import { readPrivateFile } from '../../src/files/storage.ts';
import { decideDoctorCase, resubmitDoctorApplication, submitDoctorApplication } from '../../src/vets/doctor-application.ts';
import { decideLicenceCase, submitLicenceApplication } from '../../src/vets/licence-application.ts';
import { currentVetTag, replaceVetTag } from '../../src/vets/professional-tags.ts';
import { vetCaseMove } from '../../src/vets/professional-model.ts';
import { claimCase, recordReviewChecks, releaseCase, reviewQueue, reviewStateFor } from '../../src/vets/review-workbench.ts';
import { setMembershipActive } from '../../src/billing/membership.ts';
import * as payments from '../../src/billing/payments.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let reviewerA: Actor;
let reviewerB: Actor;
let superadmin: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.4 synthetic licence');

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-review-'));
  reviewerA = actorFor(await createTestAccount(testDb.db, '09990360001'), 'ASSOCIATION_OPERATOR');
  reviewerB = actorFor(await createTestAccount(testDb.db, '09990360002'), 'ASSOCIATION_OPERATOR');
  superadmin = actorFor(await createTestAccount(testDb.db, '09990360003'), 'SUPERADMIN');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
/** A database refusal: drizzle wraps the driver error, whose SQLSTATE is on the cause. */
const sqlState = (expected: string) => (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause?.code ?? e.code) === expected;
};

async function newAccount(context: Actor['context'] = 'USER'): Promise<Actor> {
  counter += 1;
  return actorFor(await createTestAccount(testDb.db, '0999036' + String(counter + 100).padStart(4, '0')), context);
}

const doctorFields = (n: number) => ({ displayNameFa: 'دکتر بررسی ' + n, practiceScope: 'GENERAL', councilCode: 'SYN-RV-' + n, cityId: tehranCityId });

async function councilCase() {
  const applicant = await newAccount();
  const n = counter;
  const row = await submitDoctorApplication(testDb.db, storage, applicant, { ...doctorFields(n), documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }] });
  return { applicant, n, row };
}

const caseRow = async (id: string) => (await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, id)))[0]!;
const decide = (who: Actor, row: { id: string; version: number }, decision: string, reasonFa = 'SYNTHETIC دلیل') =>
  decideDoctorCase(testDb.db, who, { caseId: row.id, expectedVersion: row.version, decision, reasonFa });

// ── role isolation ─────────────────────────────────────────────────────────

test('only the association reviewer side opens the workbench, and never on its own case', async () => {
  const { applicant, n, row } = await councilCase();
  for (const context of ['USER', 'BREEDER', 'TRUSTED_VET', 'GENETICS_OPERATOR', 'CONTENT_ADMIN', 'AUTHOR'] as const) {
    const outsider = await newAccount(context);
    await assert.rejects(reviewQueue(testDb.db, outsider, { page: 1 }), code('FORBIDDEN'), context + ' queue');
    await assert.rejects(claimCase(testDb.db, outsider, { caseId: row.id, expectedVersion: row.version }), code('FORBIDDEN'), context + ' claim');
    await assert.rejects(reviewStateFor(testDb.db, outsider, row.id), code('FORBIDDEN'), context + ' state');
    await assert.rejects(decide(outsider, row, 'VERIFY'), code('FORBIDDEN'), context + ' decide');
  }
  const self = actorFor(applicant.accountId, 'ASSOCIATION_OPERATOR');
  await assert.rejects(claimCase(testDb.db, self, { caseId: row.id, expectedVersion: row.version }), code('FORBIDDEN'), 'a reviewer about their own case');
  assert.equal((await caseRow(row.id)).status, 'SUBMITTED', 'no refused call moved the case');

  await assert.rejects(reviewQueue(testDb.db, reviewerA, { page: 1, caseType: 'ANIMAL' }), code('VALIDATION'));
  await assert.rejects(reviewQueue(testDb.db, reviewerA, { page: 1, claim: 'EVERYONE' }), code('VALIDATION'));
  const queue = await reviewQueue(testDb.db, reviewerA, { page: 1, caseType: 'COUNCIL', q: 'SYN-RV-' + n });
  assert.deepEqual(queue.items.map((item) => item.id), [row.id], 'the search finds the case by its council code');
  assert.equal((await reviewQueue(testDb.db, reviewerA, { page: 1, caseType: 'LICENCE', q: 'SYN-RV-' + n })).items.length, 0, 'the type filter applies');
  assert.equal((await reviewQueue(testDb.db, reviewerA, { page: 1, claim: 'MINE', q: 'SYN-RV-' + n })).items.length, 0, 'nobody holds it yet');
});

// ── claim, release and concurrent review ──────────────────────────────────

test('two reviewers claiming at once: exactly one holds the case, and only the holder checks or decides it', async () => {
  const { row } = await councilCase();
  const results = await Promise.allSettled([
    claimCase(testDb.db, reviewerA, { caseId: row.id, expectedVersion: row.version }),
    claimCase(testDb.db, reviewerB, { caseId: row.id, expectedVersion: row.version }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'one claim wins');
  const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal((loser.reason as { code?: string }).code, 'CONFLICT');

  const held = await caseRow(row.id);
  const holder = held.claimedByAccountId === reviewerA.accountId ? reviewerA : reviewerB;
  const other = holder === reviewerA ? reviewerB : reviewerA;
  assert.equal(held.status, 'UNDER_REVIEW');

  await assert.rejects(decide(other, held, 'VERIFY'), code('CONFLICT'), 'a case held by someone else is not decided');
  await assert.rejects(recordReviewChecks(testDb.db, other, { caseId: row.id, expectedVersion: held.version, checks: [{ code: 'IDENTITY_MATCHES_ACCOUNT', result: 'PASS' }] }), code('CONFLICT'));
  await assert.rejects(releaseCase(testDb.db, other, { caseId: row.id, expectedVersion: held.version }), code('FORBIDDEN'), 'only the holder releases');
  await assert.rejects(releaseCase(testDb.db, superadmin, { caseId: row.id, expectedVersion: held.version }), code('VALIDATION'), 'the superadmin releases someone else only with a reason');

  const mine = await reviewQueue(testDb.db, holder, { page: 1, claim: 'MINE' });
  assert.ok(mine.items.some((item) => item.id === row.id && item.claimedByMe));
  const others = await reviewQueue(testDb.db, other, { page: 1, claim: 'OTHERS' });
  assert.ok(others.items.some((item) => item.id === row.id && item.claimedByOther));

  const released = await releaseCase(testDb.db, holder, { caseId: row.id, expectedVersion: held.version });
  assert.equal(released.status, 'SUBMITTED');
  assert.equal(released.claimedByAccountId, null);
  await assert.rejects(claimCase(testDb.db, other, { caseId: row.id, expectedVersion: held.version }), code('CONFLICT'), 'a claim on a version already moved on is stale');

  const reclaimed = await claimCase(testDb.db, other, { caseId: row.id, expectedVersion: released.version });
  // The same holder submitting two decisions at once: the version admits one.
  const decisions = await Promise.allSettled([decide(other, reclaimed, 'VERIFY'), decide(other, reclaimed, 'REJECT')]);
  assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
  const decided = await caseRow(row.id);
  assert.ok(['VERIFIED_NO_LICENSE', 'REJECTED'].includes(decided.status));
  assert.equal(decided.claimedByAccountId, null, 'a decision ends the claim');
  assert.equal(decided.claimedAt, null);
});

test('an unclaimed submitted case is still decided in one step, and the database refuses a claim that does not match the status', async () => {
  const { row } = await councilCase();
  const decided = await decide(reviewerA, row, 'REJECT', 'SYNTHETIC مدرک ناخوانا');
  assert.equal(decided.status, 'REJECTED');
  await assert.rejects(
    testDb.db.update(vetProfessionalCases).set({ claimedByAccountId: reviewerA.accountId, claimedAt: new Date() }).where(eq(vetProfessionalCases.id, row.id)),
    sqlState('23514'),
    'a claim on a closed case',
  );
  const { row: other } = await councilCase();
  await assert.rejects(testDb.db.update(vetProfessionalCases).set({ status: 'UNDER_REVIEW' }).where(eq(vetProfessionalCases.id, other.id)), sqlState('23514'), 'a review nobody holds');
});

// ── structured checks, correction and resubmission ────────────────────────

test('checks belong to one submission version: a failed check blocks approval until a corrected version passes', async () => {
  const { applicant, n, row } = await councilCase();
  const claimed = await claimCase(testDb.db, reviewerA, { caseId: row.id, expectedVersion: row.version });
  const record = (version: number, checks: { code: string; result: string; noteFa?: string }[]) =>
    recordReviewChecks(testDb.db, reviewerA, { caseId: row.id, expectedVersion: version, checks });

  await assert.rejects(record(claimed.version, [{ code: 'LICENCE_FILE_LEGIBLE', result: 'PASS' }]), code('VALIDATION'), 'a check of another case type');
  await assert.rejects(record(claimed.version, [{ code: 'COUNCIL_CARD_MATCHES', result: 'MAYBE' }]), code('VALIDATION'));
  await assert.rejects(record(claimed.version, [{ code: 'COUNCIL_CARD_MATCHES', result: 'FAIL' }]), code('VALIDATION'), 'a failure needs a note');
  await record(claimed.version, [
    { code: 'COUNCIL_CARD_MATCHES', result: 'FAIL', noteFa: 'SYNTHETIC کارت ناخوانا' },
    { code: 'IDENTITY_MATCHES_ACCOUNT', result: 'PASS' },
  ]);
  await assert.rejects(decide(reviewerA, claimed, 'VERIFY'), code('CONFLICT'), 'approval over a failed check');

  const state = await reviewStateFor(testDb.db, reviewerA, row.id);
  assert.equal(state!.checks.find((c) => c.code === 'COUNCIL_CARD_MATCHES')!.result, 'FAIL');
  assert.equal(state!.canRecordChecks, true);

  const corrected = await decide(reviewerA, claimed, 'REQUEST_CORRECTION', 'SYNTHETIC تصویر خوانای کارت را بفرستید');
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  const resubmitted = await resubmitDoctorApplication(testDb.db, storage, applicant, {
    ...doctorFields(n),
    caseId: row.id,
    expectedVersion: corrected.version,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card-2.png' }],
  });
  assert.equal(resubmitted.status, 'SUBMITTED');
  assert.equal(resubmitted.currentSubmissionVersion, 2);

  const fresh = await reviewStateFor(testDb.db, reviewerB, row.id);
  assert.ok(fresh!.checks.every((c) => c.result === null), 'the new version starts unchecked');
  const again = await claimCase(testDb.db, reviewerB, { caseId: row.id, expectedVersion: resubmitted.version });
  await recordReviewChecks(testDb.db, reviewerB, { caseId: row.id, expectedVersion: again.version, checks: [{ code: 'COUNCIL_CARD_MATCHES', result: 'PASS' }] });
  const verified = await decide(reviewerB, again, 'VERIFY', 'SYNTHETIC کد نظام تأیید شد');
  assert.equal(verified.status, 'VERIFIED_NO_LICENSE');

  const checks = await testDb.db.select().from(vetCaseReviewChecks).where(eq(vetCaseReviewChecks.caseId, row.id)).orderBy(asc(vetCaseReviewChecks.createdAt));
  assert.deepEqual(checks.map((c) => [c.submissionVersion, c.checkCode, c.result]), [
    [1, 'COUNCIL_CARD_MATCHES', 'FAIL'],
    [1, 'IDENTITY_MATCHES_ACCOUNT', 'PASS'],
    [2, 'COUNCIL_CARD_MATCHES', 'PASS'],
  ]);
  await assert.rejects(testDb.db.update(vetCaseReviewChecks).set({ result: 'PASS' }).where(eq(vetCaseReviewChecks.id, checks[0]!.id)), sqlState('23001'), 'a recorded check is not edited');
  await assert.rejects(testDb.db.delete(vetCaseReviewChecks).where(eq(vetCaseReviewChecks.id, checks[0]!.id)), sqlState('23001'), 'nor removed');
});

// ── audit ──────────────────────────────────────────────────────────────────

test('every document view and every review step is audited with actor, case, old and new status and reason, and the trail cannot be changed', async () => {
  const { row } = await councilCase();
  const [card] = await testDb.db.select().from(vetProfessionalDocuments).where(eq(vetProfessionalDocuments.caseId, row.id));
  await readPrivateFile(testDb.db, storage, reviewerA, card!.fileId);
  const [view] = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'PRIVATE_FILE_READ'), eq(auditEvents.targetId, card!.fileId)));
  assert.equal(view!.actorAccountId, reviewerA.accountId);
  assert.equal(view!.actorContext, 'ASSOCIATION_OPERATOR');
  assert.deepEqual(
    { caseId: (view!.metadata as Record<string, unknown>).caseId, caseStatus: (view!.metadata as Record<string, unknown>).caseStatus, kind: (view!.metadata as Record<string, unknown>).kind },
    { caseId: row.id, caseStatus: 'SUBMITTED', kind: 'COUNCIL_CARD' },
  );

  const claimed = await claimCase(testDb.db, reviewerA, { caseId: row.id, expectedVersion: row.version });
  await decide(reviewerA, claimed, 'REJECT', 'SYNTHETIC دلیل رد');
  const trail = await testDb.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.targetType, 'VET_PROFESSIONAL_CASE'), eq(auditEvents.targetId, row.id)))
    .orderBy(asc(auditEvents.occurredAt));
  const claim = trail.find((e) => e.action === 'VET_CASE_CLAIMED')!;
  assert.deepEqual([(claim.before as { status: string }).status, (claim.after as { status: string }).status], ['SUBMITTED', 'UNDER_REVIEW']);
  const decision = trail.at(-1)!;
  assert.equal(decision.actorAccountId, reviewerA.accountId);
  assert.equal(decision.reason, 'SYNTHETIC دلیل رد');
  assert.equal((decision.after as { status: string }).status, 'REJECTED');
  assert.ok(decision.before && (decision.before as { status: string }).status, 'the old status is recorded');
  assert.ok(decision.occurredAt instanceof Date);

  await assert.rejects(testDb.db.execute(sql`update audit_event set reason = 'rewritten' where id = ${decision.id}`), sqlState('23001'), 'no update');
  await assert.rejects(testDb.db.execute(sql`delete from audit_event where id = ${decision.id}`), sqlState('23001'), 'no delete');
  const [still] = await testDb.db.select().from(auditEvents).where(eq(auditEvents.id, decision.id));
  assert.equal(still!.reason, 'SYNTHETIC دلیل رد');
});

// ── payment boundary ──────────────────────────────────────────────────────

test('association reviewers and admins cannot mark a payment successful or grant a paid tag by hand', async () => {
  const applicant = await newAccount();
  const n = counter;
  const row = await submitLicenceApplication(testDb.db, storage, applicant, {
    displayNameFa: 'دکتر پروانه ' + n,
    practiceScope: 'GENERAL',
    councilCode: 'SYN-RP-' + n,
    licenceCode: 'LIC-RV-' + n,
    licenceDate: '2024-05-01',
    phone: '021-5555',
    cityId: tehranCityId,
    serviceCodes: [],
    documents: [
      { kind: 'PRACTICE_LICENCE', bytes: PDF, originalName: 'licence.pdf' },
      { kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' },
    ],
  });
  const claimed = await claimCase(testDb.db, reviewerA, { caseId: row.id, expectedVersion: row.version });
  const approved = await decideLicenceCase(testDb.db, reviewerA, { caseId: row.id, expectedVersion: claimed.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC مدارک درست است' });
  assert.equal(approved.status, 'LICENSE_APPROVED_AWAITING_PAYMENT');
  assert.notEqual((await currentVetTag(testDb.db, applicant.accountId))?.tag, 'LICENSED');

  // No reviewer move reaches the active licensed status; only the system, after a verified payment.
  assert.equal(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'REVIEWER'), null);
  assert.ok(vetCaseMove('LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'SYSTEM'));

  for (const actor of [reviewerA, superadmin]) {
    for (const tag of ['LICENSED', 'TRUSTED'] as const) {
      await assert.rejects(
        testDb.db.transaction((tx) => replaceVetTag(tx, actor, { accountId: applicant.accountId, tag, practiceScope: 'GENERAL', reasonFa: 'SYNTHETIC دستی', source: { type: 'TEST' } })),
        code('FORBIDDEN'),
        actor.context + ' ' + tag,
      );
    }
  }
  assert.notEqual((await currentVetTag(testDb.db, applicant.accountId))?.tag, 'LICENSED');

  // Membership activation refuses an account that never paid; the billing module has no manual "paid" path at all.
  await assert.rejects(setMembershipActive(testDb.db, reviewerA, { accountId: applicant.accountId, active: true, reasonFa: 'SYNTHETIC پرداخت دستی' }), code('CONFLICT'));
  assert.deepEqual(Object.keys(payments).filter((name) => /mark|paid|success|manual/i.test(name)), []);
});
