/**
 * Acceptance scenarios not already owned by a feature suite — PHASE-4 PROMPT-008.
 *
 * The scenario map in docs/qa/phase-4-acceptance.md points every requested
 * scenario at the test that proves it; this file holds only the one that had no
 * database-level proof yet: a request past its expiry that is already in
 * contract coordination (or confirmed) is not expired, by a read, a command or
 * the sweep, and its contract stays as it is. SYNTHETIC rows as elsewhere.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { finderContracts, matingRequests } from '../../src/db/schema/finder.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { publishRule } from '../../src/finder/rules.ts';
import { createRequest, expireDueRequests, requestDetail, respondToRequest } from '../../src/finder/requests.ts';
import { publishTemplate, startContract } from '../../src/finder/contracts.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS } from '../../src/finder/request-model.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let t: TestDb;
let admin: Actor;
let breed: string;
let planId: string;
let seq = 0;
const as = (id: string, context: Actor['context'] = 'USER'): Actor => ({ accountId: id as AccountId, context, activeRoles: [] });
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function owner(subscribed = false) {
  seq += 1;
  const id = await createTestAccount(t.db, '0999088' + String(seq).padStart(4, '0'));
  await t.db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED')`);
  if (subscribed) {
    await t.db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${id}::uuid, ${planId}::uuid, 'OWNER', 1, 12, 5, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
  }
  return id;
}

async function dog(ownerId: string, sex: 'MALE' | 'FEMALE') {
  const [a] = (await t.db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date)
    values (${ownerId}::uuid, 'REGISTERED', 'DOG', 'SYNTHETIC', ${breed}::uuid, ${sex}, '2023-01-01') returning id`)).rows;
  await t.db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${a!.id}::uuid, ${'98588' + String(Date.now()).slice(-7) + String(seq).padStart(3, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${ownerId}::uuid)`);
  const [p] = (await t.db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${a!.id}::uuid, ${ownerId}::uuid, 'READY', now()) returning id`)).rows;
  return { animalId: a!.id, profileId: p!.id };
}

before(async () => {
  t = await createTestDb();
  await seedBaseline(t.db);
  admin = as(await createTestAccount(t.db, '09990880000'), 'SUPERADMIN');
  breed = (await t.db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' order by sort_order limit 1`)).rows[0]!.id;
  planId = (await t.db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
    values ('OWNER', 12, 1, 'SYNTHETIC', 1000, 5, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)).rows[0]!.id;
  for (const sex of ['MALE', 'FEMALE'] as const) {
    await publishRule(t.db, admin, {
      speciesCode: 'DOG', breedId: breed, sex, minAgeMonths: 12, maxAgeMonths: 120,
      cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null,
      cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: 0,
    });
  }
  for (const key of ['finder.flag.discovery', 'finder.flag.free_pool_visibility', 'finder.flag.requests', 'finder.flag.chat', 'finder.flag.contracts']) {
    const current = await snapshotSetting(t.db, key);
    await updateSetting(t.db, admin, { key, value: true, reason: 'SYNTHETIC', expectedVersion: current.version });
  }
  await publishTemplate(t.db, admin, {
    titleFa: 'SYNTHETIC',
    clauses: REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: 'SYNTHETIC ' + REQUIRED_CLAUSE_FA[key] })),
    reasonFa: 'SYNTHETIC',
    expectedCurrentVersion: 0,
  });
});

after(async () => {
  await t?.drop();
});

test('expiry never touches a request that is already in contract coordination, and the contract stays', async () => {
  const a = await owner(true);
  const b = await owner();
  const male = await dog(a, 'MALE');
  const female = await dog(b, 'FEMALE');
  const req = await createRequest(t.db, as(a), {
    senderAnimalId: male.animalId, receiverProfileId: female.profileId, route: 'PERSONAL',
    windowFrom: day(2), windowTo: day(20), cityFa: 'تهران', placeCategory: 'NEUTRAL', financialCategory: 'NO_PAYMENT',
    messageFa: null, specialConditionsFa: null, expiresInDays: 1,
  });
  const accepted = await respondToRequest(t.db, as(b), { requestId: req.id, expectedVersion: req.version, accept: true, reasonFa: null });
  await startContract(t.db, as(a), { requestId: req.id, expectedVersion: accepted.version });

  // Long past its expiry, by any path: a sweep, a read by either party.
  const later = new Date(Date.now() + 30 * 86_400_000);
  assert.equal(await expireDueRequests(t.db, later), 0);
  for (const party of [a, b]) {
    const { request } = await requestDetail(t.db, as(party), req.id, later);
    assert.equal(request.status, 'CONTRACT_DRAFTING');
  }
  const [contract] = await t.db.select().from(finderContracts).where(eq(finderContracts.requestId, req.id));
  assert.equal(contract!.status, 'DRAFTING');

  // A competing request on the same female, also past due, does expire — the rule is by status, not by animal.
  const c = await owner(true);
  const other = await createRequest(t.db, as(c), {
    senderAnimalId: (await dog(c, 'MALE')).animalId, receiverProfileId: (await dog(b, 'FEMALE')).profileId, route: 'PERSONAL',
    windowFrom: day(2), windowTo: day(20), cityFa: 'تهران', placeCategory: 'NEUTRAL', financialCategory: 'NO_PAYMENT',
    messageFa: null, specialConditionsFa: null, expiresInDays: 1,
  });
  assert.ok((await expireDueRequests(t.db, later)) >= 1);
  const [expired] = await t.db.select().from(matingRequests).where(eq(matingRequests.id, other.id));
  assert.equal(expired!.status, 'EXPIRED');
});
