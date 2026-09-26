/**
 * Phase 4 finder foundations against a real database — PROMPT-002.
 *
 * The risks worth a database for: that a stale panel cannot overwrite a newer
 * plan or rule, that a subscription keeps what it bought after the plan
 * changes, that callbacks replayed, mismatched or racing produce exactly one
 * period each and never an overlap, that expiry and capacity are decided on the
 * server under a lock, and that the access matrix is a server answer.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { payingGateway } from '../helpers/membership.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { kycCases } from '../../src/db/schema/identity.ts';
import { kennels } from '../../src/db/schema/kennels.ts';
import { paymentItems } from '../../src/db/schema/billing.ts';
import { finderBreedRules, finderSubscriptionPeriods } from '../../src/db/schema/finder.ts';
import { updateSetting, snapshotSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { publishPlan, withdrawPlan, planSlots } from '../../src/finder/plans.ts';
import { activeRule, ensureFinderRules, publishRule } from '../../src/finder/rules.ts';
import {
  assertCapacityAvailable,
  finderCapacity,
  finderStanding,
  lockAccount,
  mayViewProfile,
  pairFormationProblem,
  startFinderSubscription,
} from '../../src/finder/subscriptions.ts';
import { finderFlagStates } from '../../src/finder/flags.ts';
import { setSpeciesEnabled, speciesEnabled, marketSpecies } from '../../src/marketplace/species.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import type { Actor, ActorContextName } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let testDb: TestDb;
let adminId: string;
const accounts: Record<string, string> = {};

const as = (accountId: string, context: ActorContextName = 'USER'): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: [],
});
const admin = () => as(adminId, 'SUPERADMIN');
const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

async function setFlag(key: string, value: boolean | number | null) {
  const current = await snapshotSetting(testDb.db, key).catch(() => null);
  await updateSetting(testDb.db, admin(), { key, value, reason: 'SYNTHETIC آزمون', expectedVersion: current?.version });
}

async function plan(audience: 'OWNER' | 'KENNEL', durationMonths: number, price: string | null, capacity: number, expected: number) {
  return publishPlan(testDb.db, admin(), {
    audience,
    durationMonths,
    titleFa: 'SYNTHETIC طرح ' + durationMonths,
    priceToman: price,
    activeAnimalCapacity: capacity,
    purchasableFrom: null,
    purchasableUntil: null,
    suspensionPolicy: 'PERIOD_CONTINUES_NO_REFUND',
    noteFa: null,
    reasonFa: 'SYNTHETIC انتشار آزمونی',
    expectedCurrentVersion: expected,
  });
}

/** The whole real money path: checkout, gateway trip, server verification. */
async function pay(accountId: string, planVersionId: string, amountRial?: bigint) {
  const started = await startFinderSubscription(testDb.db, as(accountId), { planVersionId });
  const gateway = payingGateway(amountRial ?? started.period.priceToman * 10n);
  const attempt = await startAttempt(testDb.db, as(accountId), { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  return { started, attempt, gateway, verify: () => verifyAttempt(testDb.db, { reference: attempt.reference }, gateway, paidEffects) };
}

async function approveKyc(accountId: string) {
  await testDb.db.insert(kycCases).values({ accountId, status: 'APPROVED' });
}

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  adminId = await createTestAccount(testDb.db, '09990700001');
  for (const [name, mobile] of Object.entries({
    buyer: '09990700002',
    renewer: '09990700003',
    racer: '09990700004',
    kennelOwner: '09990700005',
    freeOwner: '09990700006',
    subscriber: '09990700007',
    visitor: '09990700008',
    capacity: '09990700009',
    mismatch: '09990700010',
  })) {
    accounts[name] = await createTestAccount(testDb.db, mobile);
  }
});

after(async () => {
  await testDb?.drop();
});

test('the seed opens the finder for dogs only, closes every switch, publishes no plan and writes the baseline rule once', async () => {
  const mating = (await marketSpecies(testDb.db, 'MATING')).filter((row) => row.enabled).map((row) => row.speciesCode);
  assert.deepEqual(mating, ['DOG']);
  assert.equal(await speciesEnabled(testDb.db, 'MATING', 'CAT'), false);
  assert.ok((await finderFlagStates(testDb.db)).every((flag) => !flag.enabled), 'every switch starts closed');
  assert.ok((await planSlots(testDb.db)).every((slot) => slot.current === null), 'no plan is seeded');

  const rules = await testDb.db.select().from(finderBreedRules);
  assert.equal(rules.length, 2);
  const male = rules.find((r) => r.sex === 'MALE')!;
  const female = rules.find((r) => r.sex === 'FEMALE')!;
  assert.equal(male.cooldownDays, 14);
  assert.equal(female.cooldownMonths, 6);
  assert.ok(rules.every((r) => r.cooldownMode === 'WARN' && r.kinshipMode === 'WARN' && r.minAgeMonths === null));
  assert.equal(await ensureFinderRules(testDb.db), 0, 'a second seed changes nothing');
});

test('only the superadmin publishes a plan, a stale panel is refused, and publishing archives the version it replaces', async () => {
  await assert.rejects(
    publishPlan(testDb.db, as(adminId, 'MARKETPLACE_ADMIN'), {
      audience: 'OWNER',
      durationMonths: 1,
      titleFa: 'x',
      priceToman: '1000',
      activeAnimalCapacity: 3,
      purchasableFrom: null,
      purchasableUntil: null,
      suspensionPolicy: 'PERIOD_CONTINUES_NO_REFUND',
      noteFa: null,
      reasonFa: 'x',
      expectedCurrentVersion: 0,
    }),
    code('FORBIDDEN'),
  );
  await assert.rejects(plan('OWNER', 2, '1000', 3, 0), code('VALIDATION'), 'only 1/3/6/12 months exist');

  const v1 = await plan('OWNER', 12, '900000', 3, 0);
  assert.equal(v1.version, 1);
  await assert.rejects(plan('OWNER', 12, '950000', 3, 0), code('CONFLICT'), 'published from a stale panel');
  const v2 = await plan('OWNER', 12, '950000', 4, 1);
  assert.equal(v2.version, 2);
  const slot = (await planSlots(testDb.db)).find((s) => s.audience === 'OWNER' && s.durationMonths === 12)!;
  assert.equal(slot.current?.id, v2.id);

  // Two superadmins publishing the same slot at once: one version wins.
  const results = await Promise.allSettled([plan('OWNER', 12, '1000000', 3, 2), plan('OWNER', 12, '1100000', 3, 2)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && code('CONFLICT')(r.reason)).length, 1);

  const audits = await testDb.db.select().from(auditEvents).where(eq(auditEvents.action, 'FINDER_PLAN_PUBLISHED'));
  assert.equal(audits.length, 3);

  const winner = (await planSlots(testDb.db)).find((s) => s.audience === 'OWNER' && s.durationMonths === 12)!.current!;
  await assert.rejects(withdrawPlan(testDb.db, admin(), { planVersionId: winner.id, expectedVersion: 2, reasonFa: 'x' }), code('CONFLICT'));
  await withdrawPlan(testDb.db, admin(), { planVersionId: winner.id, expectedVersion: winner.version, reasonFa: 'SYNTHETIC توقف' });
  assert.match((await planSlots(testDb.db)).find((s) => s.audience === 'OWNER' && s.durationMonths === 12)!.problemFa!, /منتشر نشده/);
});

test('checkout is closed by its switch, refuses an unpriced plan in words, and a kennel plan needs an approved kennel', async () => {
  const unpriced = await plan('OWNER', 6, null, 3, 0);
  await assert.rejects(startFinderSubscription(testDb.db, as(accounts.buyer!), { planVersionId: unpriced.id }), code('CONFLICT'));
  await setFlag('finder.flag.subscription_purchase', true);
  await assert.rejects(
    startFinderSubscription(testDb.db, as(accounts.buyer!), { planVersionId: unpriced.id }),
    (error: unknown) => code('CONFLICT')(error) && /قیمت این طرح/.test((error as Error).message),
  );

  const kennelPlan = await plan('KENNEL', 1, '500000', 10, 0);
  await assert.rejects(startFinderSubscription(testDb.db, as(accounts.kennelOwner!), { planVersionId: kennelPlan.id }), /کنل تأییدشده/);
  await testDb.db.insert(kennels).values({ ownerAccountId: accounts.kennelOwner!, status: 'APPROVED' });
  const started = await startFinderSubscription(testDb.db, as(accounts.kennelOwner!), { planVersionId: kennelPlan.id });
  assert.equal(started.period.audience, 'KENNEL');
  assert.equal(started.period.activeAnimalCapacity, 10);
});

test('a paid period copies its plan, starts only on verification, ignores a replay and survives a later plan edit', async () => {
  const monthly = await plan('OWNER', 1, '200000', 3, 0);
  const flow = await pay(accounts.buyer!, monthly.id);
  const [item] = await testDb.db.select().from(paymentItems).where(eq(paymentItems.batchId, flow.started.batch.id));
  assert.equal(item?.priceSource, 'FINDER_PLAN');
  assert.equal(item?.priceSourceId, monthly.id);
  assert.equal(String(item?.amountToman), '200000');

  assert.equal((await finderStanding(testDb.db, accounts.buyer!)).state, 'NONE', 'nothing is live before the server verifies');
  const first = await flow.verify();
  assert.equal(first.state, 'PAID');
  const replay = await flow.verify();
  assert.equal(replay.state, 'PAID');
  assert.equal(replay.state === 'PAID' && replay.performed, false, 'a replayed callback does nothing');

  const rows = await testDb.db.select().from(finderSubscriptionPeriods).where(eq(finderSubscriptionPeriods.accountId, accounts.buyer!));
  const active = rows.filter((r) => r.status === 'ACTIVE');
  assert.equal(active.length, 1);
  const months = (active[0]!.endsAt!.getUTCFullYear() - active[0]!.startsAt!.getUTCFullYear()) * 12 + active[0]!.endsAt!.getUTCMonth() - active[0]!.startsAt!.getUTCMonth();
  assert.equal(months, 1);

  // The superadmin changes price and capacity afterwards: the paid period does not move.
  await plan('OWNER', 1, '999000', 7, monthly.version);
  const [after] = await testDb.db.select().from(finderSubscriptionPeriods).where(eq(finderSubscriptionPeriods.id, active[0]!.id));
  assert.equal(after!.priceToman, 200000n);
  assert.equal(after!.activeAnimalCapacity, 3);
  assert.equal((await finderCapacity(testDb.db, accounts.buyer!)).limit, 3);
});

test('a mismatched amount activates nothing and the period stays payable', async () => {
  const [slot] = (await planSlots(testDb.db)).filter((s) => s.audience === 'OWNER' && s.durationMonths === 1);
  const flow = await pay(accounts.mismatch!, slot!.current!.id, 1n);
  const outcome = await flow.verify();
  assert.equal(outcome.state, 'FAILED');
  const [row] = await testDb.db.select().from(finderSubscriptionPeriods).where(eq(finderSubscriptionPeriods.accountId, accounts.mismatch!));
  assert.equal(row?.status, 'PENDING_PAYMENT');
  assert.equal((await finderStanding(testDb.db, accounts.mismatch!)).state, 'NONE');
});

test('a renewal starts where the live period ends, and two payments verified together queue instead of overlapping', async () => {
  const monthly = (await planSlots(testDb.db)).find((s) => s.audience === 'OWNER' && s.durationMonths === 1)!.current!;
  const first = await pay(accounts.renewer!, monthly.id);
  await first.verify();
  const second = await pay(accounts.renewer!, monthly.id);
  assert.equal(second.started.period.kind, 'RENEWAL');
  await second.verify();
  const periods = (
    await testDb.db
      .select()
      .from(finderSubscriptionPeriods)
      .where(and(eq(finderSubscriptionPeriods.accountId, accounts.renewer!), eq(finderSubscriptionPeriods.status, 'ACTIVE')))
  ).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());
  assert.equal(periods.length, 2);
  assert.equal(periods[1]!.startsAt!.getTime(), periods[0]!.endsAt!.getTime(), 'the renewal continues the live period');

  // A checkout superseded by a newer one is paid anyway, at the same moment as
  // the newer one: both periods exist, one after the other, and no money is lost.
  const quarterly = await plan('OWNER', 3, '500000', 3, 0);
  const a = await pay(accounts.racer!, monthly.id);
  const b = await pay(accounts.racer!, quarterly.id);
  const [aStatus] = await testDb.db.select().from(finderSubscriptionPeriods).where(eq(finderSubscriptionPeriods.id, a.started.period.id));
  assert.equal(aStatus?.status, 'SUPERSEDED');
  const outcomes = await Promise.all([a.verify(), b.verify()]);
  assert.ok(outcomes.every((o) => o.state === 'PAID'));
  const raced = (
    await testDb.db
      .select()
      .from(finderSubscriptionPeriods)
      .where(and(eq(finderSubscriptionPeriods.accountId, accounts.racer!), eq(finderSubscriptionPeriods.status, 'ACTIVE')))
  ).sort((x, y) => x.startsAt!.getTime() - y.startsAt!.getTime());
  assert.equal(raced.length, 2);
  assert.ok(raced[1]!.startsAt!.getTime() >= raced[0]!.endsAt!.getTime(), 'no overlap');
});

test('expiry is read from the period: a later instant is EXPIRED and capacity falls back to the managed free figure', async () => {
  const later = new Date(Date.now() + 400 * 24 * 3600 * 1000);
  assert.equal((await finderStanding(testDb.db, accounts.buyer!, later)).state, 'EXPIRED');
  const unset = await finderCapacity(testDb.db, accounts.buyer!, later);
  assert.deepEqual([unset.limit, unset.source], [null, 'FREE'], 'no free figure entered yet: nothing may be activated');
  await setFlag('finder.capacity.free_owner', 1);
  assert.equal((await finderCapacity(testDb.db, accounts.buyer!, later)).limit, 1);
});

test('two activations at the edge of the capacity end with one success and one refusal', async () => {
  // The profile table arrives in PROMPT-003; until then a synthetic audit row
  // stands in for "one active profile", counted under the same account lock
  // the activation will use.
  const claim = () =>
    testDb.db.transaction(async (tx) => {
      await lockAccount(tx, accounts.capacity!);
      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(auditEvents)
        .where(and(eq(auditEvents.action, 'SYNTHETIC_FINDER_SLOT'), eq(auditEvents.targetId, accounts.capacity!)));
      await assertCapacityAvailable(tx, accounts.capacity!, counted!.n);
      await tx.insert(auditEvents).values({
        action: 'SYNTHETIC_FINDER_SLOT',
        actorType: 'SYSTEM',
        targetType: 'ACCOUNT',
        targetId: accounts.capacity!,
      } as never);
    });
  const results = await Promise.allSettled([claim(), claim(), claim()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'free capacity is 1');
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => code('CONFLICT')((r as PromiseRejectedResult).reason)));
});

test('the access matrix is answered by the server', async () => {
  const monthly = (await planSlots(testDb.db)).find((s) => s.audience === 'OWNER' && s.durationMonths === 1)!.current!;
  await (await pay(accounts.subscriber!, monthly.id)).verify();
  for (const who of ['subscriber', 'freeOwner', 'visitor']) await approveKyc(accounts[who]!);

  assert.equal(await mayViewProfile(testDb.db, null, accounts.subscriber!), true, 'a subscriber’s animal is public');
  assert.equal(await mayViewProfile(testDb.db, null, accounts.freeOwner!), false, 'a visitor never sees a free owner’s animal');
  assert.equal(await mayViewProfile(testDb.db, accounts.visitor!, accounts.freeOwner!), false, 'nor does a free user');
  assert.equal(await mayViewProfile(testDb.db, accounts.freeOwner!, accounts.freeOwner!), true, 'the owner sees their own');
  assert.equal(await mayViewProfile(testDb.db, accounts.subscriber!, accounts.freeOwner!), false, 'the free pool switch is closed');
  await setFlag('finder.flag.free_pool_visibility', true);
  assert.equal(await mayViewProfile(testDb.db, accounts.subscriber!, accounts.freeOwner!), true, 'a subscriber sees the free pool');

  assert.equal(await pairFormationProblem(testDb.db, accounts.visitor!, accounts.subscriber!), null, 'free may request a subscriber');
  assert.match((await pairFormationProblem(testDb.db, accounts.visitor!, accounts.freeOwner!))!, /دست‌کم یکی/);
  assert.match((await pairFormationProblem(testDb.db, accounts.mismatch!, accounts.subscriber!))!, /احراز هویت/);
});

test('breed rules: superadmin only, breed-specific over the species default, stale refused', async () => {
  const [breed] = await testDb.db.select({ id: referenceBreeds.id }).from(referenceBreeds).limit(1);
  const input = {
    speciesCode: 'DOG',
    breedId: breed!.id,
    sex: 'FEMALE',
    minAgeMonths: 18,
    maxAgeMonths: 96,
    cooldownDays: null,
    cooldownMonths: 8,
    cooldownMode: 'WARN',
    kinshipMaxDegree: 2,
    kinshipMode: 'BLOCK',
    warningFa: null,
    reasonFa: 'SYNTHETIC قاعده نژاد',
    expectedCurrentVersion: 0,
  };
  await assert.rejects(publishRule(testDb.db, as(adminId, 'MARKETPLACE_ADMIN'), input), code('FORBIDDEN'));
  await assert.rejects(publishRule(testDb.db, admin(), { ...input, cooldownDays: 30 }), code('VALIDATION'));
  const rule = await publishRule(testDb.db, admin(), input);
  await assert.rejects(publishRule(testDb.db, admin(), input), code('CONFLICT'));

  assert.equal((await activeRule(testDb.db, 'DOG', breed!.id, 'FEMALE'))?.id, rule.id);
  assert.equal((await activeRule(testDb.db, 'DOG', breed!.id, 'MALE'))?.cooldownDays, 14, 'no breed rule: the species default');
  assert.equal(await activeRule(testDb.db, 'CAT', null, 'MALE'), null, 'no rule at all is NOT_CONFIGURED');
});

test('the finder species gate and the finder settings belong to the superadmin', async () => {
  const [row] = await marketSpecies(testDb.db, 'MATING');
  await assert.rejects(
    setSpeciesEnabled(testDb.db, as(adminId, 'MARKETPLACE_ADMIN'), {
      market: 'MATING',
      speciesCode: row!.speciesCode,
      enabled: !row!.enabled,
      reasonFa: 'x',
      expectedVersion: row!.version,
    }),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    updateSetting(testDb.db, as(adminId, 'MARKETPLACE_ADMIN'), { key: 'finder.flag.requests', value: true }),
    code('FORBIDDEN'),
  );
  // A snapshot taken for a request keeps its value after the managed figure moves.
  const before = await snapshotSetting(testDb.db, 'finder.request.expiry_days');
  await updateSetting(testDb.db, admin(), { key: 'finder.request.expiry_days', value: 5, expectedVersion: before.version });
  assert.equal(before.value, 7);
  assert.equal((await snapshotSetting(testDb.db, 'finder.request.expiry_days')).value, 5);
});
