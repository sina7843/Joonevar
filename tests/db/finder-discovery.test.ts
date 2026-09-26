/**
 * Discovery against a real database — PHASE-4 PROMPT-004.
 *
 * The population is written as SYNTHETIC rows (the clinical path, KYC and
 * payments have their own suites): owners, registered dogs with an official
 * chip, profiles, subscription periods and lineage. What is tested is the
 * query: that it shows each viewer exactly what `publicProfile` would, forces
 * same breed and opposite sex in match mode, orders stably across pages while
 * profiles arrive, explains lineage, filters, stays private and stays fast.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { finderMatchNotices } from '../../src/db/schema/finder.ts';
import { notifications } from '../../src/db/schema/core.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { publishRule } from '../../src/finder/rules.ts';
import { publicProfile, activateProfile, addProfileMedia, changeProfileState } from '../../src/finder/profiles.ts';
import { myFavorites, saveSearch, searchProfiles, toggleFavorite, noticeMatches } from '../../src/finder/discovery.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let t: TestDb;
let admin: Actor;
let breedA: string;
let breedB: string;
let planId: string;
let chip = 700000000;
let root: string;

const as = (id: string): Actor => ({ accountId: id as AccountId, context: 'USER', activeRoles: [] });
const code = (expected: string) => (error: unknown) => (error as { code?: string })?.code === expected;

async function setting(key: string, value: unknown) {
  const current = await snapshotSetting(t.db, key).catch(() => null);
  await updateSetting(t.db, admin, { key, value, reason: 'SYNTHETIC', expectedVersion: current?.version });
}

async function owner(mobile: string, opts: { subscribed?: boolean; kyc?: boolean; geo?: [number, number]; city?: string } = {}) {
  const id = await createTestAccount(t.db, mobile);
  if (opts.kyc !== false) await t.db.execute(sql`insert into kyc_case (account_id, status) values (${id}::uuid, 'APPROVED')`);
  await t.db.execute(sql`insert into residence (account_id, province, city, address, geo_lat, geo_lng) values (${id}::uuid, 'تهران', ${opts.city ?? 'تهران'}, 'SYNTHETIC خیابان مخفی ۱۲', ${opts.geo ? String(opts.geo[0]) : null}, ${opts.geo ? String(opts.geo[1]) : null})`);
  if (opts.subscribed) {
    await t.db.execute(sql`insert into finder_subscription_period (account_id, plan_version_id, audience, plan_version, duration_months, active_animal_capacity, price_toman, suspension_policy, kind, status, starts_at, ends_at)
      values (${id}::uuid, ${planId}::uuid, 'OWNER', 1, 12, 50, 1000, 'PERIOD_CONTINUES_NO_REFUND', 'INITIAL', 'ACTIVE', now() - interval '1 day', now() + interval '300 days')`);
  }
  return id;
}

async function dog(ownerId: string, o: { breed?: string; sex: 'MALE' | 'FEMALE'; birth?: string; sire?: string | null; dam?: string | null; state?: string; activated?: string; name?: string }) {
  const [a] = (
    await t.db.execute<{ id: string }>(sql`insert into animal (owner_account_id, status, species, name, breed_id, sex, birth_date, sire_animal_id, dam_animal_id)
      values (${ownerId}::uuid, 'REGISTERED', 'DOG', ${o.name ?? 'SYNTHETIC سگ'}, ${o.breed ?? breedA}::uuid, ${o.sex}, ${o.birth ?? '2023-01-01'}, ${o.sire ?? null}, ${o.dam ?? null}) returning id`)
  ).rows;
  chip += 1;
  await t.db.execute(sql`insert into microchip (animal_id, number, read_method, bound_via, bound_by_account_id) values (${a!.id}::uuid, ${'985' + String(chip).padStart(12, '0')}, 'MANUAL', 'EXISTING_UNREGISTERED', ${ownerId}::uuid)`);
  let profileId: string | null = null;
  if (o.state) {
    const [p] = (
      await t.db.execute<{ id: string }>(sql`insert into mating_profile (animal_id, owner_account_id, state, activated_at) values (${a!.id}::uuid, ${ownerId}::uuid, ${o.state}, ${o.activated ?? new Date().toISOString()}) returning id`)
    ).rows;
    profileId = p!.id;
  }
  return { animalId: a!.id, profileId };
}

before(async () => {
  t = await createTestDb();
  await seedBaseline(t.db);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-fd-'));
  admin = { accountId: (await createTestAccount(t.db, '09990800000')) as AccountId, context: 'SUPERADMIN', activeRoles: [] };
  const breeds = (await t.db.execute<{ id: string }>(sql`select id from reference_breed where species_code = 'DOG' order by sort_order limit 2`)).rows;
  breedA = breeds[0]!.id;
  breedB = breeds[1]!.id;
  planId = (
    await t.db.execute<{ id: string }>(sql`insert into finder_plan_version (audience, duration_months, version, title_fa, price_toman, active_animal_capacity, suspension_policy, reason_fa)
      values ('OWNER', 12, 1, 'SYNTHETIC', 1000, 50, 'PERIOD_CONTINUES_NO_REFUND', 'SYNTHETIC') returning id`)
  ).rows[0]!.id;
  // An age range for breed A so match mode can pass the age rule.
  for (const sex of ['MALE', 'FEMALE'] as const) {
    await publishRule(t.db, admin, {
      speciesCode: 'DOG', breedId: breedA, sex, minAgeMonths: 12, maxAgeMonths: 120,
      cooldownDays: sex === 'MALE' ? 14 : null, cooldownMonths: sex === 'FEMALE' ? 6 : null,
      cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: 0,
    });
  }
});

after(async () => {
  await t?.drop();
  await fs.rm(root, { recursive: true, force: true });
});

test('discovery is closed until its switch opens', async () => {
  const result = await searchProfiles(t.db, null, {});
  assert.equal(result.closed, true);
  await setting('finder.flag.discovery', true);
  assert.equal((await searchProfiles(t.db, null, {})).closed, false);
});

test('the query shows each viewer exactly what the public page would, across the whole access matrix', async () => {
  const subOwner = await owner('09990800001', { subscribed: true });
  const freeOwner = await owner('09990800002');
  const subViewer = await owner('09990800003', { subscribed: true });
  const freeViewer = await owner('09990800004');
  const shown = await dog(subOwner, { sex: 'FEMALE', state: 'READY' });
  const free = await dog(freeOwner, { sex: 'FEMALE', state: 'READY' });
  const paused = await dog(subOwner, { sex: 'FEMALE', state: 'TEMPORARILY_UNAVAILABLE' });
  const dead = await dog(subOwner, { sex: 'FEMALE', state: 'READY' });
  await t.db.execute(sql`insert into animal_life_event (animal_id, kind, occurred_on, reason_fa, recorded_by_account_id) values (${dead.animalId}::uuid, 'DECEASED', '2026-01-01', 'SYNTHETIC', ${subOwner}::uuid)`);
  const moved = await dog(subOwner, { sex: 'FEMALE', state: 'READY' });
  await t.db.execute(sql`update animal set owner_account_id = ${freeOwner}::uuid where id = ${moved.animalId}::uuid`);

  const all = [shown, free, paused, dead, moved].map((d) => d.profileId!);
  for (const freePool of [false, true]) {
    await setting('finder.flag.free_pool_visibility', freePool);
    for (const viewer of [null, freeViewer, subViewer, freeOwner, subOwner]) {
      const result = await searchProfiles(t.db, viewer ? as(viewer) : null, {}, { pageSize: 500 });
      const listed = new Set(result.items.map((i) => i.profileId));
      for (const id of all) {
        const page = await publicProfile(t.db, viewer, id);
        assert.equal(listed.has(id), page !== null, `viewer ${viewer ?? 'visitor'} pool ${freePool} profile ${id}`);
      }
    }
  }
  const visitor = new Set((await searchProfiles(t.db, null, {}, { pageSize: 500 })).items.map((i) => i.profileId));
  assert.ok(visitor.has(shown.profileId!) && !visitor.has(free.profileId!) && !visitor.has(paused.profileId!) && !visitor.has(dead.profileId!) && !visitor.has(moved.profileId!));
});

test('match mode forces same breed and opposite sex, excludes the viewer’s own animal, and refuses someone else’s animal', async () => {
  const me = await owner('09990800010', { subscribed: true, geo: [35.7, 51.4] });
  const them = await owner('09990800011', { subscribed: true, geo: [35.72, 51.42] });
  const mine = await dog(me, { sex: 'MALE', state: 'READY', name: 'SYNTHETIC نر من' });
  const good = await dog(them, { sex: 'FEMALE', state: 'READY' });
  const sameSex = await dog(them, { sex: 'MALE', state: 'READY' });
  const otherBreed = await dog(them, { sex: 'FEMALE', breed: breedB, state: 'READY' });

  const result = await searchProfiles(t.db, as(me), { for: mine.animalId, sex: 'MALE', breed: breedB }, { pageSize: 500 });
  assert.equal(result.mode, 'MATCH');
  const ids = result.items.map((i) => i.profileId);
  assert.ok(ids.includes(good.profileId!));
  for (const excluded of [sameSex, otherBreed, mine]) assert.ok(!ids.includes(excluded.profileId!), 'the query string cannot widen match mode');
  const item = result.items.find((i) => i.profileId === good.profileId)!;
  assert.ok(item.evaluation);
  assert.ok(item.evaluation.ruleVersions.length > 0, 'the rule versions used are returned for the record');
  assert.equal(item.distanceKm, 5, 'rounded, never exact');

  const stranger = await searchProfiles(t.db, as(them), { for: mine.animalId });
  assert.equal(stranger.items.length, 0);
  assert.ok(stranger.problemFa);
  assert.equal(stranger.filters.forAnimalId, null);
});

test('lineage is explained: a sibling is a warning by default and a blocker under a BLOCK rule; missing parents are unknown', async () => {
  const me = await owner('09990800020', { subscribed: true });
  const them = await owner('09990800021', { subscribed: true });
  const sire = await dog(them, { sex: 'MALE' });
  const dam = await dog(them, { sex: 'FEMALE' });
  const mine = await dog(me, { sex: 'MALE', sire: sire.animalId, dam: dam.animalId });
  const sister = await dog(them, { sex: 'FEMALE', sire: sire.animalId, dam: dam.animalId, state: 'READY' });
  const stranger = await dog(them, { sex: 'FEMALE', state: 'READY' });

  const first = await searchProfiles(t.db, as(me), { for: mine.animalId }, { pageSize: 500 });
  const sisterEval = first.items.find((i) => i.profileId === sister.profileId)!.evaluation!;
  assert.equal(sisterEval.blockers.length, 0);
  assert.ok(sisterEval.warnings.some((w) => /تنی/.test(w)));
  const strangerEval = first.items.find((i) => i.profileId === stranger.profileId)!.evaluation!;
  assert.ok(strangerEval.unknowns.some((u) => /قابل تأیید نیست/.test(u)), 'no parents recorded: unknown, not safe');

  // The breed now blocks kinship up to degree 2; the next evaluation uses the new version.
  const [current] = (await t.db.execute<{ version: number }>(sql`select version from finder_breed_rule where breed_id = ${breedA}::uuid and sex = 'MALE' and status = 'PUBLISHED'`)).rows;
  const rule = await publishRule(t.db, admin, {
    speciesCode: 'DOG', breedId: breedA, sex: 'MALE', minAgeMonths: 12, maxAgeMonths: 120, cooldownDays: 14, cooldownMonths: null,
    cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'BLOCK', warningFa: null, reasonFa: 'SYNTHETIC', expectedCurrentVersion: current!.version,
  });
  const second = await searchProfiles(t.db, as(me), { for: mine.animalId }, { pageSize: 500 });
  const blocked = second.items.find((i) => i.profileId === sister.profileId)!;
  assert.equal(blocked.evaluation!.score, 0);
  assert.ok(blocked.evaluation!.ruleVersions.some((r) => r.id === rule.id));
  assert.equal(second.items.at(-1)!.evaluation!.score, 0, 'a blocked pair sorts last');
});

test('pages are stable while profiles arrive: no duplicates and no skipped rows', async () => {
  const o = await owner('09990800030', { subscribed: true });
  const base = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 9; i += 1) await dog(o, { sex: 'FEMALE', breed: breedB, state: 'READY', activated: new Date(base + i * 60_000).toISOString() });
  const q = { breed: breedB, city: 'تهران' };
  const before = (await searchProfiles(t.db, null, q, { pageSize: 500 })).items.map((i) => i.profileId);
  const first = await searchProfiles(t.db, null, q, { pageSize: 4 });
  await dog(o, { sex: 'FEMALE', breed: breedB, state: 'READY', activated: new Date(base + 999 * 60_000).toISOString() });
  const second = await searchProfiles(t.db, null, { ...q, cursor: first.next! }, { pageSize: 4 });
  const third = await searchProfiles(t.db, null, { ...q, cursor: second.next! }, { pageSize: 4 });
  const seen = [...first.items, ...second.items, ...third.items].map((i) => i.profileId);
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual([...seen].sort(), [...before].sort());
});

test('filters narrow the set, and nothing private leaves in a result', async () => {
  const o = await owner('09990800040', { subscribed: true, geo: [36.3, 59.6], city: 'مشهد' });
  await t.db.execute(sql`insert into kennel (owner_account_id, status, name_fa) values (${o}::uuid, 'APPROVED', 'SYNTHETIC کنل')`);
  const mated = await dog(o, { sex: 'MALE', state: 'READY' });
  await t.db.execute(sql`insert into animal_last_mating (animal_id, last_mated_on, source, source_id, confirmed_count) values (${mated.animalId}::uuid, current_date - 5, 'OFFICIAL', gen_random_uuid(), 1)`);
  const young = await dog(o, { sex: 'MALE', state: 'INVITE_ONLY', birth: new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10) });

  const ids = async (q: Record<string, string>) => new Set((await searchProfiles(t.db, null, q, { pageSize: 500 })).items.map((i) => i.profileId));
  assert.ok(!(await ids({ cooldown: 'CLEAR' })).has(mated.profileId!), 'in cooldown is filtered out');
  assert.ok(!(await ids({ lastMating: 'NONE' })).has(mated.profileId!));
  assert.ok(!(await ids({ lastMating: '90' })).has(mated.profileId!));
  assert.ok((await ids({ ownerKind: 'KENNEL' })).has(mated.profileId!));
  assert.ok(!(await ids({ ownerKind: 'OWNER' })).has(mated.profileId!));
  assert.ok((await ids({ availability: 'INVITE_ONLY' })).has(young.profileId!));
  assert.ok(!(await ids({ minAge: '12' })).has(young.profileId!));
  assert.ok((await ids({ city: 'مشهد' })).has(mated.profileId!));
  assert.ok(!(await ids({ pedigree: 'YES' })).has(mated.profileId!));
  assert.ok(!(await ids({ completeness: '5' })).has(mated.profileId!));

  const everything = JSON.stringify(await searchProfiles(t.db, null, {}, { pageSize: 500 }));
  assert.ok(!/985\d{12}/.test(everything), 'no microchip number');
  assert.ok(!everything.includes('59.6') && !everything.includes('36.3'), 'no coordinates');
  assert.ok(!everything.includes('خیابان مخفی'), 'no address');
});

test('favourites need visibility and say when a profile has gone; saved searches notify once per profile', async () => {
  const o = await owner('09990800050', { subscribed: true });
  const fan = await owner('09990800051');
  const target = await dog(o, { sex: 'FEMALE', breed: breedB, state: 'READY' });
  assert.equal(await toggleFavorite(t.db, as(fan), target.profileId!), true);
  await t.db.execute(sql`update mating_profile set state = 'TEMPORARILY_UNAVAILABLE' where id = ${target.profileId}::uuid`);
  const favs = await myFavorites(t.db, as(fan));
  assert.equal(favs.find((f) => f.profileId === target.profileId)?.card, null, 'listed without details once hidden');
  await assert.rejects(toggleFavorite(t.db, as(await owner('09990800052')), target.profileId!), code('NOT_FOUND'));

  await setting('finder.flag.notifications', true);
  await saveSearch(t.db, as(fan), { nameFa: 'SYNTHETIC ماده‌ها', raw: { breed: breedB, sex: 'FEMALE' }, notify: true });
  await saveSearch(t.db, as(o), { nameFa: 'SYNTHETIC خودم', raw: { breed: breedB }, notify: true });
  await assert.rejects(saveSearch(t.db, as(fan), { nameFa: 'x', raw: {}, notify: true }), code('VALIDATION'));

  // The profile becomes visible again through the owner's own state change: one notice, not to its owner.
  await t.db.execute(sql`update mating_profile set version = version where id = ${target.profileId}::uuid`);
  const [p] = (await t.db.execute<{ version: number }>(sql`select version from mating_profile where id = ${target.profileId}::uuid`)).rows;
  await changeProfileState(t.db, as(o), { profileId: target.profileId!, to: 'READY', expectedVersion: p!.version });
  await t.db.transaction((tx) => noticeMatches(tx, target.profileId!));
  const notices = await t.db.select().from(finderMatchNotices).where(eq(finderMatchNotices.profileId, target.profileId!));
  assert.equal(notices.length, 1, 'deduplicated across repeated visibility');
  const told = await t.db.select().from(notifications).where(eq(notifications.kind, 'FINDER_SAVED_SEARCH_MATCH'));
  assert.deepEqual([...new Set(told.map((n) => n.recipientAccountId))], [fan]);
});

test('a real activation announces itself to matching saved searches', async () => {
  const o = await owner('09990800060', { subscribed: true });
  const watcher = await owner('09990800061', { subscribed: true });
  await saveSearch(t.db, as(watcher), { nameFa: 'SYNTHETIC نرها', raw: { sex: 'MALE', breed: breedA }, notify: true });
  await setting('finder.capacity.free_owner', 1);
  const d = await dog(o, { sex: 'MALE' });
  await t.db.execute(sql`insert into animal_fertility_declaration (animal_id, status, declared_by_account_id) values (${d.animalId}::uuid, 'NOT_STERILIZED', ${o}::uuid)`);
  const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];
  const jpeg = new Uint8Array([0xff, 0xd8, ...segment(0xe0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]), 0xff, 0xda, 0, 4, 9, 9, 1, 0xff, 0xd9]);
  for (const role of ['FULL_BODY', 'FACE'] as const) {
    await addProfileMedia(t.db, root, as(o), { animalId: d.animalId, kind: 'IMAGE', role, bytes: jpeg, originalName: 'x.jpg', altFa: role });
  }
  const profile = await activateProfile(t.db, as(o), { animalId: d.animalId });
  const notices = await t.db.select().from(finderMatchNotices).where(eq(finderMatchNotices.profileId, profile.id));
  assert.equal(notices.length, 1);
});

test('a representative population answers within a bounded time', async () => {
  const owners = await Promise.all(Array.from({ length: 10 }, (_, i) => owner('0999081' + String(i).padStart(4, '0'), { subscribed: i % 2 === 0 })));
  for (let i = 0; i < 300; i += 1) await dog(owners[i % 10]!, { sex: i % 2 ? 'MALE' : 'FEMALE', state: 'READY' });
  const me = owners[0]!;
  const mine = await dog(me, { sex: 'MALE' });
  const started = performance.now();
  const browse = await searchProfiles(t.db, as(me), {}, { pageSize: 12 });
  const match = await searchProfiles(t.db, as(me), { for: mine.animalId }, { pageSize: 12 });
  const elapsed = performance.now() - started;
  assert.ok(browse.total >= 150 && match.total >= 75);
  assert.ok(elapsed < 5000, 'two searches over 300+ profiles in ' + Math.round(elapsed) + ' ms');
  console.log('discovery timing: browse+match over ' + browse.total + ' profiles in ' + Math.round(elapsed) + ' ms');
});
