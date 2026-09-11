/**
 * Public veterinary directory — Requirements-Phase-2 §7, §10, §19, §20, §23 (PROMPT-006, PROMPT-007).
 *
 * The directory is a view of the Phase 1 veterinarian: the same `vet_profile`
 * and `vet_location` rows, no second veterinarian table (P2-D15). What is
 * public is decided here, separately from the Finder: publishing a profile
 * never makes a veterinarian eligible for new work, and hiding one never takes
 * them out of it (DEC-0164).
 *
 * Who manages a profile (DEC-0166): the superadmin any profile; its owner —
 * the account it belongs to, in that account's own public context — its content,
 * locations and publication; the review operator publication only (moderation).
 * An unowned profile is a reviewed suggestion with a name and a city until a
 * claim is approved (PROMPT-007).
 */
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, accounts, species } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import {
  vetLocations,
  vetProfileSpecialties,
  vetProfileSpecies,
  vetProfiles,
  vetSpecialties,
} from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';
import {
  completeness,
  isVetPublicStatus,
  publicPhone,
  vetPublishBlockers,
  type CompletenessInput,
  type VetPublicStatus,
} from './directory-model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

type ProfileRow = typeof vetProfiles.$inferSelect;
type LocationRow = typeof vetLocations.$inferSelect;
export type LocationKind = LocationRow['kind'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^vet-[0-9a-f]{10}$/;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const LOCATION_KINDS: readonly LocationKind[] = ['CLINIC', 'HOSPITAL', 'CENTRE'];
const OWNER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];

type Manager = 'ADMIN' | 'REVIEW' | 'OWNER';

/** How the actor may manage a record owned by `ownerAccountId`, or null. */
function managerOf(actor: Actor, ownerAccountId: string | null): Manager | null {
  if (actor.context === 'SUPERADMIN') return 'ADMIN';
  if (actor.context === 'REVIEW_OPERATOR') return 'REVIEW';
  if (ownerAccountId !== null && ownerAccountId === actor.accountId && OWNER_CONTEXTS.includes(actor.context)) return 'OWNER';
  return null;
}

function assertManager(actor: Actor, ownerAccountId: string | null, allowed: readonly Manager[]): Manager {
  const manager = managerOf(actor, ownerAccountId);
  if (manager === null || !allowed.includes(manager)) {
    throw forbidden('این پروفایل را فقط صاحب آن یا سوپرادمین تغییر می‌دهد.');
  }
  return manager;
}

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') {
    throw forbidden('ویرایش پروفایل عمومی دامپزشک از این صفحه فقط در محیط سوپرادمین ممکن است.');
  }
}

const text = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

function bounded(value: string | null | undefined, max: number, labelFa: string): string | null {
  const out = text(value);
  if (out !== null && out.length > max) throw validation(labelFa + ' حداکثر ' + max.toLocaleString('fa-IR') + ' نویسه است.');
  return out;
}

/**
 * A change made to someone else's public page says why (§20, prompt rule on
 * sensitive changes). The owner editing their own page may add a note.
 */
function reasonFor(manager: Manager, reason: string | null | undefined): string | null {
  const out = bounded(reason, 500, 'دلیل');
  if (out === null && manager !== 'OWNER') throw validation('دلیل این تغییر را بنویسید.');
  return out;
}

/** A public address that is not the internal id and cannot be guessed from it (§20). */
export const newPublicSlug = (): string => 'vet-' + randomBytes(5).toString('hex');

// ── Reading a profile with everything the directory shows ──────────────────

export interface PlacedLocation extends LocationRow {
  readonly provinceNameFa: string | null;
  readonly cityNameFa: string | null;
}

export interface ProfileFacts {
  readonly profile: ProfileRow;
  readonly locations: readonly PlacedLocation[];
  readonly specialtyCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  /** Trusted Hamzist: the Phase 1 TRUSTED_VET role is active right now. */
  readonly trusted: boolean;
  /** The city an unowned profile was listed in, until locations exist. */
  readonly listed: { readonly provinceCode: string; readonly provinceNameFa: string; readonly cityNameFa: string } | null;
}

async function loadFacts(database: DbClient, profiles: readonly ProfileRow[]): Promise<ProfileFacts[]> {
  if (profiles.length === 0) return [];
  const accountIds = profiles.map((p) => p.accountId).filter((id): id is string => id !== null);
  const profileIds = profiles.map((p) => p.id);
  const [locationRows, specialtyRows, speciesRows, roleRows, provinceRows, cityRows] = await Promise.all([
    accountIds.length > 0 ? database.select().from(vetLocations).where(inArray(vetLocations.vetAccountId, accountIds)) : [],
    database.select().from(vetProfileSpecialties).where(inArray(vetProfileSpecialties.vetProfileId, profileIds)),
    database.select().from(vetProfileSpecies).where(inArray(vetProfileSpecies.vetProfileId, profileIds)),
    accountIds.length > 0
      ? database
          .select({ accountId: accountRoles.accountId })
          .from(accountRoles)
          .where(
            and(
              inArray(accountRoles.accountId, accountIds),
              eq(accountRoles.role, 'TRUSTED_VET'),
              eq(accountRoles.status, 'ACTIVE'),
            ),
          )
      : [],
    database.select().from(provinces),
    database.select().from(cities),
  ]);
  const provinceName = new Map(provinceRows.map((row) => [row.code, row.nameFa]));
  const cityById = new Map(cityRows.map((row) => [row.id, row]));
  const trusted = new Set(roleRows.map((row) => row.accountId));

  return profiles.map((profile) => {
    const listedCity = profile.listedCityId ? cityById.get(profile.listedCityId) : undefined;
    return {
      profile,
      locations: locationRows
        .filter((row) => row.vetAccountId === profile.accountId)
        .map((row) => ({
          ...row,
          provinceNameFa: row.provinceCode ? (provinceName.get(row.provinceCode) ?? null) : null,
          cityNameFa: row.cityId ? (cityById.get(row.cityId)?.nameFa ?? null) : null,
        }))
        .sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
      specialtyCodes: specialtyRows.filter((row) => row.vetProfileId === profile.id).map((row) => row.specialtyCode).sort(),
      speciesCodes: speciesRows.filter((row) => row.vetProfileId === profile.id).map((row) => row.speciesCode).sort(),
      trusted: profile.accountId !== null && trusted.has(profile.accountId),
      listed: listedCity
        ? {
            provinceCode: listedCity.provinceCode,
            provinceNameFa: provinceName.get(listedCity.provinceCode) ?? '',
            cityNameFa: listedCity.nameFa,
          }
        : null,
    };
  });
}

/** Locations a visitor sees: marked public and still active. An inactive one is history, not an address. */
export const publicLocationsOf = (facts: ProfileFacts): PlacedLocation[] =>
  facts.locations.filter((location) => location.isPublic && location.isActive);

export function completenessInputOf(facts: ProfileFacts): CompletenessInput {
  const { profile } = facts;
  return {
    headlineFa: profile.headlineFa,
    bioFa: profile.bioFa,
    experienceFa: profile.experienceFa,
    specialtyCount: facts.specialtyCodes.length,
    speciesCount: facts.speciesCodes.length,
    publicLocationsWithCity: publicLocationsOf(facts).filter((location) => location.cityId !== null).length,
    contactShown: publicPhone(profile.showPhone, profile.phone) !== null,
  };
}

const ownershipOf = (profile: ProfileRow) => ({ owned: profile.accountId !== null, hasListedCity: profile.listedCityId !== null });

// ── Reference data ───────────────────────────────────────────────────────

export async function directoryReferenceData(database: DbClient) {
  const [specialtyRows, speciesRows, provinceRows, cityRows] = await Promise.all([
    database.select().from(vetSpecialties).where(eq(vetSpecialties.isActive, true)).orderBy(asc(vetSpecialties.sortOrder)),
    database.select().from(species).orderBy(asc(species.sortOrder)),
    database.select().from(provinces).orderBy(asc(provinces.sortOrder)),
    database.select().from(cities).where(eq(cities.isActive, true)),
  ]);
  return {
    specialties: specialtyRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    species: speciesRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    provinces: provinceRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    cities: cityRows
      .map((row) => ({ id: row.id, provinceCode: row.provinceCode, nameFa: row.nameFa }))
      .sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
  };
}

// ── Editors ──────────────────────────────────────────────────────────────

async function editorData(database: DbClient, profile: ProfileRow) {
  const [facts] = await loadFacts(database, [profile]);
  const input = completenessInputOf(facts!);
  return {
    facts: facts!,
    completeness: completeness(input),
    blockers: vetPublishBlockers(input, ownershipOf(profile)),
    reference: await directoryReferenceData(database),
  };
}

export type DirectoryEditorData = Awaited<ReturnType<typeof editorData>>;

/** The superadmin's editor of an owned veterinarian, reached from the Phase 1 registry. */
export async function vetDirectoryEditor(database: DbClient, actor: Actor, accountId: string): Promise<DirectoryEditorData | null> {
  assertSuperadmin(actor);
  if (!UUID.test(accountId)) return null;
  const [profile] = await database.select().from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  return profile ? editorData(database, profile) : null;
}

/** The signed-in veterinarian's own profile, or null when the account owns none (P2-D07). */
export async function ownVetDirectory(database: DbClient, actor: Actor): Promise<DirectoryEditorData | null> {
  if (!OWNER_CONTEXTS.includes(actor.context)) return null;
  const [profile] = await database.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1);
  return profile ? editorData(database, profile) : null;
}

async function profileById(tx: DbClient, profileId: string): Promise<ProfileRow> {
  const [row] = UUID.test(profileId) ? await tx.select().from(vetProfiles).where(eq(vetProfiles.id, profileId)).limit(1) : [];
  if (!row) throw notFound('پرونده دامپزشک پیدا نشد.');
  return row;
}

export interface VetPublicProfileInput {
  readonly profileId: string;
  readonly expectedVersion: number;
  readonly headlineFa: string | null;
  readonly bioFa: string | null;
  readonly experienceFa: string | null;
  readonly showPhone: boolean;
  readonly showCouncilCode: boolean;
  readonly specialtyCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly reason?: string | null;
}

/** Saves what the public page says. Only changed fields reach the audit history, each with its previous value. */
export async function updateVetPublicProfile(
  database: Database,
  actor: Actor,
  input: VetPublicProfileInput,
): Promise<ProfileRow> {
  const next = {
    headlineFa: bounded(input.headlineFa, 120, 'عنوان حرفه‌ای'),
    bioFa: bounded(input.bioFa, 4000, 'معرفی'),
    experienceFa: bounded(input.experienceFa, 4000, 'سوابق'),
    showPhone: input.showPhone === true,
    showCouncilCode: input.showCouncilCode === true,
    specialtyCodes: [...new Set(input.specialtyCodes)].sort(),
    speciesCodes: [...new Set(input.speciesCodes)].sort(),
  };

  return database.transaction(async (tx) => {
    const current = await profileById(tx, input.profileId);
    const manager = assertManager(actor, current.accountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    if (next.specialtyCodes.length > 0) {
      const known = await tx
        .select({ code: vetSpecialties.code })
        .from(vetSpecialties)
        .where(and(inArray(vetSpecialties.code, next.specialtyCodes), eq(vetSpecialties.isActive, true)));
      if (known.length !== next.specialtyCodes.length) throw validation('تخصص انتخاب‌شده در فهرست تخصص‌ها نیست.');
    }
    if (next.speciesCodes.length > 0) {
      const known = await tx.select({ code: species.code }).from(species).where(inArray(species.code, next.speciesCodes));
      if (known.length !== next.speciesCodes.length) throw validation('گونه انتخاب‌شده در فهرست گونه‌ها نیست.');
    }

    const [facts] = await loadFacts(tx, [current]);
    const previous = {
      headlineFa: current.headlineFa,
      bioFa: current.bioFa,
      experienceFa: current.experienceFa,
      showPhone: current.showPhone,
      showCouncilCode: current.showCouncilCode,
      specialtyCodes: facts!.specialtyCodes,
      speciesCodes: facts!.speciesCodes,
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
        before[key] = previous[key];
        after[key] = next[key];
      }
    }
    if (Object.keys(after).length === 0) return current;

    const [row] = await tx
      .update(vetProfiles)
      .set({
        headlineFa: next.headlineFa,
        bioFa: next.bioFa,
        experienceFa: next.experienceFa,
        showPhone: next.showPhone,
        showCouncilCode: next.showCouncilCode,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(vetProfiles.id, current.id), eq(vetProfiles.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    if ('specialtyCodes' in after) {
      await tx.delete(vetProfileSpecialties).where(eq(vetProfileSpecialties.vetProfileId, row.id));
      if (next.specialtyCodes.length > 0) {
        await tx
          .insert(vetProfileSpecialties)
          .values(next.specialtyCodes.map((specialtyCode) => ({ vetProfileId: row.id, specialtyCode })));
      }
    }
    if ('speciesCodes' in after) {
      await tx.delete(vetProfileSpecies).where(eq(vetProfileSpecies.vetProfileId, row.id));
      if (next.speciesCodes.length > 0) {
        await tx.insert(vetProfileSpecies).values(next.speciesCodes.map((speciesCode) => ({ vetProfileId: row.id, speciesCode })));
      }
    }

    await recordAudit(tx, actor, {
      action: 'VET_PUBLIC_PROFILE_UPDATED',
      targetType: 'VET_PROFILE',
      targetId: row.id,
      targetVersion: row.version,
      before,
      after,
      reason,
    });
    return row;
  });
}

/**
 * DRAFT → PUBLISHED → HIDDEN → PUBLISHED. A published page is hidden, never
 * turned back into a draft, so its address keeps meaning the same veterinarian.
 * A page hidden by the superadmin or the review operator stays hidden until
 * one of them publishes it again; its owner cannot undo moderation (DEC-0166).
 */
export async function changeVetPublicStatus(
  database: Database,
  actor: Actor,
  input: { profileId: string; expectedVersion: number; to: string; reason?: string | null },
): Promise<ProfileRow> {
  if (!isVetPublicStatus(input.to) || input.to === 'DRAFT') throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const to: VetPublicStatus = input.to;

  return database.transaction(async (tx) => {
    const current = await profileById(tx, input.profileId);
    const manager = assertManager(actor, current.accountId, ['ADMIN', 'REVIEW', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.publicStatus === to) throw validation('پروفایل همین حالا در این وضعیت است.');
    if (to === 'HIDDEN' && current.publicStatus === 'DRAFT') throw validation('پیش‌نویسی که منتشر نشده پنهان‌کردن ندارد.');
    if (to === 'PUBLISHED' && manager === 'OWNER' && current.hiddenByReview) {
      throw conflict('این پروفایل را بررسی همزیست پنهان کرده است و فقط همان‌جا دوباره منتشر می‌شود.');
    }

    if (to === 'PUBLISHED') {
      const [facts] = await loadFacts(tx, [current]);
      const blockers = vetPublishBlockers(completenessInputOf(facts!), ownershipOf(current));
      if (blockers.length > 0) throw validation(blockers.join(' '));
    }

    const now = new Date();
    const [row] = await tx
      .update(vetProfiles)
      .set({
        publicStatus: to,
        publicSlug: current.publicSlug ?? newPublicSlug(),
        publicPublishedAt: current.publicPublishedAt ?? (to === 'PUBLISHED' ? now : null),
        hiddenByReview: to === 'HIDDEN' && manager !== 'OWNER',
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(vetProfiles.id, current.id), eq(vetProfiles.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'VET_PUBLIC_STATUS_CHANGED',
      targetType: 'VET_PROFILE',
      targetId: row.id,
      targetVersion: row.version,
      before: { publicStatus: current.publicStatus, publicSlug: current.publicSlug, hiddenByReview: current.hiddenByReview },
      after: { publicStatus: row.publicStatus, publicSlug: row.publicSlug, hiddenByReview: row.hiddenByReview },
      reason,
    });
    return row;
  });
}

export interface LocationPublicInput {
  readonly locationId: string;
  readonly expectedVersion: number;
  readonly isPublic: boolean;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly hoursNoteFa: string | null;
  readonly reason?: string | null;
}

async function placeOf(tx: DbClient, provinceCodeInput: string | null, cityIdInput: string | null) {
  let provinceCode = text(provinceCodeInput);
  const cityId = text(cityIdInput);
  let city: typeof cities.$inferSelect | undefined;
  let province: typeof provinces.$inferSelect | undefined;
  if (cityId !== null) {
    [city] = UUID.test(cityId) ? await tx.select().from(cities).where(eq(cities.id, cityId)).limit(1) : [];
    if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
    if (provinceCode !== null && provinceCode !== city.provinceCode) throw validation('شهر انتخاب‌شده در این استان نیست.');
    provinceCode = city.provinceCode;
  }
  if (provinceCode !== null) {
    [province] = await tx.select().from(provinces).where(eq(provinces.code, provinceCode)).limit(1);
    if (!province) throw validation('استان انتخاب‌شده در فهرست استان‌ها نیست.');
  }
  return { provinceCode, cityId, cityNameFa: city?.nameFa ?? null, provinceNameFa: province?.nameFa ?? null };
}

/**
 * Links a location to a normalised place and decides whether it is shown.
 * Licence, capabilities and the free-text address Phase 1 recorded are not
 * touched here, so the Finder reads exactly what it read before.
 */
export async function updateLocationPublic(
  database: Database,
  actor: Actor,
  input: LocationPublicInput,
): Promise<LocationRow> {
  const hoursNoteFa = bounded(input.hoursNoteFa, 300, 'ساعات اطلاع‌رسانی');
  if (!UUID.test(input.locationId)) throw notFound('محل کار پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetLocations).where(eq(vetLocations.id, input.locationId)).limit(1);
    if (!current) throw notFound('محل کار پیدا نشد.');
    const manager = assertManager(actor, current.vetAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const place = await placeOf(tx, input.provinceCode, input.cityId);
    if (input.isPublic && !current.isActive) throw validation('این محل کار غیرفعال است و عمومی نمی‌شود.');
    if (input.isPublic && place.cityId === null) throw validation('برای عمومی‌کردن محل کار، شهر آن را انتخاب کنید.');

    const next = { isPublic: input.isPublic === true, provinceCode: place.provinceCode, cityId: place.cityId, hoursNoteFa };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (current[key] !== next[key]) {
        before[key] = current[key];
        after[key] = next[key];
      }
    }
    if (Object.keys(after).length === 0) return current;

    const [row] = await tx
      .update(vetLocations)
      .set({ ...next, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(vetLocations.id, current.id), eq(vetLocations.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'VET_LOCATION_PUBLIC_UPDATED',
      targetType: 'VET_LOCATION',
      targetId: row.id,
      targetVersion: row.version,
      before,
      after,
      reason,
    });
    return row;
  });
}

export interface OwnLocationInput {
  readonly nameFa: string;
  readonly kind: string;
  readonly cityId: string;
  readonly neighborhoodFa?: string | null;
  readonly addressFa?: string | null;
  readonly phone?: string | null;
  readonly hoursNoteFa?: string | null;
  readonly isPublic: boolean;
}

/**
 * A place the owner works at, added from their own profile. It carries no
 * licence and no capability: those are recorded and judged only by the
 * superadmin, so a location added here can never reach the Finder (DEC-0166).
 */
export async function addOwnLocation(database: Database, actor: Actor, input: OwnLocationInput): Promise<LocationRow> {
  if (!OWNER_CONTEXTS.includes(actor.context)) throw forbidden('محل کار را صاحب پروفایل از حساب خودش ثبت می‌کند.');
  const nameFa = bounded(input.nameFa, 120, 'نام محل کار');
  if (nameFa === null) throw validation('نام محل کار را بنویسید.');
  if (!LOCATION_KINDS.includes(input.kind as LocationKind)) throw validation('نوع محل کار معتبر نیست.');
  const values = {
    neighborhoodFa: bounded(input.neighborhoodFa, 120, 'محله'),
    addressFa: bounded(input.addressFa, 300, 'نشانی'),
    phone: bounded(input.phone, 20, 'تلفن'),
    hoursNoteFa: bounded(input.hoursNoteFa, 300, 'ساعات اطلاع‌رسانی'),
  };

  return database.transaction(async (tx) => {
    const [profile] = await tx.select({ id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1);
    if (!profile) throw forbidden('این حساب پروفایل دامپزشک ندارد.');
    const place = await placeOf(tx, null, input.cityId);
    if (place.cityId === null) throw validation('شهر محل کار را انتخاب کنید.');

    const [row] = await tx
      .insert(vetLocations)
      .values({
        vetAccountId: actor.accountId,
        nameFa,
        kind: input.kind as LocationKind,
        // The Phase 1 free-text columns carry the same place, so older screens read it too.
        provinceFa: place.provinceNameFa,
        cityFa: place.cityNameFa,
        provinceCode: place.provinceCode,
        cityId: place.cityId,
        ...values,
        isPublic: input.isPublic === true,
        licenceStatus: 'NONE',
      })
      .returning();
    await recordAudit(tx, actor, {
      action: 'VET_LOCATION_CREATED',
      targetType: 'VET_LOCATION',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { vetAccountId: actor.accountId, nameFa, cityId: place.cityId, licenceStatus: 'NONE', addedByOwner: true },
    });
    return row!;
  });
}

/** A city outside the seeded capitals, added as data under its province. */
export async function addCity(
  database: Database,
  actor: Actor,
  input: { provinceCode: string; nameFa: string },
): Promise<typeof cities.$inferSelect> {
  if (actor.context !== 'SUPERADMIN' && actor.context !== 'REVIEW_OPERATOR') {
    throw forbidden('شهر تازه را سوپرادمین یا اپراتور بررسی اضافه می‌کند.');
  }
  const nameFa = unifyPersianLetters(bounded(input.nameFa, 80, 'نام شهر') ?? '').replace(/\s+/g, ' ');
  if (nameFa === '') throw validation('نام شهر را بنویسید.');

  return database.transaction(async (tx) => {
    const [province] = await tx.select().from(provinces).where(eq(provinces.code, text(input.provinceCode) ?? '')).limit(1);
    if (!province) throw validation('استان را انتخاب کنید.');
    const [existing] = await tx
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.provinceCode, province.code), eq(cities.nameFa, nameFa)))
      .limit(1);
    if (existing) throw conflict('این شهر قبلاً در استان ' + province.nameFa + ' ثبت شده است.');
    const [row] = await tx.insert(cities).values({ provinceCode: province.code, nameFa }).returning();
    await recordAudit(tx, actor, {
      action: 'CITY_CREATED',
      targetType: 'CITY',
      targetId: row!.id,
      after: { provinceCode: province.code, nameFa },
    });
    return row!;
  });
}

// ── Public ───────────────────────────────────────────────────────────────

async function publishedProfiles(database: DbClient, slug?: string): Promise<ProfileRow[]> {
  const rows = await database
    .select({ profile: vetProfiles })
    .from(vetProfiles)
    .leftJoin(accounts, eq(accounts.id, vetProfiles.accountId))
    .where(
      and(
        eq(vetProfiles.publicStatus, 'PUBLISHED'),
        // A disabled account's page goes with it; the profile row stays as history. Unowned profiles have no account.
        or(isNull(vetProfiles.accountId), ne(accounts.status, 'DISABLED')),
        slug === undefined ? undefined : eq(vetProfiles.publicSlug, slug),
      ),
    );
  return rows.map((row) => row.profile);
}

/** The places a profile is found by: its public locations, or the city an unowned profile was listed in. */
function placesOf(entry: ProfileFacts): { provinceCode: string | null; cityId: string | null; kind: LocationKind | null; cityNameFa: string | null }[] {
  const locations = publicLocationsOf(entry);
  if (locations.length > 0) return locations.map((l) => ({ provinceCode: l.provinceCode, cityId: l.cityId, kind: l.kind, cityNameFa: l.cityNameFa }));
  return entry.listed
    ? [{ provinceCode: entry.listed.provinceCode, cityId: entry.profile.listedCityId, kind: null, cityNameFa: entry.listed.cityNameFa }]
    : [];
}

export interface VetDirectoryQuery {
  readonly term?: string;
  readonly specialty?: string | null;
  readonly species?: string | null;
  readonly province?: string | null;
  readonly cityId?: string | null;
  readonly kind?: string | null;
  /** Filter by one status axis; the axes stay separate filters, never a combined score. */
  readonly status?: 'VERIFIED' | 'TRUSTED' | null;
  readonly page: number;
  readonly pageSize?: number;
}

export interface VetCard {
  readonly slug: string;
  readonly nameFa: string;
  readonly headlineFa: string | null;
  readonly specialtiesFa: readonly string[];
  readonly placesFa: readonly string[];
  readonly owned: boolean;
  readonly verified: boolean;
  readonly trusted: boolean;
}

export async function publishedVets(
  database: DbClient,
  query: VetDirectoryQuery,
): Promise<Page<VetCard> & { publishedTotal: number }> {
  const [facts, reference] = await Promise.all([
    publishedProfiles(database).then((rows) => loadFacts(database, rows)),
    database.select().from(vetSpecialties),
  ]);
  const specialtyName = new Map(reference.map((row) => [row.code, row.nameFa]));
  const term = normalizeForSearch(query.term ?? '').trim();
  const kind = LOCATION_KINDS.includes(query.kind as LocationKind) ? (query.kind as LocationKind) : null;

  // ponytail: filtered in memory over every published profile; PROMPT-012 search moves this into indexed queries.
  const filtered = facts
    .filter((entry) => {
      const places = placesOf(entry);
      if (query.specialty && !entry.specialtyCodes.includes(query.specialty)) return false;
      if (query.species && !entry.speciesCodes.includes(query.species)) return false;
      if (query.status === 'VERIFIED' && entry.profile.councilVerifiedAt === null) return false;
      if (query.status === 'TRUSTED' && !entry.trusted) return false;
      if (
        (query.province || query.cityId || kind) &&
        !places.some(
          (place) =>
            (!query.province || place.provinceCode === query.province) &&
            (!query.cityId || place.cityId === query.cityId) &&
            (!kind || place.kind === kind),
        )
      ) {
        return false;
      }
      if (term !== '') {
        const haystack = [entry.profile.displayNameFa, entry.profile.headlineFa ?? '', ...publicLocationsOf(entry).map((l) => l.nameFa)]
          .map(normalizeForSearch)
          .join(' ');
        if (!haystack.includes(term)) return false;
      }
      return true;
    })
    // Neutral order until the versioned ranking of PROMPT-012/015: no axis buys a higher place (P2-D05).
    .sort((a, b) => a.profile.displayNameFa.localeCompare(b.profile.displayNameFa, 'fa'));

  const request = { page: query.page, pageSize: query.pageSize ?? 24 };
  const items = filtered.slice(offsetOf(request), offsetOf(request) + request.pageSize).map((entry) => ({
    slug: entry.profile.publicSlug!,
    nameFa: entry.profile.displayNameFa,
    headlineFa: entry.profile.headlineFa,
    specialtiesFa: entry.specialtyCodes.map((code) => specialtyName.get(code) ?? code),
    placesFa: [...new Set(placesOf(entry).map((p) => p.cityNameFa).filter((c): c is string => c !== null))],
    owned: entry.profile.accountId !== null,
    verified: entry.profile.councilVerifiedAt !== null,
    trusted: entry.trusted,
  }));
  return { ...pageOf(items, filtered.length, request), publishedTotal: facts.length };
}

export interface VetPublicPage {
  readonly slug: string;
  readonly nameFa: string;
  readonly headlineFa: string | null;
  readonly bioFa: string | null;
  readonly experienceFa: string | null;
  /** Only with consent (§7 «کد نظام در حد مجاز»). */
  readonly councilCode: string | null;
  readonly phone: string | null;
  /** False for a reviewed suggestion nobody has claimed yet (§10). */
  readonly owned: boolean;
  readonly verified: boolean;
  readonly trusted: boolean;
  readonly specialtiesFa: readonly string[];
  readonly speciesFa: readonly string[];
  readonly locations: readonly {
    readonly id: string;
    readonly nameFa: string;
    readonly kind: LocationKind;
    readonly provinceNameFa: string | null;
    readonly cityNameFa: string | null;
    readonly neighborhoodFa: string | null;
    readonly addressFa: string | null;
    readonly phone: string | null;
    readonly hoursNoteFa: string | null;
  }[];
  /** An unowned profile's listed city and public contact, shown while it has no locations. */
  readonly listed: { readonly cityNameFa: string; readonly provinceNameFa: string; readonly contactFa: string | null } | null;
  readonly updatedAt: Date;
}

export async function vetPageBySlug(database: DbClient, slug: string): Promise<VetPublicPage | null> {
  if (!SLUG.test(slug)) return null;
  const [profile] = await publishedProfiles(database, slug);
  if (!profile) return null;
  const [[facts], specialtyRows, speciesRows] = await Promise.all([
    loadFacts(database, [profile]),
    database.select().from(vetSpecialties).orderBy(asc(vetSpecialties.sortOrder)),
    database.select().from(species).orderBy(asc(species.sortOrder)),
  ]);
  const locations = publicLocationsOf(facts!);
  return {
    slug,
    nameFa: profile.displayNameFa,
    headlineFa: profile.headlineFa,
    bioFa: profile.bioFa,
    experienceFa: profile.experienceFa,
    councilCode: profile.showCouncilCode ? profile.councilCode : null,
    phone: publicPhone(profile.showPhone, profile.phone),
    owned: profile.accountId !== null,
    verified: profile.councilVerifiedAt !== null,
    trusted: facts!.trusted,
    specialtiesFa: specialtyRows.filter((row) => facts!.specialtyCodes.includes(row.code)).map((row) => row.nameFa),
    speciesFa: speciesRows.filter((row) => facts!.speciesCodes.includes(row.code)).map((row) => row.nameFa),
    locations: locations.map((location) => ({
      id: location.id,
      nameFa: location.nameFa,
      kind: location.kind,
      provinceNameFa: location.provinceNameFa,
      cityNameFa: location.cityNameFa,
      neighborhoodFa: location.neighborhoodFa,
      addressFa: location.addressFa,
      phone: location.phone,
      hoursNoteFa: location.hoursNoteFa,
    })),
    listed:
      locations.length === 0 && facts!.listed
        ? {
            cityNameFa: facts!.listed.cityNameFa,
            provinceNameFa: facts!.listed.provinceNameFa,
            contactFa: profile.accountId === null ? profile.listedContactFa : null,
          }
        : null,
    updatedAt: profile.updatedAt,
  };
}

export async function vetSitemapEntries(database: DbClient): Promise<{ path: string; lastModified: Date }[]> {
  const rows = await publishedProfiles(database);
  return rows.map((row) => ({ path: '/veterinarians/' + row.publicSlug, lastModified: row.updatedAt }));
}
