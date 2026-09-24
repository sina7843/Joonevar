/**
 * The paid trusted-veterinarian period against a real database — Phase 2.5 PROMPT-011.
 *
 * Only a verified payment makes the period, the internal role and the single
 * trusted tag; a replayed callback makes them once. A prerequisite that lapses
 * while the payer is at the gateway stops the activation. Expiry and the
 * association's suspension take the capability away and fall back to the licensed
 * tag only while that licence is itself valid — and nothing historical is deleted.
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
import { accountRoles, auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetProfessionalCases, vetTrustedPeriods } from '../../src/db/schema/vets.ts';
import { attachKycDocument, reviewKyc, submitKyc } from '../../src/identity/kyc.ts';
import { saveProfile } from '../../src/identity/account.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { setMembershipStanding } from '../../src/billing/membership.ts';
import { decideLicenceCase, submitLicenceApplication } from '../../src/vets/licence-application.ts';
import { enforceLicencePeriod, startLicencePayment } from '../../src/vets/licence-period.ts';
import { decideTrustedCase, submitTrustedApplication } from '../../src/vets/trusted-application.ts';
import { currentVetTag } from '../../src/vets/professional-tags.ts';
import { addDays } from '../../src/domain/period.ts';
import {
  enforceTrustedPeriod,
  latestPaidTrustedPeriod,
  startTrustedPayment,
  suspendTrustedStanding,
  trustedPrerequisites,
  trustedStanding,
} from '../../src/vets/trusted-period.ts';
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
const TERMS_VERSION = 'v1-SYNTHETIC';
const LICENCE_TOMAN = 400_000;
const TRUSTED_TOMAN = 500_000;
const TRUSTED_RENEWAL_TOMAN = 350_000;
const TRUSTED_PERIOD_DAYS = 365;
const TRUSTED_GRACE_DAYS = 10;

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const rial = (toman: number) => BigInt(toman) * 10n;

const gatewayFor = (amountRial: bigint, paid = true): PaymentGateway & { calls: number } => {
  const gateway = {
    calls: 0,
    async start(input: { reference: string; amountRial: bigint; callbackUrl: string }) {
      return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
    },
    async verify() {
      gateway.calls += 1;
      return { paid, amountRial, providerRef: 'p-trusted' };
    },
  };
  return gateway;
};

function syntheticNationalId(seed: number): string {
  const body = String(100_000_000 + seed * 137).slice(0, 9);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return body + String(remainder < 2 ? remainder : 11 - remainder);
}

const setSetting = (key: string, value: unknown) =>
  testDb.db.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = ${key}`);

async function configureEverything(): Promise<void> {
  await setSetting('guide_text.trusted_vet_terms', 'SYNTHETIC — تعهدنامه آزمایشی.');
  await setSetting('trusted_vet.terms_version', TERMS_VERSION);
  await setSetting('trusted_vet.declaration_version', 'd1-SYNTHETIC');
  await setSetting('trusted_vet.activation_toman', String(TRUSTED_TOMAN));
  await setSetting('trusted_vet.renewal_toman', String(TRUSTED_RENEWAL_TOMAN));
  await setSetting('trusted_vet.period_days', TRUSTED_PERIOD_DAYS);
  await setSetting('trusted_vet.grace_days', TRUSTED_GRACE_DAYS);
  await setSetting('trusted_vet.reminder_days_before', 30);
  await setSetting('vet_licence.activation_toman', String(LICENCE_TOMAN));
  await setSetting('vet_licence.renewal_toman', '300000');
  await setSetting('vet_licence.period_days', 365);
  await setSetting('vet_licence.grace_days', 10);
  await setSetting('vet_licence.reminder_days_before', 30);
  await configureMembership(testDb.db);
}

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-trusted-period-'));
  association = actorFor(await createTestAccount(testDb.db, '09990420001'), 'ASSOCIATION_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
  await configureEverything();
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

/** A veterinarian with an active licence period, a membership and an approved trusted application. */
async function approvedTrustedApplicant(): Promise<Actor> {
  counter += 1;
  const n = counter;
  const actor = actorFor(await createTestAccount(testDb.db, '0999042' + String(n + 100).padStart(4, '0')), 'USER');
  await saveProfile(testDb.db, actor, {
    firstName: 'نمونه',
    lastName: 'معتمد ' + n,
    displayName: 'نمایشی ' + n,
    nationalId: syntheticNationalId(n),
    birthDate: '1990-01-01',
  });
  await attachKycDocument(testDb.db, storage, actor, { bytes: JPEG });
  const kyc = await submitKyc(testDb.db, actor);
  await reviewKyc(testDb.db, association, { caseId: kyc.id, decision: 'APPROVED' });

  const licence = await submitLicenceApplication(testDb.db, storage, actor, {
    displayNameFa: 'دکتر معتمد ' + n,
    practiceScope: 'GENERAL',
    councilCode: 'SYN-TP-' + n,
    licenceCode: 'LIC-TP-' + n,
    licenceDate: '2024-05-01',
    phone: '021-5555',
    cityId: tehranCityId,
    serviceCodes: [],
    documents: [
      { kind: 'PRACTICE_LICENCE', bytes: PDF, originalName: 'licence.pdf' },
      { kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' },
    ],
  });
  await decideLicenceCase(testDb.db, association, { caseId: licence.id, expectedVersion: licence.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC مدارک پروانه' });
  const licencePayment = await startLicencePayment(testDb.db, actor);
  const licenceGateway = gatewayFor(rial(LICENCE_TOMAN));
  const licenceAttempt = await startAttempt(testDb.db, actor, { batchId: licencePayment.batch.id, callbackUrl: '/x' }, licenceGateway, 'test-gateway');
  assert.equal((await verifyAttempt(testDb.db, { reference: licenceAttempt.reference }, licenceGateway, paidEffects)).state, 'PAID');

  await becomeMember(testDb.db, actor, association);

  const application = await submitTrustedApplication(testDb.db, actor, { acceptedTermsVersion: TERMS_VERSION, microchipReaderDeclared: true });
  await decideTrustedCase(testDb.db, association, {
    caseId: application.id,
    expectedVersion: application.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC شرایط معتمد کامل است',
  });
  return actor;
}

const roleOf = async (accountId: string) =>
  (await testDb.db.select().from(accountRoles).where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.role, 'TRUSTED_VET'))))[0] ?? null;
const trustedCaseOf = async (accountId: string) =>
  (await testDb.db.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.accountId, accountId), eq(vetProfessionalCases.caseType, 'TRUSTED'))))[0]!;
const noticesOf = (accountId: string, kind: string) =>
  testDb.db.select().from(notifications).where(and(eq(notifications.recipientAccountId, accountId), eq(notifications.kind, kind)));

async function payTrusted(actor: Actor, options: { amountRial?: bigint; paid?: boolean; now?: Date } = {}) {
  const started = await startTrustedPayment(testDb.db, actor, options.now ?? new Date());
  const gateway = gatewayFor(options.amountRial ?? BigInt(started.period.amountToman) * 10n, options.paid ?? true);
  const attempt = await startAttempt(testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  const outcome = await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects);
  return { started, attempt, outcome, gateway };
}

// ── only a verified payment grants anything ──────────────────────────────

test('an approval alone grants nothing, and a verified payment makes the period, the role and the trusted tag exactly once', async () => {
  const vet = await approvedTrustedApplicant();
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'LICENSED', 'the approval left the licensed tag alone');
  assert.equal(await roleOf(vet.accountId), null, 'no internal role before payment');

  const { started, attempt, outcome } = await payTrusted(vet);
  assert.equal(outcome.state, 'PAID');
  const period = (await latestPaidTrustedPeriod(testDb.db, vet.accountId))!;
  assert.equal(period.id, started.period.id);
  assert.equal(period.endsAt!.getTime() - period.startsAt!.getTime(), TRUSTED_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  assert.equal(period.graceDays, TRUSTED_GRACE_DAYS);
  assert.equal((await trustedCaseOf(vet.accountId)).status, 'ACTIVE_TRUSTED_VET');
  assert.equal((await roleOf(vet.accountId))!.status, 'ACTIVE');
  const tag = (await currentVetTag(testDb.db, vet.accountId))!;
  assert.equal(tag.tag, 'TRUSTED', 'the single public tag is the trusted one');
  assert.equal(tag.practiceScope, 'GENERAL');

  // A replayed callback finds the work done and changes nothing.
  const replay = await verifyAttempt(testDb.db, { reference: attempt.reference }, gatewayFor(rial(TRUSTED_TOMAN)), paidEffects);
  assert.deepEqual([replay.state, replay.state === 'PAID' ? replay.performed : null], ['PAID', false]);
  assert.equal((await testDb.db.select().from(vetTrustedPeriods).where(eq(vetTrustedPeriods.accountId, vet.accountId))).filter((row) => row.status === 'ACTIVE').length, 1);
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_ACTIVATED')).length, 1);
  const activations = (await testDb.db.select().from(auditEvents)).filter((event) => event.action === 'VET_TRUSTED_PERIOD_ACTIVATED' && event.targetId === period.id);
  assert.equal(activations.length, 1);
});

test('a refused payment grants nothing, and an unpriced period is not sold at all', async () => {
  const vet = await approvedTrustedApplicant();
  const { outcome } = await payTrusted(vet, { paid: false, amountRial: 0n });
  assert.equal(outcome.state, 'FAILED');
  assert.equal(await latestPaidTrustedPeriod(testDb.db, vet.accountId), null);
  assert.equal(await roleOf(vet.accountId), null);
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'LICENSED');

  await setSetting('trusted_vet.activation_toman', null);
  await assert.rejects(startTrustedPayment(testDb.db, vet), code('NOT_CONFIGURED'));
  await setSetting('trusted_vet.period_days', null);
  await setSetting('trusted_vet.activation_toman', String(TRUSTED_TOMAN));
  await assert.rejects(startTrustedPayment(testDb.db, vet), code('NOT_CONFIGURED'), 'no invented duration');
  await setSetting('trusted_vet.period_days', TRUSTED_PERIOD_DAYS);
});

// ── prerequisites, at both moments ───────────────────────────────────────

test('a prerequisite that lapses while the payer is at the gateway stops the activation, and the money is still recorded', async () => {
  const vet = await approvedTrustedApplicant();
  const started = await startTrustedPayment(testDb.db, vet);
  const gateway = gatewayFor(BigInt(started.period.amountToman) * 10n);
  const attempt = await startAttempt(testDb.db, vet, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');

  // The membership is suspended while the payer is away.
  await setMembershipStanding(testDb.db, association, { accountId: vet.accountId, action: 'SUSPEND', reasonFa: 'SYNTHETIC تعلیق حین پرداخت' });

  const outcome = await verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID', 'the payment itself is verified and recorded');
  assert.equal(await latestPaidTrustedPeriod(testDb.db, vet.accountId), null, 'no period was activated');
  assert.equal(await roleOf(vet.accountId), null, 'no role was granted');
  assert.notEqual((await currentVetTag(testDb.db, vet.accountId))!.tag, 'TRUSTED');
  assert.equal((await trustedCaseOf(vet.accountId)).status, 'TRUSTED_APPROVED_AWAITING_PAYMENT');
  const blocked = (await testDb.db.select().from(auditEvents)).filter((event) => event.action === 'VET_TRUSTED_PERIOD_ACTIVATION_BLOCKED');
  assert.equal(blocked.length, 1, 'the refusal is recorded with its reason');
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_BLOCKED')).length, 1);

  // Starting a payment while a prerequisite is missing is refused outright.
  await assert.rejects(startTrustedPayment(testDb.db, vet), code('CONFLICT'));
  const prerequisites = await trustedPrerequisites(testDb.db, vet.accountId);
  assert.equal(prerequisites.ok, false);
  assert.match(prerequisites.problemFa!, /عضویت انجمن شما معتبر نیست/);
});

test('a newer version of the terms is accepted again before a period is sold against it', async () => {
  const vet = await approvedTrustedApplicant();
  await setSetting('trusted_vet.terms_version', 'v2-SYNTHETIC');
  const prerequisites = await trustedPrerequisites(testDb.db, vet.accountId);
  assert.equal(prerequisites.ok, false);
  assert.match(prerequisites.problemFa!, /تعهدنامه معتمد به‌روز شده است/);
  await assert.rejects(startTrustedPayment(testDb.db, vet), code('CONFLICT'));
  await setSetting('trusted_vet.terms_version', TERMS_VERSION);
  assert.equal((await trustedPrerequisites(testDb.db, vet.accountId)).ok, true);
});

// ── renewal, expiry and the tag it falls back to ─────────────────────────

test('renewing stacks on the live period, and expiry takes the capability away and falls back to what is still valid', async () => {
  const vet = await approvedTrustedApplicant();
  await payTrusted(vet);
  const first = (await latestPaidTrustedPeriod(testDb.db, vet.accountId))!;

  const renewal = await payTrusted(vet);
  assert.equal(renewal.started.kind, 'RENEWAL');
  assert.equal(renewal.started.period.amountToman, String(TRUSTED_RENEWAL_TOMAN), 'the renewal tariff is its own setting');
  const second = (await latestPaidTrustedPeriod(testDb.db, vet.accountId))!;
  assert.deepEqual(second.startsAt, first.endsAt, 'the new period starts where the live one ends');
  assert.deepEqual(second.endsAt, addDays(first.endsAt!, TRUSTED_PERIOD_DAYS));
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'TRUSTED');

  // Inside the bought grace the standing still holds.
  const inGrace = addDays(second.endsAt!, TRUSTED_GRACE_DAYS - 1);
  const graceView = await trustedStanding(testDb.db, vet.accountId, inGrace);
  assert.equal(graceView.isTrustedNow, true);
  assert.equal(graceView.inGrace, true);
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'TRUSTED');

  // Past it, the capability goes and the licensed tag comes back.
  const lapsed = addDays(second.endsAt!, TRUSTED_GRACE_DAYS + 1);
  const after = await trustedStanding(testDb.db, vet.accountId, lapsed);
  assert.equal(after.isTrustedNow, false);
  assert.equal(after.caseStatus, 'EXPIRED');
  assert.equal((await roleOf(vet.accountId))!.status, 'SUSPENDED', 'the role row stays, suspended');
  // Two stacked trusted periods outlast the one licence period that was paid for,
  // so by now the licence has lapsed too and the fallback is what the council
  // verified. The licensed fallback itself is covered by the suspension test,
  // which happens while that licence is still live.
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'UNLICENSED');
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_EXPIRED')).length, 1);

  // Nothing historical is destroyed: both periods and their payments remain.
  const periods = await testDb.db.select().from(vetTrustedPeriods).where(eq(vetTrustedPeriods.accountId, vet.accountId));
  assert.equal(periods.filter((row) => row.status === 'ACTIVE').length, 2);
  await trustedStanding(testDb.db, vet.accountId, addDays(lapsed, 30));
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_EXPIRED')).length, 1, 'the withdrawal happens once');
});

test('when the licence has lapsed too, the fallback is the council-verified tag rather than a licensed one', async () => {
  const vet = await approvedTrustedApplicant();
  await payTrusted(vet);
  const period = (await latestPaidTrustedPeriod(testDb.db, vet.accountId))!;

  // Both periods are over: the licence first, then the trusted one.
  const licencePeriod = (await testDb.db.execute<{ ends_at: Date }>(sql`select ends_at from vet_licence_period where account_id = ${vet.accountId} and status = 'ACTIVE'`)).rows[0]!;
  const lapsed = addDays(new Date(Math.max(new Date(licencePeriod.ends_at).getTime(), period.endsAt!.getTime())), 30);
  await enforceLicencePeriod(testDb.db, vet.accountId, lapsed);
  await enforceTrustedPeriod(testDb.db, vet.accountId, lapsed);

  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'UNLICENSED', 'no licence to fall back to');
  assert.equal((await roleOf(vet.accountId))!.status, 'SUSPENDED');
  assert.equal((await trustedCaseOf(vet.accountId)).status, 'EXPIRED');
});

test('a reminder is written once inside its window', async () => {
  const vet = await approvedTrustedApplicant();
  await payTrusted(vet);
  const period = (await latestPaidTrustedPeriod(testDb.db, vet.accountId))!;
  await enforceTrustedPeriod(testDb.db, vet.accountId, addDays(period.endsAt!, -60));
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_ENDING')).length, 0);
  const inside = addDays(period.endsAt!, -20);
  await enforceTrustedPeriod(testDb.db, vet.accountId, inside);
  await enforceTrustedPeriod(testDb.db, vet.accountId, addDays(inside, 1));
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_PERIOD_ENDING')).length, 1);
});

// ── the association's own decision ───────────────────────────────────────

test('the association suspends a trusted standing with a reason, and only the association may', async () => {
  const vet = await approvedTrustedApplicant();
  await payTrusted(vet);
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'TRUSTED');

  await assert.rejects(suspendTrustedStanding(testDb.db, vet, { accountId: vet.accountId, reasonFa: 'SYNTHETIC' }), code('FORBIDDEN'));
  await assert.rejects(suspendTrustedStanding(testDb.db, association, { accountId: vet.accountId, reasonFa: '  ' }), code('VALIDATION'));

  await suspendTrustedStanding(testDb.db, association, { accountId: vet.accountId, reasonFa: 'SYNTHETIC بررسی انضباطی' });
  assert.equal((await trustedCaseOf(vet.accountId)).status, 'SUSPENDED');
  assert.equal((await roleOf(vet.accountId))!.status, 'SUSPENDED', 'the capability is gone, the row is not');
  assert.equal((await currentVetTag(testDb.db, vet.accountId))!.tag, 'LICENSED', 'the licence period is still valid');
  assert.equal((await noticesOf(vet.accountId, 'VET_TRUSTED_SUSPENDED')).length, 1);
  const suspensions = (await testDb.db.select().from(auditEvents)).filter((event) => event.action === 'VET_TRUSTED_SUSPENDED');
  assert.equal(suspensions.length, 1);
  assert.equal(suspensions[0]!.reason, 'SYNTHETIC بررسی انضباطی');

  // A suspended standing is not renewed by paying for it again.
  await assert.rejects(startTrustedPayment(testDb.db, vet), code('CONFLICT'));
  assert.equal((await latestPaidTrustedPeriod(testDb.db, vet.accountId))!.status, 'ACTIVE', 'the paid period itself is not destroyed');
});
