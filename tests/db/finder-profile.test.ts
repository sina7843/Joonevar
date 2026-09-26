/**
 * Mating profiles against a real database — PHASE-4 PROMPT-003.
 *
 * Built on the real clinical path (identity certified, official chip bound by a
 * trusted vet) and, for the last-mating projection, a real issued permit with
 * real date declarations. The risks: eligibility read from the right sources,
 * capacity decided under a lock, visibility decided in the query for each
 * viewer, a public picture that never leaks its original or its metadata, and
 * a last mating that only a mutual confirmation can move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import {
  animalWithSheet,
  issuedPermit,
  payingGateway,
  twoPedigreedAnimals,
  withMatingCtx,
  type MatingCtx,
} from '../helpers/mating.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { microchips } from '../../src/db/schema/clinical.ts';
import { auditEvents, storedFiles } from '../../src/db/schema/core.ts';
import { animalLastMatings, matingProfileMedia, matingProfiles } from '../../src/db/schema/finder.ts';
import { snapshotSetting, updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import { publishPlan } from '../../src/finder/plans.ts';
import { startFinderSubscription } from '../../src/finder/subscriptions.ts';
import { recordAnimalLifeEvent } from '../../src/animals/life-events.ts';
import { confirmDate, declareDate, declareDifferentDate } from '../../src/mating/dates.ts';
import * as lastMatingModule from '../../src/finder/last-mating.ts';
import { lastMatingsOf, rebuildLastMating } from '../../src/finder/last-mating.ts';
import {
  activateProfile,
  addProfileMedia,
  changeProfileState,
  deactivateProfileOf,
  declareFertility,
  ownerFinderAnimal,
  publicFinderMedia,
  publicProfile,
  removeProfileMedia,
  submitProfileReport,
} from '../../src/finder/profiles.ts';
import { NO_CONFIRMED_MATING_FA } from '../../src/finder/profile-model.ts';
import type { Actor } from '../../src/authz/actor.ts';

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];
/** A synthetic JPEG whose EXIF carries a GPS position, the thing the rendition must drop. */
const photo = (tag: string) =>
  new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...Buffer.from('Exif\0\0GPS 35.7N 51.4E ' + tag)]),
    0xff, 0xda, 0, 4, 9, 9, 0x10, 0x20,
    0xff, 0xd9,
  ]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d]);

async function setting(ctx: MatingCtx, key: string, value: unknown) {
  const current = await snapshotSetting(ctx.testDb.db, key).catch(() => null);
  await updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC', expectedVersion: current?.version });
}

/** Declaration and the two required pictures, through the real services. */
async function makeEligible(ctx: MatingCtx, actor: Actor, animalId: string, tag: string) {
  await declareFertility(ctx.testDb.db, actor, { animalId, status: 'NOT_STERILIZED', noteFa: null });
  const body = await addProfileMedia(ctx.testDb.db, ctx.root, actor, { animalId, kind: 'IMAGE', role: 'FULL_BODY', bytes: photo(tag + 'B'), originalName: 'b.jpg', altFa: 'تمام‌بدن ' + tag });
  const face = await addProfileMedia(ctx.testDb.db, ctx.root, actor, { animalId, kind: 'IMAGE', role: 'FACE', bytes: photo(tag + 'F'), originalName: 'f.jpg', altFa: 'صورت ' + tag });
  return { body, face };
}

async function subscribe(ctx: MatingCtx, actor: Actor) {
  const [plan] = await ctx.testDb.db.execute<{ id: string }>(sql`select id from finder_plan_version where status = 'PUBLISHED' limit 1`).then((r) => r.rows);
  const planId =
    plan?.id ??
    (
      await publishPlan(ctx.testDb.db, ctx.admin.actor, {
        audience: 'OWNER',
        durationMonths: 1,
        titleFa: 'SYNTHETIC',
        priceToman: '100000',
        activeAnimalCapacity: 3,
        purchasableFrom: null,
        purchasableUntil: null,
        suspensionPolicy: 'PERIOD_CONTINUES_NO_REFUND',
        noteFa: null,
        reasonFa: 'SYNTHETIC',
        expectedCurrentVersion: 0,
      })
    ).id;
  await setting(ctx, 'finder.flag.subscription_purchase', true).catch(() => undefined);
  const started = await startFinderSubscription(ctx.testDb.db, actor, { planVersionId: planId });
  const gateway = payingGateway(started.period.priceToman * 10n);
  const attempt = await startAttempt(ctx.testDb.db, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test');
  assert.equal((await verifyAttempt(ctx.testDb.db, { reference: attempt.reference }, gateway, paidEffects)).state, 'PAID');
}

test('activation reads every condition from its source, is the owner’s alone, and capacity is decided under a lock', async () => {
  await withMatingCtx({ mobilePrefix: '099941000', tmpPrefix: 'hamzist-fp1-', councilCode: 'SYNTH-FP-1', chipBase: 6_410_000 }, async (ctx) => {
    const db = ctx.testDb.db;
    const a = await animalWithSheet(ctx, 'سگ یک', { skipSheet: true });
    const b = await animalWithSheet(ctx, 'سگ دو', { skipSheet: true });
    const c = await animalWithSheet(ctx, 'سگ سه', { skipSheet: true });

    // Somebody else's animal answers exactly like a missing one.
    for (const attempt of [
      () => ownerFinderAnimal(db, ctx.second.actor, a.animalId),
      () => declareFertility(db, ctx.second.actor, { animalId: a.animalId, status: 'NOT_STERILIZED', noteFa: null }),
      () => activateProfile(db, ctx.second.actor, { animalId: a.animalId }),
      () => addProfileMedia(db, ctx.root, ctx.second.actor, { animalId: a.animalId, kind: 'IMAGE', role: 'FACE', bytes: photo('x'), originalName: 'x.jpg', altFa: 'x' }),
    ]) {
      await assert.rejects(attempt(), code('NOT_FOUND'));
    }

    const before = await ownerFinderAnimal(db, ctx.first.actor, a.animalId);
    assert.deepEqual(before.eligibility.problems.map((p) => p.code), ['FERTILITY_UNDECLARED', 'FULL_BODY', 'FACE'], 'KYC, chip and identity already hold');
    await assert.rejects(activateProfile(db, ctx.first.actor, { animalId: a.animalId }), code('VALIDATION'));

    const { body } = await makeEligible(ctx, ctx.first.actor, a.animalId, 'a');
    // The original keeps the GPS; the rendition does not.
    const [media] = await db.select().from(matingProfileMedia).where(eq(matingProfileMedia.id, body.id));
    const [original] = await db.select().from(storedFiles).where(eq(storedFiles.id, media!.fileId));
    const [rendition] = await db.select().from(storedFiles).where(eq(storedFiles.id, media!.renditionFileId!));
    assert.equal(original?.purpose, 'MATING_PROFILE_IMAGE');
    assert.equal(rendition?.purpose, 'MATING_PROFILE_RENDITION');
    const renditionBytes = await fs.readFile(path.join(ctx.root, rendition!.storageKey));
    assert.ok(!renditionBytes.toString('latin1').includes('GPS'));
    assert.ok((await fs.readFile(path.join(ctx.root, original!.storageKey))).toString('latin1').includes('GPS'));

    // No free capacity has been entered: nothing activates on a guess.
    await assert.rejects(activateProfile(db, ctx.first.actor, { animalId: a.animalId }), (e: unknown) => code('CONFLICT')(e) && /تعیین نشده/.test((e as Error).message));
    await setting(ctx, 'finder.capacity.free_owner', 1);
    const profile = await activateProfile(db, ctx.first.actor, { animalId: a.animalId });
    assert.equal(profile.state, 'READY');

    await makeEligible(ctx, ctx.first.actor, b.animalId, 'b');
    await assert.rejects(activateProfile(db, ctx.first.actor, { animalId: b.animalId }), (e: unknown) => code('CONFLICT')(e) && /پر است/.test((e as Error).message));

    // Owner states, a stale panel and the states the owner does not control.
    const paused = await changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'TEMPORARILY_UNAVAILABLE', expectedVersion: profile.version });
    await assert.rejects(changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'READY', expectedVersion: profile.version }), code('CONFLICT'));
    await assert.rejects(changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'COORDINATING', expectedVersion: paused.version }), code('CONFLICT'));
    await assert.rejects(changeProfileState(db, ctx.second.actor, { profileId: profile.id, to: 'READY', expectedVersion: paused.version }), code('NOT_FOUND'));
    // The last face picture of an active profile cannot be removed.
    const faces = await db.select().from(matingProfileMedia).where(and(eq(matingProfileMedia.profileId, profile.id), eq(matingProfileMedia.role, 'FACE')));
    await assert.rejects(removeProfileMedia(db, ctx.first.actor, { mediaId: faces[0]!.id }), code('CONFLICT'));

    // A paused profile still holds its slot; turning it off frees it.
    await changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'INACTIVE', expectedVersion: paused.version });

    // Two activations racing for one slot: exactly one wins.
    await makeEligible(ctx, ctx.first.actor, c.animalId, 'c');
    const raced = await Promise.allSettled([
      activateProfile(db, ctx.first.actor, { animalId: b.animalId }),
      activateProfile(db, ctx.first.actor, { animalId: c.animalId }),
    ]);
    assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(raced.filter((r) => r.status === 'rejected').every((r) => code('CONFLICT')((r as PromiseRejectedResult).reason)));

    // Declaring the animal sterilized takes it off the finder, and it cannot come back.
    const winner = raced[0]!.status === 'fulfilled' ? b.animalId : c.animalId;
    await declareFertility(db, ctx.first.actor, { animalId: winner, status: 'STERILIZED', noteFa: null });
    const after = await ownerFinderAnimal(db, ctx.first.actor, winner);
    assert.equal(after.profile?.state, 'INACTIVE');
    assert.ok(after.eligibility.problems.some((p) => p.code === 'STERILIZED'));

    // Missing takes it off; found does not put it back; death is final.
    await activateProfile(db, ctx.first.actor, { animalId: a.animalId });
    await recordAnimalLifeEvent(db, ctx.first.actor, { animalId: a.animalId, kind: 'MISSING', occurredOn: '2026-01-01', reasonFa: 'SYNTHETIC گم شد' });
    assert.equal((await ownerFinderAnimal(db, ctx.first.actor, a.animalId)).profile?.state, 'INACTIVE');
    await recordAnimalLifeEvent(db, ctx.first.actor, { animalId: a.animalId, kind: 'FOUND', occurredOn: '2026-01-05', reasonFa: 'SYNTHETIC پیدا شد' });
    const found = await ownerFinderAnimal(db, ctx.first.actor, a.animalId);
    assert.equal(found.profile?.state, 'INACTIVE', 'the owner opts in again');
    assert.equal(found.profile?.deactivationReason, 'LIFE_EVENT');
    await recordAnimalLifeEvent(db, ctx.first.actor, { animalId: a.animalId, kind: 'DECEASED', occurredOn: '2026-02-01', reasonFa: 'SYNTHETIC' });
    await assert.rejects(
      recordAnimalLifeEvent(db, ctx.first.actor, { animalId: a.animalId, kind: 'RESTORED', occurredOn: '2026-02-02', reasonFa: 'x' }),
      code('CONFLICT'),
    );
    await assert.rejects(activateProfile(db, ctx.first.actor, { animalId: a.animalId }), code('VALIDATION'));
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, 'MATING_PROFILE_DEACTIVATED'));
    assert.ok(audits.length >= 3);
  });
});

test('visibility is decided per viewer in the query, pictures leave only as renditions, and a transfer takes the profile down', async () => {
  await withMatingCtx({ mobilePrefix: '099942000', tmpPrefix: 'hamzist-fp2-', councilCode: 'SYNTH-FP-2', chipBase: 6_420_000 }, async (ctx) => {
    const db = ctx.testDb.db;
    await setting(ctx, 'finder.capacity.free_owner', 1);
    const a = await animalWithSheet(ctx, 'سگ عمومی', { skipSheet: true });
    const { body } = await makeEligible(ctx, ctx.first.actor, a.animalId, 'p');
    const video = await addProfileMedia(db, ctx.root, ctx.first.actor, { animalId: a.animalId, kind: 'VIDEO', role: 'OTHER', bytes: MP4, originalName: 'v.mp4', altFa: 'ویدئو' });
    await assert.rejects(
      addProfileMedia(db, ctx.root, ctx.first.actor, { animalId: a.animalId, kind: 'VIDEO', role: 'OTHER', bytes: MP4, originalName: 'v2.mp4', altFa: 'دوم' }),
      code('CONFLICT'),
      'one short clip per profile',
    );
    const profile = await activateProfile(db, ctx.first.actor, { animalId: a.animalId });
    const [bodyRow] = await db.select().from(matingProfileMedia).where(eq(matingProfileMedia.id, body.id));

    // A free owner's profile: invisible to a visitor, to a free user, and to a subscriber while the pool is closed.
    assert.equal(await publicProfile(db, null, profile.id), null);
    assert.equal(await publicProfile(db, ctx.second.accountId, profile.id), null);
    assert.equal(await publicFinderMedia(db, ctx.root, bodyRow!.renditionFileId!, null), null);
    await subscribe(ctx, ctx.second.actor);
    assert.equal(await publicProfile(db, ctx.second.accountId, profile.id), null, 'free pool switch closed');
    await setting(ctx, 'finder.flag.free_pool_visibility', true);
    const seen = await publicProfile(db, ctx.second.accountId, profile.id);
    assert.ok(seen, 'a subscriber sees an opted-in free owner');
    assert.equal(seen.lastMatingFa, NO_CONFIRMED_MATING_FA);
    const [chip] = await db.select({ number: microchips.number }).from(microchips).where(eq(microchips.animalId, a.animalId));
    assert.ok(chip);
    assert.equal(JSON.stringify(seen).includes(chip.number), false, 'no microchip number anywhere on the card');

    // The owner subscribes: now public to everyone.
    await subscribe(ctx, ctx.first.actor);
    assert.ok(await publicProfile(db, null, profile.id));
    const served = await publicFinderMedia(db, ctx.root, bodyRow!.renditionFileId!, null);
    assert.ok(served);
    assert.ok(!served.bytes.toString('latin1').includes('GPS'), 'the served picture carries no metadata');
    assert.equal(await publicFinderMedia(db, ctx.root, bodyRow!.fileId, null), null, 'the original is never served');
    assert.equal(await publicFinderMedia(db, ctx.root, video.fileId, null), null, 'the clip is not public');

    // Reporting: only what the reporter can see, once, and never your own.
    await submitProfileReport(db, ctx.second.actor, { profileId: profile.id, mediaId: body.id, reason: 'OFFENSIVE', details: null });
    await assert.rejects(submitProfileReport(db, ctx.second.actor, { profileId: profile.id, mediaId: body.id, reason: 'OFFENSIVE', details: null }), code('CONFLICT'));
    await submitProfileReport(db, ctx.second.actor, { profileId: profile.id, mediaId: null, reason: 'INCORRECT_INFO', details: null });
    await assert.rejects(submitProfileReport(db, ctx.first.actor, { profileId: profile.id, mediaId: null, reason: 'OTHER', details: 'x' }), code('VALIDATION'));

    // Paused: gone from the public, pictures included.
    const paused = await changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'TEMPORARILY_UNAVAILABLE', expectedVersion: profile.version });
    assert.equal(await publicProfile(db, null, profile.id), null);
    assert.equal(await publicFinderMedia(db, ctx.root, bodyRow!.renditionFileId!, null), null);
    await assert.rejects(submitProfileReport(db, ctx.second.actor, { profileId: profile.id, mediaId: null, reason: 'SPAM', details: null }), code('NOT_FOUND'));
    await changeProfileState(db, ctx.first.actor, { profileId: profile.id, to: 'READY', expectedVersion: paused.version });

    // A transfer, as the handover does it: owner moves, profile goes INACTIVE in the same transaction.
    await db.transaction(async (tx) => {
      await tx.update(animals).set({ ownerAccountId: ctx.second.accountId }).where(eq(animals.id, a.animalId));
      await deactivateProfileOf(tx, a.animalId, 'TRANSFER', null);
    });
    assert.equal(await publicProfile(db, ctx.second.accountId, profile.id), null);
    const inherited = await ownerFinderAnimal(db, ctx.second.actor, a.animalId);
    assert.equal(inherited.profile, null, 'the previous owner’s profile is not the new owner’s until they opt in');
    await addProfileMedia(db, ctx.root, ctx.second.actor, { animalId: a.animalId, kind: 'IMAGE', role: 'FACE', bytes: photo('n'), originalName: 'n.jpg', altFa: 'صورت تازه' });
    const [taken] = await db.select().from(matingProfiles).where(eq(matingProfiles.animalId, a.animalId));
    assert.equal(taken!.id, profile.id, 'one profile per animal, history kept');
    assert.equal(taken!.ownerAccountId, ctx.second.accountId);
    const old = await db.select().from(matingProfileMedia).where(eq(matingProfileMedia.id, body.id));
    assert.equal(old[0]!.status, 'REMOVED', 'the previous owner’s pictures are not republished');
  });
});

test('the last mating moves only on a mutual confirmation, for both animals, and a rebuild gives the same answer', async () => {
  await withMatingCtx({ mobilePrefix: '099943000', tmpPrefix: 'hamzist-fp3-', councilCode: 'SYNTH-FP-3', chipBase: 6_430_000 }, async (ctx) => {
    const db = ctx.testDb.db;
    const { male, female } = await twoPedigreedAnimals(ctx);
    const permit = await issuedPermit(ctx, male, female);
    const ids = [male.animalId, female.animalId];
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

    assert.equal((await lastMatingsOf(db, ids)).size, 0);
    const proposed = await declareDate(db, ctx.first.actor, permit.id, { matedOn: day(10) });
    assert.equal((await lastMatingsOf(db, ids)).size, 0, 'a proposal counts for nothing');
    const answer = await declareDifferentDate(db, ctx.second.actor, permit.id, {
      declarationId: proposed.id,
      expectedVersion: proposed.version,
      matedOn: day(8),
    });
    assert.equal((await lastMatingsOf(db, ids)).size, 0, 'a conflict counts for nothing');
    await assert.rejects(confirmDate(db, ctx.first.actor, permit.id, { declarationId: proposed.id, expectedVersion: proposed.version }));
    assert.equal((await lastMatingsOf(db, ids)).size, 0);

    await confirmDate(db, ctx.first.actor, permit.id, { declarationId: answer.proposed.id, expectedVersion: answer.proposed.version });
    const both = await lastMatingsOf(db, ids);
    assert.equal(both.size, 2, 'both animals move in the same transaction');
    for (const id of ids) {
      assert.equal(both.get(id)?.lastMatedOn, day(8));
      assert.equal(both.get(id)?.confirmedCount, 1);
      assert.equal(both.get(id)?.source, 'OFFICIAL');
    }

    // Rebuild from nothing gives the same projection.
    const snapshot = await db.select().from(animalLastMatings);
    await db.delete(animalLastMatings);
    await rebuildLastMating(db);
    const rebuilt = await db.select().from(animalLastMatings);
    assert.deepEqual(
      rebuilt.map((r) => [r.animalId, r.lastMatedOn, r.sourceId, r.confirmedCount]).sort(),
      snapshot.map((r) => [r.animalId, r.lastMatedOn, r.sourceId, r.confirmedCount]).sort(),
    );

    // There is no command that sets it.
    assert.deepEqual(
      Object.keys(lastMatingModule).filter((name) => /^set|^update|^write/i.test(name)),
      [],
    );
  });
});
