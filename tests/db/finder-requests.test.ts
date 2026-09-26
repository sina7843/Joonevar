/**
 * Requests, conversation and contract against a real database — PHASE-4 PROMPT-005.
 *
 * The population is SYNTHETIC rows (clinical path, KYC review and payments have
 * their own suites). What is tested is this prompt's risk: who may act, stale
 * and duplicate commands, expiry, two acceptances racing for one animal,
 * privacy of contact details, versioned contracts with bound one-time codes,
 * replay, the stored PDF, cancellation history — and that no payment exists.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { finderContractApprovals, finderContractVersions, matingRequestEvents, matingRequests } from '../../src/db/schema/finder.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { publishRule } from '../../src/finder/rules.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { recordAnimalLifeEvent } from '../../src/animals/life-events.ts';
import {
  acceptTerms,
  cancelRequest,
  counterpartContact,
  createRequest,
  expireDueRequests,
  markNotCompleted,
  proposeTerms,
  requestDetail,
  respondToRequest,
  setContactConsent,
  type CreateRequestInput,
} from '../../src/finder/requests.ts';
import { blockConversation, messagesOf, postMessage, reportMessage, attachmentFor } from '../../src/finder/conversation.ts';
import {
  cancelContract,
  confirmContract,
  contractPdfFor,
  contractView,
  editContract,
  ensureContractPdf,
  publishTemplate,
  requestContractCode,
  startContract,
} from '../../src/finder/contracts.ts';
import { REQUIRED_CLAUSE_KEYS, REQUIRED_CLAUSE_FA } from '../../src/finder/request-model.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let t: TestDb;
let admin: Actor;
let breed: string;
let planId: string;
let root: string;
let chip = 800000000;
const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }));
const as = (id: string): Actor => ({ accountId: id as AccountId, context: 'USER', activeRoles: [] });
const code = (expected: string) => (error: unknown) => (error as { code?: string })?.code === expected;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const lastCodeFor = async (accountId: string) => {
  const [a] = (await t.db.execute<{ mobile: string }>(sql`select mobile from account where id = ${accountId}::uuid`)).rows;
  const msg = [...sink].reverse().find((m) => m.to === a!.mobile)!;
  return msg.text.slice(-6);
};

async function setting(key: string, value: unknown) {
  const current = await snapshotSetting(t.db, key).catch(() => null);
  await updateSetting(t.db, admin, { key, value, reason: 'SYNTHETIC', expectedVersion: current?.version });
}

let mobileSeq = 0;
async function owner(opts: { subscribed?: boolean; kyc?: boolean } = {}) {
  mobileSeq += 1;
  const id = await createTestAccount(t.db, '0999090' + String(mobileSeq).padStart(4, '0'));
  if (opts.kyc !== false) await t.db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED')`);
  await t.db.execute(sql`insert into profile (account_id, first_name, last_name, national_id, birth_date) values (${id}::uuid, 'SYNTHETIC', ${'مالک ' + mobileSeq}, ${String(1000000000 + mobileSeq)}, '1990-01-01')`).catch(() => undefined);
  await t.db.execute(sql`insert into residence (account_id, province, city, address) values (${id}::uuid, 'تهران', 'تهران', ${'SYNTHETIC کوچه ' + mobileSeq})`);
  if (opts.subscribed) {
    await t.db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${id}::uuid, ${planId}::uuid, 'OWNER', 1, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
  }
  return id;
}

async function dog(ownerId: string, sex: 'MALE' | 'FEMALE', opts: { state?: string; birth?: string } = {}) {
  const [a] = (
    await t.db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
      values (${ownerId}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + sex}, ${breed}::uuid, ${sex}, ${opts.birth ?? '2023-01-01'}) returning id`)
  ).rows;
  chip += 1;
  await t.db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${a!.id}::uuid, ${'985' + String(chip).padStart(12, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${ownerId}::uuid)`);
  const [p] = (await t.db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${a!.id}::uuid, ${ownerId}::uuid, ${opts.state ?? 'READY'}, now()) returning id`)).rows;
  return { animalId: a!.id, profileId: p!.id };
}

const terms = { route: 'PERSONAL', windowFrom: day(5), windowTo: day(20), cityFa: 'تهران', placeCategory: 'NEUTRAL', financialCategory: 'FIXED_AMOUNT' } as const;
const request = (sender: { animalId: string }, receiver: { profileId: string }, over: Partial<CreateRequestInput> = {}): CreateRequestInput => ({
  senderAnimalId: sender.animalId,
  receiverProfileId: receiver.profileId,
  ...terms,
  messageFa: 'SYNTHETIC سلام',
  specialConditionsFa: null,
  expiresInDays: null,
  ...over,
});

async function version(id: string) {
  return (await t.db.select({ v: matingRequests.version }).from(matingRequests).where(eq(matingRequests.id, id)))[0]!.v;
}

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
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-fr-'));
  admin = { accountId: (await createTestAccount(t.db, '09990900000')) as AccountId, context: 'SUPERADMIN', activeRoles: [] };
  breed = (await t.db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' order by sort_order limit 1`)).rows[0]!.id;
  planId = (await t.db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
    values ('OWNER', 12, 1, 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
  for (const sex of ['MALE', 'FEMALE'] as const) {
    await publishRule(t.db, admin, {
      speciesCode: 'DOG', breedId: breed, sex, minAgeMonths: 12, maxAgeMonths: 120,
      cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null,
      cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: 0,
    });
  }
  await setting('finder.flag.discovery', true);
  await setting('finder.flag.chat', true);
  await setting('finder.flag.free_pool_visibility', true);
});

after(async () => {
  await t?.drop();
  await fs.rm(root, { recursive: true, force: true });
});

test('sending is closed by its switch and refused for every missing condition', async () => {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const c = await owner();
  const male = await dog(a, 'MALE');
  const female = await dog(b, 'FEMALE');
  await assert.rejects(createRequest(t.db, as(a), request(male, female)), code('CONFLICT'));
  await setting('finder.flag.requests', true);

  // Free to free: the free owner's profile is not even visible to the other free owner.
  const freeMale = await dog(c, 'MALE');
  await assert.rejects(createRequest(t.db, as(c), request(freeMale, female)), code('NOT_FOUND'));
  // No KYC on the sender.
  const noKyc = await owner({ subscribed: true, kyc: false });
  await assert.rejects(createRequest(t.db, as(noKyc), request(await dog(noKyc, 'MALE'), female)), code('VALIDATION'));
  // The sender's animal must be on the finder.
  await assert.rejects(createRequest(t.db, as(a), request(await dog(a, 'MALE', { state: 'INACTIVE' }), female)), code('VALIDATION'));
  // Same sex is refused by the evaluator.
  await assert.rejects(createRequest(t.db, as(a), request(male, await dog(b, 'MALE'))), code('VALIDATION'));
  // Too young for the breed's age rule.
  await assert.rejects(createRequest(t.db, as(a), request(male, await dog(b, 'FEMALE', { birth: day(-100) }))), (e: unknown) => code('VALIDATION')(e) && /حداقل سن/.test((e as Error).message));
  // Official route without pedigrees.
  await assert.rejects(createRequest(t.db, as(a), request(male, female, { route: 'OFFICIAL' })), (e: unknown) => /شجره/.test((e as Error).message));
  // Longer than the managed default (7 days).
  await assert.rejects(createRequest(t.db, as(a), request(male, female, { expiresInDays: 8 })), code('VALIDATION'));

  const sent = await createRequest(t.db, as(a), request(male, female, { expiresInDays: 3 }));
  const days = (sent.expiresAt.getTime() - sent.createdAt.getTime()) / 86_400_000;
  assert.ok(days > 2.9 && days < 3.1);
  const snap = sent.snapshot as { evaluation: { ruleVersions: unknown[] }; expirySetting: { value: number; version: number } };
  assert.ok(snap.evaluation.ruleVersions.length > 0, 'rule versions are snapshotted');
  assert.equal(snap.expirySetting.value, 7);
  await assert.rejects(createRequest(t.db, as(a), request(male, female)), code('CONFLICT'), 'one live request per pair');
});

test('only the receiver answers, a stale page changes nothing, terms go back and forth, and every move is history', async () => {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const male = await dog(a, 'MALE');
  const female = await dog(b, 'FEMALE');
  const req = await createRequest(t.db, as(a), request(male, female));
  await assert.rejects(respondToRequest(t.db, as(a), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null }), code('CONFLICT'));
  await assert.rejects(respondToRequest(t.db, as(await owner()), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null }), code('NOT_FOUND'));
  const accepted = await respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null });
  await assert.rejects(respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: false, reasonFa: 'x' }), code('CONFLICT'), 'stale version');
  const negotiating = await proposeTerms(t.db, as(a), { requestId: req.id, expectedVersion: accepted.version, ...terms, cityFa: 'کرج', specialConditionsFa: null });
  assert.equal(negotiating.status, 'NEGOTIATING');
  assert.equal(negotiating.termsVersion, 2);
  await assert.rejects(acceptTerms(t.db, as(a), { requestId: req.id, expectedVersion: negotiating.version }), code('CONFLICT'), 'the proposer does not accept their own terms');
  const back = await acceptTerms(t.db, as(b), { requestId: req.id, expectedVersion: negotiating.version });
  assert.equal(back.status, 'PRELIMINARILY_ACCEPTED');
  const events = await t.db.select().from(matingRequestEvents).where(eq(matingRequestEvents.requestId, req.id));
  assert.deepEqual(events.map((e) => e.toStatus), ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'NEGOTIATING', 'PRELIMINARILY_ACCEPTED']);
  await assert.rejects(respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: back.version, accept: false, reasonFa: '' }), code('VALIDATION'), 'a rejection needs a reason');
});

test('a request expires on its date, on any read or command and in a sweep', async () => {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const req = await createRequest(t.db, as(a), request(await dog(a, 'MALE'), await dog(b, 'FEMALE'), { expiresInDays: 1 }));
  const later = new Date(Date.now() + 2 * 86_400_000);
  const after = await respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null }, later);
  assert.equal(after.status, 'EXPIRED');
  const other = await createRequest(t.db, as(a), request(await dog(a, 'MALE'), await dog(b, 'FEMALE'), { expiresInDays: 1 }));
  assert.ok((await expireDueRequests(t.db, later)) >= 1);
  assert.equal((await requestDetail(t.db, as(a), other.id)).request.status, 'EXPIRED');
});

test('two acceptances racing for one animal leave exactly one contract; the loser is paused and resumes after cancellation', async () => {
  await publishTemplate(t.db, admin, {
    titleFa: 'SYNTHETIC قرارداد نمونه',
    clauses: [
      ...REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC متن بند ' + REQUIRED_CLAUSE_FA[key] })),
      { key: 'EXTRA_VISIT', required: false, titleFa: 'دیدار پیش از جفت‌گیری', bodyFa: 'SYNTHETIC دیدار اختیاری' },
    ],
    reasonFa: 'SYNTHETIC',
    expectedCurrentVersion: 0,
  });
  await assert.rejects(
    publishTemplate(t.db, admin, { titleFa: 'x', clauses: [{ key: 'TRAVEL', required: true, titleFa: 'x', bodyFa: 'x' }], reasonFa: 'x', expectedCurrentVersion: 1 }),
    code('VALIDATION'),
    'every required clause must be present',
  );
  await setting('finder.flag.contracts', true);

  const b = await owner();
  const female = await dog(b, 'FEMALE');
  const a1 = await owner({ subscribed: true });
  const a2 = await owner({ subscribed: true });
  const r1 = await createRequest(t.db, as(a1), request(await dog(a1, 'MALE'), female));
  const r2 = await createRequest(t.db, as(a2), request(await dog(a2, 'MALE'), female));
  const x1 = await respondToRequest(t.db, as(b), { requestId: r1.id, expectedVersion: r1.version, accept: true, reasonFa: null });
  const x2 = await respondToRequest(t.db, as(b), { requestId: r2.id, expectedVersion: r2.version, accept: true, reasonFa: null });
  const results = await Promise.allSettled([
    startContract(t.db, as(a1), { requestId: r1.id, expectedVersion: x1.version }),
    startContract(t.db, as(a2), { requestId: r2.id, expectedVersion: x2.version }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.some((r) => r.status === 'rejected' && code('CONFLICT')(r.reason)));
  const winner = results[0]!.status === 'fulfilled' ? r1 : r2;
  const loser = winner === r1 ? r2 : r1;
  const winnerActor = winner === r1 ? a1 : a2;
  assert.ok((await requestDetail(t.db, as(b), loser.id)).request.pausedAt, 'the competitor is paused');
  assert.equal((await t.db.execute<{ state: string }>(sql`select state from mating_profile where id = ${female.profileId}::uuid`)).rows[0]!.state, 'COORDINATING');

  await cancelRequest(t.db, as(winnerActor), { requestId: winner.id, expectedVersion: await version(winner.id), reasonFa: 'SYNTHETIC منصرف شدم' });
  assert.equal((await requestDetail(t.db, as(b), loser.id)).request.pausedAt, null, 'the competitor resumes');
  assert.equal((await t.db.execute<{ state: string }>(sql`select state from mating_profile where id = ${female.profileId}::uuid`)).rows[0]!.state, 'READY');
});

test('the conversation opens at acceptance, masks contacts, respects a block and reports only the other side', async () => {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const req = await createRequest(t.db, as(a), request(await dog(a, 'MALE'), await dog(b, 'FEMALE')));
  await assert.rejects(postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'سلام', file: null }), code('CONFLICT'), 'closed before acceptance');
  await respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null });
  const posted = await postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'شماره من 09121234567 است', file: null });
  assert.equal(posted.redacted, true);
  assert.ok(!(posted.message.bodyFa ?? '').includes('09121234567'));
  const withFile = await postMessage(t.db, root, as(b), { requestId: req.id, bodyFa: null, file: { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), originalName: 'x.pdf' } });
  assert.ok((await attachmentFor(t.db, root, as(a), withFile.message.id)).bytes.length > 0);
  const stranger = await owner();
  await assert.rejects(messagesOf(t.db, as(stranger), req.id), code('NOT_FOUND'));
  await assert.rejects(attachmentFor(t.db, root, as(stranger), withFile.message.id), code('NOT_FOUND'));
  await assert.rejects(reportMessage(t.db, as(a), { messageId: posted.message.id, reason: 'OFFENSIVE', details: null }), code('VALIDATION'), 'not your own');
  await reportMessage(t.db, as(b), { messageId: posted.message.id, reason: 'OFFENSIVE', details: null });
  await blockConversation(t.db, as(b), { requestId: req.id });
  await assert.rejects(postMessage(t.db, root, as(a), { requestId: req.id, bodyFa: 'سلام دوباره', file: null }), code('CONFLICT'));
});

test('a contract is confirmed only by both parties on the same version with their own unused codes', async () => {
  const before = Number((await t.db.execute<{ n: number }>(sql`select count(*)::int as n from payment_batch`)).rows[0]!.n);
  const { a, b, req } = await acceptedPair();
  const { contract } = await startContract(t.db, as(a), { requestId: req.id, expectedVersion: req.version });
  const v2 = await editContract(t.db, as(b), { contractId: contract.id, expectedNumber: 1, choices: { financialDetailsFa: 'SYNTHETIC جزئیات خصوصی', clauses: [{ key: 'EXTRA_VISIT', fillFa: 'یک بار' }] } });
  assert.equal(v2.number, 2);
  await assert.rejects(editContract(t.db, as(a), { contractId: contract.id, expectedNumber: 1, choices: { financialDetailsFa: null, clauses: [] } }), code('CONFLICT'), 'stale edit');
  await assert.rejects(requestContractCode(t.db, as(a), sms, { contractId: contract.id, number: 1 }), code('CONFLICT'), 'no code for an old version');

  const codeA = await requestContractCode(t.db, as(a), sms, { contractId: contract.id, number: 2 });
  await assert.rejects(requestContractCode(t.db, as(a), sms, { contractId: contract.id, number: 2 }), code('CONFLICT'), 'resend interval');
  const wrong = await confirmContract(t.db, as(a), { contractId: contract.id, number: 2, contentHash: v2.contentHash, otpId: codeA.otpId, code: '000000' === (await lastCodeFor(a)) ? '111111' : '000000', ip: '203.0.113.5', userAgent: 'test' });
  assert.equal(wrong.state, 'INVALID_CODE');
  const [otpRow] = (await t.db.execute<{ attempts: number }>(sql`select attempts from finder_contract_otp where id = ${codeA.otpId}::uuid`)).rows;
  assert.equal(otpRow!.attempts, 1, 'a wrong code is counted and the count is kept');
  const good = await lastCodeFor(a);
  await assert.rejects(confirmContract(t.db, as(a), { contractId: contract.id, number: 2, contentHash: 'deadbeef', otpId: codeA.otpId, code: good, ip: null, userAgent: null }), code('CONFLICT'), 'stale hash');
  await assert.rejects(confirmContract(t.db, as(b), { contractId: contract.id, number: 2, contentHash: v2.contentHash, otpId: codeA.otpId, code: good, ip: null, userAgent: null }), code('CONFLICT'), 'someone else’s code');
  const first = await confirmContract(t.db, as(a), { contractId: contract.id, number: 2, contentHash: v2.contentHash, otpId: codeA.otpId, code: good, ip: '203.0.113.5', userAgent: 'test' });
  assert.deepEqual(first, { state: 'APPROVED', confirmed: false });
  await assert.rejects(confirmContract(t.db, as(a), { contractId: contract.id, number: 2, contentHash: v2.contentHash, otpId: codeA.otpId, code: good, ip: null, userAgent: null }), code('CONFLICT'), 'replay');

  // The other side changes the text: the first approval does not carry over.
  const v3 = await editContract(t.db, as(b), { contractId: contract.id, expectedNumber: 2, choices: { financialDetailsFa: 'SYNTHETIC جزئیات تازه', clauses: [] } });
  for (const who of [a, b]) {
    const c = await requestContractCode(t.db, as(who), sms, { contractId: contract.id, number: 3 });
    await confirmContract(t.db, as(who), { contractId: contract.id, number: 3, contentHash: v3.contentHash, otpId: c.otpId, code: await lastCodeFor(who), ip: '198.51.100.1', userAgent: 'test' });
  }
  const detail = await requestDetail(t.db, as(a), req.id);
  assert.equal(detail.request.status, 'CONTRACT_CONFIRMED');
  const view = await contractView(t.db, as(a), req.id);
  assert.equal(view!.contract.confirmedNumber, 3);
  const approvals = await t.db.select().from(finderContractApprovals).where(eq(finderContractApprovals.contractVersionId, v3.id));
  assert.equal(approvals.length, 2);
  assert.ok(approvals.every((row) => row.contentHash === v3.contentHash && row.ip));
  const v2approvals = await t.db.select().from(finderContractApprovals).where(eq(finderContractApprovals.contractVersionId, v2.id));
  assert.equal(v2approvals.length, 1, 'the old approval stays in history, for its own version');
  assert.ok(!JSON.stringify(v3.content).match(/985\d{12}/), 'only a chip tail inside the contract');

  // The PDF: stored once, private to the two parties.
  const pdfId = await ensureContractPdf(t.db, root, contract.id);
  assert.ok(pdfId);
  assert.equal(await ensureContractPdf(t.db, root, contract.id), pdfId, 'never replaced');
  const pdf = await contractPdfFor(t.db, root, as(b), contract.id);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  await assert.rejects(contractPdfFor(t.db, root, as(await owner()), contract.id), code('NOT_FOUND'));

  // Contact details only after both consent.
  assert.equal(await counterpartContact(t.db, as(a), detail.request), null);
  await setContactConsent(t.db, as(a), { requestId: req.id, consent: true });
  assert.equal((await requestDetail(t.db, as(a), req.id)).contact, null);
  await setContactConsent(t.db, as(b), { requestId: req.id, consent: true });
  assert.ok((await requestDetail(t.db, as(a), req.id)).contact?.mobile);

  const afterCount = Number((await t.db.execute<{ n: number }>(sql`select count(*)::int as n from payment_batch`)).rows[0]!.n);
  assert.equal(afterCount, before, 'no payment row anywhere in the request-to-contract path');
  const tables = (await t.db.execute<{ table_name: string }>(sql`select table_name from information_schema.columns where table_name like 'finder_contract%' and column_name like '%amount%'`)).rows;
  assert.equal(tables.length, 0, 'no amount column on any contract table');
});

test('a confirmed contract is cancelled bilaterally or, with a reason, unilaterally, and its signed history stays', async () => {
  const signAll = async (a: string, b: string, contractId: string) => {
    const [v] = await t.db.select().from(finderContractVersions).where(eq(finderContractVersions.contractId, contractId));
    for (const who of [a, b]) {
      const c = await requestContractCode(t.db, as(who), sms, { contractId, number: v!.number });
      await confirmContract(t.db, as(who), { contractId, number: v!.number, contentHash: v!.contentHash, otpId: c.otpId, code: await lastCodeFor(who), ip: null, userAgent: null });
    }
  };
  const one = await acceptedPair();
  const c1 = (await startContract(t.db, as(one.a), { requestId: one.req.id, expectedVersion: one.req.version })).contract;
  await signAll(one.a, one.b, c1.id);
  const asked = await cancelContract(t.db, as(one.a), { contractId: c1.id, reasonFa: 'SYNTHETIC توافق شد', unilateral: false });
  assert.equal(asked.status, 'CONFIRMED', 'waits for the other side');
  const both = await cancelContract(t.db, as(one.b), { contractId: c1.id, reasonFa: 'SYNTHETIC موافقم', unilateral: false });
  assert.equal(both.cancelKind, 'BILATERAL');
  assert.equal((await t.db.select().from(finderContractVersions).where(eq(finderContractVersions.contractId, c1.id))).length, 1, 'versions kept');

  const two = await acceptedPair();
  const c2 = (await startContract(t.db, as(two.a), { requestId: two.req.id, expectedVersion: two.req.version })).contract;
  await signAll(two.a, two.b, c2.id);
  await assert.rejects(cancelContract(t.db, as(two.b), { contractId: c2.id, reasonFa: ' ', unilateral: true }), code('VALIDATION'));
  const uni = await cancelContract(t.db, as(two.b), { contractId: c2.id, reasonFa: 'SYNTHETIC نمی‌توانم', unilateral: true });
  assert.equal(uni.cancelKind, 'UNILATERAL');
  assert.equal((await requestDetail(t.db, as(two.a), two.req.id)).request.status, 'CANCELLED');

  const three = await acceptedPair();
  const c3 = (await startContract(t.db, as(three.a), { requestId: three.req.id, expectedVersion: three.req.version })).contract;
  await signAll(three.a, three.b, c3.id);
  const done = await markNotCompleted(t.db, as(three.a), { requestId: three.req.id, expectedVersion: await version(three.req.id), reasonFa: 'SYNTHETIC آبستن نشد' });
  assert.equal(done.status, 'MATING_NOT_COMPLETED');
});

test('an animal leaving the finder closes its open requests with the reason', async () => {
  const a = await owner({ subscribed: true });
  const b = await owner();
  const female = await dog(b, 'FEMALE');
  const req = await createRequest(t.db, as(a), request(await dog(a, 'MALE'), female));
  await recordAnimalLifeEvent(t.db, as(b), { animalId: female.animalId, kind: 'MISSING', occurredOn: day(-1), reasonFa: 'SYNTHETIC گم شد' });
  const detail = await requestDetail(t.db, as(a), req.id);
  assert.equal(detail.request.status, 'CANCELLED');
  assert.ok(detail.request.closedReasonFa);
});
