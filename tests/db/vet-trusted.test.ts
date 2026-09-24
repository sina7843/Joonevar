/**
 * The trusted-veterinarian application against a real database — Phase 2.5 PROMPT-010.
 *
 * Eligibility from the two authoritative answers (an active licence period and a
 * valid membership), the request offered to nobody else, the declaration and the
 * accepted terms version stored as they were made, correction and resubmission,
 * and the races: a membership or a licence that runs out between applying and
 * deciding stops the approval.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { becomeMember, configureMembership } from '../helpers/membership.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetProfessionalCases, vetTrustedDeclarations } from '../../src/db/schema/vets.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { saveProfile } from '../../src/identity/account.ts';
import { decideLicenceCase, submitLicenceApplication } from '../../src/vets/licence-application.ts';
import { enforceLicencePeriod, startLicencePayment } from '../../src/vets/licence-period.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { setMembershipStanding } from '../../src/billing/membership.ts';
import { addDays } from '../../src/domain/period.ts';
import {
  decideTrustedCase,
  myTrustedCase,
  reviseTrustedApplication,
  submitTrustedApplication,
  trustedCaseForReview,
  trustedCaseQueue,
  trustedEligibility,
} from '../../src/vets/trusted-application.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let tehranCityId: string;
let counter = 0;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.4 synthetic licence');
const TERMS_FA = 'SYNTHETIC — تعهدنامه آزمایشی دامپزشک معتمد.';
const TERMS_VERSION = 'v1-SYNTHETIC';
const DECLARATION_VERSION = 'd1-SYNTHETIC';
const LICENCE_TOMAN = 400_000;

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify() {
    return { paid: true, amountRial, providerRef: 'p-trusted' };
  },
});

function syntheticNationalId(seed: number): string {
  const body = String(100_000_000 + seed * 137).slice(0, 9);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return body + String(remainder < 2 ? remainder : 11 - remainder);
}

const setSetting = (key: string, value: unknown) =>
  testDb.db.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = ${key}`);

async function configureTrustedTerms(): Promise<void> {
  await setSetting('guide_text.trusted_vet_terms', TERMS_FA);
  await setSetting('trusted_vet.terms_version', TERMS_VERSION);
  await setSetting('trusted_vet.declaration_version', DECLARATION_VERSION);
}

async function configureLicence(): Promise<void> {
  await setSetting('vet_licence.activation_toman', String(LICENCE_TOMAN));
  await setSetting('vet_licence.renewal_toman', '300000');
  await setSetting('vet_licence.period_days', 365);
  await setSetting('vet_licence.grace_days', 10);
  await setSetting('vet_licence.reminder_days_before', 30);
}

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-trusted-'));
  association = actorFor(await createTestAccount(testDb.db, '09990410001'), 'ASSOCIATION_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
  await configureTrustedTerms();
  await configureLicence();
  await configureMembership(testDb.db);
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

/** An account with approved KYC — everything the other steps need and nothing more. */
async function approvedAccount(): Promise<Actor> {
  counter += 1;
  const actor = actorFor(await createTestAccount(testDb.db, '0999041' + String(counter + 100).padStart(4, '0')), 'USER');
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'معتمد ' + counter,
    displayName: 'نمایشی ' + counter,
    nationalId: syntheticNationalId(counter),
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, storage, actor, { bytes: JPEG });
  const submitted = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, association, { caseId: submitted.id, decision: 'APPROVED' });
  return actor;
}

/** A veterinarian whose licence documents are approved and whose period is paid for. */
async function activeLicensedVet(options: { member?: boolean } = {}): Promise<Actor> {
  const actor = await approvedAccount();
  const n = counter;
  const row = await submitLicenceApplication(testDb.db, storage, actor, {
    displayNameFa: 'دکتر معتمد ' + n,
    practiceScope: 'GENERAL',
    councilCode: 'SYN-TR-' + n,
    licenceCode: 'LIC-TR-' + n,
    licenceDate: '2024-05-01',
    phone: '021-5555',
    cityId: tehranCityId,
    serviceCodes: [],
    documents: [
      { kind: 'PRACTICE_LICENCE', bytes: PDF, originalName: 'licence.pdf' },
      { kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' },
    ],
  });
  await decideLicenceCase(testDb.db, association, { caseId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC مدارک پروانه' });
  const started = await startLicencePayment(testDb.db, actor);
  const gateway = payingGateway(BigInt(LICENCE_TOMAN) * 10n);
  const attempt = await startAttempt(testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  assert.equal((await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state, 'PAID');
  if (options.member !== false) await becomeMember(testDb.db, actor, association);
  return actor;
}

const declaration = (patch: Record<string, unknown> = {}) => ({
  acceptedTermsVersion: TERMS_VERSION,
  microchipReaderDeclared: true,
  statementFa: 'SYNTHETIC توضیح متقاضی',
  ...patch,
});

const caseRow = async (id: string) => (await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, id)))[0]!;

// ── every missing prerequisite ─────────────────────────────────────────────

test('the request belongs to an active licensed vet with a valid membership, and each missing condition says so itself', async () => {
  // Nothing at all: not a licensed vet, so the request is not even offered.
  const plain = await approvedAccount();
  const none = await trustedEligibility(testDb.db, plain.accountId);
  assert.equal(none.isActiveLicensedVet, false);
  assert.equal(none.allowed, false);
  assert.deepEqual(none.unmet.map((requirement) => requirement.code), ['LICENCE', 'MEMBERSHIP']);
  await assert.rejects(submitTrustedApplication(testDb.db, plain, declaration()), code('CONFLICT'));

  // A licensed vet without a membership: the request is offered, disabled, and the reason links to the membership.
  const unmember = await activeLicensedVet({ member: false });
  const withoutMembership = await trustedEligibility(testDb.db, unmember.accountId);
  assert.equal(withoutMembership.isActiveLicensedVet, true, 'the request is shown to an active licensed vet');
  assert.equal(withoutMembership.allowed, false);
  assert.deepEqual(withoutMembership.unmet.map((requirement) => requirement.code), ['MEMBERSHIP']);
  assert.equal(withoutMembership.unmet[0]!.href, '/membership');
  await assert.rejects(submitTrustedApplication(testDb.db, unmember, declaration()), code('CONFLICT'));
  assert.equal(await myTrustedCase(testDb.db, unmember), null, 'a refused request leaves no case');

  // Both conditions, but the terms are not published yet.
  const ready = await activeLicensedVet();
  await setSetting('trusted_vet.terms_version', null);
  const noTerms = await trustedEligibility(testDb.db, ready.accountId);
  assert.deepEqual(noTerms.unmet.map((requirement) => requirement.code), ['TERMS']);
  await assert.rejects(submitTrustedApplication(testDb.db, ready, declaration()), code('CONFLICT'));
  await configureTrustedTerms();

  const allowed = await trustedEligibility(testDb.db, ready.accountId);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.terms.textFa, TERMS_FA);
});

test('the declaration is required, and the version accepted is the version stored', async () => {
  const vet = await activeLicensedVet();
  await assert.rejects(submitTrustedApplication(testDb.db, vet, declaration({ microchipReaderDeclared: false })), code('VALIDATION'), 'no declaration, no application');
  await assert.rejects(submitTrustedApplication(testDb.db, vet, declaration({ acceptedTermsVersion: 'v0-OLD' })), code('VALIDATION'), 'an older version of the terms');

  const row = await submitTrustedApplication(testDb.db, vet, declaration({ equipmentCodes: [] }));
  assert.equal(row.status, 'SUBMITTED');
  const [stored] = await testDb.db.select().from(vetTrustedDeclarations).where(eq(vetTrustedDeclarations.caseId, row.id));
  assert.equal(stored!.termsVersion, TERMS_VERSION);
  assert.equal(stored!.declarationVersion, DECLARATION_VERSION);
  assert.equal(stored!.microchipReaderDeclared, true);
  assert.ok(stored!.declaredAt instanceof Date);

  // What was declared is evidence of that moment: it is never edited or removed.
  const sqlState = (expected: string) => (error: unknown) => ((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === expected;
  await assert.rejects(testDb.db.update(vetTrustedDeclarations).set({ termsVersion: 'v9' }).where(eq(vetTrustedDeclarations.id, stored!.id)), sqlState('23001'));
  await assert.rejects(testDb.db.delete(vetTrustedDeclarations).where(eq(vetTrustedDeclarations.id, stored!.id)), sqlState('23001'));

  // A second open application is refused while this one is open.
  await assert.rejects(submitTrustedApplication(testDb.db, vet, declaration()), code('CONFLICT'));
  const detail = await trustedCaseForReview(testDb.db, association, row.id);
  assert.equal(detail!.declaredEquipment.some((item) => item.code === 'MICROCHIP_READER'), true, 'the reader is recorded as declared');
});

// ── review, correction and resubmission ───────────────────────────────────

test('a correction is answered with a new version, and the association decides with a reason', async () => {
  const vet = await activeLicensedVet();
  const row = await submitTrustedApplication(testDb.db, vet, declaration());

  for (const context of ['USER', 'BREEDER', 'TRUSTED_VET', 'GENETICS_OPERATOR'] as const) {
    const outsider = actorFor(await createTestAccount(testDb.db, '0999041' + String(800 + counter++).padStart(4, '0')), context);
    await assert.rejects(trustedCaseQueue(testDb.db, outsider), code('FORBIDDEN'), context);
    await assert.rejects(
      decideTrustedCase(testDb.db, outsider, { caseId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: 'x' }),
      code('FORBIDDEN'),
      context,
    );
  }
  await assert.rejects(
    decideTrustedCase(testDb.db, association, { caseId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: '  ' }),
    code('VALIDATION'),
    'a decision always carries a reason',
  );

  const queue = await trustedCaseQueue(testDb.db, association);
  assert.ok(queue.some((item) => item.id === row.id));

  const corrected = await decideTrustedCase(testDb.db, association, {
    caseId: row.id,
    expectedVersion: row.version,
    decision: 'REQUEST_CORRECTION',
    reasonFa: 'SYNTHETIC توضیح تجهیزات را کامل کنید',
  });
  assert.equal(corrected.status, 'NEEDS_CORRECTION');

  const answered = await reviseTrustedApplication(testDb.db, vet, {
    ...declaration({ statementFa: 'SYNTHETIC اصلاح شد' }),
    caseId: row.id,
    expectedVersion: corrected.version,
  });
  assert.equal(answered.status, 'SUBMITTED');
  assert.equal(answered.currentSubmissionVersion, 2);
  const declarations = await testDb.db.select().from(vetTrustedDeclarations).where(eq(vetTrustedDeclarations.caseId, row.id));
  assert.equal(declarations.length, 2, 'each version keeps its own declaration');

  const approved = await decideTrustedCase(testDb.db, association, {
    caseId: row.id,
    expectedVersion: answered.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC شرایط کامل است',
  });
  assert.equal(approved.status, 'TRUSTED_APPROVED_AWAITING_PAYMENT', 'approval opens the payment and nothing more');
  const mine = await myTrustedCase(testDb.db, vet);
  assert.equal(mine!.statusFa, 'معتمد تأییدشده، در انتظار پرداخت');
  const notices = await testDb.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, vet.accountId), eq(notifications.kind, 'VET_TRUSTED_CASE_DECIDED')));
  assert.equal(notices.length, 2, 'the correction and the approval were both told');
  // Ordered explicitly: an unordered select returns rows in whatever order the
  // plan produces, so `at(-1)` was reading the correction instead of the approval
  // whenever the scan came back the other way round.
  const decided = (await testDb.db.select().from(auditEvents).orderBy(auditEvents.occurredAt)).filter(
    (event) => event.action === 'VET_TRUSTED_CASE_DECIDED' && event.targetId === row.id,
  );
  assert.equal(decided.length, 2);
  assert.equal(decided.at(-1)!.reason, 'SYNTHETIC شرایط کامل است');
});

// ── the races ─────────────────────────────────────────────────────────────

test('a membership that lapses between applying and deciding stops the approval, not the correction', async () => {
  const vet = await activeLicensedVet();
  const row = await submitTrustedApplication(testDb.db, vet, declaration());

  await setMembershipStanding(testDb.db, association, { accountId: vet.accountId, action: 'SUSPEND', reasonFa: 'SYNTHETIC تعلیق میان بررسی' });
  await assert.rejects(
    decideTrustedCase(testDb.db, association, { caseId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC' }),
    code('CONFLICT'),
    'the approval is refused while the membership is not valid',
  );
  assert.equal((await caseRow(row.id)).status, 'SUBMITTED', 'the refused approval moved nothing');

  const detail = await trustedCaseForReview(testDb.db, association, row.id);
  assert.equal(detail!.stillEligible, false);
  assert.ok(detail!.eligibilityNow.some((requirement) => requirement.code === 'MEMBERSHIP' && !requirement.met));

  // Asking for a correction or rejecting is still possible: neither hands anything out.
  const corrected = await decideTrustedCase(testDb.db, association, {
    caseId: row.id,
    expectedVersion: row.version,
    decision: 'REQUEST_CORRECTION',
    reasonFa: 'SYNTHETIC عضویت خود را معتبر کنید',
  });
  assert.equal(corrected.status, 'NEEDS_CORRECTION');
  // And the applicant cannot answer it while the condition is missing either.
  await assert.rejects(
    reviseTrustedApplication(testDb.db, vet, { ...declaration(), caseId: row.id, expectedVersion: corrected.version }),
    code('CONFLICT'),
  );

  await setMembershipStanding(testDb.db, association, { accountId: vet.accountId, action: 'REINSTATE', reasonFa: 'SYNTHETIC رفع تعلیق' });
  const answered = await reviseTrustedApplication(testDb.db, vet, { ...declaration(), caseId: row.id, expectedVersion: corrected.version });
  const approved = await decideTrustedCase(testDb.db, association, {
    caseId: row.id,
    expectedVersion: answered.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC شرایط برقرار شد',
  });
  assert.equal(approved.status, 'TRUSTED_APPROVED_AWAITING_PAYMENT');
});

test('a licence period that runs out between applying and deciding stops the approval too', async () => {
  const vet = await activeLicensedVet();
  const row = await submitTrustedApplication(testDb.db, vet, declaration());

  // Time passes: the paid licence period and its grace are over.
  const period = (await testDb.db.execute<{ ends_at: Date }>(sql`select ends_at from vet_licence_period where account_id = ${vet.accountId} and status = 'ACTIVE'`)).rows[0]!;
  const lapsed = addDays(new Date(period.ends_at), 11);
  await enforceLicencePeriod(testDb.db, vet.accountId, lapsed);

  const eligibility = await trustedEligibility(testDb.db, vet.accountId, lapsed);
  assert.equal(eligibility.isActiveLicensedVet, false, 'the request is no longer offered at all');
  assert.ok(eligibility.unmet.some((requirement) => requirement.code === 'LICENCE'));

  await assert.rejects(
    decideTrustedCase(testDb.db, association, { caseId: row.id, expectedVersion: row.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC' }, lapsed),
    code('CONFLICT'),
  );
  assert.equal((await caseRow(row.id)).status, 'SUBMITTED');

  // Rejecting an application whose conditions lapsed is still possible.
  const rejected = await decideTrustedCase(
    testDb.db,
    association,
    { caseId: row.id, expectedVersion: row.version, decision: 'REJECT', reasonFa: 'SYNTHETIC پروانه فعال نیست' },
    lapsed,
  );
  assert.equal(rejected.status, 'REJECTED');
});
