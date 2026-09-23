/**
 * Paying for, renewing and losing a practice licence period — Phase 2.5 PROMPT-008.
 *
 * Payment opens only after the association approved the licence; the tariff and
 * the period length come from managed settings and are frozen when the payment
 * starts; only an idempotent server verification activates the period and the
 * licensed tag; a failed, cancelled, mismatched or replayed callback grants
 * nothing; a renewal neither overlaps nor loses paid time; and an expired period
 * takes the doctor back to the verified no-licence tag.
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
import { auditEvents, notifications } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetLicencePeriods, vetProfessionalCases } from '../../src/db/schema/vets.ts';
import { paymentBatches } from '../../src/db/schema/billing.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt, cancelAttempt, batchTotalToman } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { currentVetTag } from '../../src/vets/professional-tags.ts';
import { decideDoctorCase, submitDoctorApplication } from '../../src/vets/doctor-application.ts';
import { decideLicenceCase, submitLicenceApplication } from '../../src/vets/licence-application.ts';
import { submitStudentApplication } from '../../src/vets/student-application.ts';
import { activateLicencePeriodFromPayment, enforceLicencePeriod, latestPaidPeriod, licenceStanding, startLicencePayment } from '../../src/vets/licence-period.ts';
import { addDays } from '../../src/vets/licence-period-model.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let association: Actor;
let superadmin: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.4 synthetic licence');
const PROVIDER = 'test-gateway';
const ACTIVATION_TOMAN = 400_000;
const RENEWAL_TOMAN = 300_000;
const PERIOD_DAYS = 365;
const GRACE_DAYS = 10;
const REMINDER_DAYS = 30;
/** Both tariffs are Toman; the gateway is asked for Rial by the documented ×10 rule. */
const rial = (toman: number) => BigInt(toman) * 10n;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-period-'));
  association = actorFor(await createTestAccount(testDb.db, '09990380001'), 'ASSOCIATION_OPERATOR');
  superadmin = actorFor(await createTestAccount(testDb.db, '09990380002'), 'SUPERADMIN');
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
  return actorFor(await createTestAccount(testDb.db, '0999038' + String(counter + 100).padStart(4, '0')), context);
}

const setSetting = (key: string, value: unknown) => updateSetting(testDb.db, superadmin, { key, value, reason: 'SYNTHETIC — تست دوره پروانه' });

async function configureTariffs(): Promise<void> {
  await setSetting('vet_licence.activation_toman', String(ACTIVATION_TOMAN));
  await setSetting('vet_licence.renewal_toman', String(RENEWAL_TOMAN));
  await setSetting('vet_licence.period_days', PERIOD_DAYS);
  await setSetting('vet_licence.grace_days', GRACE_DAYS);
  await setSetting('vet_licence.reminder_days_before', REMINDER_DAYS);
}

/** A doctor whose licence documents the association already approved (PROMPT-006). */
async function approvedLicence(): Promise<{ actor: Actor; caseId: string }> {
  const actor = await newAccount();
  const n = counter;
  const row = await submitLicenceApplication(testDb.db, storage, actor, {
    displayNameFa: 'دکتر دوره ' + n,
    practiceScope: 'GENERAL',
    councilCode: 'SYN-PC-' + n,
    licenceCode: 'LIC-PD-' + n,
    licenceDate: '2024-05-01',
    phone: '021-5555',
    cityId: tehranCityId,
    serviceCodes: [],
    documents: [
      { kind: 'PRACTICE_LICENCE', bytes: PDF, originalName: 'licence.pdf' },
      { kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' },
    ],
  });
  const approved = await decideLicenceCase(testDb.db, association, {
    caseId: row.id,
    expectedVersion: row.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC مدارک پروانه درست است',
  });
  assert.equal(approved.status, 'LICENSE_APPROVED_AWAITING_PAYMENT');
  return { actor, caseId: row.id };
}

/** A gateway whose answer the test controls, so verification is steered exactly. */
function scriptedGateway(answer: { paid: boolean; amountRial: bigint }) {
  const gateway = {
    calls: 0,
    async start(input: { reference: string; amountRial: bigint }) {
      return { reference: input.reference, amountRial: input.amountRial, redirectUrl: 'https://sandbox.invalid/pay/' + input.reference, providerRef: 'p-' + input.reference };
    },
    async verify() {
      gateway.calls += 1;
      return { paid: answer.paid, amountRial: answer.amountRial, providerRef: 'ref-1' };
    },
  };
  return gateway;
}

async function payFor(actor: Actor, answer: { paid: boolean; amountRial: bigint }, now = new Date()) {
  const started = await startLicencePayment(testDb.db, actor, now);
  const gateway = scriptedGateway(answer);
  const attempt = await startAttempt(testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/account/vet-profile/return' }, gateway, PROVIDER);
  const outcome = await verifyAttempt(testDb.db, { reference: attempt.reference, providerRef: 'ref-1' }, gateway, paidEffects);
  return { started, attempt, outcome, gateway };
}

const caseRow = async (id: string) => (await testDb.db.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, id)))[0]!;
const periodsOf = (accountId: string) => testDb.db.select().from(vetLicencePeriods).where(eq(vetLicencePeriods.accountId, accountId));
const noticesOf = (accountId: string, kind: string) =>
  testDb.db.select().from(notifications).where(and(eq(notifications.recipientAccountId, accountId), eq(notifications.kind, kind)));

// ── the gate: approval, licence facts, managed values ──────────────────────

test('payment opens only after approval, only for a licensed doctor, and only once the tariff and period are configured', async () => {
  await setSetting('vet_licence.activation_toman', null);
  await setSetting('vet_licence.period_days', null);

  const plain = await newAccount();
  await assert.rejects(startLicencePayment(testDb.db, plain), code('NOT_FOUND'), 'no licence case at all');

  const student = await newAccount();
  await submitStudentApplication(testDb.db, storage, student, {
    displayNameFa: 'دانشجوی دوره',
    studentNumber: '99' + String(counter).padStart(6, '0'),
    universityFa: 'دانشگاه آزمایشی',
    document: null,
  });
  await assert.rejects(startLicencePayment(testDb.db, student), code('NOT_FOUND'), 'a student has no licence case');

  // A doctor whose council code is verified but who has no approved licence yet.
  const doctor = await newAccount();
  const n = counter;
  const doctorCase = await submitDoctorApplication(testDb.db, storage, doctor, {
    displayNameFa: 'دکتر بدون پروانه ' + n,
    practiceScope: 'GENERAL',
    councilCode: 'SYN-PN-' + n,
    cityId: tehranCityId,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
  });
  await decideDoctorCase(testDb.db, association, { caseId: doctorCase.id, expectedVersion: doctorCase.version, decision: 'VERIFY', reasonFa: 'SYNTHETIC کد نظام' });
  await assert.rejects(startLicencePayment(testDb.db, doctor), code('NOT_FOUND'), 'a council case is not a licence case');

  const { actor } = await approvedLicence();
  await assert.rejects(startLicencePayment(testDb.db, actor), code('NOT_CONFIGURED'), 'an unpriced activation is not sold');
  await setSetting('vet_licence.activation_toman', String(ACTIVATION_TOMAN));
  await assert.rejects(startLicencePayment(testDb.db, actor), code('NOT_CONFIGURED'), 'an unset period length is not invented');

  await configureTariffs();
  const started = await startLicencePayment(testDb.db, actor);
  assert.equal(started.kind, 'ACTIVATION');
  assert.equal(started.period.periodDays, PERIOD_DAYS);
  assert.equal((await currentVetTag(testDb.db, actor.accountId))?.tag, 'UNLICENSED', 'starting a payment grants nothing');
});

test('the amount is frozen from the managed tariff, and a tariff change replaces an unpaid period instead of repricing it', async () => {
  await configureTariffs();
  const { actor, caseId } = await approvedLicence();
  const first = await startLicencePayment(testDb.db, actor);
  assert.equal(first.period.amountToman, String(ACTIVATION_TOMAN));
  assert.equal(await batchTotalToman(testDb.db, first.batch.id), BigInt(ACTIVATION_TOMAN));

  const again = await startLicencePayment(testDb.db, actor);
  assert.equal(again.reused, true, 'the same unpaid period is offered again');
  assert.equal(again.period.id, first.period.id);

  await setSetting('vet_licence.activation_toman', String(ACTIVATION_TOMAN + 50_000));
  const repriced = await startLicencePayment(testDb.db, actor);
  assert.notEqual(repriced.period.id, first.period.id, 'the stale period is not reused');
  assert.equal(repriced.period.amountToman, String(ACTIVATION_TOMAN + 50_000));
  assert.equal(await batchTotalToman(testDb.db, repriced.batch.id), BigInt(ACTIVATION_TOMAN + 50_000));

  const rows = await periodsOf(actor.accountId);
  assert.deepEqual(rows.map((row) => row.status).sort(), ['CANCELLED', 'PENDING_PAYMENT']);
  const audit = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.targetType, 'VET_LICENCE_PERIOD'), eq(auditEvents.targetId, first.period.id)));
  assert.ok(audit.some((row) => row.action === 'VET_LICENCE_PERIOD_CANCELLED'));
  assert.equal((await caseRow(caseId)).status, 'LICENSE_APPROVED_AWAITING_PAYMENT', 'no unpaid attempt moved the case');
  await setSetting('vet_licence.activation_toman', String(ACTIVATION_TOMAN));
});

// ── only a verified payment grants anything ───────────────────────────────

test('a verified payment activates the period and the licensed tag exactly once, however often the callback arrives', async () => {
  await configureTariffs();
  const { actor, caseId } = await approvedLicence();
  const now = new Date('2026-03-01T00:00:00Z');
  const { started, attempt, outcome, gateway } = await payFor(actor, { paid: true, amountRial: rial(ACTIVATION_TOMAN) }, now);
  assert.equal(outcome.state, 'PAID');
  assert.equal(gateway.calls, 1, 'the server asked the gateway rather than trusting the return');

  const period = await latestPaidPeriod(testDb.db, actor.accountId);
  assert.equal(period!.id, started.period.id);
  assert.equal(period!.status, 'ACTIVE');
  assert.equal(period!.endsAt!.getTime() - period!.startsAt!.getTime(), PERIOD_DAYS * 24 * 60 * 60 * 1000);
  assert.equal(period!.graceDays, GRACE_DAYS, 'the grace rule is frozen on what was bought');
  assert.equal((await caseRow(caseId)).status, 'ACTIVE_LICENSED_VET');
  const tag = await currentVetTag(testDb.db, actor.accountId);
  assert.equal(tag!.tag, 'LICENSED');
  assert.equal(tag!.practiceScope, 'GENERAL');

  // A replayed callback, and a second verification of the same reference, change nothing.
  const replay = await verifyAttempt(testDb.db, { reference: attempt.reference, providerRef: 'ref-1' }, scriptedGateway({ paid: true, amountRial: rial(ACTIVATION_TOMAN) }), paidEffects);
  assert.deepEqual([replay.state, replay.state === 'PAID' ? replay.performed : null], ['PAID', false]);
  assert.equal((await periodsOf(actor.accountId)).filter((row) => row.status === 'ACTIVE').length, 1);
  assert.equal((await noticesOf(actor.accountId, 'VET_LICENCE_PERIOD_ACTIVATED')).length, 1, 'one activation, one notice');
  const tagsNow = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'VET_LICENCE_PERIOD_ACTIVATED'), eq(auditEvents.targetId, period!.id)));
  assert.equal(tagsNow.length, 1);
});

test('a failed, mismatched or cancelled payment grants nothing at all', async () => {
  await configureTariffs();
  for (const answer of [
    { label: 'the gateway says unpaid', paid: false, amountRial: 0n },
    { label: 'the gateway reports another amount', paid: true, amountRial: rial(ACTIVATION_TOMAN) - 10n },
  ] as const) {
    const { actor, caseId } = await approvedLicence();
    const { outcome } = await payFor(actor, { paid: answer.paid, amountRial: answer.amountRial });
    assert.equal(outcome.state, 'FAILED', answer.label);
    assert.equal(await latestPaidPeriod(testDb.db, actor.accountId), null, answer.label);
    assert.equal((await caseRow(caseId)).status, 'LICENSE_APPROVED_AWAITING_PAYMENT', answer.label);
    assert.equal((await currentVetTag(testDb.db, actor.accountId))?.tag, 'UNLICENSED', answer.label);
  }

  const { actor, caseId } = await approvedLicence();
  const started = await startLicencePayment(testDb.db, actor);
  const gateway = scriptedGateway({ paid: true, amountRial: rial(ACTIVATION_TOMAN) });
  const attempt = await startAttempt(testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, PROVIDER);
  const cancelled = await cancelAttempt(testDb.db, { reference: attempt.reference });
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(await latestPaidPeriod(testDb.db, actor.accountId), null);
  assert.equal((await currentVetTag(testDb.db, actor.accountId))?.tag, 'UNLICENSED');

  // A verification arriving after the cancellation still grants nothing.
  const late = await verifyAttempt(testDb.db, { reference: attempt.reference, providerRef: 'ref-1' }, gateway, paidEffects);
  assert.notEqual(late.state, 'PAID');
  assert.equal(await latestPaidPeriod(testDb.db, actor.accountId), null);
  assert.equal((await caseRow(caseId)).status, 'LICENSE_APPROVED_AWAITING_PAYMENT');
  assert.equal(gateway.calls, 0, 'a cancelled attempt is never verified');
});

// ── renewal ───────────────────────────────────────────────────────────────

test('renewing early continues the live period instead of overlapping it, and renewing after expiry starts fresh', async () => {
  await configureTariffs();
  const { actor, caseId } = await approvedLicence();
  const activated = new Date('2026-03-01T00:00:00Z');
  await payFor(actor, { paid: true, amountRial: rial(ACTIVATION_TOMAN) }, activated);
  const first = (await latestPaidPeriod(testDb.db, actor.accountId))!;

  const early = new Date('2026-12-01T00:00:00Z');
  const renewal = await payFor(actor, { paid: true, amountRial: rial(RENEWAL_TOMAN) }, early);
  assert.equal(renewal.started.kind, 'RENEWAL');
  assert.equal(renewal.started.period.amountToman, String(RENEWAL_TOMAN), 'the renewal tariff is its own setting');
  const second = (await latestPaidPeriod(testDb.db, actor.accountId))!;
  assert.deepEqual(second.startsAt, first.endsAt, 'the new period starts exactly where the live one ends');
  assert.deepEqual(second.endsAt, addDays(first.endsAt!, PERIOD_DAYS), 'a full period is added, none of it lost');
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'LICENSED');
  assert.equal((await caseRow(caseId)).status, 'ACTIVE_LICENSED_VET');

  // Past the second period and its grace the licence lapses; a later renewal starts from that day.
  // The whole leg happens at a simulated future moment, so the payment effect is applied with that
  // same clock rather than the real one; the gateway verification path itself is covered above.
  const afterAll = addDays(second.endsAt!, GRACE_DAYS + 5);
  await enforceLicencePeriod(testDb.db, actor.accountId, afterAll);
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'UNLICENSED');
  const back = await startLicencePayment(testDb.db, actor, afterAll);
  assert.equal(back.kind, 'RENEWAL');
  await testDb.db.transaction((tx) => activateLicencePeriodFromPayment(tx, { id: back.batch.id, accountId: actor.accountId }, afterAll));
  const third = (await latestPaidPeriod(testDb.db, actor.accountId))!;
  assert.deepEqual(third.startsAt, afterAll, 'a lapsed licence buys time from today, not from the past');
  assert.equal((await caseRow(caseId)).status, 'ACTIVE_LICENSED_VET');
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'LICENSED');
});

// ── expiry and reminders ──────────────────────────────────────────────────

test('an ended period keeps the tag through its grace, then downgrades to the verified no-licence tag exactly once', async () => {
  await configureTariffs();
  const { actor, caseId } = await approvedLicence();
  const activated = new Date('2026-03-01T00:00:00Z');
  await payFor(actor, { paid: true, amountRial: rial(ACTIVATION_TOMAN) }, activated);
  const period = (await latestPaidPeriod(testDb.db, actor.accountId))!;

  const reminderTime = addDays(period.endsAt!, -REMINDER_DAYS + 1);
  await enforceLicencePeriod(testDb.db, actor.accountId, reminderTime);
  assert.equal((await noticesOf(actor.accountId, 'VET_LICENCE_PERIOD_ENDING')).length, 1);
  await enforceLicencePeriod(testDb.db, actor.accountId, addDays(reminderTime, 1));
  assert.equal((await noticesOf(actor.accountId, 'VET_LICENCE_PERIOD_ENDING')).length, 1, 'the reminder is written once');
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'LICENSED');

  const inGrace = addDays(period.endsAt!, GRACE_DAYS - 1);
  const graceView = await licenceStanding(testDb.db, actor.accountId, inGrace);
  assert.equal(graceView.standing, 'GRACE');
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'LICENSED', 'grace still carries the licensed tag');
  assert.equal((await caseRow(caseId)).status, 'ACTIVE_LICENSED_VET');

  const lapsed = addDays(period.endsAt!, GRACE_DAYS + 1);
  const view = await licenceStanding(testDb.db, actor.accountId, lapsed);
  assert.equal(view.standing, 'EXPIRED');
  assert.equal(view.canPay, true, 'the doctor may pay again');
  assert.equal(view.kind, 'RENEWAL');
  const tag = (await currentVetTag(testDb.db, actor.accountId))!;
  assert.equal(tag.tag, 'UNLICENSED', 'the council-verified standing stays; only the paid licence goes');
  assert.equal(tag.practiceScope, 'GENERAL');
  assert.equal((await caseRow(caseId)).status, 'EXPIRED');
  assert.equal((await noticesOf(actor.accountId, 'VET_LICENCE_PERIOD_EXPIRED')).length, 1);

  // Reading it again changes nothing further.
  await licenceStanding(testDb.db, actor.accountId, addDays(lapsed, 30));
  assert.equal((await noticesOf(actor.accountId, 'VET_LICENCE_PERIOD_EXPIRED')).length, 1);
  assert.equal((await currentVetTag(testDb.db, actor.accountId))!.tag, 'UNLICENSED');
  const expiries = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.action, 'VET_LICENCE_CASE_EXPIRED'), eq(auditEvents.targetId, caseId)));
  assert.equal(expiries.length, 1);
});

test('the payment batch of a licence period is its own service and belongs to the paying account', async () => {
  await configureTariffs();
  const { actor } = await approvedLicence();
  const started = await startLicencePayment(testDb.db, actor);
  const [batch] = await testDb.db.select().from(paymentBatches).where(eq(paymentBatches.id, started.batch.id));
  assert.equal(batch!.service, 'VET_LICENSE_ACTIVATION');
  assert.equal(batch!.accountId, actor.accountId);

  const stranger = await newAccount();
  await assert.rejects(
    startAttempt(testDb.db, stranger, { batchId: started.batch.id, callbackUrl: '/x' }, scriptedGateway({ paid: true, amountRial: rial(ACTIVATION_TOMAN) }), PROVIDER),
    code('FORBIDDEN'),
    'another account cannot pay this batch',
  );
});
