/**
 * Associations and clubs — Requirements-Phase-2 §11, §19, §20, §22 (PROMPT-010).
 *
 * The record is created and verified in the review environment, managed by the
 * account it belongs to, and read publicly at /associations. A club post is an
 * ordinary CMS row that belongs to its club, so moderation, reports and the
 * public reader of PROMPT-004/005 keep working on it unchanged (DEC-0170).
 */
import { and, asc, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, referenceBreeds, species } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { profiles } from '../db/schema/identity.ts';
import {
  communities,
  communityBreeds,
  communityEvents,
  communityManagers,
  communitySpecies,
} from '../db/schema/communities.ts';
import { contentItems } from '../db/schema/content.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { promotedTargetIds } from '../advertising/service.ts';
import { compareRanked, promotedWhenRelevant, rankTier } from '../search/model.ts';
import { normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';
import { isLicenceStatus, type LicenceStatusName } from '../centres/model.ts';
import {
  communityCompleteness,
  communityPublishBlockers,
  eventDateProblem,
  isCommunityKind,
  isCommunityScope,
  isEventStatus,
  isUpcoming,
  postingProblem,
  publicRegistration,
  scopeProblem,
  type CommunityCompletenessInput,
  type CommunityEventStatus,
  type CommunityKind,
  type CommunityScope,
} from './model.ts';
import { isVetPublicStatus, type VetPublicStatus } from '../vets/directory-model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

export type CommunityRow = typeof communities.$inferSelect;
export type CommunityEventRow = typeof communityEvents.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^(assoc|club)-[0-9a-f]{10}$/;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const OWNER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];

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
    throw forbidden('این پرونده را فقط مدیر ثبت‌شده آن، اپراتور بررسی یا سوپرادمین تغییر می‌دهد.');
  }
  return manager;
}

const text = (value: string | null | undefined): string | null => {
  const out = unifyPersianLetters((value ?? '').trim()).replace(/[ \t]+/g, ' ');
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

function url(value: string | null | undefined, labelFa: string): string | null {
  const out = bounded(value, 300, labelFa);
  if (out !== null && !/^https?:\/\/[^\s]+$/i.test(out)) throw validation(labelFa + ' باید با http یا https شروع شود.');
  return out;
}

/** A public address that is not the internal id and cannot be guessed from it (§20). */
export const newCommunitySlug = (kind: CommunityKind): string =>
  (kind === 'CLUB' ? 'club-' : 'assoc-') + randomBytes(5).toString('hex');

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

async function communityById(tx: DbClient, communityId: string): Promise<CommunityRow> {
  const [row] = UUID.test(communityId) ? await tx.select().from(communities).where(eq(communities.id, communityId)).limit(1) : [];
  if (!row) throw notFound('انجمن یا کلاب پیدا نشد.');
  return row;
}

async function bump(tx: DbClient, current: CommunityRow, values: Record<string, unknown>): Promise<CommunityRow> {
  const [row] = await tx
    .update(communities)
    .set({ ...values, version: current.version + 1, updatedAt: new Date() })
    .where(and(eq(communities.id, current.id), eq(communities.version, current.version)))
    .returning();
  if (!row) throw conflict(STALE);
  return row;
}

// ── Facts ────────────────────────────────────────────────────────────────

export interface CommunityFacts {
  readonly community: CommunityRow;
  readonly provinceNameFa: string | null;
  readonly cityNameFa: string | null;
  readonly speciesCodes: readonly string[];
  readonly breedIds: readonly string[];
  readonly breedNamesFa: readonly string[];
  readonly managers: ReadonlyArray<{
    id: string;
    accountId: string;
    status: string;
    roleFa: string | null;
    version: number;
    nameFa: string | null;
  }>;
  readonly events: readonly CommunityEventRow[];
  readonly postCount: number;
}

async function loadFacts(database: DbClient, rows: readonly CommunityRow[]): Promise<CommunityFacts[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [speciesRows, breedRows, managerRows, eventRows, postRows, provinceRows, cityRows, breedNames] = await Promise.all([
    database.select().from(communitySpecies).where(inArray(communitySpecies.communityId, ids)),
    database.select().from(communityBreeds).where(inArray(communityBreeds.communityId, ids)),
    database
      .select({ manager: communityManagers, firstName: profiles.firstName, lastName: profiles.lastName })
      .from(communityManagers)
      .leftJoin(profiles, eq(profiles.accountId, communityManagers.accountId))
      .where(inArray(communityManagers.communityId, ids)),
    database.select().from(communityEvents).where(inArray(communityEvents.communityId, ids)).orderBy(asc(communityEvents.startsOn)),
    database
      .select({ communityId: contentItems.communityId, id: contentItems.id })
      .from(contentItems)
      .where(and(inArray(contentItems.communityId, ids), eq(contentItems.status, 'PUBLISHED'))),
    database.select().from(provinces),
    database.select().from(cities),
    database.select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa }).from(referenceBreeds),
  ]);
  const provinceName = new Map(provinceRows.map((row) => [row.code, row.nameFa]));
  const cityName = new Map(cityRows.map((row) => [row.id, row.nameFa]));
  const breedName = new Map(breedNames.map((row) => [row.id, row.nameFa]));

  return rows.map((community) => {
    const ids2 = breedRows.filter((row) => row.communityId === community.id).map((row) => row.breedId);
    return {
      community,
      provinceNameFa: community.provinceCode ? (provinceName.get(community.provinceCode) ?? null) : null,
      cityNameFa: community.cityId ? (cityName.get(community.cityId) ?? null) : null,
      speciesCodes: speciesRows.filter((row) => row.communityId === community.id).map((row) => row.speciesCode).sort(),
      breedIds: ids2,
      breedNamesFa: ids2.map((id) => breedName.get(id) ?? id),
      managers: managerRows
        .filter((row) => row.manager.communityId === community.id)
        .map((row) => ({
          id: row.manager.id,
          accountId: row.manager.accountId,
          status: row.manager.status,
          roleFa: row.manager.roleFa,
          version: row.manager.version,
          nameFa: row.firstName ? row.firstName + ' ' + (row.lastName ?? '') : null,
        })),
      events: eventRows.filter((row) => row.communityId === community.id),
      postCount: postRows.filter((row) => row.communityId === community.id).length,
    };
  });
}

const contactOf = (community: CommunityRow): string | null => community.contactPhone ?? community.websiteUrl ?? community.membershipUrl;

export function completenessInputOf(facts: CommunityFacts): CommunityCompletenessInput {
  const { community } = facts;
  return {
    aboutFa: community.aboutFa,
    contact: contactOf(community),
    membershipInfoFa: community.membershipInfoFa,
    speciesCount: facts.speciesCodes.length,
    breedCount: facts.breedIds.length,
    acceptedManagers: facts.managers.filter((manager) => manager.status === 'ACCEPTED').length,
    publishedEvents: facts.events.filter((event) => event.status === 'PUBLISHED').length,
    scopePlaceSet:
      community.scope === 'PROVINCIAL'
        ? community.provinceCode !== null
        : community.scope === 'CITY'
          ? community.cityId !== null
          : community.scope === 'BREED'
            ? facts.breedIds.length > 0
            : true,
  };
}

// ── Reference data and editing ───────────────────────────────────────────

export async function communityReferenceData(database: DbClient) {
  const [provinceRows, cityRows, speciesRows, breedRows] = await Promise.all([
    database.select().from(provinces).orderBy(asc(provinces.sortOrder)),
    database.select().from(cities).where(eq(cities.isActive, true)),
    database.select().from(species).orderBy(asc(species.sortOrder)),
    database
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa })
      .from(referenceBreeds)
      .where(eq(referenceBreeds.isActive, true))
      .orderBy(asc(referenceBreeds.nameFa)),
  ]);
  return {
    provinces: provinceRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    cities: cityRows.map((row) => ({ id: row.id, provinceCode: row.provinceCode, nameFa: row.nameFa })).sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
    species: speciesRows.map((row) => ({ code: row.code, nameFa: row.nameFa })),
    breeds: breedRows.map((row) => ({ code: row.id, nameFa: row.nameFa })),
  };
}

export interface CreateCommunityInput {
  readonly kind: string;
  readonly displayNameFa: string;
  readonly scope?: string | null;
  readonly sourceFa?: string | null;
  readonly reason: string;
  readonly confirmedNotDuplicate?: boolean;
}

export async function createCommunity(database: Database, actor: Actor, input: CreateCommunityInput): Promise<CommunityRow> {
  const manager = assertManager(actor, null, ['ADMIN', 'REVIEW']);
  const reason = reasonFor(manager, input.reason);
  if (!isCommunityKind(input.kind)) throw validation('نوع رکورد را انتخاب کنید: انجمن یا کلاب.');
  const kind: CommunityKind = input.kind;
  const displayNameFa = bounded(input.displayNameFa, 160, 'نام');
  if (displayNameFa === null) throw validation('نام را بنویسید.');
  const scope = input.scope ?? 'OTHER';
  if (!isCommunityScope(scope)) throw validation('حوزه انتخاب‌شده معتبر نیست.');

  return database.transaction(async (tx) => {
    const normalized = normalizeForSearch(displayNameFa);
    const similar = (await tx.select({ displayNameFa: communities.displayNameFa, kind: communities.kind }).from(communities)).filter(
      (row) => row.kind === kind && normalizeForSearch(row.displayNameFa) === normalized,
    );
    if (similar.length > 0 && input.confirmedNotDuplicate !== true) {
      throw conflict('رکوردی با همین نام و نوع ثبت شده است؛ اگر رکورد دیگری است، تأیید «تکراری نیست» را بزنید.');
    }
    const [row] = await tx
      .insert(communities)
      .values({ kind, displayNameFa, scope, sourceFa: bounded(input.sourceFa, 300, 'منبع اطلاعات') })
      .returning();
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_CREATED',
      targetType: 'COMMUNITY',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { kind, displayNameFa, scope },
      reason,
    });
    return row!;
  });
}

export interface CommunityProfileInput {
  readonly communityId: string;
  readonly expectedVersion: number;
  readonly displayNameFa: string;
  readonly aboutFa: string | null;
  readonly scope: string;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly membershipInfoFa: string | null;
  readonly membershipUrl: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly speciesCodes: readonly string[];
  readonly breedIds: readonly string[];
  readonly reason?: string | null;
}

export async function updateCommunityProfile(database: Database, actor: Actor, input: CommunityProfileInput): Promise<CommunityRow> {
  if (!isCommunityScope(input.scope)) throw validation('حوزه انتخاب‌شده معتبر نیست.');
  const scope: CommunityScope = input.scope;
  const next = {
    displayNameFa: bounded(input.displayNameFa, 160, 'نام') ?? '',
    aboutFa: bounded(input.aboutFa, 4000, 'معرفی'),
    scope,
    provinceCode: text(input.provinceCode),
    cityId: text(input.cityId),
    membershipInfoFa: bounded(input.membershipInfoFa, 2000, 'شرایط عضویت'),
    membershipUrl: url(input.membershipUrl, 'نشانی عضویت'),
    contactPhone: bounded(input.contactPhone, 20, 'تلفن'),
    websiteUrl: url(input.websiteUrl, 'نشانی وب‌سایت'),
    speciesCodes: [...new Set(input.speciesCodes)].sort(),
    breedIds: [...new Set(input.breedIds)].sort(),
  };
  if (next.displayNameFa === '') throw validation('نام را بنویسید.');

  return database.transaction(async (tx) => {
    const current = await communityById(tx, input.communityId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    if (next.cityId !== null) {
      const [city] = UUID.test(next.cityId) ? await tx.select().from(cities).where(eq(cities.id, next.cityId)).limit(1) : [];
      if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
      next.provinceCode = city.provinceCode;
    } else if (next.provinceCode !== null) {
      const [province] = await tx.select().from(provinces).where(eq(provinces.code, next.provinceCode)).limit(1);
      if (!province) throw validation('استان انتخاب‌شده در فهرست استان‌ها نیست.');
    }
    if (next.speciesCodes.length > 0) {
      const known = await tx.select({ code: species.code }).from(species).where(inArray(species.code, next.speciesCodes));
      if (known.length !== next.speciesCodes.length) throw validation('گونه انتخاب‌شده در فهرست گونه‌ها نیست.');
    }
    if (next.breedIds.length > 0) {
      const known = await tx.select({ id: referenceBreeds.id }).from(referenceBreeds).where(inArray(referenceBreeds.id, next.breedIds));
      if (known.length !== next.breedIds.length) throw validation('نژاد انتخاب‌شده در بانک نژاد نیست.');
    }
    const problem = scopeProblem({ scope, provinceCode: next.provinceCode, cityId: next.cityId, breedCount: next.breedIds.length });
    if (problem) throw validation(problem);

    const [facts] = await loadFacts(tx, [current]);
    const previous = {
      displayNameFa: current.displayNameFa,
      aboutFa: current.aboutFa,
      scope: current.scope,
      provinceCode: current.provinceCode,
      cityId: current.cityId,
      membershipInfoFa: current.membershipInfoFa,
      membershipUrl: current.membershipUrl,
      contactPhone: current.contactPhone,
      websiteUrl: current.websiteUrl,
      speciesCodes: facts!.speciesCodes,
      breedIds: facts!.breedIds,
    };
    const diff = diffOf(previous, next);
    if (!diff.changed) return current;

    const row = await bump(tx, current, {
      displayNameFa: next.displayNameFa,
      aboutFa: next.aboutFa,
      scope: next.scope,
      provinceCode: next.provinceCode,
      cityId: next.cityId,
      membershipInfoFa: next.membershipInfoFa,
      membershipUrl: next.membershipUrl,
      contactPhone: next.contactPhone,
      websiteUrl: next.websiteUrl,
    });
    if ('speciesCodes' in diff.after) {
      await tx.delete(communitySpecies).where(eq(communitySpecies.communityId, row.id));
      if (next.speciesCodes.length > 0) {
        await tx.insert(communitySpecies).values(next.speciesCodes.map((speciesCode) => ({ communityId: row.id, speciesCode })));
      }
    }
    if ('breedIds' in diff.after) {
      await tx.delete(communityBreeds).where(eq(communityBreeds.communityId, row.id));
      if (next.breedIds.length > 0) {
        await tx.insert(communityBreeds).values(next.breedIds.map((breedId) => ({ communityId: row.id, breedId })));
      }
    }
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_PROFILE_UPDATED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: diff.before,
      after: diff.after,
      reason,
    });
    return row;
  });
}

/** The registration of an association, recorded by whoever checked it — never by its own manager (§11, P2-D05). */
export async function setCommunityRegistration(
  database: Database,
  actor: Actor,
  input: { communityId: string; expectedVersion: number; registrationNumber: string | null; licenceStatus: string; reason: string },
  now: Date = new Date(),
): Promise<CommunityRow> {
  if (!isLicenceStatus(input.licenceStatus)) throw validation('وضعیت مجوز معتبر نیست.');
  const status: LicenceStatusName = input.licenceStatus;
  const registrationNumber = bounded(input.registrationNumber, 60, 'شماره ثبت');
  if (status !== 'NONE' && registrationNumber === null) throw validation('برای ثبت وضعیت مجوز، شماره آن را بنویسید.');

  return database.transaction(async (tx) => {
    const current = await communityById(tx, input.communityId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'REVIEW']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.kind !== 'ASSOCIATION' && status !== 'NONE') {
      throw validation('شماره ثبت برای انجمن است؛ برای کلاب مجوزی ثبت نمی‌شود.');
    }
    const row = await bump(tx, current, {
      registrationNumber,
      licenceStatus: status,
      licenceVerifiedAt: status === 'VALID' ? now : null,
    });
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_REGISTRATION_RECORDED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: { registrationNumber: current.registrationNumber, licenceStatus: current.licenceStatus },
      after: { registrationNumber: row.registrationNumber, licenceStatus: row.licenceStatus },
      reason,
    });
    return row;
  });
}

/** «انتشار مستقیم کلاب فقط با مجوز ادمین فعال می‌شود» (§11): only the superadmin turns this on. */
export async function setCommunityPublisher(
  database: Database,
  actor: Actor,
  input: { communityId: string; expectedVersion: number; canPublishPosts: boolean; reason: string },
): Promise<CommunityRow> {
  if (actor.context !== 'SUPERADMIN') throw forbidden('مجوز انتشار مستقیم فقط از محیط سوپرادمین داده می‌شود.');
  const reason = reasonFor('ADMIN', input.reason);

  return database.transaction(async (tx) => {
    const current = await communityById(tx, input.communityId);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.kind !== 'CLUB') throw validation('فقط کلاب می‌تواند ناشر مجاز شود.');
    if (current.canPublishPosts === (input.canPublishPosts === true)) throw validation('همین وضعیت هم‌اکنون برقرار است.');
    const row = await bump(tx, current, { canPublishPosts: input.canPublishPosts === true });
    await recordAudit(tx, actor, {
      action: input.canPublishPosts ? 'COMMUNITY_PUBLISHER_GRANTED' : 'COMMUNITY_PUBLISHER_REVOKED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: { canPublishPosts: current.canPublishPosts },
      after: { canPublishPosts: row.canPublishPosts },
      reason,
    });
    if (row.ownerAccountId) {
      await createNotification(tx, {
        recipientAccountId: row.ownerAccountId,
        kind: 'COMMUNITY_PUBLISHER_CHANGED',
        titleFa: input.canPublishPosts ? 'کلاب شما ناشر مجاز شد' : 'مجوز انتشار کلاب شما برداشته شد',
        bodyFa: reason ?? '',
        resume: { entity: { type: 'COMMUNITY', id: row.id }, step: 'COMMUNITY_POSTS', originRoute: '/account/communities/' + row.id },
      });
    }
    return row;
  });
}

export async function assignCommunityOwner(
  database: Database,
  actor: Actor,
  input: { communityId: string; expectedVersion: number; mobile: string; reason: string },
  now: Date = new Date(),
): Promise<CommunityRow> {
  if (actor.context !== 'SUPERADMIN') throw forbidden('واگذاری مدیریت فقط از محیط سوپرادمین ممکن است.');
  const reason = reasonFor('ADMIN', input.reason);
  const mobile = text(input.mobile) ?? '';

  return database.transaction(async (tx) => {
    const current = await communityById(tx, input.communityId);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.ownerAccountId !== null) throw conflict('این پرونده همین حالا مدیر دارد.');
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile)).limit(1);
    if (!account) throw notFound('حسابی با این شماره پیدا نشد؛ صاحب شماره باید یک‌بار وارد همزیست شده باشد.');

    const row = await bump(tx, current, { ownerAccountId: account.id, claimedAt: now });
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_OWNER_ASSIGNED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: { ownerAccountId: null },
      after: { ownerAccountId: account.id },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: account.id,
      kind: 'COMMUNITY_OWNER_ASSIGNED',
      titleFa: 'مدیریت ' + row.displayNameFa + ' به شما سپرده شد',
      bodyFa: reason ?? '',
      resume: { entity: { type: 'COMMUNITY', id: row.id }, step: 'COMMUNITY_PROFILE', originRoute: '/account/communities/' + row.id },
    });
    return row;
  });
}

export async function changeCommunityStatus(
  database: Database,
  actor: Actor,
  input: { communityId: string; expectedVersion: number; to: string; reason?: string | null },
): Promise<CommunityRow> {
  if (!isVetPublicStatus(input.to) || input.to === 'DRAFT') throw validation('وضعیت انتخاب‌شده معتبر نیست.');
  const to: VetPublicStatus = input.to;

  return database.transaction(async (tx) => {
    const current = await communityById(tx, input.communityId);
    const manager = assertManager(actor, current.ownerAccountId, ['ADMIN', 'REVIEW', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (current.publicStatus === to) throw validation('این پرونده همین حالا در این وضعیت است.');
    if (to === 'HIDDEN' && current.publicStatus === 'DRAFT') throw validation('پیش‌نویسی که منتشر نشده پنهان‌کردن ندارد.');
    if (to === 'PUBLISHED' && manager === 'OWNER' && current.hiddenByReview) {
      throw conflict('این پرونده را بررسی همزیست پنهان کرده است و فقط همان‌جا دوباره منتشر می‌شود.');
    }
    if (to === 'PUBLISHED') {
      const [facts] = await loadFacts(tx, [current]);
      const blockers = communityPublishBlockers(completenessInputOf(facts!));
      if (blockers.length > 0) throw validation(blockers.join(' '));
    }

    const now = new Date();
    const row = await bump(tx, current, {
      publicStatus: to,
      publicSlug: current.publicSlug ?? newCommunitySlug(current.kind as CommunityKind),
      publicPublishedAt: current.publicPublishedAt ?? (to === 'PUBLISHED' ? now : null),
      hiddenByReview: to === 'HIDDEN' && manager !== 'OWNER',
    });
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_STATUS_CHANGED',
      targetType: 'COMMUNITY',
      targetId: row.id,
      targetVersion: row.version,
      before: { publicStatus: current.publicStatus, hiddenByReview: current.hiddenByReview },
      after: { publicStatus: row.publicStatus, publicSlug: row.publicSlug, hiddenByReview: row.hiddenByReview },
      reason,
    });
    return row;
  });
}

// ── Managers ─────────────────────────────────────────────────────────────

export async function inviteCommunityManager(
  database: Database,
  actor: Actor,
  input: { communityId: string; mobile: string; roleFa?: string | null; reason?: string | null },
): Promise<typeof communityManagers.$inferSelect> {
  const roleFa = bounded(input.roleFa, 120, 'سمت');
  const mobile = text(input.mobile) ?? '';

  return database.transaction(async (tx) => {
    const community = await communityById(tx, input.communityId);
    const manager = assertManager(actor, community.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile)).limit(1);
    if (!account) throw notFound('حسابی با این شماره پیدا نشد؛ صاحب شماره باید یک‌بار وارد همزیست شده باشد.');

    const [existing] = await tx
      .select()
      .from(communityManagers)
      .where(and(eq(communityManagers.communityId, community.id), eq(communityManagers.accountId, account.id)))
      .limit(1);
    if (existing && existing.status !== 'REMOVED' && existing.status !== 'DECLINED') {
      throw conflict('این حساب همین حالا در فهرست مدیران این پرونده است.');
    }

    const values = { roleFa, status: 'INVITED' as const, invitedByAccountId: actor.accountId, invitedAt: new Date(), respondedAt: null };
    const [row] = existing
      ? await tx
          .update(communityManagers)
          .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
          .where(and(eq(communityManagers.id, existing.id), eq(communityManagers.version, existing.version)))
          .returning()
      : await tx.insert(communityManagers).values({ communityId: community.id, accountId: account.id, ...values }).returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'COMMUNITY_MANAGER_INVITED',
      targetType: 'COMMUNITY_MANAGER',
      targetId: row.id,
      targetVersion: row.version,
      after: { communityId: community.id, accountId: account.id, roleFa },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: account.id,
      kind: 'COMMUNITY_MANAGER_INVITED',
      titleFa: 'دعوت به مدیریت ' + community.displayNameFa,
      bodyFa: 'تا وقتی این دعوت را نپذیرید، نام شما در صفحه عمومی نمایش داده نمی‌شود.',
      resume: { entity: { type: 'COMMUNITY_MANAGER', id: row.id }, step: 'COMMUNITY_INVITATION', originRoute: '/account/communities' },
    });
    return row;
  });
}

export async function respondToCommunityInvitation(
  database: Database,
  actor: Actor,
  input: { managerId: string; expectedVersion: number; accept: boolean },
  now: Date = new Date(),
): Promise<typeof communityManagers.$inferSelect> {
  return database.transaction(async (tx) => {
    const [row] = UUID.test(input.managerId)
      ? await tx.select().from(communityManagers).where(eq(communityManagers.id, input.managerId)).limit(1)
      : [];
    // Someone else's invitation is not found rather than forbidden.
    if (!row || row.accountId !== actor.accountId || !OWNER_CONTEXTS.includes(actor.context)) throw notFound('دعوت پیدا نشد.');
    if (row.status !== 'INVITED') throw conflict('این دعوت پیش‌تر پاسخ داده شده است.');
    if (row.version !== input.expectedVersion) throw conflict(STALE);

    const [updated] = await tx
      .update(communityManagers)
      .set({ status: input.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now, version: row.version + 1, updatedAt: now })
      .where(and(eq(communityManagers.id, row.id), eq(communityManagers.version, row.version)))
      .returning();
    if (!updated) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: input.accept ? 'COMMUNITY_MANAGER_ACCEPTED' : 'COMMUNITY_MANAGER_DECLINED',
      targetType: 'COMMUNITY_MANAGER',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: row.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function removeCommunityManager(
  database: Database,
  actor: Actor,
  input: { managerId: string; expectedVersion: number; reason?: string | null },
): Promise<typeof communityManagers.$inferSelect> {
  return database.transaction(async (tx) => {
    const [row] = UUID.test(input.managerId)
      ? await tx.select().from(communityManagers).where(eq(communityManagers.id, input.managerId)).limit(1)
      : [];
    if (!row) throw notFound('مدیر پیدا نشد.');
    const community = await communityById(tx, row.communityId);
    const manager = assertManager(actor, community.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (row.status === 'REMOVED') throw conflict('این مدیر پیش‌تر برداشته شده است.');
    if (row.version !== input.expectedVersion) throw conflict(STALE);

    const [updated] = await tx
      .update(communityManagers)
      .set({ status: 'REMOVED', respondedAt: new Date(), version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(communityManagers.id, row.id), eq(communityManagers.version, row.version)))
      .returning();
    if (!updated) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_MANAGER_REMOVED',
      targetType: 'COMMUNITY_MANAGER',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: row.status },
      after: { status: 'REMOVED' },
      reason,
    });
    return updated;
  });
}

export async function myCommunityInvitations(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ manager: communityManagers, communityNameFa: communities.displayNameFa, kind: communities.kind })
    .from(communityManagers)
    .innerJoin(communities, eq(communities.id, communityManagers.communityId))
    .where(and(eq(communityManagers.accountId, actor.accountId), eq(communityManagers.status, 'INVITED')));
  return rows.map((row) => ({ ...row.manager, communityNameFa: row.communityNameFa, kind: row.kind }));
}

// ── Events ───────────────────────────────────────────────────────────────

export interface EventInput {
  readonly titleFa: string;
  readonly startsOn: string;
  readonly endsOn?: string | null;
  readonly cityId?: string | null;
  readonly placeFa?: string | null;
  readonly descriptionFa?: string | null;
  readonly registrationUrl?: string | null;
  readonly status?: string;
  readonly cancelReasonFa?: string | null;
  readonly reason?: string | null;
}

function validEvent(input: EventInput) {
  const titleFa = bounded(input.titleFa, 160, 'عنوان رویداد');
  if (titleFa === null) throw validation('عنوان رویداد را بنویسید.');
  const startsOn = text(input.startsOn);
  const endsOn = text(input.endsOn);
  const problem = eventDateProblem(startsOn, endsOn);
  if (problem) throw validation(problem);
  const status = input.status ?? 'DRAFT';
  if (!isEventStatus(status)) throw validation('وضعیت رویداد معتبر نیست.');
  return {
    titleFa,
    startsOn: startsOn!,
    endsOn,
    placeFa: bounded(input.placeFa, 200, 'محل برگزاری'),
    descriptionFa: bounded(input.descriptionFa, 4000, 'توضیح رویداد'),
    registrationUrl: url(input.registrationUrl, 'نشانی ثبت‌نام'),
    status: status as CommunityEventStatus,
    cancelReasonFa: bounded(input.cancelReasonFa, 500, 'دلیل لغو'),
  };
}

export async function addCommunityEvent(
  database: Database,
  actor: Actor,
  communityId: string,
  input: EventInput,
): Promise<CommunityEventRow> {
  const values = validEvent(input);

  return database.transaction(async (tx) => {
    const community = await communityById(tx, communityId);
    const manager = assertManager(actor, community.ownerAccountId, ['ADMIN', 'OWNER']);
    const cityId = text(input.cityId);
    if (cityId !== null) {
      const [city] = UUID.test(cityId) ? await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1) : [];
      if (!city) throw validation('شهر رویداد در فهرست شهرها نیست.');
    }
    if (values.status === 'CANCELLED') throw validation('رویداد تازه لغوشده ثبت نمی‌شود.');

    const [row] = await tx
      .insert(communityEvents)
      .values({ communityId: community.id, cityId, ...values, cancelReasonFa: null })
      .returning();
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_EVENT_CREATED',
      targetType: 'COMMUNITY_EVENT',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { communityId: community.id, titleFa: values.titleFa, startsOn: values.startsOn, status: values.status, by: manager },
    });
    return row!;
  });
}

export async function updateCommunityEvent(
  database: Database,
  actor: Actor,
  input: EventInput & { eventId: string; expectedVersion: number },
): Promise<CommunityEventRow> {
  const values = validEvent(input);

  return database.transaction(async (tx) => {
    const [current] = UUID.test(input.eventId)
      ? await tx.select().from(communityEvents).where(eq(communityEvents.id, input.eventId)).limit(1)
      : [];
    if (!current) throw notFound('رویداد پیدا نشد.');
    const community = await communityById(tx, current.communityId);
    const manager = assertManager(actor, community.ownerAccountId, ['ADMIN', 'OWNER']);
    const reason = reasonFor(manager, input.reason);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (values.status === 'CANCELLED' && values.cancelReasonFa === null) throw validation('برای لغو رویداد، دلیل آن را بنویسید.');
    const cityId = text(input.cityId);
    if (cityId !== null) {
      const [city] = UUID.test(cityId) ? await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1) : [];
      if (!city) throw validation('شهر رویداد در فهرست شهرها نیست.');
    }

    const next = { ...values, cityId };
    const previous = Object.fromEntries(Object.keys(next).map((key) => [key, (current as Record<string, unknown>)[key]]));
    const diff = diffOf(previous, next);
    const [row] = await tx
      .update(communityEvents)
      .set({ ...next, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(communityEvents.id, current.id), eq(communityEvents.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'COMMUNITY_EVENT_UPDATED',
      targetType: 'COMMUNITY_EVENT',
      targetId: row.id,
      targetVersion: row.version,
      before: diff.before,
      after: diff.after,
      reason,
    });
    return row;
  });
}

// ── Editors ──────────────────────────────────────────────────────────────

async function editorData(database: DbClient, community: CommunityRow) {
  const [facts] = await loadFacts(database, [community]);
  const input = completenessInputOf(facts!);
  return {
    facts: facts!,
    completeness: communityCompleteness(input),
    blockers: communityPublishBlockers(input),
    posting: postingProblem({ kind: community.kind as CommunityKind, canPublishPosts: community.canPublishPosts }),
    reference: await communityReferenceData(database),
  };
}

export type CommunityEditorData = Awaited<ReturnType<typeof editorData>>;

export async function communityEditor(database: DbClient, actor: Actor, communityId: string): Promise<CommunityEditorData | null> {
  if (!UUID.test(communityId)) return null;
  const [community] = await database.select().from(communities).where(eq(communities.id, communityId)).limit(1);
  if (!community) return null;
  assertManager(actor, community.ownerAccountId, ['ADMIN', 'REVIEW', 'OWNER']);
  return editorData(database, community);
}

export async function manageableCommunities(database: DbClient, actor: Actor) {
  const rows =
    actor.context === 'SUPERADMIN' || actor.context === 'REVIEW_OPERATOR'
      ? await database.select().from(communities).orderBy(asc(communities.displayNameFa))
      : OWNER_CONTEXTS.includes(actor.context)
        ? await database.select().from(communities).where(eq(communities.ownerAccountId, actor.accountId)).orderBy(asc(communities.displayNameFa))
        : [];
  const facts = await loadFacts(database, rows);
  return facts.map((entry) => ({
    community: entry.community,
    cityNameFa: entry.cityNameFa,
    provinceNameFa: entry.provinceNameFa,
    eventCount: entry.events.length,
    postCount: entry.postCount,
  }));
}

// ── Public ───────────────────────────────────────────────────────────────

async function publishedRows(database: DbClient, slug?: string): Promise<CommunityRow[]> {
  const rows = await database
    .select({ community: communities })
    .from(communities)
    .leftJoin(accounts, eq(accounts.id, communities.ownerAccountId))
    .where(
      and(
        eq(communities.publicStatus, 'PUBLISHED'),
        or(isNull(communities.ownerAccountId), ne(accounts.status, 'DISABLED')),
        slug === undefined ? undefined : eq(communities.publicSlug, slug),
      ),
    );
  return rows.map((row) => row.community);
}

export interface CommunityQuery {
  readonly term?: string;
  readonly kind?: string | null;
  readonly scope?: string | null;
  readonly species?: string | null;
  readonly breedId?: string | null;
  readonly province?: string | null;
  readonly page: number;
  readonly pageSize?: number;
}

export interface CommunityCard {
  readonly slug: string;
  readonly kind: CommunityKind;
  readonly nameFa: string;
  readonly scopeFa: string;
  readonly placeFa: string | null;
  readonly breedNamesFa: readonly string[];
  readonly owned: boolean;
  readonly registered: boolean;
  readonly upcomingEvents: number;
  readonly complete: boolean;
  /** A live advertising package, shown with its own label and nothing implied. */
  readonly promoted: boolean;
}

export async function publishedCommunities(
  database: DbClient,
  query: CommunityQuery,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<Page<CommunityCard> & { publishedTotal: number }> {
  const facts = await publishedRows(database).then((rows) => loadFacts(database, rows));
  const term = normalizeForSearch(query.term ?? '').trim();

  // ponytail: filtered in memory over published records; PROMPT-012 search moves this into indexed queries.
  const filtered = facts
    .filter((entry) => {
      if (query.kind && entry.community.kind !== query.kind) return false;
      if (query.scope && entry.community.scope !== query.scope) return false;
      if (query.species && !entry.speciesCodes.includes(query.species)) return false;
      if (query.breedId && !entry.breedIds.includes(query.breedId)) return false;
      if (query.province && entry.community.provinceCode !== query.province) return false;
      if (term !== '' && !normalizeForSearch(entry.community.displayNameFa).includes(term)) return false;
      return true;
    })
    .sort((a, b) => a.community.displayNameFa.localeCompare(b.community.displayNameFa, 'fa'));

  // §15 bands. An association or club has no Phase 1 trust axis of its own, so
  // its recorded registration is the verified band (DEC-0172).
  const promoted = await promotedTargetIds(database, 'COMMUNITY');
  const request = { page: query.page, pageSize: query.pageSize ?? 24 };
  const cards = filtered.map((entry) => ({
    slug: entry.community.publicSlug!,
    kind: entry.community.kind as CommunityKind,
    nameFa: entry.community.displayNameFa,
    scopeFa: entry.community.scope,
    placeFa: entry.cityNameFa ?? entry.provinceNameFa,
    breedNamesFa: entry.breedNamesFa,
    owned: entry.community.ownerAccountId !== null,
    registered: entry.community.licenceStatus === 'VALID',
    upcomingEvents: entry.events.filter((event) => event.status === 'PUBLISHED' && isUpcoming(event, today)).length,
    complete: communityCompleteness(completenessInputOf(entry)).complete,
    promoted: promotedWhenRelevant(promoted.has(entry.community.id), true),
  }));
  const ranked = [...cards].sort((a, b) =>
    compareRanked(
      { tier: rankTier({ promoted: a.promoted, trusted: false, verified: a.registered, complete: a.complete }), nameFa: a.nameFa },
      { tier: rankTier({ promoted: b.promoted, trusted: false, verified: b.registered, complete: b.complete }), nameFa: b.nameFa },
    ),
  );
  const items = ranked.slice(offsetOf(request), offsetOf(request) + request.pageSize);
  return { ...pageOf(items, ranked.length, request), publishedTotal: facts.length };
}

export interface CommunityPublicPage {
  readonly slug: string;
  readonly kind: CommunityKind;
  readonly nameFa: string;
  readonly aboutFa: string | null;
  readonly scope: CommunityScope;
  readonly placeFa: string | null;
  readonly registration: { readonly statusFa: string; readonly number: string | null } | null;
  readonly membershipInfoFa: string | null;
  readonly membershipUrl: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly owned: boolean;
  readonly speciesFa: readonly string[];
  readonly breedNamesFa: readonly string[];
  readonly managers: ReadonlyArray<{ nameFa: string; roleFa: string | null }>;
  readonly events: ReadonlyArray<{
    id: string;
    titleFa: string;
    startsOn: string;
    endsOn: string | null;
    placeFa: string | null;
    descriptionFa: string | null;
    registrationUrl: string | null;
    cityNameFa: string | null;
    cancelled: boolean;
    cancelReasonFa: string | null;
    upcoming: boolean;
  }>;
  readonly posts: ReadonlyArray<{ slug: string; titleFa: string; summaryFa: string; publishedAt: Date | null }>;
  readonly updatedAt: Date;
}

export async function communityPageBySlug(
  database: DbClient,
  slug: string,
  today: string = new Date().toISOString().slice(0, 10),
  now: Date = new Date(),
): Promise<CommunityPublicPage | null> {
  if (!SLUG.test(slug)) return null;
  const [community] = await publishedRows(database, slug);
  if (!community) return null;
  const [[facts], speciesRows, cityRows, postRows] = await Promise.all([
    loadFacts(database, [community]),
    database.select().from(species).orderBy(asc(species.sortOrder)),
    database.select({ id: cities.id, nameFa: cities.nameFa }).from(cities),
    database
      .select({ slug: contentItems.slug, titleFa: contentItems.titleFa, summaryFa: contentItems.summaryFa, publishAt: contentItems.publishAt, firstPublishedAt: contentItems.firstPublishedAt })
      .from(contentItems)
      .where(and(eq(contentItems.communityId, community.id), eq(contentItems.status, 'PUBLISHED')))
      .orderBy(desc(contentItems.firstPublishedAt)),
  ]);
  const cityName = new Map(cityRows.map((row) => [row.id, row.nameFa]));

  return {
    slug,
    kind: community.kind as CommunityKind,
    nameFa: community.displayNameFa,
    aboutFa: community.aboutFa,
    scope: community.scope as CommunityScope,
    placeFa: facts!.cityNameFa ?? facts!.provinceNameFa,
    registration: publicRegistration(community.licenceStatus, community.registrationNumber),
    membershipInfoFa: community.membershipInfoFa,
    membershipUrl: community.membershipUrl,
    contactPhone: community.contactPhone,
    websiteUrl: community.websiteUrl,
    owned: community.ownerAccountId !== null,
    speciesFa: speciesRows.filter((row) => facts!.speciesCodes.includes(row.code)).map((row) => row.nameFa),
    breedNamesFa: facts!.breedNamesFa,
    // Only managers who accepted the invitation are named (§20).
    managers: facts!.managers
      .filter((manager) => manager.status === 'ACCEPTED' && manager.nameFa !== null)
      .map((manager) => ({ nameFa: manager.nameFa!, roleFa: manager.roleFa })),
    events: facts!.events
      .filter((event) => event.status !== 'DRAFT')
      .map((event) => ({
        id: event.id,
        titleFa: event.titleFa,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        placeFa: event.placeFa,
        descriptionFa: event.descriptionFa,
        registrationUrl: event.registrationUrl,
        cityNameFa: event.cityId ? (cityName.get(event.cityId) ?? null) : null,
        cancelled: event.status === 'CANCELLED',
        cancelReasonFa: event.cancelReasonFa,
        upcoming: isUpcoming(event, today),
      })),
    // A scheduled post is not public until its time, exactly as in the CMS (DEC-0159).
    posts: postRows
      .filter((row) => row.publishAt === null || row.publishAt <= now)
      .map((row) => ({ slug: row.slug, titleFa: row.titleFa, summaryFa: row.summaryFa, publishedAt: row.firstPublishedAt })),
    updatedAt: community.updatedAt,
  };
}

export async function communitySitemapEntries(database: DbClient): Promise<{ path: string; lastModified: Date }[]> {
  const rows = await publishedRows(database);
  return rows.map((row) => ({ path: '/associations/' + row.publicSlug, lastModified: row.updatedAt }));
}
