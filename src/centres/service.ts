/**
 * Veterinary centres — Requirements-Phase-2 §9, §19, §20, §22, §23 (PROMPT-008).
 *
 * A centre is an organisation; each of its branches is a `vet_location` row —
 * the same table Phase 1 uses — so a branch is never a second copy of a place
 * (P2-D15, DEC-0167). A branch created here carries no licence and no service
 * capability, and a branch that belongs to no veterinarian has no owner
 * account, so the Finder and every Phase 1 flow (which join on that account)
 * cannot see it.
 *
 * Who manages a centre (DEC-0168): the superadmin any centre; the review
 * operator publication and the licence (moderation and verification); the
 * owning account its content, branches and members. The owner arrives by claim
 * in PROMPT-009 or by the superadmin assigning one here.
 */
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, species } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import {
  centreFacilities,
  centreFacilityLinks,
  centreMembers,
  centreServiceLinks,
  centreServices,
  centreSpeciesLinks,
  centreTypes,
  centres,
  locationHours,
  vetLocations,
  vetProfiles,
} from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { promotedTargetIds } from '../advertising/service.ts';
import { primaryOf } from '../admin/merge.ts';
import { compareRanked, promotedWhenRelevant, rankTier } from '../search/model.ts';
import { normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';
import { directoryReferenceData } from '../vets/directory.ts';
import {
  centreCompleteness,
  centrePublishBlockers,
  hoursProblem,
  isCentreStatus,
  isLicenceStatus,
  parseClock,
  publicLicence,
  type CentreCompletenessInput,
  type CentreStatus,
  type HoursRowInput,
  type LicenceStatusName,
} from './model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

type CentreRow = typeof centres.$inferSelect;
type LocationRow = typeof vetLocations.$inferSelect;
type HoursRow = typeof locationHours.$inferSelect;
export type CentreRecord = CentreRow;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^centre-[0-9a-f]{10}$/;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const OWNER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
const BRANCH_KINDS = ['CLINIC', 'HOSPITAL', 'CENTRE'] as const;

type Manager = 'ADMIN' | 'REVIEW' | 'OWNER';

function managerOf(actor: Actor, ownerAccountId: string | null): Manager | null {
  if (actor.context === 'SUPERADMIN') return 'ADMIN';
  if (actor.context === 'REVIEW_OPERATOR') return 'REVIEW';
  if (ownerAccountId !== null && ownerAccountId === actor.accountId && OWNER_CONTEXTS.includes(actor.context)) return 'OWNER';
  return null;
}

function assertManager(actor: Actor, ownerAccountId: string | null, allowed: readonly Manager[]): Manager {
  const manager = managerOf(actor, ownerAccountId);
  if (manager === null || !allowed.includes(manager)) {
    throw forbidden('این مرکز را فقط مدیر ثبت‌شده آن، اپراتور بررسی یا سوپرادمین تغییر می‌دهد.');
  }
  return manager;
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

function reasonFor(manager: Manager, reason: string | null | undefined): string | null {
  const out = bounded(reason, 500, 'دلیل');
  if (out === null && manager !== 'OWNER') throw validation('دلیل این تغییر را بنویسید.');
  return out;
}

/** A public address that is not the internal id and cannot be guessed from it (§20). */
export const newCentreSlug = (): string => 'centre-' + randomBytes(5).toString('hex');

function diffOf(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      before[key] = previous[key];
      after[key] = next[key];
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 };
}

async function centreById(tx: DbClient, centreId: string): Promise<CentreRow> {
  const [row] = UUID.test(centreId) ? await tx.select().from(centres).where(eq(centres.id, centreId)).limit(1) : [];
  if (!row) throw notFound('مرکز پیدا نشد.');
  return row;
}

async function bumpCentre(tx: DbClient, current: CentreRow, values: Record<string, unknown>): Promise<CentreRow> {
  const [row] = await tx
    .update(centres)
    .set({ ...values, version: current.version + 1, updatedAt: new Date() })
    .where(and(eq(centres.id, current.id), eq(centres.version, current.version)))
    .returning();
  if (!row) throw conflict(STALE);
  return row;
}

// ── Reference data ───────────────────────────────────────────────────────

export async function centreReferenceData(database: DbClient) {
  const [directory, typeRows, serviceRows, facilityRows] = await Promise.all([
    directoryReferenceData(database),
    database.select().from(centreTypes).where(eq(centreTypes.isActive, true)).orderBy(asc(centreTypes.sortOrder)),
    database.select().from(centreServices).where(eq(centreServices.isActive, true)).orderBy(asc(centreServices.sortOrder)),
    database.select().from(centreFacilities).where(eq(centreFacilities.isActive, true)).orderBy(asc(centreFacilities.sortOrder)),
  ]);
  return {
    provinces: directory.provinces,
    cities: directory.cities,
    species: directory.species,
    types: typeRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    services: serviceRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    facilities: facilityRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
  };
}

// ── Facts of one centre ──────────────────────────────────────────────────

export interface CentreBranch extends LocationRow {
  readonly provinceNameFa: string | null;
  readonly cityNameFa: string | null;
  readonly hours: readonly HoursRow[];
}

export interface CentreFacts {
  readonly centre: CentreRow;
  readonly typeNameFa: string;
  readonly branches: readonly CentreBranch[];
  readonly serviceCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly facilityCodes: readonly string[];
  readonly members: ReadonlyArray<{
    id: string;
    vetProfileId: string;
    status: string;
    roleFa: string | null;
    version: number;
    nameFa: string;
    publicSlug: string | null;
    publicStatus: string;
  }>;
  readonly listed: { readonly provinceCode: string; readonly provinceNameFa: string; readonly cityNameFa: string } | null;
}

async function loadFacts(database: DbClient, rows: readonly CentreRow[]): Promise<CentreFacts[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [branchRows, serviceRows, speciesRows, facilityRows, memberRows, typeRows, provinceRows, cityRows] = await Promise.all([
    database.select().from(vetLocations).where(inArray(vetLocations.centreId, ids)),
    database.select().from(centreServiceLinks).where(inArray(centreServiceLinks.centreId, ids)),
    database.select().from(centreSpeciesLinks).where(inArray(centreSpeciesLinks.centreId, ids)),
    database.select().from(centreFacilityLinks).where(inArray(centreFacilityLinks.centreId, ids)),
    database
      .select({ member: centreMembers, nameFa: vetProfiles.displayNameFa, publicSlug: vetProfiles.publicSlug, publicStatus: vetProfiles.publicStatus })
      .from(centreMembers)
      .innerJoin(vetProfiles, eq(vetProfiles.id, centreMembers.vetProfileId))
      .where(inArray(centreMembers.centreId, ids)),
    database.select().from(centreTypes),
    database.select().from(provinces),
    database.select().from(cities),
  ]);
  const branchIds = branchRows.map((row) => row.id);
  const hourRows = branchIds.length > 0 ? await database.select().from(locationHours).where(inArray(locationHours.locationId, branchIds)) : [];
  const provinceName = new Map(provinceRows.map((row) => [row.code, row.nameFa]));
  const cityById = new Map(cityRows.map((row) => [row.id, row]));
  const typeName = new Map(typeRows.map((row) => [row.code, row.nameFa]));

  return rows.map((centre) => {
    const listedCity = centre.listedCityId ? cityById.get(centre.listedCityId) : undefined;
    return {
      centre,
      typeNameFa: typeName.get(centre.typeCode) ?? centre.typeCode,
      branches: branchRows
        .filter((row) => row.centreId === centre.id)
        .map((row) => ({
          ...row,
          provinceNameFa: row.provinceCode ? (provinceName.get(row.provinceCode) ?? null) : null,
          cityNameFa: row.cityId ? (cityById.get(row.cityId)?.nameFa ?? null) : null,
          hours: hourRows.filter((hour) => hour.locationId === row.id).sort((a, b) => a.weekday - b.weekday),
        }))
        .sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
      serviceCodes: serviceRows.filter((row) => row.centreId === centre.id).map((row) => row.serviceCode).sort(),
      speciesCodes: speciesRows.filter((row) => row.centreId === centre.id).map((row) => row.speciesCode).sort(),
      facilityCodes: facilityRows.filter((row) => row.centreId === centre.id).map((row) => row.facilityCode).sort(),
      members: memberRows
        .filter((row) => row.member.centreId === centre.id)
        .map((row) => ({
          id: row.member.id,
          vetProfileId: row.member.vetProfileId,
          status: row.member.status,
          roleFa: row.member.roleFa,
          version: row.member.version,
          nameFa: row.nameFa,
          publicSlug: row.publicSlug,
          publicStatus: row.publicStatus,
        })),
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

export const publicBranchesOf = (facts: CentreFacts): CentreBranch[] =>
  facts.branches.filter((branch) => branch.isPublic && branch.isActive);

export function completenessInputOf(facts: CentreFacts): CentreCompletenessInput {
  const shown = publicBranchesOf(facts);
  return {
    aboutFa: facts.centre.aboutFa,
    phone: facts.centre.phone,
    serviceCount: facts.serviceCodes.length,
    speciesCount: facts.speciesCodes.length,
    facilityCount: facts.facilityCodes.length,
    publicBranchesWithCity: shown.filter((branch) => branch.cityId !== null).length,
    branchesWithHours: shown.filter((branch) => branch.hours.length > 0 || branch.isOpen24h).length,
    acceptedMembers: facts.members.filter((member) => member.status === 'ACCEPTED').length,
    licenceRecorded: facts.centre.licenceNumber !== null || facts.centre.licenceStatus !== 'NONE',
  };
}

const ownershipOf = (centre: CentreRow) => ({ owned: centre.ownerAccountId !== null, hasListedCity: centre.listedCityId !== null });

// ── Editing ──────────────────────────────────────────────────────────────

export interface CreateCentreInput {
  readonly typeCode: string;
  readonly displayNameFa: string;
  readonly cityId?: string | null;
  readonly contactFa?: string | null;
  readonly sourceFa?: string | null;
  readonly reason: string;
  readonly confirmedNotDuplicate?: boolean;
}

/** A new centre record, created by the superadmin or from a reviewed suggestion (§10). */
export async function createCentre(database: Database, actor: Actor, input: CreateCentreInput): Promise<CentreRow> {
  const manager = assertManager(actor, null, ['ADMIN', 'REVIEW']);
  const reason = reasonFor(manager, input.reason);
  const displayNameFa = bounded(input.displayNameFa, 160, 'نام مرکز');
  if (displayNameFa === null) throw validation('نام مرکز را بنویسید.');
  const listedContactFa = bounded(input.contactFa, 300, 'تماس یا نشانی عمومی');
  const sourceFa = bounded(input.sourceFa, 300, 'منبع اطلاعات');
  const cityId = text(input.cityId);
  if (cityId !== null && !UUID.test(cityId)) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');

  return database.transaction(async (tx) => {
    const [type] = await tx.select().from(centreTypes).where(eq(centreTypes.code, text(input.typeCode) ?? '')).limit(1);
    if (!type) throw validation('نوع مرکز را انتخاب کنید.');
    if (cityId !== null) {
      const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1);
      if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
    }
    const normalized = normalizeForSearch(displayNameFa);
    const similar = (await tx.select({ displayNameFa: centres.displayNameFa }).from(centres)).filter(
      (row) => normalizeForSearch(row.displayNameFa) === normalized,
    );
    if (similar.length > 0 && input.confirmedNotDuplicate !== true) {
      throw conflict('مرکزی با همین نام ثبت شده است؛ اگر مرکز دیگری است، تأیید «تکراری نیست» را بزنید.');
    }

    const [row] = await tx
      .insert(centres)
      .values({ typeCode: type.code, displayNameFa, listedCityId: cityId, listedContactFa, sourceFa })
      .returning();
    await recordAudit(tx, actor, {
      action: 'CENTRE_CREATED',
      targetType: 'CENTRE',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { typeCode: type.code, displayNameFa, listedCityId: cityId, sourceFa },
      reason,
    });
    return row!;
  });
}

export interface CentreProfileInput {
  readonly centreId: string;
  readonly expectedVersion: number;
  readonly typeCode: string;
  readonly displayNameFa: string;
  readonly aboutFa: string | null;
  readonly phone: string | null;
  readonly websiteUrl: string | null;
  readonly serviceCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly facilityCodes: readonly string[];
  readonly reason?: string | null;
}

async function assertCodes(
  tx: DbClient,
  table: typeof centreServices | typeof centreFacilities,
  codes: readonly string[],
  labelFa: string,
): Promise<void> {
  if (codes.length === 0) return;
  const known = await tx.select({ code: table.code }).from(table).where(and(inArray(table.code, [...codes]), eq(table.isActive, true)));
  if (known.length !== codes.length) throw validation(labelFa + ' انتخاب‌شده در فهرست نیست.');
}

/** What the public page says. Only changed fields reach the audit history, each with its previous value. */
export async function updateCentreProfile(database: Database, actor: Actor, input: CentreProfileInput): Promise<CentreRow> {
  const websiteUrl = bounded(input.websiteUrl, 300, 'نشانی وب‌سایت');
  if (websiteUrl !== null && !/^https?:\/\/[^\s]+$/i.test(websiteUrl)) throw validation('نشانی وب‌سایت باید با http یا https شروع شود.');
  const next = {
    typeCode: text(input.typeCode) ?? '',
    displayNameFa: bounded(input.displayNameFa, 160, 'نام مرکز') ?? '',
    aboutFa: bounded(input.aboutFa, 4000, 'معرفی مرکز'),
    phone: bounded(input.phone, 20, 'تلفن'),
    websiteUrl,
    serviceCodes: [...new Set(input.serviceCodes)].sort(),
    speciesCodes: [...new Set(input.speciesCodes)].sort(),
    facilityCodes: [...new Set(input.facilityCodes)].sort(),
  };
  if (next.displayNameFa === '') throw validation('نام مرکز را بنویسید.');

  return database.transaction(async (tx) => {
    const current = await centreById(tx, input.centreId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const [type] = await tx.select().from(centreTypes).where(eq(centreTypes.code, next.typeCode)).limit(1);
    if (!type) throw validation('نوع مرکز را انتخاب کنید.');
    await assertCodes(tx, centreServices, next.serviceCodes, 'خدمت');
    await assertCodes(tx, centreFacilities, next.facilityCodes, 'امکانات');
    if (next.speciesCodes.length > 0) {
      const known = await tx.select({ code: species.code }).from(species).where(inArray(species.code, next.speciesCodes));
      if (known.length !== next.speciesCodes.length) throw validation('گونه انتخاب‌شده در فهرست گونه‌ها نیست.');
    }

    const [facts] = await loadFacts(tx, [current]);
    const previous = {
      typeCode: current.typeCode,
      displayNameFa: current.displayNameFa,
      aboutFa: current.aboutFa,
      phone: current.phone,
      websiteUrl: current.websiteUrl,
      serviceCodes: facts!.serviceCodes,
      speciesCodes: facts!.speciesCodes,
      facilityCodes: facts!.facilityCodes,
    };
    const diff = diffOf(previous, next);
    if (!diff.changed) return current;

    const row = await bumpCentre(tx, current, {
      typeCode: next.typeCode,
      displayNameFa: next.displayNameFa,
      aboutFa: next.aboutFa,
      phone: next.phone,
      websiteUrl: next.websiteUrl,
    });
    if ('serviceCodes' in diff.after) {
      await tx.delete(centreServiceLinks).where(eq(centreServiceLinks.centreId, row.id));
      if (next.serviceCodes.length > 0) {
        await tx.insert(centreServiceLinks).values(next.serviceCodes.map((serviceCode) => ({ centreId: row.id, serviceCode })));
      }
    }
    if ('speciesCodes' in diff.after) {
      await tx.delete(centreSpeciesLinks).where(eq(centreSpeciesLinks.centreId, row.id));
      if (next.speciesCodes.length > 0) {
        await tx.insert(centreSpeciesLinks).values(next.speciesCodes.map((speciesCode) => ({ centreId: row.id, speciesCode })));
      }
    }
    if ('facilityCodes' in diff.after) {
      await tx.delete(centreFacilityLinks).where(eq(centreFacilityLinks.centreId, row.id));
      if (next.facilityCodes.length > 0) {
        await tx.insert(centreFacilityLinks).values(next.facilityCodes.map((facilityCode) => ({ centreId: row.id, facilityCode })));
      }
    }
    await recordAudit(tx, actor, {
      action: 'CENTRE_PROFILE_UPDATED',
      targetType: 'CENTRE',
      targetId: row.id,
      targetVersion: row.version,
      before: diff.before,
      after: diff.after,
      reason,
    });
    return row;
  });
}

/**
 * The centre's licence, exactly as recorded by whoever checked it. The owner
 * cannot verify their own centre: this is the Verification axis (§9, P2-D05).
 */
export async function setCentreLicence(
  database: Database,
  actor: Actor,
  input: { centreId: string; expectedVersion: number; licenceNumber: string | null; licenceStatus: string; reason: string },
  now: Date = new Date(),
): Promise<CentreRow> {
  if (!isLicenceStatus(input.licenceStatus)) throw validation('وضعیت مجوز معتبر نیست.');
  const status: LicenceStatusName = input.licenceStatus;
  const licenceNumber = bounded(input.licenceNumber, 60, 'شماره مجوز');
  if (status !== 'NONE' && licenceNumber === null) throw validation('برای ثبت وضعیت مجوز، شماره آن را بنویسید.');

  return database.transaction(async (tx) => {
    const current = await centreById(tx, input.centreId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'REVIEW']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    const row = await bumpCentre(tx, current, {
      licenceNumber,
      licenceStatus: status,
      licenceVerifiedAt: status === 'VALID' ? now : null,
    });
    await recordAudit(tx, actor, {
      action: 'CENTRE_LICENCE_RECORDED',
      targetType: 'CENTRE',
      targetId: row.id,
      targetVersion: row.version,
      before: { licenceNumber: current.licenceNumber, licenceStatus: current.licenceStatus },
      after: { licenceNumber: row.licenceNumber, licenceStatus: row.licenceStatus },
      reason,
    });
    return row;
  });
}

/** The owning account, assigned by the superadmin. PROMPT-009 adds the claim that does this by review. */
export async function assignCentreOwner(
  database: Database,
  actor: Actor,
  input: { centreId: string; expectedVersion: number; mobile: string; reason: string },
  now: Date = new Date(),
): Promise<CentreRow> {
  if (actor.context !== 'SUPERADMIN') throw forbidden('واگذاری مدیریت مرکز فقط از محیط سوپرادمین ممکن است.');
  const reason = reasonFor('ADMIN', input.reason);
  const mobile = text(input.mobile) ?? '';

  return database.transaction(async (tx) => {
    const current = await centreById(tx, input.centreId);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.ownerAccountId !== null) throw conflict('این مرکز همین حالا مدیر دارد.');
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile)).limit(1);
    if (!account) throw notFound('حسابی با این شماره پیدا نشد؛ صاحب شماره باید یک‌بار وارد همزیست شده باشد.');

    const row = await bumpCentre(tx, current, { ownerAccountId: account.id, claimedAt: now });
    await recordAudit(tx, actor, {
      action: 'CENTRE_OWNER_ASSIGNED',
      targetType: 'CENTRE',
      targetId: row.id,
      targetVersion: row.version,
      before: { ownerAccountId: null },
      after: { ownerAccountId: account.id },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: account.id,
      kind: 'CENTRE_OWNER_ASSIGNED',
      titleFa: 'مدیریت مرکز ' + row.displayNameFa + ' به شما سپرده شد',
      bodyFa: reason ?? '',
      resume: { entity: { type: 'CENTRE', id: row.id }, step: 'CENTRE_PROFILE', originRoute: '/account/centres/' + row.id },
    });
    return row;
  });
}

/** DRAFT → PUBLISHED → HIDDEN → PUBLISHED, with the moderation rule of DEC-0166. */
export async function changeCentreStatus(
  database: Database,
  actor: Actor,
  input: { centreId: string; expectedVersion: number; to: string; reason?: string | null },
): Promise<CentreRow> {
  if (!isCentreStatus(input.to) || input.to === 'DRAFT') throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const to: CentreStatus = input.to;

  return database.transaction(async (tx) => {
    const current = await centreById(tx, input.centreId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'REVIEW', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.publicStatus === to) throw validation('مرکز همین حالا در این وضعیت است.');
    if (to === 'HIDDEN' && current.publicStatus === 'DRAFT') throw validation('پیش‌نویسی که منتشر نشده پنهان‌کردن ندارد.');
    if (to === 'PUBLISHED' && manager === 'OWNER' && current.hiddenByReview) {
      throw conflict('این مرکز را بررسی همزیست پنهان کرده است و فقط همان‌جا دوباره منتشر می‌شود.');
    }
    if (to === 'PUBLISHED') {
      const [facts] = await loadFacts(tx, [current]);
      const blockers = centrePublishBlockers(completenessInputOf(facts!), ownershipOf(current));
      if (blockers.length > 0) throw validation(blockers.join(' '));
    }

    const now = new Date();
    const row = await bumpCentre(tx, current, {
      publicStatus: to,
      publicSlug: current.publicSlug ?? newCentreSlug(),
      publicPublishedAt: current.publicPublishedAt ?? (to === 'PUBLISHED' ? now : null),
      hiddenByReview: to === 'HIDDEN' && manager !== 'OWNER',
    });
    await recordAudit(tx, actor, {
      action: 'CENTRE_STATUS_CHANGED',
      targetType: 'CENTRE',
      targetId: row.id,
      targetVersion: row.version,
      before: { publicStatus: current.publicStatus, hiddenByReview: current.hiddenByReview },
      after: { publicStatus: row.publicStatus, publicSlug: row.publicSlug, hiddenByReview: row.hiddenByReview },
      reason,
    });
    return row;
  });
}

// ── Branches ─────────────────────────────────────────────────────────────

export interface BranchInput {
  readonly nameFa: string;
  readonly kind: string;
  readonly cityId: string;
  readonly neighborhoodFa?: string | null;
  readonly addressFa?: string | null;
  readonly phone?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly isOpen24h?: boolean;
  readonly hoursNoteFa?: string | null;
  readonly isPublic?: boolean;
  /** Announced hours, saved with the branch so nothing typed here is lost. */
  readonly hours?: readonly HoursRowInput[];
}

async function placeOf(tx: DbClient, cityId: string | null) {
  const id = text(cityId);
  if (id === null || !UUID.test(id)) throw validation('شهر شعبه را انتخاب کنید.');
  const [city] = await tx.select().from(cities).where(eq(cities.id, id)).limit(1);
  if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
  const [province] = await tx.select().from(provinces).where(eq(provinces.code, city.provinceCode)).limit(1);
  return { cityId: id, city, provinceNameFa: province?.nameFa ?? null };
}

function coordinate(value: number | null | undefined, max: number, labelFa: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Math.abs(value) > max) throw validation(labelFa + ' معتبر نیست.');
  return value;
}

/**
 * A branch is a new `vet_location` row without a veterinarian account, without
 * a licence and without any service capability, so it can never appear in the
 * Finder or take a Phase 1 referral (DEC-0167).
 */
export async function addCentreBranch(
  database: Database,
  actor: Actor,
  centreId: string,
  input: BranchInput,
): Promise<LocationRow> {
  const nameFa = bounded(input.nameFa, 120, 'نام شعبه');
  if (nameFa === null) throw validation('نام شعبه را بنویسید.');
  if (!(BRANCH_KINDS as readonly string[]).includes(input.kind)) throw validation('نوع شعبه معتبر نیست.');
  const values = {
    neighborhoodFa: bounded(input.neighborhoodFa, 120, 'محله'),
    addressFa: bounded(input.addressFa, 300, 'نشانی'),
    phone: bounded(input.phone, 20, 'تلفن'),
    hoursNoteFa: bounded(input.hoursNoteFa, 300, 'ساعات اطلاع‌رسانی'),
    latitude: coordinate(input.latitude, 90, 'عرض جغرافیایی'),
    longitude: coordinate(input.longitude, 180, 'طول جغرافیایی'),
  };

  const announced = (input.hours ?? [])
    .map((row) => ({ weekday: row.weekday, opensAt: clockOrThrow(row.opensAt), closesAt: clockOrThrow(row.closesAt) }))
    .filter((row) => {
      const problem = hoursProblem(row);
      if (problem) throw validation(problem);
      return row.opensAt !== null && row.closesAt !== null;
    });

  return database.transaction(async (tx) => {
    const centre = await centreById(tx, centreId);
    const manager = assertManager(actor, centre.ownerAccountId, ['ADMIN', 'OWNER']);
    const place = await placeOf(tx, input.cityId);
    const [row] = await tx
      .insert(vetLocations)
      .values({
        vetAccountId: null,
        centreId: centre.id,
        nameFa,
        kind: input.kind as (typeof BRANCH_KINDS)[number],
        provinceFa: place.provinceNameFa,
        cityFa: place.city.nameFa,
        provinceCode: place.city.provinceCode,
        cityId: place.cityId,
        ...values,
        isOpen24h: input.isOpen24h === true,
        isPublic: input.isPublic !== false,
        licenceStatus: 'NONE',
      })
      .returning();
    if (announced.length > 0) {
      await tx.insert(locationHours).values(
        announced.map((entry) => ({ locationId: row!.id, weekday: entry.weekday, opensAt: entry.opensAt!, closesAt: entry.closesAt! })),
      );
    }
    await recordAudit(tx, actor, {
      action: 'CENTRE_BRANCH_CREATED',
      targetType: 'VET_LOCATION',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { centreId: centre.id, nameFa, cityId: place.cityId, licenceStatus: 'NONE', hours: announced.length, addedBy: manager },
    });
    return row!;
  });
}

async function branchOf(tx: DbClient, locationId: string): Promise<{ branch: LocationRow; centre: CentreRow }> {
  const [branch] = UUID.test(locationId) ? await tx.select().from(vetLocations).where(eq(vetLocations.id, locationId)).limit(1) : [];
  if (!branch || branch.centreId === null) throw notFound('شعبه پیدا نشد.');
  return { branch, centre: await centreById(tx, branch.centreId) };
}

export interface BranchUpdateInput {
  readonly locationId: string;
  readonly expectedVersion: number;
  readonly nameFa: string;
  readonly kind: string;
  readonly cityId: string;
  readonly neighborhoodFa?: string | null;
  readonly addressFa?: string | null;
  readonly phone?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly isOpen24h?: boolean;
  readonly hoursNoteFa?: string | null;
  readonly isPublic?: boolean;
  readonly isActive?: boolean;
  readonly hours?: readonly HoursRowInput[];
  readonly reason?: string | null;
}

/** Place, visibility and announced hours of one branch. Licence and capabilities stay untouched. */
export async function updateCentreBranch(database: Database, actor: Actor, input: BranchUpdateInput): Promise<LocationRow> {
  const nameFa = bounded(input.nameFa, 120, 'نام شعبه');
  if (nameFa === null) throw validation('نام شعبه را بنویسید.');
  if (!(BRANCH_KINDS as readonly string[]).includes(input.kind)) throw validation('نوع شعبه معتبر نیست.');
  const hours = (input.hours ?? []).map((row) => ({
    weekday: row.weekday,
    opensAt: clockOrThrow(row.opensAt),
    closesAt: clockOrThrow(row.closesAt),
  }));
  for (const row of hours) {
    const problem = hoursProblem(row);
    if (problem) throw validation(problem);
  }

  return database.transaction(async (tx) => {
    const { branch, centre } = await branchOf(tx, input.locationId);
    const manager = assertManager(actor, centre.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (branch.version !== input.expectedVersion) throw conflict(STALE);
    const place = await placeOf(tx, input.cityId);
    const isActive = input.isActive !== false;
    const isPublic = input.isPublic === true;
    if (isPublic && !isActive) throw validation('شعبه غیرفعال عمومی نمی‌شود.');

    const next = {
      nameFa,
      kind: input.kind as (typeof BRANCH_KINDS)[number],
      provinceFa: place.provinceNameFa,
      cityFa: place.city.nameFa,
      provinceCode: place.city.provinceCode,
      cityId: place.cityId,
      neighborhoodFa: bounded(input.neighborhoodFa, 120, 'محله'),
      addressFa: bounded(input.addressFa, 300, 'نشانی'),
      phone: bounded(input.phone, 20, 'تلفن'),
      latitude: coordinate(input.latitude, 90, 'عرض جغرافیایی'),
      longitude: coordinate(input.longitude, 180, 'طول جغرافیایی'),
      hoursNoteFa: bounded(input.hoursNoteFa, 300, 'ساعات اطلاع‌رسانی'),
      isOpen24h: input.isOpen24h === true,
      isPublic,
      isActive,
    };
    const previous = Object.fromEntries(Object.keys(next).map((key) => [key, (branch as Record<string, unknown>)[key]]));
    const diff = diffOf(previous, next);

    const [row] = await tx
      .update(vetLocations)
      .set({ ...next, version: branch.version + 1, updatedAt: new Date() })
      .where(and(eq(vetLocations.id, branch.id), eq(vetLocations.version, branch.version)))
      .returning();
    if (!row) throw conflict(STALE);

    const existing = await tx.select().from(locationHours).where(eq(locationHours.locationId, branch.id));
    const announced = hours.filter((entry) => entry.opensAt !== null && entry.closesAt !== null);
    const changedHours =
      JSON.stringify(existing.map((e) => [e.weekday, e.opensAt, e.closesAt]).sort()) !==
      JSON.stringify(announced.map((e) => [e.weekday, e.opensAt, e.closesAt]).sort());
    if (input.hours !== undefined && changedHours) {
      await tx.delete(locationHours).where(eq(locationHours.locationId, branch.id));
      if (announced.length > 0) {
        await tx.insert(locationHours).values(
          announced.map((entry) => ({ locationId: branch.id, weekday: entry.weekday, opensAt: entry.opensAt!, closesAt: entry.closesAt! })),
        );
      }
    }

    await recordAudit(tx, actor, {
      action: 'CENTRE_BRANCH_UPDATED',
      targetType: 'VET_LOCATION',
      targetId: row.id,
      targetVersion: row.version,
      before: diff.before,
      after: { ...diff.after, ...(input.hours !== undefined && changedHours ? { hours: announced.length } : {}) },
      reason,
    });
    return row;
  });
}

function clockOrThrow(raw: string | null): string | null {
  try {
    return parseClock(raw);
  } catch {
    throw validation('ساعت را به شکل ۰۹:۰۰ بنویسید.');
  }
}

/**
 * A veterinarian's own Phase 1 location joined to a centre. The row is linked,
 * never copied, and its licence and capabilities are left exactly as they were,
 * so the Finder keeps reading the same data (P2-D15).
 */
export async function attachLocationToCentre(
  database: Database,
  actor: Actor,
  input: { locationId: string; centreId: string; expectedVersion?: number; reason: string },
): Promise<LocationRow> {
  if (actor.context !== 'SUPERADMIN') throw forbidden('پیوند محل کار موجود به مرکز فقط از محیط سوپرادمین ممکن است.');
  const reason = reasonFor('ADMIN', input.reason);

  return database.transaction(async (tx) => {
    const centre = await centreById(tx, input.centreId);
    const [branch] = UUID.test(input.locationId)
      ? await tx.select().from(vetLocations).where(eq(vetLocations.id, input.locationId)).limit(1)
      : [];
    if (!branch) throw notFound('محل کار پیدا نشد.');
    if (input.expectedVersion !== undefined && branch.version !== input.expectedVersion) throw conflict(STALE);
    // The real race guard: a place already linked is never taken from its centre here.
    if (branch.centreId !== null) throw conflict('این محل کار قبلاً به مرکزی پیوند خورده است.');

    const [row] = await tx
      .update(vetLocations)
      .set({ centreId: centre.id, version: branch.version + 1, updatedAt: new Date() })
      .where(and(eq(vetLocations.id, branch.id), eq(vetLocations.version, branch.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CENTRE_BRANCH_LINKED',
      targetType: 'VET_LOCATION',
      targetId: row.id,
      targetVersion: row.version,
      before: { centreId: null },
      after: { centreId: centre.id, vetAccountId: row.vetAccountId, licenceStatus: row.licenceStatus },
      reason,
    });
    return row;
  });
}

// ── Professional team ────────────────────────────────────────────────────

/** An invitation. The veterinarian appears on the page only after accepting it (§20). */
export async function inviteCentreMember(
  database: Database,
  actor: Actor,
  input: { centreId: string; vetRef: string; roleFa?: string | null; reason?: string | null },
): Promise<typeof centreMembers.$inferSelect> {
  const roleFa = bounded(input.roleFa, 120, 'سمت');
  const ref = text(input.vetRef);
  if (ref === null) throw validation('نشانی عمومی یا کد نظام دامپزشک را بنویسید.');

  return database.transaction(async (tx) => {
    const centre = await centreById(tx, input.centreId);
    const manager = assertManager(actor, centre.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    const code = unifyPersianLetters(ref).toUpperCase();
    const [vet] = await tx
      .select()
      .from(vetProfiles)
      .where(or(eq(vetProfiles.publicSlug, ref), eq(vetProfiles.councilCode, code)))
      .limit(1);
    if (!vet) throw notFound('دامپزشکی با این نشانی یا کد نظام پیدا نشد.');

    const [existing] = await tx
      .select()
      .from(centreMembers)
      .where(and(eq(centreMembers.centreId, centre.id), eq(centreMembers.vetProfileId, vet.id)))
      .limit(1);
    if (existing && existing.status !== 'REMOVED' && existing.status !== 'DECLINED') {
      throw conflict('این دامپزشک همین حالا در فهرست اعضای این مرکز است.');
    }

    const values = { roleFa, status: 'INVITED' as const, invitedByAccountId: actor.accountId, invitedAt: new Date(), respondedAt: null };
    const [row] = existing
      ? await tx
          .update(centreMembers)
          .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
          .where(and(eq(centreMembers.id, existing.id), eq(centreMembers.version, existing.version)))
          .returning()
      : await tx.insert(centreMembers).values({ centreId: centre.id, vetProfileId: vet.id, ...values }).returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'CENTRE_MEMBER_INVITED',
      targetType: 'CENTRE_MEMBER',
      targetId: row.id,
      targetVersion: row.version,
      after: { centreId: centre.id, vetProfileId: vet.id, roleFa },
      reason,
    });
    if (vet.accountId !== null) {
      await createNotification(tx, {
        recipientAccountId: vet.accountId,
        kind: 'CENTRE_MEMBER_INVITED',
        titleFa: 'دعوت به تیم حرفه‌ای ' + centre.displayNameFa,
        bodyFa: 'تا وقتی این دعوت را نپذیرید، نام شما در صفحه این مرکز نمایش داده نمی‌شود.',
        resume: { entity: { type: 'CENTRE_MEMBER', id: row.id }, step: 'CENTRE_INVITATION', originRoute: '/account/vet-profile' },
      });
    }
    return row;
  });
}

/** The veterinarian's own answer. Nobody else can accept on their behalf. */
export async function respondToCentreInvitation(
  database: Database,
  actor: Actor,
  input: { memberId: string; expectedVersion: number; accept: boolean },
  now: Date = new Date(),
): Promise<typeof centreMembers.$inferSelect> {
  return database.transaction(async (tx) => {
    const [row] = UUID.test(input.memberId)
      ? await tx.select().from(centreMembers).where(eq(centreMembers.id, input.memberId)).limit(1)
      : [];
    if (!row) throw notFound('دعوت پیدا نشد.');
    const [vet] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, row.vetProfileId)).limit(1);
    // Someone else's invitation is not found rather than forbidden.
    if (!vet || vet.accountId === null || vet.accountId !== actor.accountId || !OWNER_CONTEXTS.includes(actor.context)) {
      throw notFound('دعوت پیدا نشد.');
    }
    if (row.status !== 'INVITED') throw conflict('این دعوت پیش‌تر پاسخ داده شده است.');
    if (row.version !== input.expectedVersion) throw conflict(STALE);

    const [updated] = await tx
      .update(centreMembers)
      .set({ status: input.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now, version: row.version + 1, updatedAt: now })
      .where(and(eq(centreMembers.id, row.id), eq(centreMembers.version, row.version)))
      .returning();
    if (!updated) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: input.accept ? 'CENTRE_MEMBER_ACCEPTED' : 'CENTRE_MEMBER_DECLINED',
      targetType: 'CENTRE_MEMBER',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: row.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function removeCentreMember(
  database: Database,
  actor: Actor,
  input: { memberId: string; expectedVersion: number; reason?: string | null },
): Promise<typeof centreMembers.$inferSelect> {
  return database.transaction(async (tx) => {
    const [row] = UUID.test(input.memberId)
      ? await tx.select().from(centreMembers).where(eq(centreMembers.id, input.memberId)).limit(1)
      : [];
    if (!row) throw notFound('عضو پیدا نشد.');
    const centre = await centreById(tx, row.centreId);
    const manager = assertManager(actor, centre.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (row.status === 'REMOVED') throw conflict('این عضو پیش‌تر برداشته شده است.');
    if (row.version !== input.expectedVersion) throw conflict(STALE);

    const [updated] = await tx
      .update(centreMembers)
      .set({ status: 'REMOVED', respondedAt: new Date(), version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(centreMembers.id, row.id), eq(centreMembers.version, row.version)))
      .returning();
    if (!updated) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CENTRE_MEMBER_REMOVED',
      targetType: 'CENTRE_MEMBER',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: row.status },
      after: { status: 'REMOVED' },
      reason,
    });
    return updated;
  });
}

/** Invitations waiting for this veterinarian, for their own profile page. */
export async function myCentreInvitations(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ member: centreMembers, centreNameFa: centres.displayNameFa })
    .from(centreMembers)
    .innerJoin(centres, eq(centres.id, centreMembers.centreId))
    .innerJoin(vetProfiles, eq(vetProfiles.id, centreMembers.vetProfileId))
    .where(and(eq(vetProfiles.accountId, actor.accountId), eq(centreMembers.status, 'INVITED')));
  return rows.map((row) => ({ ...row.member, centreNameFa: row.centreNameFa }));
}

// ── Editors ──────────────────────────────────────────────────────────────

async function editorData(database: DbClient, centre: CentreRow) {
  const [facts] = await loadFacts(database, [centre]);
  const input = completenessInputOf(facts!);
  return {
    facts: facts!,
    completeness: centreCompleteness(input),
    blockers: centrePublishBlockers(input, ownershipOf(centre)),
    reference: await centreReferenceData(database),
  };
}

export type CentreEditorData = Awaited<ReturnType<typeof editorData>>;

export async function centreEditor(database: DbClient, actor: Actor, centreId: string): Promise<CentreEditorData | null> {
  if (!UUID.test(centreId)) return null;
  const [centre] = await database.select().from(centres).where(eq(centres.id, centreId)).limit(1);
  if (!centre) return null;
  // Reading is allowed for the same people who may change something.
  assertManager(actor, centre.ownerAccountId, ['ADMIN', 'REVIEW', 'OWNER']);
  return editorData(database, centre);
}

export async function manageableCentres(database: DbClient, actor: Actor) {
  const rows =
    actor.context === 'SUPERADMIN' || actor.context === 'REVIEW_OPERATOR'
      ? await database.select().from(centres).orderBy(asc(centres.displayNameFa))
      : OWNER_CONTEXTS.includes(actor.context)
        ? await database.select().from(centres).where(eq(centres.ownerAccountId, actor.accountId)).orderBy(asc(centres.displayNameFa))
        : [];
  const facts = await loadFacts(database, rows);
  return facts.map((entry) => ({
    centre: entry.centre,
    typeNameFa: entry.typeNameFa,
    branchCount: entry.branches.length,
    cityNameFa: publicBranchesOf(entry)[0]?.cityNameFa ?? entry.listed?.cityNameFa ?? null,
  }));
}

/** Phase 1 places of veterinarians that belong to no centre yet, for the linking form. */
export async function linkableLocations(database: DbClient, actor: Actor): Promise<{ id: string; label: string }[]> {
  if (actor.context !== 'SUPERADMIN') return [];
  const rows = await database
    .select({ id: vetLocations.id, nameFa: vetLocations.nameFa, cityFa: vetLocations.cityFa, vetNameFa: vetProfiles.displayNameFa })
    .from(vetLocations)
    .innerJoin(vetProfiles, eq(vetProfiles.accountId, vetLocations.vetAccountId))
    .where(and(isNull(vetLocations.centreId), eq(vetLocations.isActive, true)))
    .orderBy(asc(vetLocations.nameFa));
  return rows.map((row) => ({ id: row.id, label: [row.nameFa, row.cityFa, row.vetNameFa].filter(Boolean).join(' · ') }));
}

// ── Public ───────────────────────────────────────────────────────────────

async function publishedCentreRows(database: DbClient, slug?: string): Promise<CentreRow[]> {
  const rows = await database
    .select({ centre: centres })
    .from(centres)
    .leftJoin(accounts, eq(accounts.id, centres.ownerAccountId))
    .where(
      and(
        eq(centres.publicStatus, 'PUBLISHED'),
        or(isNull(centres.ownerAccountId), ne(accounts.status, 'DISABLED')),
        // A merged duplicate leaves the lists but keeps its own address (§21).
        slug === undefined ? isNull(centres.mergedIntoCentreId) : undefined,
        slug === undefined ? undefined : eq(centres.publicSlug, slug),
      ),
    );
  return rows.map((row) => row.centre);
}

function placesOf(entry: CentreFacts) {
  const branches = publicBranchesOf(entry);
  if (branches.length > 0) {
    return branches.map((branch) => ({
      provinceCode: branch.provinceCode,
      cityId: branch.cityId,
      cityNameFa: branch.cityNameFa,
      isOpen24h: branch.isOpen24h,
    }));
  }
  return entry.listed
    ? [{ provinceCode: entry.listed.provinceCode, cityId: entry.centre.listedCityId, cityNameFa: entry.listed.cityNameFa, isOpen24h: false }]
    : [];
}

/** A branch that is also a licensed Phase 1 place of a veterinarian (§11.1). */
const servesHamzist = (entry: CentreFacts): boolean =>
  entry.branches.some((branch) => branch.vetAccountId !== null && branch.licenceStatus === 'VALID' && branch.isActive);

export interface CentreQuery {
  readonly term?: string;
  readonly type?: string | null;
  readonly service?: string | null;
  readonly species?: string | null;
  readonly province?: string | null;
  readonly cityId?: string | null;
  readonly open24h?: boolean;
  readonly verified?: boolean;
  readonly page: number;
  readonly pageSize?: number;
}

export interface CentreCard {
  /** Public image of the record, served through /media while it stays published. */
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
  readonly slug: string;
  readonly nameFa: string;
  readonly typeFa: string;
  readonly servicesFa: readonly string[];
  readonly placesFa: readonly string[];
  readonly owned: boolean;
  readonly verified: boolean;
  readonly open24h: boolean;
  readonly serves: boolean;
  readonly complete: boolean;
  /** A live advertising package, shown with its own label and nothing implied. */
  readonly promoted: boolean;
}

export async function publishedCentres(database: DbClient, query: CentreQuery): Promise<Page<CentreCard> & { publishedTotal: number }> {
  const [facts, serviceRows] = await Promise.all([
    publishedCentreRows(database).then((rows) => loadFacts(database, rows)),
    database.select().from(centreServices),
  ]);
  const serviceName = new Map(serviceRows.map((row) => [row.code, row.nameFa]));
  const term = normalizeForSearch(query.term ?? '').trim();

  // ponytail: filtered in memory over published centres; PROMPT-012 search moves this into indexed queries.
  const filtered = facts
    .filter((entry) => {
      const places = placesOf(entry);
      if (query.type && entry.centre.typeCode !== query.type) return false;
      if (query.service && !entry.serviceCodes.includes(query.service)) return false;
      if (query.species && !entry.speciesCodes.includes(query.species)) return false;
      if (query.verified && entry.centre.licenceStatus !== 'VALID') return false;
      if (query.open24h && !places.some((place) => place.isOpen24h)) return false;
      if (
        (query.province || query.cityId) &&
        !places.some((place) => (!query.province || place.provinceCode === query.province) && (!query.cityId || place.cityId === query.cityId))
      ) {
        return false;
      }
      if (term !== '') {
        const haystack = [entry.centre.displayNameFa, ...publicBranchesOf(entry).map((branch) => branch.nameFa)].map(normalizeForSearch).join(' ');
        if (!haystack.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => a.centre.displayNameFa.localeCompare(b.centre.displayNameFa, 'fa'));

  // §15 bands: advertising among matching records first, then the recorded
  // axes. Being a Hamzist service partner is the centre's trust axis (DEC-0172).
  const promoted = await promotedTargetIds(database, 'CENTRE');
  const request = { page: query.page, pageSize: query.pageSize ?? 24 };
  const cards = filtered.map((entry) => ({
    slug: entry.centre.publicSlug!,
    nameFa: entry.centre.displayNameFa,
    imageFileId: entry.centre.imageFileId,
    imageAltFa: entry.centre.imageAltFa,
    typeFa: entry.typeNameFa,
    servicesFa: entry.serviceCodes.map((code) => serviceName.get(code) ?? code),
    placesFa: [...new Set(placesOf(entry).map((place) => place.cityNameFa).filter((city): city is string => city !== null))],
    owned: entry.centre.ownerAccountId !== null,
    verified: entry.centre.licenceStatus === 'VALID',
    open24h: placesOf(entry).some((place) => place.isOpen24h),
    serves: servesHamzist(entry),
    complete: centreCompleteness(completenessInputOf(entry)).complete,
    promoted: promotedWhenRelevant(promoted.has(entry.centre.id), true),
  }));
  const ranked = [...cards].sort((a, b) =>
    compareRanked(
      { tier: rankTier({ promoted: a.promoted, trusted: a.serves, verified: a.verified, complete: a.complete }), nameFa: a.nameFa },
      { tier: rankTier({ promoted: b.promoted, trusted: b.serves, verified: b.verified, complete: b.complete }), nameFa: b.nameFa },
    ),
  );
  const items = ranked.slice(offsetOf(request), offsetOf(request) + request.pageSize);
  return { ...pageOf(items, ranked.length, request), publishedTotal: facts.length };
}

export interface CentrePublicPage {
  /** Public image of the record, served through /media while it stays published. */
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
  readonly slug: string;
  /** Set when this centre was merged into another: its address points there (§21). */
  readonly primary: { readonly slug: string; readonly nameFa: string } | null;
  readonly nameFa: string;
  readonly typeFa: string;
  readonly aboutFa: string | null;
  readonly phone: string | null;
  readonly websiteUrl: string | null;
  readonly licence: { readonly statusFa: string; readonly number: string | null } | null;
  readonly verified: boolean;
  readonly serves: boolean;
  readonly owned: boolean;
  readonly servicesFa: readonly string[];
  readonly speciesFa: readonly string[];
  readonly facilitiesFa: readonly string[];
  readonly branches: ReadonlyArray<{
    id: string;
    nameFa: string;
    kind: string;
    provinceNameFa: string | null;
    cityNameFa: string | null;
    neighborhoodFa: string | null;
    addressFa: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    isOpen24h: boolean;
    hoursNoteFa: string | null;
    hours: ReadonlyArray<{ weekday: number; opensAt: string; closesAt: string }>;
  }>;
  readonly team: ReadonlyArray<{ nameFa: string; roleFa: string | null; slug: string | null }>;
  readonly listed: { readonly cityNameFa: string; readonly provinceNameFa: string; readonly contactFa: string | null } | null;
  readonly updatedAt: Date;
}

export async function centrePageBySlug(database: DbClient, slug: string): Promise<CentrePublicPage | null> {
  if (!SLUG.test(slug)) return null;
  const [centre] = await publishedCentreRows(database, slug);
  if (!centre) return null;
  const [[facts], serviceRows, facilityRows, speciesRows] = await Promise.all([
    loadFacts(database, [centre]),
    database.select().from(centreServices).orderBy(asc(centreServices.sortOrder)),
    database.select().from(centreFacilities).orderBy(asc(centreFacilities.sortOrder)),
    database.select().from(species).orderBy(asc(species.sortOrder)),
  ]);
  const branches = publicBranchesOf(facts!);
  return {
    slug,
    primary: await primaryOf(database, 'CENTRE', centre.mergedIntoCentreId),
    nameFa: centre.displayNameFa,
    imageFileId: centre.imageFileId,
    imageAltFa: centre.imageAltFa,
    typeFa: facts!.typeNameFa,
    aboutFa: centre.aboutFa,
    phone: centre.phone,
    websiteUrl: centre.websiteUrl,
    licence: publicLicence(centre.licenceStatus, centre.licenceNumber),
    verified: centre.licenceStatus === 'VALID',
    serves: servesHamzist(facts!),
    owned: centre.ownerAccountId !== null,
    servicesFa: serviceRows.filter((row) => facts!.serviceCodes.includes(row.code)).map((row) => row.nameFa),
    speciesFa: speciesRows.filter((row) => facts!.speciesCodes.includes(row.code)).map((row) => row.nameFa),
    facilitiesFa: facilityRows.filter((row) => facts!.facilityCodes.includes(row.code)).map((row) => row.nameFa),
    branches: branches.map((branch) => ({
      id: branch.id,
      nameFa: branch.nameFa,
      kind: branch.kind,
      provinceNameFa: branch.provinceNameFa,
      cityNameFa: branch.cityNameFa,
      neighborhoodFa: branch.neighborhoodFa,
      addressFa: branch.addressFa,
      phone: branch.phone,
      latitude: branch.latitude,
      longitude: branch.longitude,
      isOpen24h: branch.isOpen24h,
      hoursNoteFa: branch.hoursNoteFa,
      hours: branch.hours.map((hour) => ({ weekday: hour.weekday, opensAt: hour.opensAt, closesAt: hour.closesAt })),
    })),
    // Only veterinarians who accepted the invitation, and only their published pages are linked.
    team: facts!.members
      .filter((member) => member.status === 'ACCEPTED')
      .map((member) => ({
        nameFa: member.nameFa,
        roleFa: member.roleFa,
        slug: member.publicStatus === 'PUBLISHED' ? member.publicSlug : null,
      })),
    listed:
      branches.length === 0 && facts!.listed
        ? {
            cityNameFa: facts!.listed.cityNameFa,
            provinceNameFa: facts!.listed.provinceNameFa,
            contactFa: centre.ownerAccountId === null ? centre.listedContactFa : null,
          }
        : null,
    updatedAt: centre.updatedAt,
  };
}

export async function centreSitemapEntries(database: DbClient): Promise<{ path: string; lastModified: Date }[]> {
  const rows = await publishedCentreRows(database);
  return rows.map((row) => ({ path: '/centers/' + row.publicSlug, lastModified: row.updatedAt }));
}
