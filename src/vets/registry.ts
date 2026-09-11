/**
 * Trusted veterinarians, their locations and the Finder query — §11.1, §21.1.
 *
 * There is no public onboarding here (D01). These rows describe veterinarians
 * the association has already approved, and they are entered from the
 * superadmin environment. The professional council code and the location
 * licence are two independent approvals: neither one implies the other.
 */
import { and, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, accounts } from '../db/schema/core.ts';
import { vetLocations, vetProfiles } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import {
  distanceKm,
  locationEligibility,
  type LocationCapability,
  type LocationEligibility,
  type VisitContextName,
} from '../domain/referral.ts';
import type { Actor } from '../authz/actor.ts';

export type VetProfileRecord = typeof vetProfiles.$inferSelect;
export type VetLocationRecord = typeof vetLocations.$inferSelect;

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') {
    throw forbidden('ثبت و ویرایش داده دامپزشکان معتمد فقط از محیط سوپرادمین ممکن است.');
  }
}

const trimmed = (value: string | null | undefined): string | null => {
  const out = (value ?? '').trim();
  return out === '' ? null : out;
};

export function capabilitiesOf(location: VetLocationRecord): readonly LocationCapability[] {
  const out: LocationCapability[] = [];
  if (location.canImplantMicrochip) out.push('IMPLANT');
  if (location.canDrawBloodSample) out.push('BLOOD_SAMPLE');
  if (location.canPregnancyCheck) out.push('PREGNANCY_CHECK');
  return out;
}

export function eligibilityOf(location: VetLocationRecord, context: VisitContextName): LocationEligibility {
  return locationEligibility(
    {
      isActive: location.isActive,
      licenceStatus: location.licenceStatus,
      cityFa: location.cityFa,
      addressFa: location.addressFa,
      phone: location.phone,
      capabilities: capabilitiesOf(location),
    },
    context,
  );
}

// ── Superadmin-managed registry ───────────────────────────────────────────

export interface UpsertVetInput {
  readonly mobile: string;
  readonly displayNameFa: string;
  readonly councilCode: string;
  readonly phone?: string | null;
  readonly bioFa?: string | null;
}

/**
 * Attaches a professional record to an account that already holds the trusted
 * veterinarian role. The role itself is granted elsewhere; this only records
 * the verified council code, which is why an account without the role is
 * refused rather than silently promoted.
 */
export async function upsertVetProfile(
  database: Database,
  actor: Actor,
  input: UpsertVetInput,
): Promise<VetProfileRecord> {
  assertSuperadmin(actor);
  const name = trimmed(input.displayNameFa);
  const council = trimmed(input.councilCode)?.toUpperCase() ?? null;
  if (!name) throw validation('نام دامپزشک لازم است.');
  if (!council) throw validation('کد نظام دامپزشکی لازم است.');

  const [account] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.mobile, trimmed(input.mobile) ?? ''))
    .limit(1);
  if (!account) throw notFound('حسابی با این شماره پیدا نشد.');

  const [role] = await database
    .select({ status: accountRoles.status })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, account.id), eq(accountRoles.role, 'TRUSTED_VET')))
    .limit(1);
  if (!role) throw validation('این حساب نقش دامپزشک معتمد ندارد؛ ابتدا نقش را ثبت کنید.');

  const [existing] = await database
    .select()
    .from(vetProfiles)
    .where(eq(vetProfiles.accountId, account.id))
    .limit(1);

  const [taken] = await database
    .select({ accountId: vetProfiles.accountId })
    .from(vetProfiles)
    .where(eq(vetProfiles.councilCode, council))
    .limit(1);
  if (taken && taken.accountId !== account.id) {
    throw conflict('این کد نظام دامپزشکی قبلاً برای حساب دیگری ثبت شده است.');
  }

  return database.transaction(async (tx) => {
    const values = {
      displayNameFa: name,
      councilCode: council,
      councilVerifiedAt: new Date(),
      phone: trimmed(input.phone),
      // The registry form has no bio field; the directory writes it (PROMPT-006), so absent means unchanged.
      bioFa: input.bioFa === undefined ? (existing?.bioFa ?? null) : trimmed(input.bioFa),
      updatedAt: new Date(),
    };
    const [row] = existing
      ? await tx
          .update(vetProfiles)
          .set({ ...values, version: existing.version + 1 })
          .where(and(eq(vetProfiles.id, existing.id), eq(vetProfiles.version, existing.version)))
          .returning()
      : await tx
          .insert(vetProfiles)
          .values({ accountId: account.id, ...values })
          .returning();
    if (!row) throw conflict('این پرونده هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: existing ? 'VET_PROFILE_UPDATED' : 'VET_PROFILE_CREATED',
      targetType: 'VET_PROFILE',
      targetId: row.id,
      targetVersion: row.version,
      after: { accountId: row.accountId, councilCode: row.councilCode },
    });
    return row;
  });
}

export interface LocationInput {
  readonly nameFa: string;
  readonly kind?: 'CLINIC' | 'HOSPITAL' | 'CENTRE';
  readonly provinceFa?: string | null;
  readonly cityFa?: string | null;
  readonly neighborhoodFa?: string | null;
  readonly addressFa?: string | null;
  readonly phone?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly licenceNumber?: string | null;
  readonly licenceStatus?: 'NONE' | 'VALID' | 'EXPIRED' | 'REVOKED';
  readonly canImplantMicrochip?: boolean;
  readonly canDrawBloodSample?: boolean;
  readonly canPregnancyCheck?: boolean;
  readonly isActive?: boolean;
}

export async function addLocation(
  database: Database,
  actor: Actor,
  vetAccountId: string,
  input: LocationInput,
): Promise<VetLocationRecord> {
  assertSuperadmin(actor);
  const name = trimmed(input.nameFa);
  if (!name) throw validation('نام مرکز لازم است.');

  const [profile] = await database
    .select({ id: vetProfiles.id })
    .from(vetProfiles)
    .where(eq(vetProfiles.accountId, vetAccountId))
    .limit(1);
  if (!profile) throw notFound('پرونده دامپزشک پیدا نشد.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(vetLocations)
      .values({
        vetAccountId,
        nameFa: name,
        kind: input.kind ?? 'CLINIC',
        provinceFa: trimmed(input.provinceFa),
        cityFa: trimmed(input.cityFa),
        neighborhoodFa: trimmed(input.neighborhoodFa),
        addressFa: trimmed(input.addressFa),
        phone: trimmed(input.phone),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        licenceNumber: trimmed(input.licenceNumber),
        // A licence is never assumed valid because a row was created.
        licenceStatus: input.licenceStatus ?? 'NONE',
        canImplantMicrochip: input.canImplantMicrochip ?? false,
        canDrawBloodSample: input.canDrawBloodSample ?? false,
        canPregnancyCheck: input.canPregnancyCheck ?? false,
        isActive: input.isActive ?? true,
      })
      .returning();
    if (!row) throw conflict('ثبت مرکز انجام نشد.');
    await recordAudit(tx, actor, {
      action: 'VET_LOCATION_CREATED',
      targetType: 'VET_LOCATION',
      targetId: row.id,
      targetVersion: row.version,
      after: { vetAccountId, nameFa: row.nameFa, licenceStatus: row.licenceStatus },
    });
    return row;
  });
}

export async function updateLocation(
  database: Database,
  actor: Actor,
  locationId: string,
  input: LocationInput,
  expectedVersion?: number,
): Promise<VetLocationRecord> {
  assertSuperadmin(actor);
  const [current] = await database.select().from(vetLocations).where(eq(vetLocations.id, locationId)).limit(1);
  if (!current) throw notFound('مرکز پیدا نشد.');
  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    throw versionStale(expectedVersion, current.version);
  }

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(vetLocations)
      .set({
        nameFa: trimmed(input.nameFa) ?? current.nameFa,
        kind: input.kind ?? current.kind,
        provinceFa: input.provinceFa === undefined ? current.provinceFa : trimmed(input.provinceFa),
        cityFa: input.cityFa === undefined ? current.cityFa : trimmed(input.cityFa),
        neighborhoodFa:
          input.neighborhoodFa === undefined ? current.neighborhoodFa : trimmed(input.neighborhoodFa),
        addressFa: input.addressFa === undefined ? current.addressFa : trimmed(input.addressFa),
        phone: input.phone === undefined ? current.phone : trimmed(input.phone),
        latitude: input.latitude === undefined ? current.latitude : input.latitude,
        longitude: input.longitude === undefined ? current.longitude : input.longitude,
        licenceNumber:
          input.licenceNumber === undefined ? current.licenceNumber : trimmed(input.licenceNumber),
        licenceStatus: input.licenceStatus ?? current.licenceStatus,
        canImplantMicrochip: input.canImplantMicrochip ?? current.canImplantMicrochip,
        canDrawBloodSample: input.canDrawBloodSample ?? current.canDrawBloodSample,
        canPregnancyCheck: input.canPregnancyCheck ?? current.canPregnancyCheck,
        isActive: input.isActive ?? current.isActive,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(vetLocations.id, locationId), eq(vetLocations.version, current.version)))
      .returning();
    if (!row) throw conflict('این مرکز هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'VET_LOCATION_UPDATED',
      targetType: 'VET_LOCATION',
      targetId: row.id,
      targetVersion: row.version,
      before: { licenceStatus: current.licenceStatus, isActive: current.isActive },
      after: { licenceStatus: row.licenceStatus, isActive: row.isActive },
    });
    return row;
  });
}

/** Veterinarians with an account. Unowned directory profiles are the review operator's (PROMPT-007). */
export async function listVetProfiles(
  database: DbClient,
): Promise<readonly (VetProfileRecord & { accountId: string; councilCode: string })[]> {
  const rows = await database.select().from(vetProfiles).where(isNotNull(vetProfiles.accountId));
  return rows
    .map((row) => ({ ...row, accountId: row.accountId!, councilCode: row.councilCode ?? '' }))
    .sort((a, b) => a.displayNameFa.localeCompare(b.displayNameFa, 'fa'));
}

export async function locationsOfVet(
  database: DbClient,
  vetAccountId: string,
): Promise<readonly VetLocationRecord[]> {
  return database.select().from(vetLocations).where(eq(vetLocations.vetAccountId, vetAccountId));
}

export async function findLocation(database: DbClient, id: string): Promise<VetLocationRecord | null> {
  const [row] = await database.select().from(vetLocations).where(eq(vetLocations.id, id)).limit(1);
  return row ?? null;
}

// ── Finder ────────────────────────────────────────────────────────────────

export interface FinderQuery {
  readonly context: VisitContextName;
  /** One box searching veterinarian, centre and neighbourhood (§11.1). */
  readonly term?: string | null;
  readonly cityFa?: string | null;
  readonly origin?: { readonly lat: number; readonly lng: number } | null;
  readonly maxDistanceKm?: number | null;
}

export interface FinderResult {
  readonly location: VetLocationRecord;
  readonly vetAccountId: string;
  readonly vetNameFa: string;
  readonly councilCode: string;
  readonly vetPhone: string | null;
  readonly distanceKm: number | null;
}

/**
 * Finder query — §11.1, D02.
 *
 * The eligibility of the veterinarian is a SQL condition rather than a filter
 * applied afterwards, so a veterinarian who cannot accept new work never
 * reaches the result list. The location conditions are applied on the same
 * query for the same reason. Nothing here sorts by an appointment: no slot,
 * calendar or earliest-availability concept exists in this product.
 */
export async function searchFinder(
  database: DbClient,
  query: FinderQuery,
): Promise<readonly FinderResult[]> {
  const term = trimmed(query.term);
  const like = term ? '%' + term + '%' : null;
  const context = query.context;

  const rows = await database
    .select({
      location: vetLocations,
      vetAccountId: vetProfiles.accountId,
      vetNameFa: vetProfiles.displayNameFa,
      councilCode: vetProfiles.councilCode,
      vetPhone: vetProfiles.phone,
    })
    .from(vetLocations)
    .innerJoin(vetProfiles, eq(vetProfiles.accountId, vetLocations.vetAccountId))
    .where(
      and(
        eq(vetLocations.isActive, true),
        eq(vetLocations.licenceStatus, 'VALID'),
        // A location missing any mandatory facility of this context is absent,
        // not offered with a reduced service (§11.1).
        context === 'MICROCHIP'
          ? and(eq(vetLocations.canImplantMicrochip, true), eq(vetLocations.canDrawBloodSample, true))
          : context === 'DNA'
            ? eq(vetLocations.canDrawBloodSample, true)
            : eq(vetLocations.canPregnancyCheck, true),
        // Owned profiles always have a verified code; the join on account already excludes unowned ones.
        sql`${vetProfiles.councilCode} is not null`,
        sql`${vetLocations.cityFa} is not null`,
        sql`${vetLocations.addressFa} is not null`,
        sql`${vetLocations.phone} is not null`,
        // Only a veterinarian who may accept new work at all (§7.1, §11.1).
        sql`exists (
          select 1 from account_role r
          where r.account_id = ${vetLocations.vetAccountId}
            and r.role = 'TRUSTED_VET'
            and r.status = 'ACTIVE'
        )`,
        sql`exists (
          select 1 from membership m
          where m.account_id = ${vetLocations.vetAccountId} and m.status = 'ACTIVE'
        )`,
        query.cityFa ? eq(vetLocations.cityFa, query.cityFa) : undefined,
        like
          ? or(
              ilike(vetProfiles.displayNameFa, like),
              ilike(vetLocations.nameFa, like),
              ilike(sql`coalesce(${vetLocations.neighborhoodFa}, '')`, like),
            )
          : undefined,
      ),
    );

  const origin = query.origin ?? null;
  const withDistance = rows.map((row) => ({
    location: row.location,
    vetAccountId: row.vetAccountId!,
    vetNameFa: row.vetNameFa,
    councilCode: row.councilCode!,
    vetPhone: row.vetPhone,
    distanceKm:
      origin && row.location.latitude !== null && row.location.longitude !== null
        ? distanceKm(origin, { lat: row.location.latitude, lng: row.location.longitude })
        : null,
  }));

  const limited =
    origin && query.maxDistanceKm
      ? withDistance.filter((row) => row.distanceKm !== null && row.distanceKm <= query.maxDistanceKm!)
      : withDistance;

  // Distance when it is known, then name. There is no earliest-slot ordering.
  return limited.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;
    return a.location.nameFa.localeCompare(b.location.nameFa, 'fa');
  });
}

/** Cities that actually have an eligible location, for the filter control. */
export async function finderCities(
  database: DbClient,
  context: VisitContextName,
): Promise<readonly string[]> {
  const rows = await searchFinder(database, { context });
  return [...new Set(rows.map((row) => row.location.cityFa).filter((c): c is string => c !== null))].sort(
    (a, b) => a.localeCompare(b, 'fa'),
  );
}
