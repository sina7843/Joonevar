/**
 * From a confirmed contract to one downstream path — PHASE-4 PROMPT-006, on a real database.
 *
 * The official side uses the real Phase 1 fixture (two members, pedigreed and
 * chipped by the actual pipeline), because the permit's own rules are what is
 * being preserved. The personal side uses SYNTHETIC chipped animals, since a
 * pedigree is exactly what it must not need. The risks tested: the handoff is
 * idempotent under retries and races, re-validates what may have changed, keeps
 * the two paths apart, and the shared date protocol moves both animals' last
 * mating atomically from mutually confirmed dates only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { withMatingCtx, takeToIssued, twoPedigreedAnimals, type MatingCtx } from '../helpers/mating.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { publishRule } from '../../src/finder/rules.ts';
import { localTestSmsSender } from '../../src/adapters/registry.ts';
import { loadEnv } from '../../src/config/env.ts';
import { createRequest, requestDetail, respondToRequest } from '../../src/finder/requests.ts';
import { cancelContract, confirmContract, contractView, publishTemplate, requestContractCode, startContract } from '../../src/finder/contracts.ts';
import { downstreamView, finderCooldownFor, handoffContract } from '../../src/finder/downstream.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import {
  confirmDate,
  confirmDateOn,
  datesOfSubject,
  declareDate,
  declareDateOn,
  declareDifferentDateOn,
  personalMatingForParty,
  personalSubject,
} from '../../src/mating/dates.ts';
import { startPermit } from '../../src/mating/permits.ts';
import { lastMatingsOf, rebuildLastMating } from '../../src/finder/last-mating.ts';
import { addPersonalNote, respondToDeclaration, startDeclaration } from '../../src/mating/declaration.ts';
import { finderPersonalMatings, matingPermits } from '../../src/db/schema/mating.ts';
import { addDays, todayCivil } from '../../src/domain/calendar.ts';
import type { Actor } from '../../src/authz/actor.ts';

const sink: Array<{ to: string; text: string }> = [];
const sms = localTestSmsSender(sink, loadEnv({ APP_ENV: 'development', INTEGRATION_MODE: 'local', DATABASE_URL: 'postgres://synthetic/unused' }));
const code = (expected: string) => (error: unknown) => (error as { code?: string })?.code === expected;
const daysAgo = (n: number) => addDays(todayCivil(), -n);
let chip = 0;

async function count(ctx: MatingCtx, table: string): Promise<number> {
  return (await ctx.testDb.db.execute<{ n: number }>(sql.raw('select count(*)::int as n from ' + table))).rows[0]!.n;
}

async function finderSetup(ctx: MatingCtx) {
  const db = ctx.testDb.db;
  for (const key of ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts']) {
    const current = await snapshotSetting(db, key);
    await updateSetting(db, ctx.admin.actor, { key, value: true, reason: 'SYNTHETIC', expectedVersion: current.version });
  }
  for (const sex of ['MALE', 'FEMALE'] as const) {
    await publishRule(db, ctx.admin.actor, {
      speciesCode: 'DOG', breedId: ctx.breedId, sex, minAgeMonths: 12, maxAgeMonths: 120,
      cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null,
      cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: 0,
    });
  }
  await publishTemplate(db, ctx.admin.actor, {
    titleFa: 'SYNTHETIC قرارداد',
    clauses: REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC ' + REQUIRED_CLAUSE_FA[key] })),
    reasonFa: 'SYNTHETIC',
    expectedCurrentVersion: 0,
  });
  const plan = (await db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
    values ('OWNER', 12, 1, 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
  await db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
    values (${ctx.first.accountId}::uuid, ${plan}::uuid, 'OWNER', 1, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
}

/** A profile on an existing animal (SYNTHETIC row; the profile rules have their own suite). */
async function profile(ctx: MatingCtx, animalId: string, ownerId: string): Promise<string> {
  return (await ctx.testDb.db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${animalId}::uuid, ${ownerId}::uuid, 'READY', now()) returning id`)).rows[0]!.id;
}

/** A SYNTHETIC chipped animal with no pedigree, for the personal path. */
async function chipped(ctx: MatingCtx, ownerId: string, sex: 'MALE' | 'FEMALE') {
  const [a] = (await ctx.testDb.db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
    values (${ownerId}::uuid, 'REGISTERED', 'DOG', ${'SYNTHETIC ' + sex}, ${ctx.breedId}::uuid, ${sex}, '2023-01-01') returning id`)).rows;
  chip += 1;
  await ctx.testDb.db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id)
    values (${a!.id}::uuid, ${'98561' + String(chip).padStart(10, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${ownerId}::uuid)`);
  return { animalId: a!.id, profileId: await profile(ctx, a!.id, ownerId) };
}

async function codeFor(mobile: string): Promise<string> {
  return [...sink].reverse().find((m) => m.to === mobile)!.text.slice(-6);
}

/** Request → acceptance → contract → both one-time codes: the P005 path, as a fixture. */
async function confirmedContract(ctx: MatingCtx, male: { animalId: string }, femaleProfileId: string, route: 'OFFICIAL' | 'PERSONAL') {
  const db = ctx.testDb.db;
  const req = await createRequest(db, ctx.first.actor, {
    senderAnimalId: male.animalId,
    receiverProfileId: femaleProfileId,
    route,
    windowFrom: todayCivil(),
    windowTo: addDays(todayCivil(), 20),
    cityFa: 'تهران',
    placeCategory: 'NEUTRAL',
    financialCategory: 'NO_PAYMENT',
    messageFa: null,
    specialConditionsFa: null,
    expiresInDays: null,
  });
  const accepted = await respondToRequest(db, ctx.second.actor, { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null });
  await startContract(db, ctx.first.actor, { requestId: req.id, expectedVersion: accepted.version });
  const view = (await contractView(db, ctx.first.actor, req.id))!;
  for (const party of [ctx.first, ctx.second]) {
    const { otpId } = await requestContractCode(db, party.actor, sms, { contractId: view.contract.id, number: view.current.number });
    const outcome = await confirmContract(db, party.actor, {
      contractId: view.contract.id, number: view.current.number, contentHash: view.current.contentHash,
      otpId, code: await codeFor(party.mobile), ip: '203.0.113.9', userAgent: 'test',
    });
    assert.equal(outcome.state, 'APPROVED');
  }
  assert.equal((await requestDetail(db, ctx.first.actor, req.id)).request.status, 'CONTRACT_CONFIRMED');
  return { requestId: req.id, contractId: view.contract.id };
}

test('PROMPT-006: one downstream path per confirmed contract, one date protocol, two separate paths', async (t) => {
  await withMatingCtx({ mobilePrefix: '099906600', tmpPrefix: 'hamzist-fdown-', councilCode: 'SYNTH-FD-1', chipBase: 6_600_000 }, async (ctx) => {
    const db = ctx.testDb.db;
    await finderSetup(ctx);
    const outsider: Actor = ctx.vet.actor;

    await t.test('personal: the handoff is idempotent under retry and a two-party race, and has no official effect', async () => {
      const male = await chipped(ctx, ctx.first.accountId, 'MALE');
      const female = await chipped(ctx, ctx.second.accountId, 'FEMALE');
      const { requestId, contractId } = await confirmedContract(ctx, male, female.profileId, 'PERSONAL');
      const [permits, batches, cards] = await Promise.all([count(ctx, 'mating_permit'), count(ctx, 'payment_batch'), count(ctx, 'puppy_card')]);

      await assert.rejects(handoffContract(db, outsider, { contractId }), code('NOT_FOUND'), 'a stranger cannot even see it');
      const [x, y] = await Promise.all([
        handoffContract(db, ctx.first.actor, { contractId }),
        handoffContract(db, ctx.second.actor, { contractId }),
      ]);
      const again = await handoffContract(db, ctx.first.actor, { contractId });
      assert.equal(x.id, y.id);
      assert.equal(x.id, again.id);
      assert.equal(x.route, 'PERSONAL');
      assert.equal(x.permitId, null);
      assert.equal((await db.select().from(finderPersonalMatings).where(eq(finderPersonalMatings.contractId, contractId))).length, 1);
      assert.deepEqual([await count(ctx, 'mating_permit'), await count(ctx, 'payment_batch'), await count(ctx, 'puppy_card')], [permits, batches, cards], 'no permit, no payment, no card');

      const mating = await personalMatingForParty(db, ctx.first.actor, x.personalMatingId!);
      await assert.rejects(personalMatingForParty(db, outsider, mating.id), code('NOT_FOUND'));
      const subject = personalSubject(mating);

      // Either side proposes; only the other side confirms that exact version.
      const v1 = await declareDateOn(db, ctx.first.actor, subject, { matedOn: daysAgo(2) });
      await assert.rejects(confirmDateOn(db, ctx.first.actor, subject, { declarationId: v1.id, expectedVersion: 1 }), code('FORBIDDEN'));
      await assert.rejects(declareDateOn(db, ctx.first.actor, subject, { matedOn: addDays(todayCivil(), 1) }), /آینده/);
      assert.equal((await lastMatingsOf(db, [male.animalId])).size, 0, 'a pending date drives nothing');

      await confirmDateOn(db, ctx.second.actor, subject, { declarationId: v1.id, expectedVersion: 1 });
      const last = await lastMatingsOf(db, [male.animalId, female.animalId]);
      assert.equal(last.get(male.animalId)?.lastMatedOn, daysAgo(2));
      assert.equal(last.get(female.animalId)?.lastMatedOn, daysAgo(2), 'both animals move in the same transaction');
      assert.equal(last.get(male.animalId)?.source, 'FINDER_PERSONAL');
      assert.equal((await requestDetail(db, ctx.first.actor, requestId)).request.status, 'MATING_COMPLETED');
      const profiles = (await db.execute<{ state: string }>(sql`select state from mating_profile where animal_id in (${male.animalId}::uuid, ${female.animalId}::uuid)`)).rows;
      assert.deepEqual(profiles.map((p) => p.state), ['READY', 'READY'], 'available again after the mating');

      const cooldown = await finderCooldownFor(db, [male.animalId, female.animalId]);
      assert.ok(cooldown.every((c) => c.cooldown.state === 'IN_COOLDOWN' && /فقط هشدار/.test(c.cooldown.fa)), 'the breed rule warns, never blocks');
      assert.deepEqual([await count(ctx, 'mating_permit'), await count(ctx, 'payment_batch'), await count(ctx, 'puppy_card')], [permits, batches, cards]);
    });

    await t.test('dates: corrections race to one winner, conflicts are explicit, and only the newest confirmed event counts', async () => {
      const male = await chipped(ctx, ctx.first.accountId, 'MALE');
      const female = await chipped(ctx, ctx.second.accountId, 'FEMALE');
      const { contractId } = await confirmedContract(ctx, male, female.profileId, 'PERSONAL');
      const link = await handoffContract(db, ctx.second.actor, { contractId });
      const subject = personalSubject(await personalMatingForParty(db, ctx.second.actor, link.personalMatingId!));

      const v1 = await declareDateOn(db, ctx.first.actor, subject, { matedOn: daysAgo(10) });
      const race = await Promise.allSettled([
        declareDateOn(db, ctx.first.actor, subject, { matedOn: daysAgo(9), replacesVersion: 1 }),
        declareDateOn(db, ctx.first.actor, subject, { matedOn: daysAgo(8), replacesVersion: 1 }),
      ]);
      assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'two corrections of one version: exactly one wins');
      assert.ok(race.some((r) => r.status === 'rejected' && code('CONFLICT')(r.reason)));
      await assert.rejects(confirmDateOn(db, ctx.second.actor, subject, { declarationId: v1.id, expectedVersion: 1 }), code('CONFLICT'), 'the superseded version is dead');

      const pending = (await datesOfSubject(db, subject)).find((r) => r.status === 'PROPOSED')!;
      const { conflicted, proposed } = await declareDifferentDateOn(db, ctx.second.actor, subject, {
        declarationId: pending.id, expectedVersion: pending.version, matedOn: daysAgo(7),
      });
      assert.equal(conflicted.status, 'CONFLICTED');
      assert.equal(proposed.conflictsWithId, conflicted.id);
      assert.equal((await lastMatingsOf(db, [male.animalId])).size, 0, 'stale, superseded and conflicted rows drive nothing');

      await confirmDateOn(db, ctx.first.actor, subject, { declarationId: proposed.id, expectedVersion: proposed.version });
      // An older date confirmed later does not replace the newer event.
      const older = await declareDateOn(db, ctx.second.actor, subject, { matedOn: daysAgo(12) });
      await confirmDateOn(db, ctx.first.actor, subject, { declarationId: older.id, expectedVersion: older.version });
      const last = (await lastMatingsOf(db, [male.animalId])).get(male.animalId)!;
      assert.equal(last.lastMatedOn, daysAgo(7));
      assert.equal(last.confirmedCount, 2, 'the count grows; no partner is named');

      // A full rebuild from the sources gives exactly the incremental answer.
      const before = await lastMatingsOf(db, [male.animalId, female.animalId]);
      await rebuildLastMating(db);
      assert.deepEqual(await lastMatingsOf(db, [male.animalId, female.animalId]), before);
    });

    await t.test('re-validation: an ownership change or a missing chip after the contract stops the handoff', async () => {
      const male = await chipped(ctx, ctx.first.accountId, 'MALE');
      const female = await chipped(ctx, ctx.second.accountId, 'FEMALE');
      const { contractId } = await confirmedContract(ctx, male, female.profileId, 'PERSONAL');
      // SYNTHETIC: the chip binding is removed and ownership moves, bypassing their own flows.
      await db.execute(sql`delete from microchip where animal_id = ${female.animalId}::uuid`);
      await assert.rejects(handoffContract(db, ctx.first.actor, { contractId }), (e: unknown) => code('VALIDATION')(e) && /میکروچیپ/.test((e as Error).message));
      await db.execute(sql`update animal set owner_account_id = ${ctx.vet.accountId}::uuid where id = ${male.animalId}::uuid`);
      await assert.rejects(handoffContract(db, ctx.second.actor, { contractId }), (e: unknown) => /مالک/.test((e as Error).message));
      assert.equal((await db.select().from(finderPersonalMatings).where(eq(finderPersonalMatings.contractId, contractId))).length, 0);
    });

    await t.test('cancellation detaches the path without erasing confirmed history', async () => {
      const male = await chipped(ctx, ctx.first.accountId, 'MALE');
      const female = await chipped(ctx, ctx.second.accountId, 'FEMALE');
      const { requestId, contractId } = await confirmedContract(ctx, male, female.profileId, 'PERSONAL');
      const link = await handoffContract(db, ctx.first.actor, { contractId });
      const mating = await personalMatingForParty(db, ctx.first.actor, link.personalMatingId!);
      const subject = personalSubject(mating);
      const done = await declareDateOn(db, ctx.first.actor, subject, { matedOn: daysAgo(3) });
      await confirmDateOn(db, ctx.second.actor, subject, { declarationId: done.id, expectedVersion: done.version });
      const open = await declareDateOn(db, ctx.second.actor, subject, { matedOn: daysAgo(1) });

      await cancelContract(db, ctx.first.actor, { contractId, reasonFa: 'SYNTHETIC لغو', unilateral: true });
      const view = (await downstreamView(db, ctx.second.actor, requestId))!;
      assert.ok(view.link?.detachedAt, 'detached, never rewritten');
      assert.equal(view.link?.personalMatingId, mating.id);
      assert.equal(view.personal?.status, 'CANCELLED');
      const rows = await datesOfSubject(db, subject);
      assert.equal(rows.find((r) => r.id === done.id)?.status, 'CONFIRMED', 'what happened stays recorded');
      assert.equal(rows.find((r) => r.id === open.id)?.status, 'SUPERSEDED', 'a pending proposal can no longer be confirmed');
      await assert.rejects(personalMatingForParty(db, ctx.first.actor, mating.id, { requireActive: true }), code('CONFLICT'));
      assert.equal((await handoffContract(db, ctx.first.actor, { contractId })).id, link.id, 'the link is final; a new path needs a new contract');
      assert.equal((await lastMatingsOf(db, [male.animalId])).get(male.animalId)?.lastMatedOn, daysAgo(3));
    });

    await t.test('official: the handoff opens or links the ordinary permit exactly once, and the permit keeps every rule', async () => {
      const { male, female } = await twoPedigreedAnimals(ctx);
      const maleProfile = await profile(ctx, male.animalId, ctx.first.accountId);
      assert.ok(maleProfile);
      const femaleProfile = await profile(ctx, female.animalId, ctx.second.accountId);
      const batches = await count(ctx, 'payment_batch');

      // A personal-route contract for these pedigreed animals would still be personal;
      // this one is official.
      const { requestId, contractId } = await confirmedContract(ctx, male, femaleProfile, 'OFFICIAL');
      assert.equal(await count(ctx, 'payment_batch'), batches, 'the contract collected nothing');

      // A double click races the same party (the fixture's permit path expects the
      // first owner as initiator); the other party's later call gets the same link.
      const [x, y] = await Promise.all([
        handoffContract(db, ctx.first.actor, { contractId }),
        handoffContract(db, ctx.first.actor, { contractId }),
      ]);
      assert.equal(x.id, y.id);
      assert.equal((await handoffContract(db, ctx.second.actor, { contractId })).id, x.id);
      assert.equal(x.route, 'OFFICIAL');
      const permits = await db.select().from(matingPermits).where(eq(matingPermits.sireAnimalId, male.animalId));
      assert.equal(permits.length, 1, 'one permit, whoever pressed and however often');
      const permit = permits[0]!;
      assert.equal(permit.id, x.permitId);
      assert.equal(permit.status, 'AWAITING_COUNTERPARTY', 'the counterparty still confirms the permit itself');
      assert.equal(permit.permitNo, null, 'the contract issues nothing');
      assert.equal(await count(ctx, 'payment_batch'), batches, 'the permit fee is paid in the permit flow, not here');
      await assert.rejects(declareDate(db, ctx.first.actor, permit.id, { matedOn: daysAgo(1) }), /مجوز صادرشده/, 'no official date before issuance');

      // The ordinary permit path — confirmation, allocation, payment, review — still runs, unchanged.
      const issued = await takeToIssued(ctx, permit);
      const date = await declareDate(db, ctx.second.actor, issued.id, { matedOn: daysAgo(1) });
      await confirmDate(db, ctx.first.actor, issued.id, { declarationId: date.id, expectedVersion: date.version });
      assert.equal((await requestDetail(db, ctx.first.actor, requestId)).request.status, 'MATING_COMPLETED');
      const last = await lastMatingsOf(db, [male.animalId, female.animalId]);
      assert.equal(last.get(female.animalId)?.source, 'OFFICIAL');
      assert.equal(last.get(male.animalId)?.lastMatedOn, daysAgo(1));
      assert.equal((await db.select().from(finderPersonalMatings).where(eq(finderPersonalMatings.contractId, contractId))).length, 0, 'paths never mix');
    });

    await t.test('official: an open permit the same owners already started is linked, not duplicated', async () => {
      // The pedigreed pair from the previous step now has an issued permit; a new
      // pair is needed for an open one.
      const { male, female } = await twoPedigreedAnimals(ctx);
      const femaleProfile = await profile(ctx, female.animalId, ctx.second.accountId);
      await profile(ctx, male.animalId, ctx.first.accountId);
      const { contractId } = await confirmedContract(ctx, male, femaleProfile, 'OFFICIAL');
      const open = await startPermit(db, ctx.second.actor, { ownAnimalId: female.animalId, counterpartyPedigreeCode: male.pedigreeCode });
      const link = await handoffContract(db, ctx.first.actor, { contractId });
      assert.equal(link.permitId, open.id);
      assert.equal((await db.select().from(matingPermits).where(eq(matingPermits.sireAnimalId, male.animalId))).length, 1);
    });

    await t.test('legacy: a one-sided personal declaration and its notes never reach the last mating, even on rebuild', async () => {
      const male = await chipped(ctx, ctx.first.accountId, 'MALE');
      const female = await chipped(ctx, ctx.second.accountId, 'FEMALE');
      const [chipNo] = (await db.execute<{ number: string }>(sql`select number from microchip where animal_id = ${female.animalId}::uuid`)).rows;
      const declaration = await startDeclaration(db, ctx.first.actor, { ownAnimalId: male.animalId, counterpartyIdentifier: chipNo!.number, counterpartyMobile: ctx.second.mobile }, sms);
      await addPersonalNote(db, ctx.first.actor, declaration.id, { kind: 'MATING_DATE', noteDate: daysAgo(1) });
      await respondToDeclaration(db, ctx.second.actor, declaration.id, { confirm: true });
      await rebuildLastMating(db);
      assert.equal((await lastMatingsOf(db, [male.animalId, female.animalId])).size, 0, 'legacy history is not upgraded to mutual confirmation');
    });
  });
});
