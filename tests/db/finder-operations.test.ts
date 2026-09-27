/**
 * Finder operations against a real database — PHASE-4 PROMPT-007.
 *
 * Abuse (reports, evidence, queue, appeals), privacy (what a moderator and the
 * overview can read), authorization (least-privilege capabilities, IDOR and
 * enumeration), blocks and sanctions, notification queueing and retry, OTP
 * secrecy, and lifecycle reconciliation. The population is SYNTHETIC rows; the
 * flows that create KYC, chips and subscriptions have their own suites.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, notificationDeliveries, notifications } from '../../src/db/schema/core.ts';
import { accountSanctions, moderationReports } from '../../src/db/schema/moderation.ts';
import { finderContractOtps, finderMessages, matingProfiles } from '../../src/db/schema/finder.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { publishRule } from '../../src/finder/rules.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { createRequest, respondToRequest, type CreateRequestInput } from '../../src/finder/requests.ts';
import { postMessage } from '../../src/finder/conversation.ts';
import { confirmContract, contractPdfFor, contractView, publishTemplate, requestContractCode, startContract } from '../../src/finder/contracts.ts';
import { publicProfile, activateProfile } from '../../src/finder/profiles.ts';
import { recordAnimalLifeEvent } from '../../src/animals/life-events.ts';
import {
  appealFinderDecision,
  decideFinderAppeal,
  decideFinderReport,
  evidenceFile,
  finderReportQueue,
  submitFinderReport,
  takeReport,
} from '../../src/finder/reports.ts';
import { blockPerson, imposeSanction, liftSanction, unblock, myBlocks } from '../../src/finder/sanctions.ts';
import { feedbackList, finderOverview, reconcileFinder, sendReminders, submitFeedback } from '../../src/finder/operations.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import { runOutbox } from '../../src/notifications/outbox.ts';
import { appealQueue, decideAppeal } from '../../src/marketplace/listing-moderation.ts';
import { failingSmsSender, smsOutboundSender } from '../../src/notifications/sms-channel.ts';
import { createSession, resolveSession } from '../../src/identity/session.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let t: TestDb;
let root: string;
let admin: Actor;
let modA: Actor;
let modB: Actor;
let reviewer: Actor;
let support: Actor;
let breed: string;
let planId: string;
let chip = 870000000;
let mobileSeq = 0;
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }));
const as = (id: string, context: Actor['context'] = 'USER'): Actor => ({ accountId: id as AccountId, context, activeRoles: [] });
const code = (expected: string) => (error: unknown) => (error as { code?: string })?.code === expected;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

async function setting(key: string, value: unknown) {
  const current = await snapshotSetting(t.db, key).catch(() => null);
  await updateSetting(t.db, admin, { key, value, reason: 'SYNTHETIC', expectedVersion: current?.version });
}

async function staff(context: Actor['context']): Promise<Actor> {
  mobileSeq += 1;
  return as(await createTestAccount(t.db, '0999077' + String(mobileSeq).padStart(4, '0')), context);
}

async function owner(opts: { subscribed?: boolean } = {}) {
  mobileSeq += 1;
  const id = await createTestAccount(t.db, '0999077' + String(mobileSeq).padStart(4, '0'));
  await t.db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED')`);
  await t.db.execute(sql`insert into residence (account_id, province, city, address) values (${id}::uuid, 'تهران', 'تهران', ${'SYNTHETIC کوچه ' + mobileSeq})`);
  if (opts.subscribed) {
    await t.db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${id}::uuid, ${planId}::uuid, 'OWNER', 1, 12, 2, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
  }
  return id;
}

async function dog(ownerId: string, sex: 'MALE' | 'FEMALE', state = 'READY') {
  const [a] = (await t.db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
      values (${ownerId}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + sex}, ${breed}::uuid, ${sex}, '2023-01-01') returning id`)).rows;
  chip += 1;
  await t.db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${a!.id}::uuid, ${'985' + String(chip).padStart(12, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${ownerId}::uuid)`);
  const [p] = (await t.db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${a!.id}::uuid, ${ownerId}::uuid, ${state}, now()) returning id`)).rows;
  return { animalId: a!.id, profileId: p!.id };
}

const request = (sender: { animalId: string }, receiver: { profileId: string }): CreateRequestInput => ({
  senderAnimalId: sender.animalId,
  receiverProfileId: receiver.profileId,
  route: 'PERSONAL',
  windowFrom: day(5),
  windowTo: day(20),
  cityFa: 'تهران',
  placeCategory: 'NEUTRAL',
  financialCategory: 'NO_PAYMENT',
  messageFa: null,
  specialConditionsFa: null,
  expiresInDays: null,
});

async function acceptedPair() {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const male = await dog(a, 'MALE');
  const female = await dog(b, 'FEMALE');
  const req = await createRequest(t.db, as(a), request(male, female));
  const accepted = await respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null });
  return { a, b, male, female, req: accepted };
}

before(async () => {
  t = await createTestDb();
  await seedBaseline(t.db);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-fops-'));
  admin = as(await createTestAccount(t.db, '09990770000'), 'SUPERADMIN');
  modA = await staff('LISTING_MODERATOR');
  modB = await staff('LISTING_MODERATOR');
  reviewer = await staff('DISPUTE_REVIEWER');
  support = await staff('SUPPORT_AGENT');
  breed = (await t.db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' order by sort_order limit 1`)).rows[0]!.id;
  planId = (await t.db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
    values ('OWNER', 12, 1, 'SYNTHETIC', 1000, 2, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
  for (const sex of ['MALE', 'FEMALE'] as const) {
    await publishRule(t.db, admin, {
      speciesCode: 'DOG', breedId: breed, sex, minAgeMonths: 12, maxAgeMonths: 120,
      cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null,
      cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: 0,
    });
  }
  for (const key of ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts', 'finder.flag.notifications']) {
    await setting(key, true);
  }
});

after(async () => {
  await t?.drop();
  await fs.rm(root, { recursive: true, force: true });
});

test('reports: every target by its own guard, categories, private evidence with checked signatures, one open report per target', async () => {
  const { a, b, female, req } = await acceptedPair();
  await assert.rejects(submitFinderReport(t.db, root, as(a), { target: 'PROFILE', id: female.profileId, category: 'NOT_A_CATEGORY', details: null }), code('VALIDATION'));
  // A file that is not what it claims stops the report before anything is written.
  const before = (await t.db.select().from(moderationReports)).length;
  await assert.rejects(
    submitFinderReport(t.db, root, as(a), { target: 'PROFILE', id: female.profileId, category: 'FALSE_ANIMAL_DATA', details: null, evidence: [{ bytes: new TextEncoder().encode('<script>'), originalName: 'x.jpg' }] }),
  );
  assert.equal((await t.db.select().from(moderationReports)).length, before);

  const profile = await submitFinderReport(t.db, root, as(a), { target: 'PROFILE', id: female.profileId, category: 'FALSE_ANIMAL_DATA', details: 'SYNTHETIC شماره من ۰۹۱۲۱۲۳۴۵۶۷', evidence: [{ bytes: JPEG, originalName: 'e.jpg' }] });
  await assert.rejects(submitFinderReport(t.db, root, as(a), { target: 'PROFILE', id: female.profileId, category: 'ANIMAL_ABUSE', details: null }), code('CONFLICT'), 'one open report per reporter and target');
  const account = await submitFinderReport(t.db, root, as(b), { target: 'ACCOUNT', id: req.id, category: 'UNAUTHORIZED_BROKERAGE', details: null });
  const onRequest = await submitFinderReport(t.db, root, as(b), { target: 'REQUEST', id: req.id, category: 'CROSS_BREED_REQUEST', details: null });
  assert.ok(profile.id && account.id && onRequest.id);

  // Someone outside the request cannot report it or its people: the same not-found as a missing one.
  const stranger = await owner();
  await assert.rejects(submitFinderReport(t.db, root, as(stranger), { target: 'ACCOUNT', id: req.id, category: 'HARASSMENT', details: null }), code('NOT_FOUND'));
  await assert.rejects(submitFinderReport(t.db, root, as(stranger), { target: 'REQUEST', id: '00000000-0000-0000-0000-000000000000', category: 'HARASSMENT', details: null }), code('NOT_FOUND'));
  const [row] = await t.db.select().from(moderationReports).where(eq(moderationReports.id, account.id));
  assert.equal(row!.reportedAccountId, a);
  assert.equal(row!.finderCategory, 'UNAUTHORIZED_BROKERAGE');

  // Reporting is rate limited once an operator sets a ceiling.
  await setting('market.limit.report_per_hour', 1);
  const c = await owner();
  const other = await dog(await owner({ subscribed: true }), 'MALE');
  const p1 = await dog(await owner({ subscribed: true }), 'FEMALE');
  await submitFinderReport(t.db, root, as(c), { target: 'PROFILE', id: other.profileId, category: 'OTHER_POLICY', details: 'SYNTHETIC توضیح' });
  await assert.rejects(submitFinderReport(t.db, root, as(c), { target: 'PROFILE', id: p1.profileId, category: 'OTHER_POLICY', details: 'SYNTHETIC توضیح' }), code('RATE_LIMITED'));
  await setting('market.limit.report_per_hour', null);
});

test('queue: least privilege, the reported item alone, one moderator per report, one decision, audited evidence', async () => {
  const { a, b, req } = await acceptedPair();
  await postMessage(t.db, root, as(b), { requestId: req.id, bodyFa: 'SYNTHETIC پیام دیگر', file: null });
  const reported = await postMessage(t.db, root, as(b), { requestId: req.id, bodyFa: 'SYNTHETIC پیام توهین‌آمیز', file: null });
  const report = await submitFinderReport(t.db, root, as(a), { target: 'MESSAGE', id: reported.message.id, category: 'HARASSMENT', details: 'SYNTHETIC کد ملی 0499370899', evidence: [{ bytes: JPEG, originalName: 'e.jpg' }] });

  await assert.rejects(finderReportQueue(t.db, reviewer), code('FORBIDDEN'), 'a dispute reviewer does not work this queue');
  await assert.rejects(finderReportQueue(t.db, support), code('FORBIDDEN'));
  const queue = await finderReportQueue(t.db, modA);
  const item = queue.find((q) => q.id === report.id)!;
  assert.equal(item.subjectFa, 'SYNTHETIC پیام توهین‌آمیز', 'the reported message alone');
  assert.ok(!JSON.stringify(queue).includes('پیام دیگر'), 'never the rest of the conversation');
  assert.ok(!item.details!.includes('0499370899'), 'a number typed into the details is redacted');

  // Evidence: moderators only, and the view is recorded.
  await assert.rejects(evidenceFile(t.db, root, as(a), item.evidence[0]!), code('NOT_FOUND'));
  await assert.rejects(evidenceFile(t.db, root, support, item.evidence[0]!), code('NOT_FOUND'));
  const file = await evidenceFile(t.db, root, modA, item.evidence[0]!);
  assert.equal(file.mime, 'image/jpeg');
  assert.equal((await t.db.select().from(auditEvents).where(eq(auditEvents.action, 'FINDER_REPORT_EVIDENCE_VIEWED'))).length, 1);

  // Taking races: exactly one moderator holds it.
  const takes = await Promise.allSettled([takeReport(t.db, modA, { reportId: report.id }), takeReport(t.db, modB, { reportId: report.id })]);
  assert.equal(takes.filter((r) => r.status === 'fulfilled').length, 1);
  const holder = takes[0]!.status === 'fulfilled' ? modA : modB;
  const other = holder === modA ? modB : modA;
  await assert.rejects(decideFinderReport(t.db, other, { reportId: report.id, action: 'HIDE_MESSAGE', reasonFa: 'SYNTHETIC دلیل کافی' }), code('CONFLICT'));
  await assert.rejects(decideFinderReport(t.db, holder, { reportId: report.id, action: 'UNLIST_PROFILE', reasonFa: 'SYNTHETIC دلیل کافی' }), code('CONFLICT'), 'not an action for a message');
  await assert.rejects(decideFinderReport(t.db, holder, { reportId: report.id, action: 'HIDE_MESSAGE', reasonFa: 'کم' }), code('CONFLICT'), 'a reason is required');
  const decisions = await Promise.allSettled([
    decideFinderReport(t.db, holder, { reportId: report.id, action: 'HIDE_MESSAGE', reasonFa: 'SYNTHETIC توهین در گفت‌وگو' }),
    decideFinderReport(t.db, holder, { reportId: report.id, action: 'DISMISS', reasonFa: 'SYNTHETIC بدون تخلف' }),
  ]);
  assert.equal(decisions.filter((d) => d.status === 'fulfilled').length, 1, 'one decision per report');
  const [decided] = await t.db.select().from(moderationReports).where(eq(moderationReports.id, report.id));
  const [message] = await t.db.select().from(finderMessages).where(eq(finderMessages.id, reported.message.id));
  assert.equal(decided!.status === 'ACTIONED', message!.hiddenAt !== null, 'the action landed with the decision, and only with it');

  if (decided!.status === 'ACTIONED') {
    // The appeal: only the affected person, and decided by someone else; overturning undoes the action.
    await assert.rejects(appealFinderDecision(t.db, as(a), { reportId: report.id, statementFa: 'SYNTHETIC من اعتراض دارم به این' }), code('NOT_FOUND'));
    const appeal = await appealFinderDecision(t.db, as(b), { reportId: report.id, statementFa: 'SYNTHETIC پیام من توهین نبود' });
    // The marketplace appeal queue is a different queue: it neither lists nor decides this one.
    assert.ok(!(await appealQueue(t.db, modA)).some((q) => q.id === appeal.id));
    await assert.rejects(decideAppeal(t.db, modA, { appealId: appeal.id, uphold: true, reasonFa: 'SYNTHETIC' }), code('NOT_FOUND'));
    await assert.rejects(decideFinderAppeal(t.db, holder, { appealId: appeal.id, uphold: false, reasonFa: 'SYNTHETIC بازبینی' }), code('CONFLICT'));
    await decideFinderAppeal(t.db, other, { appealId: appeal.id, uphold: false, reasonFa: 'SYNTHETIC بازبینی شد' });
    const [back] = await t.db.select().from(finderMessages).where(eq(finderMessages.id, reported.message.id));
    assert.equal(back!.hiddenAt, null);
  }
});

test('blocks: both directions, open requests close without saying who, and nothing can be probed', async () => {
  const { a, b, male, female, req } = await acceptedPair();
  assert.ok(await publicProfile(t.db, a, female.profileId));
  await assert.rejects(blockPerson(t.db, as(a), { profileId: '11111111-1111-1111-1111-111111111111' }), code('NOT_FOUND'));
  await assert.rejects(blockPerson(t.db, as(await owner()), { requestId: req.id }), code('NOT_FOUND'), 'no block through a request you are not in');
  await blockPerson(t.db, as(b), { requestId: req.id });
  await blockPerson(t.db, as(b), { requestId: req.id }); // idempotent
  const [closed] = (await t.db.execute<{ status: string; reason: string }>(sql`select status, closed_reason_fa as reason from mating_request where id = ${req.id}::uuid`)).rows;
  assert.equal(closed!.status, 'CANCELLED');
  assert.ok(!/مسدود/.test(closed!.reason), 'the reason does not say who blocked whom');
  assert.equal(await publicProfile(t.db, a, female.profileId), null, 'the blocked person finds nothing');
  assert.equal(await publicProfile(t.db, b, male.profileId), null, 'and neither does the blocker');
  await assert.rejects(createRequest(t.db, as(a), request(male, female)), code('NOT_FOUND'));
  const [block] = await myBlocks(t.db, as(b));
  assert.ok(block && !/09990/.test(block.labelFa), 'a masked label, never the number');
  await assert.rejects(unblock(t.db, as(a), { blockId: block!.id }), code('NOT_FOUND'), 'only the blocker lifts it');
  await unblock(t.db, as(b), { blockId: block!.id });
  assert.ok(await publicProfile(t.db, a, female.profileId));
});

test('sanctions: superadmin only, profiles leave, new actions stop, no refund; an account restriction ends sign-in', async () => {
  const { a, b, male, female } = await acceptedPair();
  await assert.rejects(imposeSanction(t.db, modA, { accountId: a, scope: 'FINDER_ACCESS', reasonFa: 'SYNTHETIC تخلف مکرر' }), code('FORBIDDEN'));
  const periodsBefore = (await t.db.execute(sql`select status, ends_at from finder_subscription_period where account_id = ${a}::uuid`)).rows;
  const batchesBefore = (await t.db.execute(sql`select count(*)::int as n from payment_batch`)).rows[0];
  const suspension = await imposeSanction(t.db, admin, { accountId: a, scope: 'FINDER_ACCESS', reasonFa: 'SYNTHETIC تخلف مکرر', days: 7 });
  const [profile] = await t.db.select().from(matingProfiles).where(eq(matingProfiles.animalId, male.animalId));
  assert.equal(profile!.state, 'INACTIVE');
  assert.equal(profile!.deactivationReason, 'SUSPENSION');
  await assert.rejects(createRequest(t.db, as(a), request(male, female)), (e: unknown) => code('FORBIDDEN')(e) && /بازپرداخت/.test((e as Error).message));
  await assert.rejects(activateProfile(t.db, as(a), { animalId: male.animalId }), code('FORBIDDEN'));
  assert.deepEqual((await t.db.execute(sql`select status, ends_at from finder_subscription_period where account_id = ${a}::uuid`)).rows, periodsBefore, 'the subscription is untouched');
  assert.deepEqual((await t.db.execute(sql`select count(*)::int as n from payment_batch`)).rows[0], batchesBefore, 'and no refund exists');
  await assert.rejects(imposeSanction(t.db, admin, { accountId: a, scope: 'FINDER_ACCESS', reasonFa: 'SYNTHETIC بار دوم' }), code('CONFLICT'));
  await liftSanction(t.db, admin, { sanctionId: suspension.id, reasonFa: 'SYNTHETIC پایان بررسی' });
  // Access is back: activation now stops only at the animal's own eligibility (SYNTHETIC animal, no photos).
  await assert.rejects(activateProfile(t.db, as(a), { animalId: male.animalId }), code('VALIDATION'));

  const session = await createSession(t.db, b);
  assert.ok(await resolveSession(t.db, session.token));
  const restriction = await imposeSanction(t.db, admin, { accountId: b, scope: 'ACCOUNT', reasonFa: 'SYNTHETIC حساب مشکوک' });
  assert.equal(await resolveSession(t.db, session.token), null, 'sign-in and every session end at once');
  await liftSanction(t.db, admin, { sanctionId: restriction.id, reasonFa: 'SYNTHETIC رفع شد' });
  const [account] = (await t.db.execute<{ status: string }>(sql`select status from account where id = ${b}::uuid`)).rows;
  assert.equal(account!.status, 'ACTIVE');
  assert.equal((await t.db.select().from(accountSanctions).where(eq(accountSanctions.accountId, b))).length, 1, 'lifting keeps the row');
});

test('feedback is confidential, post-event, one per party, and readable only with its capability', async () => {
  const { a, b, req } = await acceptedPair();
  await assert.rejects(submitFeedback(t.db, as(a), { requestId: req.id, score: 4, bodyFa: null }), code('CONFLICT'), 'not before the event');
  // SYNTHETIC: the outcome is reached by the request suites; here only the status matters.
  await t.db.execute(sql`update mating_request set status = 'MATING_NOT_COMPLETED' where id = ${req.id}::uuid`);
  await assert.rejects(submitFeedback(t.db, as(await owner()), { requestId: req.id, score: 4, bodyFa: null }), code('NOT_FOUND'));
  await assert.rejects(submitFeedback(t.db, as(a), { requestId: req.id, score: 9, bodyFa: null }), code('VALIDATION'));
  await submitFeedback(t.db, as(a), { requestId: req.id, score: 2, bodyFa: 'SYNTHETIC طرف نیامد' });
  await assert.rejects(submitFeedback(t.db, as(a), { requestId: req.id, score: 3, bodyFa: null }), code('CONFLICT'));
  await submitFeedback(t.db, as(b), { requestId: req.id, score: 4, bodyFa: null });
  await assert.rejects(feedbackList(t.db, modA), code('FORBIDDEN'));
  const rows = await feedbackList(t.db, reviewer);
  assert.ok(rows.some((r) => r.bodyFa === 'SYNTHETIC طرف نیامد'));
  assert.ok(!JSON.stringify(rows).includes('09990'), 'no partner identity alongside the note');
});

test('notifications: queued is not delivered; retry, suppression, coalesced messages and one reminder per request', async () => {
  const kinds = async (accountId: string, kind: string) =>
    t.db.select().from(notifications).where(and(eq(notifications.recipientAccountId, accountId), eq(notifications.kind, kind)));
  await t.db.execute(sql`update product_setting set value = '"ON"'::jsonb where key = 'notifications.sms_enabled'`);
  try {
    const { a, b, req } = await acceptedPair();
    const [received] = await kinds(b, 'FINDER_REQUEST_RECEIVED');
    const deliveries = await t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, received!.id));
    const smsRow = deliveries.find((d) => d.channel === 'SMS')!;
    assert.equal(smsRow.status, 'PENDING', 'queued, not sent: nothing has talked to a provider yet');
    assert.ok(!/[0-9۰-۹]{4}/.test(smsRow.renderedText ?? ''), 'the SMS carries no record value');

    // A failing provider leaves it pending with an attempt counted; a working one sends it.
    const failed = await runOutbox(t.db, smsOutboundSender(failingSmsSender()), { limit: 100 });
    assert.ok(failed.retried >= 1);
    const [afterFail] = await t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, smsRow.id));
    assert.equal(afterFail!.status, 'PENDING');
    assert.equal(afterFail!.attempts, 1);
    const outbox: Array<{ to: string; text: string }> = [];
    await runOutbox(t.db, smsOutboundSender(localTestSmsSender(outbox, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }))), { limit: 100, now: new Date(Date.now() + 86_400_000) });
    const [sent] = await t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, smsRow.id));
    assert.equal(sent!.status, 'SENT', 'SENT means the local sender accepted it — not a real provider');

    // Two messages in a row give one notice until the first is read.
    await postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'SYNTHETIC یک', file: null });
    await postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'SYNTHETIC دو', file: null });
    assert.equal((await kinds(b, 'FINDER_MESSAGE_POSTED')).length, 1);
    await t.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.recipientAccountId, b), eq(notifications.kind, 'FINDER_MESSAGE_POSTED')));
    await postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'SYNTHETIC سه', file: null });
    assert.equal((await kinds(b, 'FINDER_MESSAGE_POSTED')).length, 2);

    // Reminders: unset sends nothing; set, the sweep may run twice and still sends once.
    assert.deepEqual(await sendReminders(t.db), { expiring: 0, window: 0 });
    await setting('finder.reminder.expiry_hours', 168);
    await sendReminders(t.db);
    await sendReminders(t.db);
    assert.equal((await kinds(a, 'FINDER_REQUEST_EXPIRING')).length, 1);
    await setting('finder.reminder.expiry_hours', null);
  } finally {
    await t.db.execute(sql`update product_setting set value = '"OFF"'::jsonb where key = 'notifications.sms_enabled'`);
  }
  // With the channel off, a new finder SMS is suppressed at the source: only the in-app row exists.
  const { b } = await acceptedPair();
  const [received] = await kinds(b, 'FINDER_REQUEST_RECEIVED');
  const rows = await t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, received!.id));
  assert.deepEqual(rows.map((r) => r.channel), ['IN_APP']);
});

test('OTP secrecy and contract access: codes never reach audit or operators; the PDF is the parties\' alone', async () => {
  await publishTemplate(t.db, admin, {
    titleFa: 'SYNTHETIC قرارداد',
    clauses: REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC ' + REQUIRED_CLAUSE_FA[key] })),
    reasonFa: 'SYNTHETIC',
    expectedCurrentVersion: 0,
  });
  const { a, b, req } = await acceptedPair();
  await startContract(t.db, as(a), { requestId: req.id, expectedVersion: req.version });
  const view = (await contractView(t.db, as(a), req.id))!;
  const codes: string[] = [];
  for (const party of [a, b]) {
    const { otpId } = await requestContractCode(t.db, as(party), sms, { contractId: view.contract.id, number: view.current.number });
    const mobile = (await t.db.execute<{ mobile: string }>(sql`select mobile from account where id = ${party}::uuid`)).rows[0]!.mobile;
    const secret = [...sink].reverse().find((m) => m.to === mobile)!.text.slice(-6);
    codes.push(secret);
    const outcome = await confirmContract(t.db, as(party), { contractId: view.contract.id, number: view.current.number, contentHash: view.current.contentHash, otpId, code: secret, ip: null, userAgent: null });
    assert.equal(outcome.state, 'APPROVED');
    // Replay of the same code is refused.
    await assert.rejects(confirmContract(t.db, as(party), { contractId: view.contract.id, number: view.current.number, contentHash: view.current.contentHash, otpId, code: secret, ip: null, userAgent: null }));
  }
  const audit = JSON.stringify(await t.db.select().from(auditEvents));
  for (const secret of codes) assert.ok(!audit.includes('"' + secret + '"') && !audit.includes(':' + secret), 'no code in audit');
  const stored = await t.db.select().from(finderContractOtps);
  assert.ok(stored.every((o) => !codes.includes(o.codeHash)), 'stored as a hash only');
  for (const operator of [support, reviewer, modA]) {
    await assert.rejects(contractPdfFor(t.db, root, operator, view.contract.id), code('NOT_FOUND'), operator.context + ' cannot read a contract');
  }
});

test('overview: aggregate and minimised, for its capability only', async () => {
  await assert.rejects(finderOverview(t.db, modA), code('FORBIDDEN'));
  const view = await finderOverview(t.db, as(admin.accountId, 'FINANCE_OPERATOR'));
  const text = JSON.stringify(view);
  assert.ok(!/09990|985\d{9}|SYNTHETIC|تهران/.test(text), 'no phone, chip, message, contract text or place');
  assert.ok(view.funnel.length >= 5);
  assert.ok(view.reports.byCategory.every((r) => r.suppressed || r.count >= 5), 'small groups show no number');
});

test('reconciliation: transfer, death, the end of a subscription, and code retention — safe to repeat', async () => {
  const a = await owner({ subscribed: true });
  const moved = await dog(a, 'MALE');
  const dead = await dog(a, 'FEMALE');
  const b = await owner();
  // SYNTHETIC: ownership changed and a death recorded without the finder hooks.
  await t.db.execute(sql`update animal set owner_account_id = ${b}::uuid where id = ${moved.animalId}::uuid`);
  await t.db.execute(sql`insert into animal_life_event (animal_id, kind, occurred_on, reason_fa, recorded_by_account_id) values (${dead.animalId}::uuid, 'DECEASED', ${day(-1)}, 'SYNTHETIC', ${a}::uuid)`);

  // The end of a subscription: three live profiles, a free capacity of two; the coordinating one
  // holds its slot and stays, the newest of the others goes.
  const c = await owner();
  await setting('finder.capacity.free_owner', 2);
  const first = await dog(c, 'MALE');
  await t.db.execute(sql`update mating_profile set activated_at = now() - interval '3 days' where id = ${first.profileId}::uuid`);
  const coordinating = await dog(c, 'FEMALE', 'COORDINATING');
  const newest = await dog(c, 'MALE');

  const result = await reconcileFinder(t.db);
  assert.ok(result.transferred >= 1 && result.lifeEvents >= 1);
  const state = async (id: string) => (await t.db.select().from(matingProfiles).where(eq(matingProfiles.id, id)))[0]!;
  assert.equal((await state(moved.profileId)).deactivationReason, 'TRANSFER');
  assert.equal((await state(dead.profileId)).deactivationReason, 'LIFE_EVENT');
  assert.equal((await state(coordinating.profileId)).state, 'COORDINATING', 'never an animal in coordination');
  assert.equal((await state(newest.profileId)).deactivationReason, 'SUBSCRIPTION_ENDED', 'the newest goes first');
  assert.equal((await state(first.profileId)).state, 'READY');

  const again = await reconcileFinder(t.db);
  assert.deepEqual([again.transferred, again.lifeEvents, again.overCapacity], [0, 0, 0], 'a second run changes nothing');

  // An unset free capacity is not a decision to unlist everyone.
  await setting('finder.capacity.free_owner', null);
  const d = await owner();
  await dog(d, 'MALE');
  await dog(d, 'FEMALE');
  assert.equal((await reconcileFinder(t.db)).overCapacity, 0);

  // Code retention: only an unused, long-expired code goes.
  await setting('finder.retention.otp_days', 1);
  const kept = (await t.db.select().from(finderContractOtps)).filter((o) => o.consumedAt !== null).length;
  await t.db.execute(sql`update finder_contract_otp set expires_at = now() - interval '10 days'`);
  await reconcileFinder(t.db);
  assert.equal((await t.db.select().from(finderContractOtps)).length, kept, 'consumed codes back approvals and stay');
  await setting('finder.retention.otp_days', null);
  // A death recorded through the real hook needs no sweep at all.
  const e = await owner();
  const lost = await dog(e, 'MALE');
  await recordAnimalLifeEvent(t.db, as(e), { animalId: lost.animalId, kind: 'MISSING', occurredOn: day(-1), reasonFa: 'SYNTHETIC گم شد' });
  assert.equal((await state(lost.profileId)).state, 'INACTIVE');
});
