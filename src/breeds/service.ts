/**
 * Breed bank — Requirements-Phase-2 §6, §19, §22, §23 (PROMPT-003).
 *
 * Built on `reference_breed`, the row Phase 1 animals and kennels already point
 * at (P2-D15): nothing here creates a second breed record, moves an animal or
 * rewrites a kennel. Public readers take no actor and see only what is
 * published; every writer belongs to the superadmin environment, runs in one
 * transaction with its audit row, and refuses a stale version instead of
 * overwriting someone else's edit.
 */
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  breedGroups,
  breedMedicalClaims,
  breedSlugRedirects,
  referenceBreeds,
  species,
} from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import type { Actor } from '../authz/actor.ts';
import type { SitemapEntry } from '../seo/sitemap.ts';
import {
  BREED_CLAIM_KINDS,
  BREED_COATS,
  BREED_LEVELS,
  BREED_SIZES,
  LEVEL_ATTRIBUTES,
  canTransition,
  countryNameFa,
  isHttpUrl,
  isOneOf,
  isReviewDate,
  isValidSlug,
  matchesBreedSearch,
  normalizeForSearch,
  publishBlockers,
  slugify,
  type BreedClaimKind,
  type BreedCoat,
  type BreedLevel,
  type BreedProfileStatus,
  type BreedSize,
} from './model.ts';

export type BreedRow = typeof referenceBreeds.$inferSelect;
export type BreedGroupRow = typeof breedGroups.$inferSelect;
export type BreedClaimRow = typeof breedMedicalClaims.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پرونده نژاد هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید و تغییر را تکرار کنید.';
const TARGET = 'REFERENCE_BREED';

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') throw forbidden('بانک نژاد فقط در محیط سوپرادمین مدیریت می‌شود.');
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') throw validation('دلیل این تغییر را بنویسید؛ در تاریخچه ثبت می‌شود.');
  return trimmed;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

// ── Addresses and duplicates ──────────────────────────────────────────────

async function slugTaken(database: DbClient, slug: string, exceptBreedId?: string): Promise<boolean> {
  const [breed] = await database
    .select({ id: referenceBreeds.id })
    .from(referenceBreeds)
    .where(eq(referenceBreeds.slug, slug))
    .limit(1);
  if (breed && breed.id !== exceptBreedId) return true;
  const [redirect] = await database
    .select({ breedId: breedSlugRedirects.breedId })
    .from(breedSlugRedirects)
    .where(eq(breedSlugRedirects.slug, slug))
    .limit(1);
  return Boolean(redirect && redirect.breedId !== exceptBreedId);
}

/** A free address for a new breed: its own name, or the same with a number. */
export async function allocateSlug(database: DbClient, nameEn: string): Promise<string> {
  const base = slugify(nameEn) || 'breed';
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : base + '-' + n;
    if (!(await slugTaken(database, candidate))) return candidate;
  }
}

/**
 * Breeds already known under one of these names — by either name, an
 * alternative name or the address (§22 Duplicate Candidate). Shown before a
 * second record for the same breed can be created.
 *
 * ponytail: a scan of the whole register; fine for hundreds of breeds, move to
 * PROMPT-012's search index if the register ever reaches tens of thousands.
 */
export async function duplicateCandidates(
  database: DbClient,
  names: readonly string[],
  exceptBreedId?: string,
): Promise<Array<{ id: string; nameFa: string; nameEn: string }>> {
  const keys = new Set(names.map(normalizeForSearch).filter((key) => key !== ''));
  if (keys.size === 0) return [];
  const rows = await database
    .select({
      id: referenceBreeds.id,
      nameFa: referenceBreeds.nameFa,
      nameEn: referenceBreeds.nameEn,
      slug: referenceBreeds.slug,
      altNames: referenceBreeds.altNames,
    })
    .from(referenceBreeds);
  return rows
    .filter(
      (row) =>
        row.id !== exceptBreedId &&
        [row.nameFa, row.nameEn, row.slug, ...row.altNames].some((name) => keys.has(normalizeForSearch(name))),
    )
    .map(({ id, nameFa, nameEn }) => ({ id, nameFa, nameEn }));
}

// ── Public readers ────────────────────────────────────────────────────────

export interface BreedCard {
  readonly slug: string;
  readonly nameFa: string;
  readonly nameEn: string;
  readonly size: BreedSize | null;
  readonly fciGroup: number | null;
  readonly groupNameFa: string | null;
}

export async function breedGroupOptions(database: DbClient, speciesCode = 'DOG'): Promise<BreedGroupRow[]> {
  return database
    .select()
    .from(breedGroups)
    .where(eq(breedGroups.speciesCode, speciesCode))
    .orderBy(asc(breedGroups.fciGroup));
}

/**
 * The public list: published, not merged into another breed, filtered by name
 * and FCI group. `publishedTotal` tells an empty bank apart from an empty result.
 */
export async function publishedBreeds(
  database: DbClient,
  query: { term?: string; fciGroup?: number | null; page: number; pageSize?: number },
): Promise<Page<BreedCard> & { publishedTotal: number }> {
  const rows = await database
    .select({ breed: referenceBreeds, group: breedGroups })
    .from(referenceBreeds)
    .leftJoin(breedGroups, eq(referenceBreeds.groupId, breedGroups.id))
    .where(and(eq(referenceBreeds.profileStatus, 'PUBLISHED'), isNull(referenceBreeds.mergedIntoBreedId)));

  const filtered = rows
    .filter(
      (row) =>
        (query.fciGroup == null || row.group?.fciGroup === query.fciGroup) &&
        matchesBreedSearch(row.breed, query.term ?? ''),
    )
    .sort((a, b) => a.breed.nameFa.localeCompare(b.breed.nameFa, 'fa'));

  const request = { page: query.page, pageSize: query.pageSize ?? 24 };
  const items = filtered.slice(offsetOf(request), offsetOf(request) + request.pageSize).map(({ breed, group }) => ({
    slug: breed.slug,
    nameFa: breed.nameFa,
    nameEn: breed.nameEn,
    size: breed.size,
    fciGroup: group?.fciGroup ?? null,
    groupNameFa: group?.nameFa ?? null,
  }));
  return { ...pageOf(items, filtered.length, request), publishedTotal: rows.length };
}

export type BreedPage =
  | { readonly kind: 'redirect'; readonly slug: string }
  | {
      readonly kind: 'breed';
      readonly breed: BreedRow;
      readonly group: BreedGroupRow | null;
      readonly claims: readonly BreedClaimRow[];
      /** Set when this record is a merged duplicate of a breed that has a public page. */
      readonly primary: { readonly slug: string; readonly nameFa: string } | null;
    };

/**
 * One public breed page by address. A draft does not exist from outside — the
 * same 404 as a mistyped address — and an address the breed used to have
 * answers with the current one.
 */
export async function breedPageBySlug(database: DbClient, slug: string): Promise<BreedPage | null> {
  if (!isValidSlug(slug)) return null;

  const [row] = await database
    .select({ breed: referenceBreeds, group: breedGroups })
    .from(referenceBreeds)
    .leftJoin(breedGroups, eq(referenceBreeds.groupId, breedGroups.id))
    .where(eq(referenceBreeds.slug, slug))
    .limit(1);

  if (!row) {
    const [moved] = await database
      .select({ slug: referenceBreeds.slug })
      .from(breedSlugRedirects)
      .innerJoin(referenceBreeds, eq(breedSlugRedirects.breedId, referenceBreeds.id))
      .where(eq(breedSlugRedirects.slug, slug))
      .limit(1);
    return moved ? { kind: 'redirect', slug: moved.slug } : null;
  }
  if (row.breed.profileStatus === 'DRAFT') return null;

  let primary: { slug: string; nameFa: string } | null = null;
  if (row.breed.mergedIntoBreedId) {
    const [target] = await database
      .select({ slug: referenceBreeds.slug, nameFa: referenceBreeds.nameFa, status: referenceBreeds.profileStatus })
      .from(referenceBreeds)
      .where(eq(referenceBreeds.id, row.breed.mergedIntoBreedId))
      .limit(1);
    if (target && target.status !== 'DRAFT') primary = { slug: target.slug, nameFa: target.nameFa };
  }

  const claims = await database
    .select()
    .from(breedMedicalClaims)
    .where(and(eq(breedMedicalClaims.breedId, row.breed.id), isNull(breedMedicalClaims.archivedAt)))
    .orderBy(asc(breedMedicalClaims.kind), asc(breedMedicalClaims.createdAt));

  return { kind: 'breed', breed: row.breed, group: row.group, claims, primary };
}

/** Sitemap section `breeds`: every indexable breed page with its real modification time. */
export async function breedSitemapEntries(database: DbClient): Promise<SitemapEntry[]> {
  const rows = await database
    .select({ slug: referenceBreeds.slug, updatedAt: referenceBreeds.updatedAt })
    .from(referenceBreeds)
    .where(and(eq(referenceBreeds.profileStatus, 'PUBLISHED'), isNull(referenceBreeds.mergedIntoBreedId)))
    .orderBy(asc(referenceBreeds.slug));
  return rows.map((row) => ({ path: '/breeds/' + row.slug, lastModified: row.updatedAt }));
}

// ── Superadmin ────────────────────────────────────────────────────────────

export async function breedForEditing(database: DbClient, actor: Actor, breedId: string) {
  assertSuperadmin(actor);
  if (!UUID.test(breedId)) return null;
  const [breed] = await database.select().from(referenceBreeds).where(eq(referenceBreeds.id, breedId)).limit(1);
  if (!breed) return null;

  const [claims, groups, speciesRows, mergeTargets, redirects] = await Promise.all([
    database
      .select()
      .from(breedMedicalClaims)
      .where(eq(breedMedicalClaims.breedId, breed.id))
      .orderBy(desc(breedMedicalClaims.createdAt)),
    breedGroupOptions(database, breed.speciesCode),
    database.select().from(species).orderBy(asc(species.sortOrder)),
    database
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa, nameEn: referenceBreeds.nameEn })
      .from(referenceBreeds)
      .where(and(ne(referenceBreeds.id, breed.id), isNull(referenceBreeds.mergedIntoBreedId)))
      .orderBy(asc(referenceBreeds.nameFa)),
    database
      .select({ slug: breedSlugRedirects.slug })
      .from(breedSlugRedirects)
      .where(eq(breedSlugRedirects.breedId, breed.id)),
  ]);

  const primary = breed.mergedIntoBreedId
    ? (await database
        .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa, slug: referenceBreeds.slug })
        .from(referenceBreeds)
        .where(eq(referenceBreeds.id, breed.mergedIntoBreedId))
        .limit(1))[0] ?? null
    : null;

  return { breed, claims, groups, species: speciesRows, mergeTargets, redirects, primary };
}

export interface BreedProfileInput {
  readonly breedId: string;
  readonly expectedVersion: number;
  readonly nameFa: string;
  readonly nameEn: string;
  readonly slug: string;
  readonly altNames: readonly string[];
  readonly speciesCode: string;
  readonly groupId: string | null;
  readonly originCountry: string | null;
  readonly size: string | null;
  readonly coat: string | null;
  readonly energy: string | null;
  readonly trainability: string | null;
  readonly careNeed: string | null;
  readonly withChildren: string | null;
  readonly withOtherAnimals: string | null;
  readonly historyFa: string | null;
  readonly standardFa: string | null;
  readonly standardUrl: string | null;
}

const PROFILE_FIELDS = [
  'nameFa',
  'nameEn',
  'slug',
  'altNames',
  'speciesCode',
  'groupId',
  'originCountry',
  'size',
  'coat',
  'energy',
  'trainability',
  'careNeed',
  'withChildren',
  'withOtherAnimals',
  'historyFa',
  'standardFa',
  'standardUrl',
] as const;

const blankToNull = (value: string | null): string | null => (value === null || value.trim() === '' ? null : value.trim());

function levelOrNull(value: string | null, labelFa: string): BreedLevel | null {
  const v = blankToNull(value);
  if (v === null) return null;
  if (!isOneOf(BREED_LEVELS, v)) throw validation('مقدار «' + labelFa + '» معتبر نیست.');
  return v;
}

/** Edits the identity and profile of a breed, with its version and a before/after audit. */
export async function updateBreedProfile(database: Database, actor: Actor, input: BreedProfileInput): Promise<BreedRow> {
  assertSuperadmin(actor);
  if (!UUID.test(input.breedId)) throw notFound('نژاد پیدا نشد.');

  const nameFa = input.nameFa.trim();
  const nameEn = input.nameEn.trim();
  if (nameFa === '' || nameEn === '') throw validation('نام فارسی و لاتین نژاد را وارد کنید.');
  const slug = input.slug.trim();
  if (!isValidSlug(slug)) {
    throw validation('نشانی صفحه فقط حروف کوچک لاتین، رقم و خط تیره است؛ مثلاً german-shepherd.');
  }
  const originCountry = blankToNull(input.originCountry)?.toUpperCase() ?? null;
  if (originCountry !== null && countryNameFa(originCountry) === null) {
    throw validation('کد کشور مبدأ باید کد دوحرفی ISO باشد؛ مثلاً IR یا DE.');
  }
  const standardUrl = blankToNull(input.standardUrl);
  if (standardUrl !== null && !isHttpUrl(standardUrl)) throw validation('نشانی استاندارد باید یک پیوند http یا https باشد.');
  const size = blankToNull(input.size);
  if (size !== null && !isOneOf(BREED_SIZES, size)) throw validation('اندازه انتخاب‌شده معتبر نیست.');
  const coat = blankToNull(input.coat);
  if (coat !== null && !isOneOf(BREED_COATS, coat)) throw validation('نوع پوشش انتخاب‌شده معتبر نیست.');

  const next = {
    nameFa,
    nameEn,
    slug,
    altNames: [...input.altNames],
    speciesCode: input.speciesCode,
    groupId: blankToNull(input.groupId),
    originCountry,
    size: size as BreedSize | null,
    coat: coat as BreedCoat | null,
    energy: levelOrNull(input.energy, LEVEL_ATTRIBUTES[0].labelFa),
    trainability: levelOrNull(input.trainability, LEVEL_ATTRIBUTES[1].labelFa),
    careNeed: levelOrNull(input.careNeed, LEVEL_ATTRIBUTES[2].labelFa),
    withChildren: levelOrNull(input.withChildren, LEVEL_ATTRIBUTES[3].labelFa),
    withOtherAnimals: levelOrNull(input.withOtherAnimals, LEVEL_ATTRIBUTES[4].labelFa),
    historyFa: blankToNull(input.historyFa),
    standardFa: blankToNull(input.standardFa),
    standardUrl,
  };

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(referenceBreeds).where(eq(referenceBreeds.id, input.breedId)).limit(1);
      if (!current) throw notFound('نژاد پیدا نشد.');
      if (current.version !== input.expectedVersion) throw conflict(STALE);

      const [speciesRow] = await tx.select().from(species).where(eq(species.code, next.speciesCode)).limit(1);
      if (!speciesRow) throw validation('گونه انتخاب‌شده در فهرست گونه‌ها نیست.');
      if (next.groupId !== null) {
        const [group] = UUID.test(next.groupId)
          ? await tx.select().from(breedGroups).where(eq(breedGroups.id, next.groupId)).limit(1)
          : [];
        if (!group || group.speciesCode !== next.speciesCode) throw validation('گروه FCI انتخاب‌شده برای این گونه نیست.');
      }
      if (next.slug !== current.slug && (await slugTaken(tx, next.slug, current.id))) {
        throw conflict('این نشانی صفحه قبلاً برای نژاد دیگری استفاده شده است.');
      }
      const duplicates = await duplicateCandidates(tx, [next.nameFa, next.nameEn, ...next.altNames], current.id);
      if (duplicates.length > 0) {
        throw conflict(
          'این نام با نژاد ثبت‌شده دیگری یکی است: ' + duplicates.map((d) => d.nameFa + ' (' + d.nameEn + ')').join('، '),
          { duplicates },
        );
      }
      if (current.profileStatus === 'PUBLISHED') {
        const blockers = publishBlockers(next);
        if (blockers.length > 0) throw validation('صفحه این نژاد منتشر شده است. ' + blockers[0]);
      }

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const field of PROFILE_FIELDS) {
        const was = current[field];
        const now = next[field];
        if (JSON.stringify(was) !== JSON.stringify(now)) {
          before[field] = was;
          after[field] = now;
        }
      }
      if (Object.keys(after).length === 0) return current;

      const [row] = await tx
        .update(referenceBreeds)
        .set({ ...next, version: current.version + 1, updatedAt: new Date() })
        .where(and(eq(referenceBreeds.id, current.id), eq(referenceBreeds.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);

      if (row.slug !== current.slug) {
        // Coming back to an address this breed used before takes it out of the redirects.
        await tx
          .delete(breedSlugRedirects)
          .where(and(eq(breedSlugRedirects.slug, row.slug), eq(breedSlugRedirects.breedId, row.id)));
        await tx.insert(breedSlugRedirects).values({ slug: current.slug, breedId: row.id }).onConflictDoNothing();
      }

      await recordAudit(tx, actor, {
        action: 'BREED_PROFILE_UPDATED',
        targetType: TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before,
        after,
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('این نام یا نشانی هم‌زمان برای نژاد دیگری ثبت شد.');
    throw error;
  }
}

/** Publishes, archives or unpublishes a breed page; always with a reason. */
export async function changeBreedStatus(
  database: Database,
  actor: Actor,
  input: { breedId: string; expectedVersion: number; to: string; reason: string },
): Promise<BreedRow> {
  assertSuperadmin(actor);
  if (!UUID.test(input.breedId)) throw notFound('نژاد پیدا نشد.');
  const to = input.to as BreedProfileStatus;
  const reason = requireReason(input.reason);

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(referenceBreeds).where(eq(referenceBreeds.id, input.breedId)).limit(1);
    if (!current) throw notFound('نژاد پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (!canTransition(current.profileStatus, to)) throw validation('این تغییر وضعیت برای صفحه نژاد مجاز نیست.');
    if (to === 'PUBLISHED') {
      if (current.mergedIntoBreedId) throw validation('این نژاد تکراری است و صفحه آن منتشر نمی‌شود.');
      const blockers = publishBlockers(current);
      if (blockers.length > 0) throw validation(blockers[0]!);
    }

    const [row] = await tx
      .update(referenceBreeds)
      .set({
        profileStatus: to,
        publishedAt: to === 'PUBLISHED' ? (current.publishedAt ?? new Date()) : current.publishedAt,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(referenceBreeds.id, current.id), eq(referenceBreeds.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'BREED_PROFILE_STATUS_CHANGED',
      targetType: TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { profileStatus: current.profileStatus },
      after: { profileStatus: row.profileStatus },
      reason,
    });
    return row;
  });
}

/**
 * Records that a breed duplicates another (§21, §23). The duplicate is taken
 * out of new choices and its page points at the primary; animals and kennels
 * recorded with it keep exactly the breed they were recorded with.
 */
export async function markBreedDuplicate(
  database: Database,
  actor: Actor,
  input: { breedId: string; primaryBreedId: string; expectedVersion: number; reason: string },
): Promise<BreedRow> {
  assertSuperadmin(actor);
  if (!UUID.test(input.breedId) || !UUID.test(input.primaryBreedId)) throw notFound('نژاد پیدا نشد.');
  if (input.breedId === input.primaryBreedId) throw validation('یک نژاد نمی‌تواند تکراری خودش باشد.');
  const reason = requireReason(input.reason);

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(referenceBreeds).where(eq(referenceBreeds.id, input.breedId)).limit(1);
    const [primary] = await tx
      .select()
      .from(referenceBreeds)
      .where(eq(referenceBreeds.id, input.primaryBreedId))
      .limit(1);
    if (!current || !primary) throw notFound('نژاد پیدا نشد.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.mergedIntoBreedId) throw validation('این نژاد قبلاً به‌عنوان تکراری ثبت شده است.');
    if (primary.mergedIntoBreedId) throw validation('نژاد اصلی خودش تکراری است؛ رکورد اصلیِ آن را انتخاب کنید.');
    if (primary.speciesCode !== current.speciesCode) throw validation('نژاد اصلی باید از همان گونه باشد.');
    const [pointing] = await tx
      .select({ id: referenceBreeds.id })
      .from(referenceBreeds)
      .where(eq(referenceBreeds.mergedIntoBreedId, current.id))
      .limit(1);
    if (pointing) throw validation('نژاد دیگری تکراریِ همین رکورد ثبت شده است؛ این رکورد نمی‌تواند خودش تکراری باشد.');

    const [row] = await tx
      .update(referenceBreeds)
      .set({ mergedIntoBreedId: primary.id, isActive: false, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(referenceBreeds.id, current.id), eq(referenceBreeds.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'BREED_MARKED_DUPLICATE',
      targetType: TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { mergedIntoBreedId: null, isActive: current.isActive },
      after: { mergedIntoBreedId: primary.id, isActive: false },
      reason,
      metadata: { primaryNameEn: primary.nameEn },
    });
    return row;
  });
}

export interface MedicalClaimInput {
  readonly breedId: string;
  readonly kind: string;
  readonly titleFa: string;
  readonly noteFa: string | null;
  readonly sourceTitle: string;
  readonly sourceUrl: string | null;
  readonly reviewedOn: string;
}

/** A medical claim is accepted only with its source and a past review date (§6). */
export async function addMedicalClaim(database: Database, actor: Actor, input: MedicalClaimInput): Promise<BreedClaimRow> {
  assertSuperadmin(actor);
  if (!UUID.test(input.breedId)) throw notFound('نژاد پیدا نشد.');
  if (!isOneOf(BREED_CLAIM_KINDS, input.kind)) throw validation('نوع مطلب سلامت را انتخاب کنید.');
  const titleFa = input.titleFa.trim();
  const sourceTitle = input.sourceTitle.trim();
  if (titleFa === '') throw validation('عنوان مطلب سلامت را بنویسید.');
  if (sourceTitle === '') throw validation('منبع این مطلب را بنویسید؛ ادعای سلامت بدون منبع منتشر نمی‌شود.');
  const sourceUrl = blankToNull(input.sourceUrl);
  if (sourceUrl !== null && !isHttpUrl(sourceUrl)) throw validation('پیوند منبع باید http یا https باشد.');
  if (!isReviewDate(input.reviewedOn)) throw validation('تاریخ بازبینی باید روزی معتبر و گذشته باشد.');

  return database.transaction(async (tx) => {
    const [breed] = await tx
      .update(referenceBreeds)
      .set({ updatedAt: new Date() })
      .where(eq(referenceBreeds.id, input.breedId))
      .returning({ id: referenceBreeds.id });
    if (!breed) throw notFound('نژاد پیدا نشد.');

    const [row] = await tx
      .insert(breedMedicalClaims)
      .values({
        breedId: breed.id,
        kind: input.kind as BreedClaimKind,
        titleFa,
        noteFa: blankToNull(input.noteFa),
        sourceTitle,
        sourceUrl,
        reviewedOn: input.reviewedOn,
        createdByAccountId: actor.accountId,
      })
      .returning();
    if (!row) throw validation('ثبت مطلب سلامت انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'BREED_MEDICAL_CLAIM_ADDED',
      targetType: TARGET,
      targetId: breed.id,
      after: {
        claimId: row.id,
        kind: row.kind,
        titleFa: row.titleFa,
        sourceTitle: row.sourceTitle,
        sourceUrl: row.sourceUrl,
        reviewedOn: row.reviewedOn,
      },
    });
    return row;
  });
}

/** Takes a claim off the public page; the row and its history stay (P2-D13). */
export async function archiveMedicalClaim(
  database: Database,
  actor: Actor,
  input: { claimId: string; reason: string },
): Promise<BreedClaimRow> {
  assertSuperadmin(actor);
  if (!UUID.test(input.claimId)) throw notFound('مطلب سلامت پیدا نشد.');
  const reason = requireReason(input.reason);

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(breedMedicalClaims)
      .set({ archivedAt: new Date() })
      .where(and(eq(breedMedicalClaims.id, input.claimId), isNull(breedMedicalClaims.archivedAt)))
      .returning();
    if (!row) throw notFound('مطلب سلامت پیدا نشد یا قبلاً کنار گذاشته شده است.');
    await tx.update(referenceBreeds).set({ updatedAt: new Date() }).where(eq(referenceBreeds.id, row.breedId));

    await recordAudit(tx, actor, {
      action: 'BREED_MEDICAL_CLAIM_ARCHIVED',
      targetType: TARGET,
      targetId: row.breedId,
      before: { claimId: row.id, archivedAt: null },
      after: { claimId: row.id, archivedAt: row.archivedAt },
      reason,
    });
    return row;
  });
}
