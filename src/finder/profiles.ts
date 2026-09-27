/**
 * Mating profiles — PHASE-4 PROMPT-003.
 *
 * Activation, availability, media, the owner's fertility statement, lifecycle
 * reactions and the public read. Everything that decides eligibility,
 * visibility or capacity runs here on the server, inside transactions:
 *
 *  - activation takes the owner's account lock, re-reads every eligibility fact
 *    and counts the owner's active profiles under that lock, so two activations
 *    at the edge of the capacity end with one refusal;
 *  - a profile is public only while its state is listed, the activating owner
 *    is still the owner, the animal is registered and alive, and the access
 *    matrix lets this viewer see this owner; anything else answers NOT_FOUND;
 *  - only a picture's metadata-free rendition is ever served; the original and
 *    the clip stay private.
 */
import { and, asc, count, desc, eq, inArray, ne, or } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { referenceBreeds, storedFiles } from '../db/schema/core.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { residences } from '../db/schema/identity.ts';
import { matingPermits } from '../db/schema/mating.ts';
import { litters } from '../db/schema/breeding.ts';
import { moderationReports } from '../db/schema/moderation.ts';
import {
  animalFertilityDeclarations,
  animalLifeEvents,
  matingProfileMedia,
  matingProfiles,
} from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import fs from 'node:fs/promises';
import { putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { stripImageMetadata } from '../media/strip-metadata.ts';
import { readSetting } from '../settings/service.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import { isKycApproved } from '../identity/kyc.ts';
import { kennelOfOwner } from '../kennels/service.ts';
import { requireOwnedAnimal } from '../animals/service.ts';
import { speciesEnabled } from '../marketplace/species.ts';
import { reportInputProblems } from '../moderation/model.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { todayCivil } from '../domain/calendar.ts';
import type { Actor } from '../authz/actor.ts';
import { assertCapacityAvailable, lockAccount, mayViewProfile } from './subscriptions.ts';
import { assertFinderAccess, blockedBetween } from './sanctions.ts';
import type { FinderReportCategory } from './reports-model.ts';
import { activeRule } from './rules.ts';
import { lastMatingsOf } from './last-mating.ts';
import { finderFlagEnabled } from './flags.ts';
import { FINDER_SETTING_KEYS } from './model.ts';
import { noticeMatches } from './discovery.ts';
import { closeRequestsForAnimal } from './requests.ts';
import {
  ageFa,
  ageInMonths,
  ageRequestProblem,
  completeness,
  cooldownState,
  DEACTIVATION_FA,
  eligibilityProblems,
  holdsCapacity,
  lastMatingFa,
  lifeStatus,
  ownerMayMove,
  PROFILE_STATE_FA,
  publiclyListed,
  type CooldownState,
  type EligibilityProblem,
  type LifeEventKind,
  type LifeStatus,
  type ProfileState,
} from './profile-model.ts';

export const PROFILES_ROUTE = '/account/mating-finder/profiles';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پروفایل در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.';

type AnimalRow = typeof animals.$inferSelect;
export type ProfileRow = typeof matingProfiles.$inferSelect;
export type MediaRow = typeof matingProfileMedia.$inferSelect;

// ── facts ────────────────────────────────────────────────────────────────────

export async function lifeStatusOf(database: DbClient, animalId: string): Promise<LifeStatus> {
  const rows = await database
    .select({ kind: animalLifeEvents.kind })
    .from(animalLifeEvents)
    .where(eq(animalLifeEvents.animalId, animalId))
    .orderBy(asc(animalLifeEvents.createdAt), asc(animalLifeEvents.id));
  return lifeStatus(rows.map((r) => r.kind as LifeEventKind));
}

export async function fertilityOf(database: DbClient, animalId: string) {
  const [row] = await database
    .select()
    .from(animalFertilityDeclarations)
    .where(eq(animalFertilityDeclarations.animalId, animalId))
    .orderBy(desc(animalFertilityDeclarations.declaredAt), desc(animalFertilityDeclarations.id))
    .limit(1);
  return row ?? null;
}

async function activeMedia(database: DbClient, profileId: string): Promise<MediaRow[]> {
  return database
    .select()
    .from(matingProfileMedia)
    .where(and(eq(matingProfileMedia.profileId, profileId), eq(matingProfileMedia.status, 'ACTIVE')))
    .orderBy(asc(matingProfileMedia.sortOrder), asc(matingProfileMedia.createdAt));
}

async function profileOfAnimal(database: DbClient, animalId: string): Promise<ProfileRow | null> {
  const [row] = await database.select().from(matingProfiles).where(eq(matingProfiles.animalId, animalId)).limit(1);
  return row ?? null;
}

export interface Eligibility {
  readonly problems: readonly EligibilityProblem[];
  readonly lifeStatus: LifeStatus;
  readonly fertility: 'NOT_STERILIZED' | 'STERILIZED' | null;
}

/** Every eligibility fact read from its authoritative source, for this actor and animal. */
export async function eligibilityOf(
  database: DbClient,
  actor: Actor,
  animal: AnimalRow,
  media: readonly MediaRow[],
): Promise<Eligibility> {
  const [kyc, open, life, chip, fertility] = await Promise.all([
    isKycApproved(database, animal.ownerAccountId),
    speciesEnabled(database, 'MATING', animal.species),
    lifeStatusOf(database, animal.id),
    database.select({ id: microchips.id }).from(microchips).where(eq(microchips.animalId, animal.id)).limit(1),
    fertilityOf(database, animal.id),
  ]);
  const images = media.filter((m) => m.kind === 'IMAGE');
  const facts = {
    actorIsOwner: animal.ownerAccountId === actor.accountId,
    ownerKycApproved: kyc,
    animalStatus: animal.status,
    speciesOpen: open,
    lifeStatus: life,
    hasOfficialChip: chip.length > 0,
    hasBreed: animal.breedId !== null,
    hasSex: animal.sex !== null,
    hasBirthDate: animal.birthDate !== null,
    fertility: fertility?.status ?? null,
    hasFullBodyImage: images.some((m) => m.role === 'FULL_BODY'),
    hasFaceImage: images.some((m) => m.role === 'FACE'),
  };
  return { problems: eligibilityProblems(facts), lifeStatus: life, fertility: facts.fertility };
}

// ── deactivation, from every direction ────────────────────────────────────────

/**
 * Take an animal's profile off the finder with a reason, inside the caller's
 * transaction. Used by the owner, a transfer, a lifecycle event, a protected
 * identity change and (PROMPT-007) moderation. Nothing is deleted; the owner
 * opts in again. Requests the profile is part of are suspended by PROMPT-005
 * through this same entry point.
 */
export async function deactivateProfileOf(
  tx: DbClient,
  animalId: string,
  reason: 'OWNER' | 'TRANSFER' | 'LIFE_EVENT' | 'IDENTITY_CHANGE' | 'MODERATION' | 'SUBSCRIPTION_ENDED' | 'SUSPENSION',
  actor: Actor | null,
  noteFa: string | null = null,
  now: Date = new Date(),
): Promise<boolean> {
  const [profile] = await tx
    .select()
    .from(matingProfiles)
    .where(and(eq(matingProfiles.animalId, animalId), ne(matingProfiles.state, 'INACTIVE')))
    .for('update')
    .limit(1);
  if (!profile) return false;
  await tx
    .update(matingProfiles)
    .set({
      state: 'INACTIVE',
      deactivationReason: reason,
      deactivationNoteFa: noteFa,
      deactivatedAt: now,
      version: profile.version + 1,
      updatedAt: now,
    })
    .where(eq(matingProfiles.id, profile.id));
  await recordAudit(tx, actor, {
    action: 'MATING_PROFILE_DEACTIVATED',
    targetType: 'MATING_PROFILE',
    targetId: profile.id,
    targetVersion: profile.version + 1,
    before: { state: profile.state },
    after: { state: 'INACTIVE', reason },
    reason: noteFa,
  });
  // Open requests of this animal close with the reason and the other side is told;
  // a confirmed contract and every history row stay (PROMPT-005, PRODUCT_DECISIONS §11).
  await closeRequestsForAnimal(tx, animalId, DEACTIVATION_FA[reason] ?? 'پروفایل از جفت‌یابی خارج شد.', now);
  if (reason !== 'OWNER' && (await finderFlagEnabled(tx, 'finder.flag.notifications'))) {
    await createNotification(tx, {
      recipientAccountId: profile.ownerAccountId,
      kind: 'MATING_PROFILE_DEACTIVATED',
      titleFa: 'پروفایل جفت‌یابی غیرفعال شد',
      bodyFa: DEACTIVATION_FA[reason] ?? 'پروفایل از جفت‌یابی خارج شد.',
      resume: { entity: { type: 'ANIMAL', id: animalId }, step: 'MATING_PROFILE', originRoute: PROFILES_ROUTE + '/' + animalId },
    });
  }
  return true;
}

// ── owner commands ───────────────────────────────────────────────────────────

async function ensureProfile(tx: DbClient, actor: Actor, animal: AnimalRow, now: Date): Promise<ProfileRow> {
  const existing = await profileOfAnimal(tx, animal.id);
  if (existing) {
    if (existing.ownerAccountId === animal.ownerAccountId) return existing;
    // A new owner takes over an old, inactive profile; the history stays.
    if (existing.state !== 'INACTIVE') throw conflict(STALE);
    const [taken] = await tx
      .update(matingProfiles)
      .set({ ownerAccountId: animal.ownerAccountId, preferencesFa: null, version: existing.version + 1, updatedAt: now })
      .where(and(eq(matingProfiles.id, existing.id), eq(matingProfiles.version, existing.version)))
      .returning();
    if (!taken) throw conflict(STALE);
    // The previous owner's pictures are not the new owner's to publish.
    await tx
      .update(matingProfileMedia)
      .set({ status: 'REMOVED', statusReasonFa: 'مالکیت حیوان منتقل شد', updatedAt: now })
      .where(and(eq(matingProfileMedia.profileId, existing.id), eq(matingProfileMedia.status, 'ACTIVE')));
    await tx.update(matingProfiles).set({ primaryMediaId: null }).where(eq(matingProfiles.id, existing.id));
    return { ...taken, primaryMediaId: null };
  }
  const [created] = await tx
    .insert(matingProfiles)
    .values({ animalId: animal.id, ownerAccountId: actor.accountId, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: matingProfiles.animalId })
    .returning();
  return created ?? (await profileOfAnimal(tx, animal.id))!;
}

/** The owner's statement, append-only. Declaring STERILIZED takes the profile off the finder. */
export async function declareFertility(
  database: Database,
  actor: Actor,
  input: { animalId: string; status: string; noteFa: string | null },
): Promise<void> {
  if (input.status !== 'NOT_STERILIZED' && input.status !== 'STERILIZED') throw validation('وضعیت را انتخاب کنید.');
  const status = input.status;
  const animal = await requireOwnedAnimal(database, actor, input.animalId);
  await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(animalFertilityDeclarations)
      .values({ animalId: animal.id, status, declaredByAccountId: actor.accountId, noteFa: input.noteFa?.trim() || null })
      .returning();
    await recordAudit(tx, actor, {
      action: 'ANIMAL_FERTILITY_DECLARED',
      targetType: 'ANIMAL',
      targetId: animal.id,
      after: { status, declarationId: row!.id, kind: 'OWNER_DECLARATION_NOT_VETERINARY' },
    });
    if (status === 'STERILIZED') await deactivateProfileOf(tx, animal.id, 'OWNER', actor, 'اظهار عقیم‌بودن');
  });
}

export interface AddMediaInput {
  readonly animalId: string;
  readonly kind: 'IMAGE' | 'VIDEO';
  readonly role: 'FULL_BODY' | 'FACE' | 'OTHER';
  readonly bytes: Uint8Array;
  readonly originalName: string;
  readonly altFa: string;
}

export async function addProfileMedia(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: AddMediaInput,
  now: Date = new Date(),
): Promise<MediaRow> {
  const altFa = input.altFa.trim();
  if (altFa === '') throw validation('متن جایگزین را بنویسید؛ برای کسی که تصویر را نمی‌بیند لازم است.');
  if (input.kind === 'VIDEO' && input.role !== 'OTHER') throw validation('ویدئو نقش تصویر تمام‌بدن یا صورت را ندارد.');
  const animal = await requireOwnedAnimal(database, actor, input.animalId);
  const [maxImages, maxVideoMb] = await Promise.all([
    readSetting(database, FINDER_SETTING_KEYS.mediaMaxImages),
    readSetting(database, FINDER_SETTING_KEYS.mediaMaxVideoMb),
  ]);
  if (input.kind === 'VIDEO' && maxVideoMb.value !== null && input.bytes.length > Number(maxVideoMb.value) * 1024 * 1024) {
    throw validation('حجم ویدئو بیشتر از ' + Number(maxVideoMb.value).toLocaleString('fa-IR') + ' مگابایت است.');
  }
  // Refuse before writing anything if the picture cannot be cleaned.
  const rendition = input.kind === 'IMAGE' ? stripImageMetadata(input.bytes) : null;

  return database.transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    const profile = await ensureProfile(tx, actor, animal, now);
    const current = await activeMedia(tx, profile.id);
    if (input.kind === 'IMAGE' && maxImages.value !== null && current.filter((m) => m.kind === 'IMAGE').length >= Number(maxImages.value)) {
      throw conflict('سقف تصویرهای این پروفایل پر است؛ پیش از افزودن، یکی را حذف کنید.');
    }
    if (input.kind === 'VIDEO' && current.some((m) => m.kind === 'VIDEO')) {
      throw conflict('هر پروفایل فقط یک ویدئوی کوتاه دارد؛ ویدئوی فعلی را اول حذف کنید.');
    }
    const original = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: input.kind === 'IMAGE' ? 'MATING_PROFILE_IMAGE' : 'MATING_PROFILE_VIDEO',
      bytes: input.bytes,
      originalName: input.originalName,
    });
    const clean = rendition
      ? await putPrivateFile(tx, storageRoot, actor, {
          ownerAccountId: actor.accountId,
          purpose: 'MATING_PROFILE_RENDITION',
          bytes: rendition,
          originalName: 'rendition',
        })
      : null;
    const [media] = await tx
      .insert(matingProfileMedia)
      .values({
        profileId: profile.id,
        kind: input.kind,
        role: input.role,
        fileId: original.id,
        renditionFileId: clean?.id ?? null,
        altFa,
        sortOrder: current.length,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (input.kind === 'IMAGE' && profile.primaryMediaId === null) {
      await tx.update(matingProfiles).set({ primaryMediaId: media!.id, updatedAt: now }).where(eq(matingProfiles.id, profile.id));
    }
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_MEDIA_ADDED',
      targetType: 'MATING_PROFILE',
      targetId: profile.id,
      after: { mediaId: media!.id, kind: input.kind, role: input.role, metadataStripped: rendition !== null },
    });
    return media!;
  });
}

async function ownedMedia(tx: DbClient, actor: Actor, mediaId: string) {
  if (!UUID.test(mediaId)) throw notFound('این رسانه پیدا نشد.');
  const [row] = await tx
    .select({ media: matingProfileMedia, profile: matingProfiles, ownerAccountId: animals.ownerAccountId })
    .from(matingProfileMedia)
    .innerJoin(matingProfiles, eq(matingProfiles.id, matingProfileMedia.profileId))
    .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
    .where(eq(matingProfileMedia.id, mediaId))
    .limit(1);
  // Somebody else's media and missing media give the same answer.
  if (!row || row.ownerAccountId !== actor.accountId || row.media.status !== 'ACTIVE') throw notFound('این رسانه پیدا نشد.');
  return row;
}

/**
 * Remove a picture or the clip. While the profile is on the finder, the last
 * full-body or face picture cannot be removed: that would leave a public
 * profile that no longer meets the entry conditions.
 */
export async function removeProfileMedia(database: Database, actor: Actor, input: { mediaId: string }, now: Date = new Date()): Promise<void> {
  await database.transaction(async (tx) => {
    const { media, profile } = await ownedMedia(tx, actor, input.mediaId);
    if (holdsCapacity(profile.state as ProfileState) && media.kind === 'IMAGE' && media.role !== 'OTHER') {
      const same = (await activeMedia(tx, profile.id)).filter((m) => m.kind === 'IMAGE' && m.role === media.role);
      if (same.length <= 1) {
        throw conflict('این تنها تصویر ' + (media.role === 'FACE' ? 'صورت' : 'تمام‌بدن') + ' پروفایل فعال است؛ اول تصویر دیگری اضافه کنید یا پروفایل را غیرفعال کنید.');
      }
    }
    await tx
      .update(matingProfileMedia)
      .set({ status: 'REMOVED', statusReasonFa: 'حذف توسط مالک', updatedAt: now })
      .where(eq(matingProfileMedia.id, media.id));
    if (profile.primaryMediaId === media.id) {
      const next = (await activeMedia(tx, profile.id)).find((m) => m.kind === 'IMAGE');
      await tx.update(matingProfiles).set({ primaryMediaId: next?.id ?? null, updatedAt: now }).where(eq(matingProfiles.id, profile.id));
    }
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_MEDIA_REMOVED',
      targetType: 'MATING_PROFILE',
      targetId: profile.id,
      after: { mediaId: media.id },
    });
  });
}

export async function setPrimaryMedia(database: Database, actor: Actor, input: { mediaId: string }): Promise<void> {
  await database.transaction(async (tx) => {
    const { media, profile } = await ownedMedia(tx, actor, input.mediaId);
    if (media.kind !== 'IMAGE') throw validation('تصویر اصلی باید عکس باشد.');
    await tx.update(matingProfiles).set({ primaryMediaId: media.id, updatedAt: new Date() }).where(eq(matingProfiles.id, profile.id));
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_PRIMARY_MEDIA_SET',
      targetType: 'MATING_PROFILE',
      targetId: profile.id,
      after: { mediaId: media.id },
    });
  });
}

/**
 * Put an animal on the finder. Every condition is read again under the owner's
 * account lock, and the owner's active profiles are counted under the same
 * lock, so capacity cannot be exceeded by two tabs at once.
 */
export async function activateProfile(database: Database, actor: Actor, input: { animalId: string }, now: Date = new Date()): Promise<ProfileRow> {
  await requireOwnedAnimal(database, actor, input.animalId);
  await assertFinderAccess(database, actor.accountId, now);
  return database.transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    const [animal] = await tx.select().from(animals).where(eq(animals.id, input.animalId)).for('update').limit(1);
    if (!animal || animal.ownerAccountId !== actor.accountId) throw notFound('پرونده حیوان پیدا نشد.');
    const profile = await ensureProfile(tx, actor, animal, now);
    if (profile.state !== 'INACTIVE') throw conflict('این پروفایل همین حالا در جفت‌یابی فعال است.');
    const eligibility = await eligibilityOf(tx, actor, animal, await activeMedia(tx, profile.id));
    if (eligibility.problems.length > 0) {
      throw validation(eligibility.problems.map((p) => p.fa).join(' '), { problems: eligibility.problems.map((p) => p.code) });
    }
    const [counted] = await tx
      .select({ n: count() })
      .from(matingProfiles)
      .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
      .where(
        and(
          eq(matingProfiles.ownerAccountId, actor.accountId),
          eq(animals.ownerAccountId, actor.accountId),
          ne(matingProfiles.state, 'INACTIVE'),
        ),
      );
    const capacity = await assertCapacityAvailable(tx, actor.accountId, Number(counted?.n ?? 0), now);
    const [row] = await tx
      .update(matingProfiles)
      .set({ state: 'READY', deactivationReason: null, deactivationNoteFa: null, activatedAt: now, version: profile.version + 1, updatedAt: now })
      .where(and(eq(matingProfiles.id, profile.id), eq(matingProfiles.version, profile.version), eq(matingProfiles.state, 'INACTIVE')))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_ACTIVATED',
      targetType: 'MATING_PROFILE',
      targetId: row.id,
      targetVersion: row.version,
      after: { animalId: animal.id, state: 'READY', capacityLimit: capacity.limit, capacitySource: capacity.source },
    });
    // Saved searches this profile now matches get their one notice each (PROMPT-004).
    await noticeMatches(tx, row.id, now);
    return row;
  });
}

/** The owner's own availability moves; activation and the request-driven states are elsewhere. */
export async function changeProfileState(
  database: Database,
  actor: Actor,
  input: { profileId: string; to: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<ProfileRow> {
  if (!UUID.test(input.profileId)) throw notFound('این پروفایل پیدا نشد.');
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({ profile: matingProfiles, ownerAccountId: animals.ownerAccountId })
      .from(matingProfiles)
      .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
      .where(eq(matingProfiles.id, input.profileId))
      .for('update', { of: matingProfiles })
      .limit(1);
    if (!row || row.ownerAccountId !== actor.accountId || row.profile.ownerAccountId !== actor.accountId) {
      throw notFound('این پروفایل پیدا نشد.');
    }
    const profile = row.profile;
    if (profile.version !== input.expectedVersion) throw conflict(STALE);
    const from = profile.state as ProfileState;
    const to = input.to as ProfileState;
    if (!ownerMayMove(from, to)) {
      throw conflict('از وضعیت «' + PROFILE_STATE_FA[from] + '» نمی‌توان به «' + (PROFILE_STATE_FA[to] ?? input.to) + '» رفت.');
    }
    if (to === 'INACTIVE') {
      await deactivateProfileOf(tx, profile.animalId, 'OWNER', actor, null, now);
      return (await profileOfAnimal(tx, profile.animalId))!;
    }
    const [updated] = await tx
      .update(matingProfiles)
      .set({ state: to, version: profile.version + 1, updatedAt: now })
      .where(and(eq(matingProfiles.id, profile.id), eq(matingProfiles.version, profile.version)))
      .returning();
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_STATE_CHANGED',
      targetType: 'MATING_PROFILE',
      targetId: profile.id,
      targetVersion: updated!.version,
      before: { state: from },
      after: { state: to },
    });
    if (publiclyListed(to) && !publiclyListed(from)) await noticeMatches(tx, profile.id, now);
    return updated!;
  });
}

export async function updatePreferences(
  database: Database,
  actor: Actor,
  input: { animalId: string; preferencesFa: string },
): Promise<void> {
  const animal = await requireOwnedAnimal(database, actor, input.animalId);
  const text = input.preferencesFa.trim();
  if (text.length > 1000) throw validation('ترجیحات حداکثر ۱۰۰۰ نویسه است.');
  await database.transaction(async (tx) => {
    const profile = await ensureProfile(tx, actor, animal, new Date());
    await tx.update(matingProfiles).set({ preferencesFa: text || null, updatedAt: new Date() }).where(eq(matingProfiles.id, profile.id));
  });
}

// ── reads ────────────────────────────────────────────────────────────────────

export interface ProfileCard {
  readonly profileId: string;
  readonly animalId: string;
  readonly nameFa: string;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly breedFa: string | null;
  readonly ageMonths: number | null;
  readonly ageFa: string | null;
  readonly provinceFa: string | null;
  readonly cityFa: string | null;
  readonly hasPedigree: boolean;
  readonly completeness: { readonly score: number; readonly total: number };
  readonly lastMatedOn: string | null;
  readonly lastMatingFa: string;
  readonly cooldown: CooldownState;
  readonly ageRequestProblemFa: string | null;
  readonly ruleVersion: number | null;
  readonly confirmedMatings: number;
  readonly births: number;
  readonly registeredOffspring: number;
  readonly ownerKind: 'OWNER' | 'KENNEL';
  readonly kennelNameFa: string | null;
  readonly state: ProfileState;
  readonly stateFa: string;
  readonly preferencesFa: string | null;
  readonly primary: { readonly fileId: string; readonly altFa: string } | null;
  readonly images: ReadonlyArray<{ readonly mediaId: string; readonly fileId: string; readonly altFa: string; readonly role: string }>;
}

/** Public statistics only: counts, never who the previous partners were (PRODUCT_DECISIONS §5). */
async function statsOf(database: DbClient, animalId: string) {
  const [births] = await database
    .select({ n: count() })
    .from(litters)
    .innerJoin(matingPermits, eq(matingPermits.id, litters.permitId))
    .where(or(eq(matingPermits.sireAnimalId, animalId), eq(matingPermits.damAnimalId, animalId)));
  const [offspring] = await database
    .select({ n: count() })
    .from(animals)
    .where(and(eq(animals.status, 'REGISTERED'), or(eq(animals.sireAnimalId, animalId), eq(animals.damAnimalId, animalId))));
  return { births: Number(births?.n ?? 0), offspring: Number(offspring?.n ?? 0) };
}

export async function buildCard(database: DbClient, profile: ProfileRow, animal: AnimalRow, now: Date): Promise<ProfileCard> {
  const today = todayCivil(now);
  const [media, breed, pedigree, residence, kennel, last, stats] = await Promise.all([
    activeMedia(database, profile.id),
    animal.breedId
      ? database.select({ nameFa: referenceBreeds.nameFa }).from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId)).limit(1)
      : Promise.resolve([]),
    database.select({ id: pedigrees.id }).from(pedigrees).where(eq(pedigrees.animalId, animal.id)).limit(1),
    database.select({ province: residences.province, city: residences.city }).from(residences).where(eq(residences.accountId, animal.ownerAccountId)).limit(1),
    kennelOfOwner(database, animal.ownerAccountId),
    lastMatingsOf(database, [animal.id]),
    statsOf(database, animal.id),
  ]);
  const rule = animal.sex ? await activeRule(database, animal.species, animal.breedId, animal.sex) : null;
  const ageMonths = animal.birthDate ? ageInMonths(animal.birthDate, today) : null;
  const lastMatedOn = last.get(animal.id)?.lastMatedOn ?? null;
  const images = media.filter((m) => m.kind === 'IMAGE' && m.renditionFileId !== null);
  const primaryMedia = images.find((m) => m.id === profile.primaryMediaId) ?? images[0] ?? null;
  const approvedKennel = kennel?.status === 'APPROVED' ? kennel : null;
  return {
    profileId: profile.id,
    animalId: animal.id,
    nameFa: animal.name ?? 'بدون نام',
    sex: animal.sex,
    breedFa: breed[0]?.nameFa ?? null,
    ageMonths,
    ageFa: ageMonths === null ? null : ageFa(ageMonths),
    provinceFa: approvedKennel?.provinceFa ?? residence[0]?.province ?? null,
    cityFa: approvedKennel?.cityFa ?? residence[0]?.city ?? null,
    hasPedigree: pedigree.length > 0,
    completeness: completeness({
      hasPedigree: pedigree.length > 0,
      identityVerifiedByVet: animal.identityVerifiedAt !== null,
      imageCount: images.length,
      hasVideo: media.some((m) => m.kind === 'VIDEO'),
      hasPreferences: (profile.preferencesFa ?? '') !== '',
    }),
    lastMatedOn,
    lastMatingFa: lastMatingFa(lastMatedOn, today),
    cooldown: cooldownState(rule, lastMatedOn, today),
    ageRequestProblemFa: ageMonths === null ? 'تاریخ تولد ثبت نشده است.' : ageRequestProblem(rule, ageMonths),
    ruleVersion: rule?.version ?? null,
    confirmedMatings: last.get(animal.id)?.confirmedCount ?? 0,
    births: stats.births,
    registeredOffspring: stats.offspring,
    ownerKind: approvedKennel ? 'KENNEL' : 'OWNER',
    kennelNameFa: approvedKennel?.nameFa ?? null,
    state: profile.state as ProfileState,
    stateFa: PROFILE_STATE_FA[profile.state as ProfileState],
    preferencesFa: profile.preferencesFa,
    primary: primaryMedia ? { fileId: primaryMedia.renditionFileId!, altFa: primaryMedia.altFa } : null,
    images: images.map((m) => ({ mediaId: m.id, fileId: m.renditionFileId!, altFa: m.altFa, role: m.role })),
  };
}

/**
 * Whether this profile is on the finder right now for this viewer. Every
 * condition is re-read, so a transfer, a death or an expired subscription takes
 * the profile down on the next request without waiting for anything.
 */
async function visibleTo(database: DbClient, viewerAccountId: string | null, profile: ProfileRow, animal: AnimalRow, now: Date): Promise<boolean> {
  if (!publiclyListed(profile.state as ProfileState)) return false;
  if (profile.ownerAccountId !== animal.ownerAccountId || animal.status !== 'REGISTERED') return false;
  const [life, open] = await Promise.all([lifeStatusOf(database, animal.id), speciesEnabled(database, 'MATING', animal.species)]);
  if (life !== 'ACTIVE' || !open) return false;
  // PROMPT-007: a block in either direction answers exactly like a hidden profile.
  if (viewerAccountId && viewerAccountId !== animal.ownerAccountId && (await blockedBetween(database, viewerAccountId, animal.ownerAccountId))) return false;
  return mayViewProfile(database, viewerAccountId, animal.ownerAccountId, now);
}

/** A public profile, or null — the same null for missing, hidden, paused and not-for-you. */
export async function publicProfile(database: DbClient, viewerAccountId: string | null, profileId: string, now: Date = new Date()): Promise<ProfileCard | null> {
  if (!UUID.test(profileId)) return null;
  const [row] = await database
    .select({ profile: matingProfiles, animal: animals })
    .from(matingProfiles)
    .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
    .where(eq(matingProfiles.id, profileId))
    .limit(1);
  if (!row || !(await visibleTo(database, viewerAccountId, row.profile, row.animal, now))) return null;
  return buildCard(database, row.profile, row.animal, now);
}

/**
 * The only way a finder picture leaves storage: its metadata-free rendition,
 * while its profile is visible to this viewer. The original and the clip are
 * never served here.
 */
export async function publicFinderMedia(
  database: DbClient,
  storageRoot: string,
  fileId: string,
  viewerAccountId: string | null,
): Promise<{ mime: string; bytes: Buffer; sha256: string } | null> {
  if (!UUID.test(fileId)) return null;
  const [row] = await database
    .select({ profile: matingProfiles, animal: animals, file: storedFiles })
    .from(matingProfileMedia)
    .innerJoin(matingProfiles, eq(matingProfiles.id, matingProfileMedia.profileId))
    .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
    .innerJoin(storedFiles, eq(storedFiles.id, matingProfileMedia.renditionFileId))
    .where(and(eq(matingProfileMedia.renditionFileId, fileId), eq(matingProfileMedia.status, 'ACTIVE'), eq(matingProfileMedia.kind, 'IMAGE')))
    .limit(1);
  if (!row || row.file.purpose !== 'MATING_PROFILE_RENDITION') return null;
  if (!(await visibleTo(database, viewerAccountId, row.profile, row.animal, new Date()))) return null;
  const bytes = await fs.readFile(resolveWithinRoot(storageRoot, row.file.storageKey)).catch(() => null);
  if (!bytes) return null;
  return { mime: row.file.mime, bytes, sha256: row.file.sha256 };
}

export interface OwnerAnimalEntry {
  readonly animal: AnimalRow;
  readonly profile: ProfileRow | null;
  readonly media: readonly MediaRow[];
  readonly eligibility: Eligibility;
  readonly card: ProfileCard | null;
}

/** The owner's registered animals of an open species, each with its profile and what still blocks it. */
export async function ownerFinderAnimals(database: DbClient, actor: Actor, now: Date = new Date()): Promise<readonly OwnerAnimalEntry[]> {
  const rows = await database
    .select()
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), inArray(animals.status, ['REGISTERED'])))
    .orderBy(asc(animals.createdAt));
  const out: OwnerAnimalEntry[] = [];
  for (const animal of rows) {
    if (!(await speciesEnabled(database, 'MATING', animal.species))) continue;
    out.push(await ownerAnimalEntry(database, actor, animal, now));
  }
  return out;
}

async function ownerAnimalEntry(database: DbClient, actor: Actor, animal: AnimalRow, now: Date): Promise<OwnerAnimalEntry> {
  const found = await profileOfAnimal(database, animal.id);
  // A profile left behind by a previous owner is not this owner's yet.
  const profile = found && found.ownerAccountId === actor.accountId ? found : null;
  const media = profile ? await activeMedia(database, profile.id) : [];
  const eligibility = await eligibilityOf(database, actor, animal, media);
  return { animal, profile, media, eligibility, card: profile ? await buildCard(database, profile, animal, now) : null };
}

export async function ownerFinderAnimal(database: DbClient, actor: Actor, animalId: string, now: Date = new Date()): Promise<OwnerAnimalEntry> {
  const animal = await requireOwnedAnimal(database, actor, animalId);
  return ownerAnimalEntry(database, actor, animal, now);
}

// ── reporting ────────────────────────────────────────────────────────────────

/**
 * Report a public profile or one of its pictures. Only something the reporter
 * can see is reportable, so this cannot reveal a hidden profile; a second open
 * report on the same thing is refused by the database. The queue and decisions
 * are PROMPT-007.
 */
export async function submitProfileReport(
  database: Database,
  actor: Actor,
  input: { profileId: string; mediaId: string | null; reason: string; details: string | null; finderCategory?: FinderReportCategory | null },
  within?: (tx: DbClient, reportId: string) => Promise<void>,
): Promise<{ id: string }> {
  const problems = reportInputProblems({ reason: input.reason, details: input.details });
  if (problems.length > 0) throw validation(problems[0]!);
  await assertWithinLimit(database, { action: 'REPORT_SUBMIT', actor });
  const card = await publicProfile(database, actor.accountId, input.profileId);
  if (!card) throw notFound('این پروفایل پیدا نشد.');
  const [owner] = await database.select({ ownerAccountId: animals.ownerAccountId }).from(animals).where(eq(animals.id, card.animalId)).limit(1);
  if (owner?.ownerAccountId === actor.accountId) throw validation('گزارش پروفایل خودتان ممکن نیست.');
  const mediaId = input.mediaId?.trim() || null;
  if (mediaId !== null && !card.images.some((image) => image.mediaId === mediaId)) throw notFound('این تصویر پیدا نشد.');
  const target = mediaId ? 'MATING_PROFILE_MEDIA' : 'MATING_PROFILE';
  return database.transaction(async (tx) => {
    let id: string;
    try {
      const [created] = await tx
        .insert(moderationReports)
        .values({
          targetKind: target as never,
          reporterAccountId: actor.accountId,
          reason: input.reason as never,
          details: input.details?.trim() || null,
          matingProfileId: mediaId ? null : card.profileId,
          matingProfileMediaId: mediaId,
          finderCategory: input.finderCategory ?? null,
        })
        .returning({ id: moderationReports.id });
      id = created!.id;
    } catch (error) {
      const text = String(error) + String((error as { cause?: unknown }).cause ?? '');
      if (text.includes('moderation_report_one_open_mating')) {
        throw conflict('گزارش باز شما درباره همین مورد ثبت شده است و در حال بررسی است.');
      }
      throw error;
    }
    await recordAudit(tx, actor, {
      action: 'MATING_PROFILE_REPORTED',
      targetType: target,
      targetId: mediaId ?? card.profileId,
      after: { reportId: id, reason: input.reason },
    });
    if (within) await within(tx, id);
    return { id };
  });
}
