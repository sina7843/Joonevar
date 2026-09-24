/**
 * The association review workbench — Phase 2.5 PROMPT-007.
 *
 * One queue for every professional case the association decides — student,
 * council code and practice licence, and the trusted-veterinarian review once its
 * case type exists — with filters and pagination. A reviewer claims a case, which
 * moves it to UNDER_REVIEW and freezes the applicant's edits, records structured
 * checks against the submission version they are reading, then decides or
 * releases it. Every step is optimistic on the case version, so two reviewers
 * cannot both claim, and nobody decides a case someone else holds.
 *
 * The reviewer role is the association operator (with the superadmin), scoped to
 * the association environment (DEC-0190, DEC-0193). Nothing here touches a
 * payment: association reviewers cannot mark one successful, and the licensed and
 * trusted tags accept only the server (professional-tags.ts).
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { profiles } from '../db/schema/identity.ts';
import { vetCaseReviewChecks, vetProfessionalCases, vetProfessionalSubmissions, vetProfiles } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus } from './professional-model.ts';
import {
  APPROVAL_OUTCOMES,
  CASE_STATUS_FA,
  CASE_TYPE_FA,
  REVIEW_CHECKS,
  isReviewCheckCode,
  isReviewCheckResult,
  type ReviewCheckResult,
  type VetCaseType,
} from './professional-profile-model.ts';
// The same audit target as the application modules; not imported, because they import this module.
const CASE_TARGET = 'VET_PROFESSIONAL_CASE';

export const REVIEW_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];
/** The case types the association decides in this environment. */
export const REVIEW_CASE_TYPES: readonly VetCaseType[] = ['STUDENT', 'COUNCIL', 'LICENCE', 'TRUSTED'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const HELD_BY_OTHER = 'این پرونده را بررسی‌کننده دیگری در دست دارد؛ تا رها نشود، اقدام دیگری روی آن ممکن نیست.';

export const REVIEW_VIEWS = ['OPEN', 'CORRECTION', 'DECIDED', 'ALL'] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];
export const REVIEW_CLAIMS = ['ALL', 'MINE', 'UNCLAIMED', 'OTHERS'] as const;
export type ReviewClaim = (typeof REVIEW_CLAIMS)[number];

const VIEW_STATUSES: Record<Exclude<ReviewView, 'ALL'>, readonly VetCaseStatus[]> = {
  OPEN: ['SUBMITTED', 'UNDER_REVIEW'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['VERIFIED_STUDENT', 'VERIFIED_NO_LICENSE', 'LICENSE_APPROVED_AWAITING_PAYMENT', 'TRUSTED_APPROVED_AWAITING_PAYMENT', 'REJECTED'],
};

export const DETAIL_ROUTE: Record<VetCaseType, string> = {
  STUDENT: '/assoc/vet-students/',
  COUNCIL: '/assoc/vet-doctors/',
  LICENCE: '/assoc/vet-licences/',
  CLAIM: '/assoc/vet-doctors/',
  TRUSTED: '/assoc/vet-trusted/',
};

export type CaseRow = typeof vetProfessionalCases.$inferSelect;

export function assertReviewer(actor: Actor): void {
  if (!REVIEW_CONTEXTS.includes(actor.context)) throw forbidden('میز بررسی دامپزشکان فقط در محیط انجمن باز می‌شود.');
}

/** A case of this workbench: one of its types, and not a mirrored Phase 2 application. */
async function reviewableCase(tx: DbClient, caseId: string): Promise<CaseRow> {
  const [row] = UUID.test(caseId) ? await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, caseId)).limit(1) : [];
  if (!row || !REVIEW_CASE_TYPES.includes(row.caseType as VetCaseType) || row.legacyApplicationId !== null) throw notFound('پرونده پیدا نشد.');
  return row;
}

// ── Queue ──────────────────────────────────────────────────────────────────

export interface ReviewFilters {
  readonly caseType?: string | null;
  readonly view?: string | null;
  readonly claim?: string | null;
  readonly q?: string | null;
  readonly page: number;
  readonly pageSize?: number;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => '\\' + ch);

export async function reviewQueue(database: DbClient, actor: Actor, filters: ReviewFilters) {
  assertReviewer(actor);
  const caseType = filters.caseType ?? 'ALL';
  const view = (filters.view ?? 'OPEN') as ReviewView;
  const claim = (filters.claim ?? 'ALL') as ReviewClaim;
  if (caseType !== 'ALL' && !REVIEW_CASE_TYPES.includes(caseType as VetCaseType)) throw validation('نوع پرونده معتبر نیست.');
  if (!REVIEW_VIEWS.includes(view)) throw validation('نمای صف معتبر نیست.');
  if (!REVIEW_CLAIMS.includes(claim)) throw validation('فیلتر برداشتن پرونده معتبر نیست.');
  const q = (filters.q ?? '').trim().slice(0, 60);
  const request = { page: Math.max(1, filters.page || 1), pageSize: boundedRows(filters.pageSize, 20) };

  const like = '%' + escapeLike(q) + '%';
  const where = and(
    isNull(vetProfessionalCases.legacyApplicationId),
    caseType === 'ALL' ? inArray(vetProfessionalCases.caseType, [...REVIEW_CASE_TYPES]) : eq(vetProfessionalCases.caseType, caseType as VetCaseType),
    view === 'ALL' ? ne(vetProfessionalCases.status, 'DRAFT') : inArray(vetProfessionalCases.status, [...VIEW_STATUSES[view]]),
    claim === 'MINE' ? eq(vetProfessionalCases.claimedByAccountId, actor.accountId) : undefined,
    claim === 'UNCLAIMED' ? isNull(vetProfessionalCases.claimedByAccountId) : undefined,
    claim === 'OTHERS' ? and(isNotNull(vetProfessionalCases.claimedByAccountId), ne(vetProfessionalCases.claimedByAccountId, actor.accountId)) : undefined,
    q === ''
      ? undefined
      : or(
          sql`${vetProfessionalSubmissions.payload} ->> 'displayNameFa' ilike ${like}`,
          sql`${vetProfessionalSubmissions.payload} ->> 'councilCode' ilike ${like}`,
          sql`${vetProfessionalSubmissions.payload} ->> 'studentNumber' ilike ${like}`,
          sql`${vetProfessionalSubmissions.payload} ->> 'licenceCode' ilike ${like}`,
          sql`${vetProfiles.displayNameFa} ilike ${like}`,
        ),
  );
  const base = () =>
    database
      .select({ row: vetProfessionalCases, payload: vetProfessionalSubmissions.payload, profileName: vetProfiles.displayNameFa, firstName: profiles.firstName, lastName: profiles.lastName })
      .from(vetProfessionalCases)
      .leftJoin(
        vetProfessionalSubmissions,
        and(eq(vetProfessionalSubmissions.caseId, vetProfessionalCases.id), eq(vetProfessionalSubmissions.version, vetProfessionalCases.currentSubmissionVersion)),
      )
      .leftJoin(vetProfiles, eq(vetProfiles.id, vetProfessionalCases.vetProfileId))
      .leftJoin(profiles, eq(profiles.accountId, vetProfessionalCases.accountId));

  const [[total], rows] = await Promise.all([
    database
      .select({ value: count() })
      .from(vetProfessionalCases)
      .leftJoin(
        vetProfessionalSubmissions,
        and(eq(vetProfessionalSubmissions.caseId, vetProfessionalCases.id), eq(vetProfessionalSubmissions.version, vetProfessionalCases.currentSubmissionVersion)),
      )
      .leftJoin(vetProfiles, eq(vetProfiles.id, vetProfessionalCases.vetProfileId))
      .where(where),
    base()
      .where(where)
      // The longest-waiting case first while it waits; otherwise the most recent.
      .orderBy(view === 'OPEN' ? asc(vetProfessionalCases.updatedAt) : desc(vetProfessionalCases.updatedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);

  const items = rows.map(({ row, payload, profileName, firstName, lastName }) => {
    const fields = (payload ?? {}) as Record<string, unknown>;
    const type = row.caseType as VetCaseType;
    return {
      id: row.id,
      caseType: type,
      caseTypeFa: CASE_TYPE_FA[type],
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      submissionVersion: row.currentSubmissionVersion,
      displayNameFa: profileName ?? (typeof fields.displayNameFa === 'string' ? fields.displayNameFa : null) ?? (firstName ? firstName + ' ' + (lastName ?? '') : null),
      code: (typeof fields.licenceCode === 'string' ? fields.licenceCode : null) ?? (typeof fields.councilCode === 'string' ? fields.councilCode : null) ?? (typeof fields.studentNumber === 'string' ? fields.studentNumber : null),
      claimedByMe: row.claimedByAccountId === actor.accountId,
      claimedByOther: row.claimedByAccountId !== null && row.claimedByAccountId !== actor.accountId,
      claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
      detailHref: DETAIL_ROUTE[type] + row.id,
    };
  });
  return pageOf(items, Number(total?.value ?? 0), request);
}

// ── Claim and release ──────────────────────────────────────────────────────

export async function claimCase(database: Database, actor: Actor, input: { caseId: string; expectedVersion: number }, now: Date = new Date()): Promise<CaseRow> {
  assertReviewer(actor);
  return database.transaction(async (tx) => {
    const current = await reviewableCase(tx, input.caseId);
    if (current.accountId === actor.accountId) throw forbidden('پرونده خودتان را نمی‌توانید بررسی کنید.');
    if (current.status === 'UNDER_REVIEW') {
      throw conflict(current.claimedByAccountId === actor.accountId ? 'این پرونده همین حالا در دست شماست.' : HELD_BY_OTHER);
    }
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (!vetCaseMove(current.status as VetCaseStatus, 'UNDER_REVIEW', 'REVIEWER')) throw conflict('این پرونده در انتظار بررسی نیست.');
    // Conditional on the version: of two reviewers claiming at once, exactly one row is updated.
    const [row] = await tx
      .update(vetProfessionalCases)
      .set({ status: 'UNDER_REVIEW', claimedByAccountId: actor.accountId, claimedAt: now, version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'VET_CASE_CLAIMED',
      targetType: CASE_TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, claimedByAccountId: null },
      after: { status: row.status, claimedByAccountId: actor.accountId, submissionVersion: row.currentSubmissionVersion },
    });
    return row;
  });
}

/** Back to the queue. The holder releases freely; the superadmin may release someone else's case with a reason. */
export async function releaseCase(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; reasonFa?: string | null },
  now: Date = new Date(),
): Promise<CaseRow> {
  assertReviewer(actor);
  const reasonFa = (input.reasonFa ?? '').trim() || null;
  return database.transaction(async (tx) => {
    const current = await reviewableCase(tx, input.caseId);
    if (current.status !== 'UNDER_REVIEW') throw conflict('این پرونده در دست بررسی نیست.');
    const holder = current.claimedByAccountId === actor.accountId;
    if (!holder && actor.context !== 'SUPERADMIN') throw forbidden('فقط بررسی‌کننده‌ای که پرونده را برداشته آن را رها می‌کند.');
    if (!holder && reasonFa === null) throw validation('برای رها کردن پرونده بررسی‌کننده دیگر، دلیل را بنویسید.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    if (!vetCaseMove('UNDER_REVIEW', 'SUBMITTED', 'REVIEWER')) throw conflict('این انتقال مجاز نیست.');
    const [row] = await tx
      .update(vetProfessionalCases)
      .set({ status: 'SUBMITTED', claimedByAccountId: null, claimedAt: null, version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'VET_CASE_RELEASED',
      targetType: CASE_TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, claimedByAccountId: current.claimedByAccountId },
      after: { status: row.status, claimedByAccountId: null },
      reason: reasonFa,
    });
    return row;
  });
}

// ── Structured checks ──────────────────────────────────────────────────────

export interface CheckInput {
  readonly code: string;
  readonly result: string;
  readonly noteFa?: string | null;
}

/** Checks against the version the reviewer is reading. Only the holder of the case records them. */
export async function recordReviewChecks(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; checks: readonly CheckInput[] },
  now: Date = new Date(),
) {
  assertReviewer(actor);
  if (input.checks.length === 0) throw validation('دست‌کم یک مورد بررسی را ثبت کنید.');
  if (input.checks.length > 12) throw validation('موارد بررسی بیش از حد مجاز است.');
  return database.transaction(async (tx) => {
    const current = await reviewableCase(tx, input.caseId);
    const type = current.caseType as VetCaseType;
    if (current.status !== 'UNDER_REVIEW') throw conflict('ثبت بررسی فقط برای پرونده‌ای است که برداشته‌اید.');
    if (current.claimedByAccountId !== actor.accountId) throw conflict(HELD_BY_OTHER);
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    const rows = input.checks.map((check) => {
      if (!isReviewCheckCode(type, check.code)) throw validation('مورد بررسی «' + check.code + '» برای این نوع پرونده تعریف نشده است.');
      if (!isReviewCheckResult(check.result)) throw validation('نتیجه بررسی معتبر نیست.');
      const noteFa = (check.noteFa ?? '').trim() || null;
      if (noteFa !== null && noteFa.length > 500) throw validation('یادداشت بررسی حداکثر ۵۰۰ نویسه است.');
      if (check.result === 'FAIL' && noteFa === null) throw validation('برای موردی که درست نیست، توضیح بنویسید.');
      return {
        caseId: current.id,
        submissionVersion: current.currentSubmissionVersion,
        checkCode: check.code,
        result: check.result as ReviewCheckResult,
        noteFa,
        reviewerAccountId: actor.accountId,
        createdAt: now,
      };
    });
    const inserted = await tx.insert(vetCaseReviewChecks).values(rows).returning();
    await recordAudit(tx, actor, {
      action: 'VET_CASE_CHECKS_RECORDED',
      targetType: CASE_TARGET,
      targetId: current.id,
      targetVersion: current.version,
      before: { status: current.status },
      after: { status: current.status, submissionVersion: current.currentSubmissionVersion, checks: rows.map((row) => ({ code: row.checkCode, result: row.result })) },
    });
    return inserted;
  });
}

/** The latest recorded result of each check for one submission version. */
export async function latestChecks(database: DbClient, caseId: string, submissionVersion: number) {
  const rows = await database
    .select()
    .from(vetCaseReviewChecks)
    .where(and(eq(vetCaseReviewChecks.caseId, caseId), eq(vetCaseReviewChecks.submissionVersion, submissionVersion)))
    .orderBy(asc(vetCaseReviewChecks.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latest.set(row.checkCode, row);
  return latest;
}

/**
 * Called by every decision, inside its transaction. A case someone else holds is
 * not decided, and an approval is refused while a recorded check of the current
 * version says the evidence is wrong.
 */
export async function assertDecisionAllowed(tx: DbClient, current: CaseRow, actor: Actor, outcome: VetCaseStatus): Promise<void> {
  if (current.status === 'UNDER_REVIEW' && current.claimedByAccountId !== actor.accountId) throw conflict(HELD_BY_OTHER);
  if (!APPROVAL_OUTCOMES.includes(outcome)) return;
  const failed = [...(await latestChecks(tx, current.id, current.currentSubmissionVersion)).values()].filter((row) => row.result === 'FAIL');
  if (failed.length > 0) {
    throw conflict('در بررسی این نسخه موردی ثبت شده که درست نیست؛ با این وضعیت تأیید ممکن نیست. اصلاح بخواهید، رد کنید یا مورد را دوباره بررسی و ثبت کنید.', {
      failedChecks: failed.map((row) => row.checkCode),
    });
  }
}

/** Everything the review panel of a case needs, for the reviewer looking at it. */
export async function reviewStateFor(database: DbClient, actor: Actor, caseId: string) {
  assertReviewer(actor);
  const row = await reviewableCase(database, caseId).catch(() => null);
  if (!row) return null;
  const type = row.caseType as VetCaseType;
  const [checks, [claimer]] = await Promise.all([
    latestChecks(database, row.id, row.currentSubmissionVersion),
    row.claimedByAccountId
      ? database.select({ firstName: profiles.firstName, lastName: profiles.lastName }).from(profiles).where(eq(profiles.accountId, row.claimedByAccountId)).limit(1)
      : Promise.resolve([]),
  ]);
  const claimedByMe = row.claimedByAccountId === actor.accountId;
  const open = row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW';
  return {
    caseId: row.id,
    caseType: type,
    status: row.status as VetCaseStatus,
    statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
    version: row.version,
    submissionVersion: row.currentSubmissionVersion,
    ownCase: row.accountId === actor.accountId,
    claimedByMe,
    claimedByOther: row.claimedByAccountId !== null && !claimedByMe,
    claimerNameFa: claimer ? claimer.firstName + ' ' + claimer.lastName : null,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
    canClaim: open && row.status === 'SUBMITTED' && row.accountId !== actor.accountId,
    canRelease: row.status === 'UNDER_REVIEW' && (claimedByMe || actor.context === 'SUPERADMIN'),
    canRecordChecks: row.status === 'UNDER_REVIEW' && claimedByMe,
    checks: REVIEW_CHECKS[type].map((definition) => {
      const latest = checks.get(definition.code);
      return {
        code: definition.code,
        labelFa: definition.labelFa,
        result: (latest?.result ?? null) as ReviewCheckResult | null,
        noteFa: latest?.noteFa ?? null,
        at: latest ? latest.createdAt.toISOString() : null,
      };
    }),
  };
}
