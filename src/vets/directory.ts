/**
 * Public veterinary directory — Requirements-Phase-2 §7, §19, §20, §23 (PROMPT-006).
 *
 * The directory is a view of the Phase 1 veterinarian: the same `vet_profile`
 * and `vet_location` rows, no second veterinarian table (P2-D15). What is
 * public is decided here, separately from the Finder: publishing a profile
 * never makes a veterinarian eligible for new work, and hiding one never takes
 * them out of it (DEC-0164).
 *
 * The superadmin edits a profile today; the veterinarian's own editing arrives
 * with registration and claim in PROMPT-007.
 */
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
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
import type { Actor } from '../authz/actor.ts';

type ProfileRow = typeof vetProfiles.$inferSelect;
type LocationRow = typeof vetLocations.$inferSelect;
export type LocationKind = LocationRow['kind'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^vet-[0-9a-f]{10}$/;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const LOCATION_KINDS: readonly LocationKind[] = ['CLINIC', 'HOSPITAL', 'CENTRE'];

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') {
    throw forbidden('ویرایش پروفایل عمومی دامپزشک فقط از محیط سوپرادمین ممکن است.');
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

/** Every change made to someone else's public page says why (§20, prompt rule on sensitive changes). */
function requireReason(reason: string | null | undefined): string {
  const out = bounded(reason, 500, 'دلیل');
  if (out === null) throw validation('دلیل این تغییر را بنویسید.');
  return out;
}

/** A public address that is not the internal id and cannot be guessed from it (§20). */
const newPublicSlug = (): string => 'vet-' + randomBytes(5).toString('hex');

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
}

async function loadFacts(database: DbClient, profiles: readonly ProfileRow[]): Promise<ProfileFacts[]> {
  if (profiles.length === 0) return [];
  const accountIds = profiles.map((p) => p.accountId);
  const profileIds = profiles.map((p) => p.id);
  const [locationRows, specialtyRows, speciesRows, roleRows, provinceRows, cityRows] = await Promise.all([
    database.select().from(vetLocations).where(inArray(vetLocations.vetAccountId, accountIds)),
    database.select().from(vetProfileSpecialties).where(inArray(vetProfileSpecialties.vetProfileId, profileIds)),
    database.select().from(vetProfileSpecies).where(inArray(vetProfileSpecies.vetProfileId, profileIds)),
    database
      .select({ accountId: accountRoles.accountId })
      .from(accountRoles)
      .where(
        and(
          inArray(accountRoles.accountId, accountIds),
          eq(accountRoles.role, 'TRUSTED_VET'),
          eq(accountRoles.status, 'ACTIVE'),
        ),
      ),
    database.select().from(provinces),
    database.select().from(cities),
  ]);
  const provinceName = new Map(provinceRows.map((row) => [row.code, row.nameFa]));
  const cityName = new Map(cityRows.map((row) => [row.id, row.nameFa]));
  const trusted = new Set(roleRows.map((row) => row.accountId));

  return profiles.map((profile) => ({
    profile,
    locations: locationRows
      .filter((row) => row.vetAccountId === profile.accountId)
      .map((row) => ({
        ...row,
        provinceNameFa: row.provinceCode ? (provinceName.get(row.provinceCode) ?? null) : null,
        cityNameFa: row.cityId ? (cityName.get(row.cityId) ?? null) : null,
      }))
      .sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
    specialtyCodes: specialtyRows.filter((row) => row.vetProfileId === profile.id).map((row) => row.specialtyCode).sort(),
    speciesCodes: speciesRows.filter((row) => row.vetProfileId === profile.id).map((row) => row.speciesCode).sort(),
    trusted: trusted.has(profile.accountId),
  }));
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

// ── Superadmin ───────────────────────────────────────────────────────────

export async function vetDirectoryEditor(database: DbClient, actor: Actor, accountId: string) {
  assertSuperadmin(actor);
  if (!UUID.test(accountId)) return null;
  const [profile] = await database.select().from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  if (!profile) return null;
  const [facts] = await loadFacts(database, [profile]);
  const input = completenessInputOf(facts!);
  return {
    facts: facts!,
    completeness: completeness(input),
    blockers: vetPublishBlockers(input),
    reference: await directoryReferenceData(database),
  };
}

export interface VetPublicProfileInput {
  readonly accountId: string;
  readonly expectedVersion: number;
  readonly headlineFa: string | null;
  readonly bioFa: string | null;
  readonly experienceFa: string | null;
  readonly showPhone: boolean;
  readonly showCouncilCode: boolean;
  readonly specialtyCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly reason: string;
}

/** Saves what the public page says. Only changed fields reach the audit history, each with its previous value. */
export async function updateVetPublicProfile(
  database: Database,
  actor: Actor,
  input: VetPublicProfileInput,
): Promise<ProfileRow> {
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  const next = {
    headlineFa: bounded(input.headlineFa, 120, 'عنوان حرفه‌ای'),
    bioFa: bounded(input.bioFa, 4000, 'معرفی'),
    experienceFa: bounded(input.experienceFa, 4000, 'سوابق'),
    showPhone: input.showPhone === true,
    showCouncilCode: input.showCouncilCode === true,
    specialtyCodes: [...new Set(input.specialtyCodes)].sort(),
    speciesCodes: [...new Set(input.speciesCodes)].sort(),
  };
  if (!UUID.test(input.accountId)) throw notFound('پرونده دامپزشک پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, input.accountId)).limit(1);
    if (!current) throw notFound('پرونده دامپزشک پیدا نشد.');
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
 */
export async function changeVetPublicStatus(
  database: Database,
  actor: Actor,
  input: { accountId: string; expectedVersion: number; to: string; reason: string },
): Promise<ProfileRow> {
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  if (!isVetPublicStatus(input.to) || input.to === 'DRAFT') throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const to: VetPublicStatus = input.to;
  if (!UUID.test(input.accountId)) throw notFound('پرونده دامپزشک پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, input.accountId)).limit(1);
    if (!current) throw notFound('پرونده دامپزشک پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.publicStatus === to) throw validation('پروفایل همین حالا در این وضعیت است.');
    if (to === 'HIDDEN' && current.publicStatus === 'DRAFT') throw validation('پیش‌نویسی که منتشر نشده پنهان‌کردن ندارد.');

    if (to === 'PUBLISHED') {
      const [facts] = await loadFacts(tx, [current]);
      const blockers = vetPublishBlockers(completenessInputOf(facts!));
      if (blockers.length > 0) throw validation(blockers.join(' '));
    }

    const now = new Date();
    const [row] = await tx
      .update(vetProfiles)
      .set({
        publicStatus: to,
        publicSlug: current.publicSlug ?? newPublicSlug(),
        publicPublishedAt: current.publicPublishedAt ?? (to === 'PUBLISHED' ? now : null),
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
      before: { publicStatus: current.publicStatus, publicSlug: current.publicSlug },
      after: { publicStatus: row.publicStatus, publicSlug: row.publicSlug },
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
  readonly reason: string;
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
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  const hoursNoteFa = bounded(input.hoursNoteFa, 300, 'ساعات اطلاع‌رسانی');
  if (!UUID.test(input.locationId)) throw notFound('محل کار پیدا نشد.');
  let provinceCode = text(input.provinceCode);
  const cityId = text(input.cityId);

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetLocations).where(eq(vetLocations.id, input.locationId)).limit(1);
    if (!current) throw notFound('محل کار پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    if (cityId !== null) {
      const [city] = UUID.test(cityId) ? await tx.select().from(cities).where(eq(cities.id, cityId)).limit(1) : [];
      if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
      if (provinceCode !== null && provinceCode !== city.provinceCode) throw validation('شهر انتخاب‌شده در این استان نیست.');
      provinceCode = city.provinceCode;
    } else if (provinceCode !== null) {
      const [province] = await tx.select().from(provinces).where(eq(provinces.code, provinceCode)).limit(1);
      if (!province) throw validation('استان انتخاب‌شده در فهرست استان‌ها نیست.');
    }
    if (input.isPublic && !current.isActive) throw validation('این محل کار غیرفعال است و عمومی نمی‌شود.');
    if (input.isPublic && cityId === null) throw validation('برای عمومی‌کردن محل کار، شهر آن را انتخاب کنید.');

    const next = { isPublic: input.isPublic === true, provinceCode, cityId, hoursNoteFa };
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

/** A city outside the seeded capitals, added as data under its province. */
export async function addCity(
  database: Database,
  actor: Actor,
  input: { provinceCode: string; nameFa: string },
): Promise<typeof cities.$inferSelect> {
  assertSuperadmin(actor);
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
    .innerJoin(accounts, eq(accounts.id, vetProfiles.accountId))
    .where(
      and(
        eq(vetProfiles.publicStatus, 'PUBLISHED'),
        // A disabled account's page goes with it; the profile row stays as history.
        ne(accounts.status, 'DISABLED'),
        slug === undefined ? undefined : eq(vetProfiles.publicSlug, slug),
      ),
    );
  return rows.map((row) => row.profile);
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
      const places = publicLocationsOf(entry);
      if (query.specialty && !entry.specialtyCodes.includes(query.specialty)) return false;
      if (query.species && !entry.speciesCodes.includes(query.species)) return false;
      if (query.status === 'VERIFIED' && entry.profile.councilVerifiedAt === null) return false;
      if (query.status === 'TRUSTED' && !entry.trusted) return false;
      if (
        (query.province || query.cityId || kind) &&
        !places.some(
          (location) =>
            (!query.province || location.provinceCode === query.province) &&
            (!query.cityId || location.cityId === query.cityId) &&
            (!kind || location.kind === kind),
        )
      ) {
        return false;
      }
      if (term !== '') {
        const haystack = [entry.profile.displayNameFa, entry.profile.headlineFa ?? '', ...places.map((l) => l.nameFa)]
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
    placesFa: [...new Set(publicLocationsOf(entry).map((l) => l.cityNameFa).filter((c): c is string => c !== null))],
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
  return {
    slug,
    nameFa: profile.displayNameFa,
    headlineFa: profile.headlineFa,
    bioFa: profile.bioFa,
    experienceFa: profile.experienceFa,
    councilCode: profile.showCouncilCode ? profile.councilCode : null,
    phone: publicPhone(profile.showPhone, profile.phone),
    verified: profile.councilVerifiedAt !== null,
    trusted: facts!.trusted,
    specialtiesFa: specialtyRows.filter((row) => facts!.specialtyCodes.includes(row.code)).map((row) => row.nameFa),
    speciesFa: speciesRows.filter((row) => facts!.speciesCodes.includes(row.code)).map((row) => row.nameFa),
    locations: publicLocationsOf(facts!).map((location) => ({
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
    updatedAt: profile.updatedAt,
  };
}

export async function vetSitemapEntries(database: DbClient): Promise<{ path: string; lastModified: Date }[]> {
  const rows = await publishedProfiles(database);
  return rows.map((row) => ({ path: '/veterinarians/' + row.publicSlug, lastModified: row.updatedAt }));
}
