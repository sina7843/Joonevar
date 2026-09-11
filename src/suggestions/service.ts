/**
 * Suggested directory records — Requirements-Phase-2 §10, §20, §22 (PROMPT-009).
 *
 * An ordinary user reports that a veterinarian or a centre exists. Nothing is
 * published from that alone: similar records are shown before the suggestion is
 * even accepted, a reviewer reads it, and only approval creates the record —
 * unowned, with the city and public contact that were suggested, so the people
 * it describes can claim it later (P2-D06, DEC-0169).
 */
import { and, asc, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { centreTypes, centres, directorySuggestions, vetProfiles } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt } from '../settings/service.ts';
import { AppError, conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';
import { decisionOutcome, isReviewDecision, type VetApplicationStatus } from '../vets/onboarding-model.ts';
import { isSuggestionKind, suggestionProblem, type SuggestionKind } from './model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

export type SuggestionRow = typeof directorySuggestions.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پیشنهاد هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const DAY_MS = 24 * 60 * 60 * 1000;
const SUGGESTER_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
const REVIEWER_CONTEXTS: readonly ActorContextName[] = ['REVIEW_OPERATOR', 'SUPERADMIN'];
const OPEN: readonly VetApplicationStatus[] = ['SUBMITTED', 'NEEDS_CORRECTION'];

function assertSuggester(actor: Actor): void {
  if (!SUGGESTER_CONTEXTS.includes(actor.context)) {
    throw forbidden('پیشنهاد ثبت رکورد از حساب کاربری خودتان ثبت می‌شود، نه از محیط عملیاتی.');
  }
}

function assertReviewer(actor: Actor): void {
  if (!REVIEWER_CONTEXTS.includes(actor.context)) {
    throw forbidden('بررسی پیشنهادها فقط در محیط اپراتور بررسی ممکن است.');
  }
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

function reasonOf(reason: string | null | undefined): string {
  const out = bounded(reason, 1000, 'دلیل');
  if (out === null) throw validation('دلیل این تصمیم را بنویسید.');
  return out;
}

/** A public address that is not the internal id and cannot be guessed from it (§20). */
const newSlug = (prefix: string): string => prefix + '-' + randomBytes(5).toString('hex');

export interface SimilarRecord {
  readonly kind: SuggestionKind;
  readonly nameFa: string;
  readonly slug: string | null;
  readonly owned: boolean;
  readonly published: boolean;
}

/**
 * Records that already carry this name. Shown before a suggestion is created
 * (§10) and checked again when it is approved, so the same place does not end
 * up in the directory twice.
 */
export async function similarRecords(database: DbClient, kind: string, displayNameFa: string): Promise<SimilarRecord[]> {
  const wanted = normalizeForSearch(displayNameFa ?? '');
  if (wanted === '') return [];
  const [vetRows, centreRows] = await Promise.all([
    kind === 'VET'
      ? database
          .select({ nameFa: vetProfiles.displayNameFa, slug: vetProfiles.publicSlug, accountId: vetProfiles.accountId, status: vetProfiles.publicStatus })
          .from(vetProfiles)
      : [],
    kind === 'CENTRE'
      ? database
          .select({ nameFa: centres.displayNameFa, slug: centres.publicSlug, accountId: centres.ownerAccountId, status: centres.publicStatus })
          .from(centres)
      : [],
  ]);
  // ponytail: name comparison in memory; PROMPT-012 search replaces it with an indexed query.
  return [...vetRows.map((row) => ({ ...row, kind: 'VET' as const })), ...centreRows.map((row) => ({ ...row, kind: 'CENTRE' as const }))]
    .filter((row) => normalizeForSearch(row.nameFa) === wanted)
    .map((row) => ({
      kind: row.kind,
      nameFa: row.nameFa,
      slug: row.status === 'PUBLISHED' ? row.slug : null,
      owned: row.accountId !== null,
      published: row.status === 'PUBLISHED',
    }));
}

export interface SuggestionInput {
  readonly kind: string;
  readonly displayNameFa: string;
  readonly cityId: string;
  readonly contactFa?: string | null;
  readonly sourceFa: string;
  readonly noteFa?: string | null;
  /** The suggester has seen the similar records and this is a different one. */
  readonly confirmedNotDuplicate?: boolean;
}

function validFields(input: SuggestionInput) {
  const fields = {
    displayNameFa: bounded(input.displayNameFa, 160, 'نام'),
    cityId: text(input.cityId),
    contactFa: bounded(input.contactFa, 300, 'تماس یا نشانی عمومی'),
    sourceFa: bounded(input.sourceFa, 300, 'منبع اطلاعات'),
    noteFa: bounded(input.noteFa, 1000, 'توضیح'),
  };
  const problem = suggestionProblem(fields);
  if (problem) throw validation(problem);
  if (!UUID.test(fields.cityId!)) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
  return {
    displayNameFa: fields.displayNameFa!,
    cityId: fields.cityId!,
    contactFa: fields.contactFa,
    sourceFa: fields.sourceFa!,
    noteFa: fields.noteFa,
  };
}

async function assertCity(tx: DbClient, cityId: string): Promise<void> {
  const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1);
  if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
}

async function assertNotDuplicate(tx: DbClient, kind: SuggestionKind, displayNameFa: string, confirmed: boolean | undefined): Promise<void> {
  const similar = await similarRecords(tx, kind, displayNameFa);
  if (similar.length === 0) return;
  const claimable = similar.find((row) => row.published && !row.owned);
  if (claimable) {
    throw conflict('همین نام در همزیست هست و هنوز مالکی ندارد؛ به‌جای پیشنهاد تازه، همان را Claim کنید.');
  }
  if (confirmed !== true) {
    throw conflict('رکوردی با همین نام وجود دارد: ' + similar.map((row) => row.nameFa).join('، ') + '. اگر جای دیگری است، تأیید «تکراری نیست» را بزنید.');
  }
}

export async function submitSuggestion(
  database: Database,
  actor: Actor,
  input: SuggestionInput,
  now: Date = new Date(),
): Promise<SuggestionRow> {
  assertSuggester(actor);
  if (!isSuggestionKind(input.kind)) throw validation('نوع پیشنهاد معتبر نیست.');
  const kind: SuggestionKind = input.kind;
  const fields = validFields(input);

  return database.transaction(async (tx) => {
    await assertCity(tx, fields.cityId);
    const [open] = await tx
      .select({ value: count() })
      .from(directorySuggestions)
      .where(and(eq(directorySuggestions.submittedByAccountId, actor.accountId), inArray(directorySuggestions.status, [...OPEN])));
    if (Number(open?.value ?? 0) >= 3) {
      throw conflict('سه پیشنهاد بازِ در حال بررسی دارید؛ تا تعیین تکلیف آن‌ها پیشنهاد تازه ثبت نمی‌شود.');
    }

    const limit = await readInt(tx, 'moderation.suggestion_daily_limit');
    const [recent] = await tx
      .select({ value: count() })
      .from(directorySuggestions)
      .where(
        and(
          eq(directorySuggestions.submittedByAccountId, actor.accountId),
          gt(directorySuggestions.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if (Number(recent?.value ?? 0) >= limit) {
      throw new AppError('RATE_LIMITED', 'در ۲۴ ساعت گذشته بیش از حد مجاز پیشنهاد ثبت کرده‌اید؛ بعداً دوباره تلاش کنید.');
    }

    await assertNotDuplicate(tx, kind, fields.displayNameFa, input.confirmedNotDuplicate);

    const [row] = await tx
      .insert(directorySuggestions)
      .values({ kind, submittedByAccountId: actor.accountId, ...fields })
      .returning();
    await recordAudit(tx, actor, {
      action: 'DIRECTORY_SUGGESTION_SUBMITTED',
      targetType: 'DIRECTORY_SUGGESTION',
      targetId: row!.id,
      targetVersion: row!.version,
      after: { kind, displayNameFa: fields.displayNameFa, cityId: fields.cityId, sourceFa: fields.sourceFa },
    });
    return row!;
  });
}

async function ownSuggestion(tx: DbClient, actor: Actor, suggestionId: string, expectedVersion: number): Promise<SuggestionRow> {
  const [row] = UUID.test(suggestionId)
    ? await tx.select().from(directorySuggestions).where(eq(directorySuggestions.id, suggestionId)).limit(1)
    : [];
  // Someone else's suggestion is not found, not forbidden: its existence is not disclosed.
  if (!row || row.submittedByAccountId !== actor.accountId) throw notFound('پیشنهاد پیدا نشد.');
  if (row.version !== expectedVersion) throw conflict(STALE);
  return row;
}

/** Answers a correction request: the suggestion goes back to review with what was asked for. */
export async function resubmitSuggestion(
  database: Database,
  actor: Actor,
  input: SuggestionInput & { suggestionId: string; expectedVersion: number },
): Promise<SuggestionRow> {
  assertSuggester(actor);
  const fields = validFields(input);

  return database.transaction(async (tx) => {
    const current = await ownSuggestion(tx, actor, input.suggestionId, input.expectedVersion);
    if (current.status !== 'NEEDS_CORRECTION') throw conflict('فقط پیشنهادی که اصلاحش خواسته شده دوباره ارسال می‌شود.');
    await assertCity(tx, fields.cityId);
    await assertNotDuplicate(tx, current.kind, fields.displayNameFa, input.confirmedNotDuplicate);

    const [row] = await tx
      .update(directorySuggestions)
      .set({ ...fields, status: 'SUBMITTED', version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(directorySuggestions.id, current.id), eq(directorySuggestions.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'DIRECTORY_SUGGESTION_RESUBMITTED',
      targetType: 'DIRECTORY_SUGGESTION',
      targetId: row.id,
      targetVersion: row.version,
      before: { displayNameFa: current.displayNameFa, cityId: current.cityId, contactFa: current.contactFa, status: current.status },
      after: { displayNameFa: row.displayNameFa, cityId: row.cityId, contactFa: row.contactFa, status: row.status },
    });
    return row;
  });
}

export async function withdrawSuggestion(
  database: Database,
  actor: Actor,
  input: { suggestionId: string; expectedVersion: number },
): Promise<SuggestionRow> {
  assertSuggester(actor);
  return database.transaction(async (tx) => {
    const current = await ownSuggestion(tx, actor, input.suggestionId, input.expectedVersion);
    if (!OPEN.includes(current.status)) throw conflict('این پیشنهاد دیگر باز نیست.');
    const [row] = await tx
      .update(directorySuggestions)
      .set({ status: 'WITHDRAWN', version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(directorySuggestions.id, current.id), eq(directorySuggestions.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'DIRECTORY_SUGGESTION_WITHDRAWN',
      targetType: 'DIRECTORY_SUGGESTION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status },
    });
    return row;
  });
}

export async function mySuggestions(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ suggestion: directorySuggestions, cityNameFa: cities.nameFa })
    .from(directorySuggestions)
    .leftJoin(cities, eq(cities.id, directorySuggestions.cityId))
    .where(eq(directorySuggestions.submittedByAccountId, actor.accountId))
    .orderBy(desc(directorySuggestions.createdAt));
  const slugs = await publishedSlugs(
    database,
    rows.map((row) => row.suggestion),
  );
  return rows.map((row) => ({ ...row.suggestion, cityNameFa: row.cityNameFa, publicSlug: slugs.get(row.suggestion.id) ?? null }));
}

/** The address of the record a suggestion produced, when that record is published. */
async function publishedSlugs(database: DbClient, rows: readonly SuggestionRow[]): Promise<Map<string, string | null>> {
  const vetIds = rows.map((row) => row.createdVetProfileId).filter((id): id is string => id !== null);
  const centreIds = rows.map((row) => row.createdCentreId).filter((id): id is string => id !== null);
  const [vetRows, centreRows] = await Promise.all([
    vetIds.length > 0
      ? database.select({ id: vetProfiles.id, slug: vetProfiles.publicSlug, status: vetProfiles.publicStatus }).from(vetProfiles).where(inArray(vetProfiles.id, vetIds))
      : [],
    centreIds.length > 0
      ? database.select({ id: centres.id, slug: centres.publicSlug, status: centres.publicStatus }).from(centres).where(inArray(centres.id, centreIds))
      : [],
  ]);
  const byId = new Map<string, string | null>();
  for (const row of [...vetRows, ...centreRows]) byId.set(row.id, row.status === 'PUBLISHED' ? row.slug : null);
  const out = new Map<string, string | null>();
  for (const row of rows) {
    const recordId = row.createdVetProfileId ?? row.createdCentreId;
    out.set(row.id, recordId ? (byId.get(recordId) ?? null) : null);
  }
  return out;
}

// ── Reviewer ─────────────────────────────────────────────────────────────

const QUEUE_STATUSES: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetApplicationStatus[]> = {
  OPEN: ['SUBMITTED'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
};

export async function suggestionQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  const request = { page: query.page, pageSize: query.pageSize ?? 20 };
  const where = inArray(directorySuggestions.status, [...QUEUE_STATUSES[query.view]]);
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(directorySuggestions).where(where),
    database
      .select({ suggestion: directorySuggestions, cityNameFa: cities.nameFa })
      .from(directorySuggestions)
      .leftJoin(cities, eq(cities.id, directorySuggestions.cityId))
      .where(where)
      .orderBy(query.view === 'DECIDED' ? desc(directorySuggestions.updatedAt) : asc(directorySuggestions.createdAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  return pageOf(
    rows.map((row) => ({ ...row.suggestion, cityNameFa: row.cityNameFa })),
    total?.value ?? 0,
    request,
  );
}

export async function suggestionForReview(database: DbClient, actor: Actor, suggestionId: string) {
  assertReviewer(actor);
  if (!UUID.test(suggestionId)) return null;
  const [row] = await database
    .select({ suggestion: directorySuggestions, cityNameFa: cities.nameFa, provinceNameFa: provinces.nameFa })
    .from(directorySuggestions)
    .leftJoin(cities, eq(cities.id, directorySuggestions.cityId))
    .leftJoin(provinces, eq(provinces.code, cities.provinceCode))
    .where(eq(directorySuggestions.id, suggestionId))
    .limit(1);
  if (!row) return null;
  return {
    suggestion: row.suggestion,
    cityNameFa: row.cityNameFa,
    provinceNameFa: row.provinceNameFa,
    // The suggester's identity is not shown: the reviewer judges the record, not the person (§20).
    similar: await similarRecords(database, row.suggestion.kind, row.suggestion.displayNameFa),
    createdSlug: (await publishedSlugs(database, [row.suggestion])).get(row.suggestion.id) ?? null,
  };
}

/**
 * The reviewer's decision. Approval creates the record without an owner and
 * publishes it with the «بدون مالک» label; the suggester is told either way and
 * never becomes its owner by suggesting it (§10, P2-D06).
 */
export async function decideSuggestion(
  database: Database,
  actor: Actor,
  input: { suggestionId: string; expectedVersion: number; decision: string; reasonFa: string; confirmedNotDuplicate?: boolean },
  now: Date = new Date(),
): Promise<SuggestionRow> {
  assertReviewer(actor);
  if (!isReviewDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const decision = input.decision;
  const reasonFa = reasonOf(input.reasonFa);
  if (!UUID.test(input.suggestionId)) throw notFound('پیشنهاد پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(directorySuggestions).where(eq(directorySuggestions.id, input.suggestionId)).limit(1);
    if (!current) throw notFound('پیشنهاد پیدا نشد.');
    if (current.submittedByAccountId === actor.accountId) throw forbidden('پیشنهاد خودتان را نمی‌توانید بررسی کنید.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    const outcome = decisionOutcome(current.status, decision);
    if (outcome === null) throw conflict('این پیشنهاد دیگر در انتظار بررسی نیست.');

    let createdVetProfileId = current.createdVetProfileId;
    let createdCentreId = current.createdCentreId;

    if (decision === 'APPROVE') {
      // Checked again at the moment of approval, not trusted from submission.
      await assertNotDuplicate(tx, current.kind, current.displayNameFa, input.confirmedNotDuplicate);
      if (current.kind === 'VET') {
        const [profile] = await tx
          .insert(vetProfiles)
          .values({
            accountId: null,
            displayNameFa: current.displayNameFa,
            listedCityId: current.cityId,
            listedContactFa: current.contactFa,
            sourceFa: current.sourceFa,
            publicStatus: 'PUBLISHED',
            publicSlug: newSlug('vet'),
            publicPublishedAt: now,
          })
          .returning();
        createdVetProfileId = profile!.id;
        await recordAudit(tx, actor, {
          action: 'VET_PROFILE_UNOWNED_PUBLISHED',
          targetType: 'VET_PROFILE',
          targetId: profile!.id,
          targetVersion: profile!.version,
          after: { displayNameFa: profile!.displayNameFa, listedCityId: current.cityId, sourceFa: current.sourceFa, publicSlug: profile!.publicSlug },
          reason: reasonFa,
          metadata: { suggestionId: current.id },
        });
      } else {
        // A suggestion does not say what kind of centre it is; a reviewer sets that on the centre itself.
        const [fallbackType] = await tx.select({ code: centreTypes.code }).from(centreTypes).where(eq(centreTypes.code, 'OTHER')).limit(1);
        if (!fallbackType) throw validation('نوع «سایر مراکز» در فهرست انواع مرکز نیست.');
        const [centre] = await tx
          .insert(centres)
          .values({
            ownerAccountId: null,
            typeCode: fallbackType.code,
            displayNameFa: current.displayNameFa,
            listedCityId: current.cityId,
            listedContactFa: current.contactFa,
            sourceFa: current.sourceFa,
            publicStatus: 'PUBLISHED',
            publicSlug: newSlug('centre'),
            publicPublishedAt: now,
          })
          .returning();
        createdCentreId = centre!.id;
        await recordAudit(tx, actor, {
          action: 'CENTRE_PUBLISHED_FROM_SUGGESTION',
          targetType: 'CENTRE',
          targetId: centre!.id,
          targetVersion: centre!.version,
          after: { displayNameFa: centre!.displayNameFa, listedCityId: current.cityId, sourceFa: current.sourceFa, publicSlug: centre!.publicSlug },
          reason: reasonFa,
          metadata: { suggestionId: current.id },
        });
      }
    }

    const [row] = await tx
      .update(directorySuggestions)
      .set({
        status: outcome,
        reviewNoteFa: reasonFa,
        reviewedByAccountId: actor.accountId,
        reviewedAt: now,
        createdVetProfileId,
        createdCentreId,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(directorySuggestions.id, current.id), eq(directorySuggestions.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'DIRECTORY_SUGGESTION_DECIDED',
      targetType: 'DIRECTORY_SUGGESTION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status, decision },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: current.submittedByAccountId,
      kind: 'DIRECTORY_SUGGESTION_DECIDED',
      titleFa:
        row.status === 'APPROVED'
          ? 'پیشنهاد شما ثبت شد'
          : row.status === 'NEEDS_CORRECTION'
            ? 'پیشنهاد شما نیازمند اصلاح است'
            : 'پیشنهاد شما پذیرفته نشد',
      bodyFa: reasonFa,
      resume: {
        entity: { type: 'DIRECTORY_SUGGESTION', id: row.id },
        step: row.status === 'NEEDS_CORRECTION' ? 'CORRECTION' : 'RESULT',
        originRoute: '/account/suggestions',
      },
    });
    return row;
  });
}

/** Unowned, published records a visitor may claim, for the «claim this» links. */
export async function claimableCentreCount(database: DbClient): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(centres)
    .where(and(isNull(centres.ownerAccountId), eq(centres.publicStatus, 'PUBLISHED')));
  return Number(row?.value ?? 0);
}
