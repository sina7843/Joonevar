/**
 * Reports and moderation — Requirements-Phase-2 §13, §20, §22 (PROMPT-005).
 *
 * A signed-in person reports content they can see, once per item while the
 * report is open and within a daily limit. The content admin decides on all
 * open reports of an item at once: dismiss them, ask the author for a
 * correction, hide or soft-delete the content, or restrict the publisher. The
 * decision is written onto each report with its actor, time and reason, the
 * change it causes is audited where it happens, and everything runs in one
 * transaction — a second moderator deciding at the same moment gets a conflict,
 * not a second decision.
 *
 * Reporters are never shown to the content admin or the author: moderation is
 * about what was published, not about who pointed at it (§20).
 */
import { and, count, desc, eq, gt, inArray, isNull, max, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { contentItems } from '../db/schema/content.ts';
import { moderationReports, publisherRestrictions } from '../db/schema/moderation.ts';
import { recordAudit } from '../audit/service.ts';
import { DAY_MS, boundedRows, limitMessageFa, windowStart, withinLimit } from '../privacy/limits.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt } from '../settings/service.ts';
import { AppError, conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import type { Actor } from '../authz/actor.ts';
import { applyContentStatus } from '../content/service.ts';
import { formatInstantFa, publicState, type ContentKind, type ContentStatus } from '../content/model.ts';
import { activeRestrictionFor, type RestrictionRow } from './restrictions.ts';
import {
  isModerationDecision,
  isRestrictionActive,
  reportInputProblems,
  reportStatusFor,
  restrictionEndProblem,
  type ModerationDecision,
  type ReportReason,
  type ReportStatus,
} from './model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET = 'CONTENT_ITEM';

function assertContentAdmin(actor: Actor): void {
  if (actor.context !== 'CONTENT_ADMIN') throw forbidden('گزارش‌ها فقط در محیط ادمین محتوا بررسی می‌شوند.');
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') throw validation('دلیل این تصمیم را بنویسید؛ در تاریخچه ثبت می‌شود.');
  return trimmed;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

const DUPLICATE_REPORT = 'گزارش قبلی شما درباره همین مطلب هنوز در حال بررسی است.';

// ── Reporting ─────────────────────────────────────────────────────────────

/** What a reporter may see of an item before reporting it: only content the public can see. */
export async function reportableContent(database: DbClient, contentId: string, now: Date = new Date()) {
  if (!UUID.test(contentId)) return null;
  const [item] = await database
    .select({
      id: contentItems.id,
      kind: contentItems.kind,
      slug: contentItems.slug,
      titleFa: contentItems.titleFa,
      status: contentItems.status,
      publishAt: contentItems.publishAt,
      authorAccountId: contentItems.authorAccountId,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentId))
    .limit(1);
  if (!item) return null;
  const state = publicState(item, now);
  return state === 'VISIBLE' || state === 'ARCHIVED' ? item : null;
}

export async function submitContentReport(
  database: Database,
  actor: Actor,
  input: { contentId: string; reason: string; details: string | null },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const problems = reportInputProblems(input);
  if (problems.length > 0) throw validation(problems[0]!);
  const details = (input.details ?? '').trim() || null;

  try {
    return await database.transaction(async (tx) => {
      const item = await reportableContent(tx, input.contentId, now);
      if (!item) throw notFound('این مطلب پیدا نشد یا دیگر در سایت نیست.');
      if (item.authorAccountId === actor.accountId) {
        throw validation('مطلب خودتان را نمی‌توانید گزارش کنید؛ آن را از محیط نویسنده اصلاح کنید.');
      }

      const [open] = await tx
        .select({ id: moderationReports.id })
        .from(moderationReports)
        .where(
          and(
            eq(moderationReports.reporterAccountId, actor.accountId),
            eq(moderationReports.contentId, item.id),
            eq(moderationReports.status, 'OPEN'),
          ),
        )
        .limit(1);
      if (open) throw conflict(DUPLICATE_REPORT);

      const ceiling = await readInt(tx, 'moderation.report_daily_limit');
      const [recent] = await tx
        .select({ value: count() })
        .from(moderationReports)
        .where(
          and(
            eq(moderationReports.reporterAccountId, actor.accountId),
            gt(moderationReports.createdAt, windowStart(now, DAY_MS)),
          ),
        );
      // One rule for every ceiling (§20): count inside the window, compare, and
      // refuse without telling a guesser how many attempts are left.
      if (!withinLimit({ used: Number(recent?.value ?? 0), ceiling })) {
        throw new AppError('RATE_LIMITED', limitMessageFa(DAY_MS));
      }

      const [current] = await tx
        .select({ revisionNumber: contentItems.revisionNumber })
        .from(contentItems)
        .where(eq(contentItems.id, item.id))
        .limit(1);
      const [row] = await tx
        .insert(moderationReports)
        .values({
          targetKind: 'CONTENT',
          contentId: item.id,
          reporterAccountId: actor.accountId,
          reason: input.reason as ReportReason,
          details,
          contentRevision: current?.revisionNumber ?? null,
          createdAt: now,
        })
        .returning({ id: moderationReports.id });
      await recordAudit(tx, actor, {
        action: 'CONTENT_REPORTED',
        targetType: TARGET,
        targetId: item.id,
        // The reporter is the actor of this row; the details stay on the report, not in the log.
        metadata: { reportId: row!.id, reason: input.reason },
      });
      return { id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(DUPLICATE_REPORT);
    throw error;
  }
}

// ── The content admin's queue ─────────────────────────────────────────────

export interface QueueEntry {
  readonly contentId: string;
  readonly kind: ContentKind;
  readonly titleFa: string;
  readonly status: ContentStatus;
  readonly openReports: number;
  readonly latestAt: Date;
  readonly reasons: readonly ReportReason[];
  readonly correctionRequested: boolean;
}

/** Items with open reports, most recently reported first. */
export async function openReportQueue(
  database: DbClient,
  actor: Actor,
  request: { page: number; pageSize?: number },
): Promise<Page<QueueEntry>> {
  assertContentAdmin(actor);
  // §20: one answer never returns a whole table, however large a page is asked for.
  const page = { page: request.page, pageSize: boundedRows(request.pageSize, 20) };
  const groups = await database
    .select({
      contentId: moderationReports.contentId,
      openReports: count(),
      latestAt: max(moderationReports.createdAt),
      reasons: sql<string[]>`array_agg(distinct ${moderationReports.reason}::text)`,
    })
    .from(moderationReports)
    .where(eq(moderationReports.status, 'OPEN'))
    .groupBy(moderationReports.contentId)
    .orderBy(desc(max(moderationReports.createdAt)))
    .limit(page.pageSize)
    .offset(offsetOf(page));
  const [total] = await database
    .select({ value: sql<string>`count(distinct ${moderationReports.contentId})` })
    .from(moderationReports)
    .where(eq(moderationReports.status, 'OPEN'));

  const ids = groups.map((group) => group.contentId!).filter(Boolean);
  const items = ids.length
    ? await database
        .select({
          id: contentItems.id,
          kind: contentItems.kind,
          titleFa: contentItems.titleFa,
          status: contentItems.status,
          correctionNote: contentItems.correctionNote,
        })
        .from(contentItems)
        .where(inArray(contentItems.id, ids))
    : [];
  const byId = new Map(items.map((item) => [item.id, item]));

  return pageOf(
    groups.flatMap((group) => {
      const item = byId.get(group.contentId!);
      if (!item) return [];
      return [
        {
          contentId: item.id,
          kind: item.kind,
          titleFa: item.titleFa,
          status: item.status,
          openReports: Number(group.openReports),
          latestAt: group.latestAt as Date,
          reasons: group.reasons as ReportReason[],
          correctionRequested: item.correctionNote !== null,
        },
      ];
    }),
    Number(total?.value ?? 0),
    page,
  );
}

export interface DecidedReport {
  readonly id: string;
  readonly contentId: string;
  readonly titleFa: string;
  readonly reason: ReportReason;
  readonly status: ReportStatus;
  readonly decision: ModerationDecision;
  readonly decisionReason: string | null;
  readonly decidedAt: Date;
  readonly decidedByName: string | null;
}

/** Decided reports, newest decision first — the moderation history. */
export async function decidedReports(
  database: DbClient,
  actor: Actor,
  request: { page: number; pageSize?: number },
): Promise<Page<DecidedReport>> {
  assertContentAdmin(actor);
  // §20: one answer never returns a whole table, however large a page is asked for.
  const page = { page: request.page, pageSize: boundedRows(request.pageSize, 20) };
  const where = sql`${moderationReports.status} <> 'OPEN'`;
  const rows = await database
    .select({
      report: moderationReports,
      titleFa: contentItems.titleFa,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
    })
    .from(moderationReports)
    .innerJoin(contentItems, eq(contentItems.id, moderationReports.contentId))
    .leftJoin(profiles, eq(profiles.accountId, moderationReports.decidedByAccountId))
    .where(where)
    .orderBy(desc(moderationReports.decidedAt))
    .limit(page.pageSize)
    .offset(offsetOf(page));
  const [total] = await database.select({ value: count() }).from(moderationReports).where(where);
  return pageOf(
    rows.map(({ report, titleFa, firstName, lastName }) => ({
      id: report.id,
      contentId: report.contentId!,
      titleFa,
      reason: report.reason,
      status: report.status,
      decision: report.decision!,
      decisionReason: report.decisionReason,
      decidedAt: report.decidedAt!,
      decidedByName: firstName ? firstName + ' ' + (lastName ?? '') : null,
    })),
    Number(total?.value ?? 0),
    page,
  );
}

/** One item with its open and decided reports, its author and the author's restriction. */
export async function reportsForContent(database: DbClient, actor: Actor, contentId: string, now: Date = new Date()) {
  assertContentAdmin(actor);
  if (!UUID.test(contentId)) return null;
  const [item] = await database.select().from(contentItems).where(eq(contentItems.id, contentId)).limit(1);
  if (!item) return null;

  const [reports, author, restriction] = await Promise.all([
    database
      .select({
        report: moderationReports,
        deciderFirstName: profiles.firstName,
        deciderLastName: profiles.lastName,
      })
      .from(moderationReports)
      .leftJoin(profiles, eq(profiles.accountId, moderationReports.decidedByAccountId))
      .where(eq(moderationReports.contentId, item.id))
      .orderBy(desc(moderationReports.createdAt)),
    database
      .select({ firstName: profiles.firstName, lastName: profiles.lastName, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.accountId, item.authorAccountId))
      .limit(1),
    activeRestrictionFor(database, item.authorAccountId, now),
  ]);

  const shaped = reports.map(({ report, deciderFirstName, deciderLastName }) => ({
    id: report.id,
    reason: report.reason,
    details: report.details,
    contentRevision: report.contentRevision,
    status: report.status,
    decision: report.decision,
    decisionReason: report.decisionReason,
    decidedAt: report.decidedAt,
    decidedByName: deciderFirstName ? deciderFirstName + ' ' + (deciderLastName ?? '') : null,
    createdAt: report.createdAt,
  }));
  const authorName = author[0]
    ? (author[0].displayName ?? author[0].firstName + ' ' + author[0].lastName)
    : 'نویسنده بدون پروفایل';

  return {
    item,
    publicState: publicState(item, now),
    authorName,
    restriction,
    open: shaped.filter((report) => report.status === 'OPEN'),
    decided: shaped.filter((report) => report.status !== 'OPEN'),
  };
}

// ── Deciding ──────────────────────────────────────────────────────────────

export interface DecisionInput {
  readonly contentId: string;
  readonly decision: string;
  readonly reason: string;
  /** For RESTRICT_PUBLISHER: when it ends; null means until lifted. */
  readonly restrictUntil?: Date | null;
}

/**
 * Decides every open report of one item. The report rows are closed first, with
 * a condition on their status, so the second of two simultaneous decisions
 * finds nothing left to close and stops before doing anything.
 */
export async function decideContentReports(
  database: Database,
  actor: Actor,
  input: DecisionInput,
  now: Date = new Date(),
): Promise<{ decision: ModerationDecision; closed: number }> {
  assertContentAdmin(actor);
  if (!UUID.test(input.contentId)) throw notFound('محتوا پیدا نشد.');
  if (!isModerationDecision(input.decision)) throw validation('تصمیم را انتخاب کنید.');
  const decision = input.decision;
  const reason = requireReason(input.reason);
  const restrictUntil = input.restrictUntil ?? null;
  if (decision === 'RESTRICT_PUBLISHER') {
    const problem = restrictionEndProblem(restrictUntil, now);
    if (problem) throw validation(problem);
  }

  return database.transaction(async (tx) => {
    const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, input.contentId)).limit(1);
    if (!item) throw notFound('محتوا پیدا نشد.');

    const closed = await tx
      .update(moderationReports)
      .set({
        status: reportStatusFor(decision),
        decision,
        decisionReason: reason,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
      })
      .where(and(eq(moderationReports.contentId, item.id), eq(moderationReports.status, 'OPEN')))
      .returning({ id: moderationReports.id });
    if (closed.length === 0) {
      throw conflict('گزارش بازی برای این محتوا نمانده است؛ ممکن است همکار دیگری همین حالا تصمیم گرفته باشد.');
    }

    const editorRoute = '/author/content/' + item.id;
    let notice: { titleFa: string; bodyFa: string; route: string } | null = null;

    if (decision === 'HIDE' || decision === 'SOFT_DELETE') {
      await applyContentStatus(
        tx,
        actor,
        { contentId: item.id, expectedVersion: item.version, to: decision === 'HIDE' ? 'HIDDEN' : 'DELETED', reason },
        now,
      );
      notice = {
        titleFa: decision === 'HIDE' ? 'یکی از نوشته‌های شما مخفی شد' : 'یکی از نوشته‌های شما حذف شد',
        bodyFa: '«' + item.titleFa + '» پس از بررسی گزارش ' + (decision === 'HIDE' ? 'مخفی' : 'حذف') + ' شد. دلیل: ' + reason,
        route: editorRoute,
      };
    } else if (decision === 'REQUEST_CORRECTION') {
      if (item.status === 'DELETED') throw validation('برای محتوای حذف‌شده درخواست اصلاح ثبت نمی‌شود.');
      const [row] = await tx
        .update(contentItems)
        .set({ correctionNote: reason, correctionRequestedAt: now, version: item.version + 1, updatedAt: now })
        .where(and(eq(contentItems.id, item.id), eq(contentItems.version, item.version)))
        .returning({ version: contentItems.version });
      if (!row) throw conflict('این محتوا هم‌زمان تغییر کرده است؛ دوباره تصمیم بگیرید.');
      await recordAudit(tx, actor, {
        action: 'CONTENT_CORRECTION_REQUESTED',
        targetType: TARGET,
        targetId: item.id,
        targetVersion: row.version,
        before: { correctionNote: item.correctionNote },
        after: { correctionNote: reason },
        reason,
      });
      notice = {
        titleFa: 'درخواست اصلاح یکی از نوشته‌های شما',
        bodyFa: '«' + item.titleFa + '»: ' + reason + ' — با ذخیره نسخه اصلاح‌شده، درخواست بسته می‌شود.',
        route: editorRoute,
      };
    } else if (decision === 'RESTRICT_PUBLISHER') {
      if (await activeRestrictionFor(tx, item.authorAccountId, now)) {
        throw validation('این نویسنده همین حالا محدودیت فعال دارد.');
      }
      const [restriction] = await tx
        .insert(publisherRestrictions)
        .values({
          accountId: item.authorAccountId,
          reason,
          startsAt: now,
          endsAt: restrictUntil,
          sourceContentId: item.id,
          createdByAccountId: actor.accountId,
        })
        .returning();
      await recordAudit(tx, actor, {
        action: 'PUBLISHER_RESTRICTED',
        targetType: 'ACCOUNT',
        targetId: item.authorAccountId,
        before: { restricted: false },
        after: { restricted: true, restrictionId: restriction!.id, endsAt: restrictUntil },
        reason,
        metadata: { sourceContentId: item.id },
      });
      notice = {
        titleFa: 'انتشار برای حساب شما محدود شد',
        bodyFa:
          'تا ' + (restrictUntil ? formatInstantFa(restrictUntil) : 'اطلاع بعدی') + ' نمی‌توانید محتوا منتشر کنید یا محتوای منتشرشده را تغییر دهید. دلیل: ' + reason,
        route: '/author',
      };
    }

    await recordAudit(tx, actor, {
      action: 'CONTENT_REPORTS_DECIDED',
      targetType: TARGET,
      targetId: item.id,
      reason,
      metadata: { decision, reports: closed.map((row) => row.id) },
    });

    if (notice) {
      await createNotification(tx, {
        recipientAccountId: item.authorAccountId,
        kind: 'CONTENT_MODERATION_' + decision,
        titleFa: notice.titleFa,
        bodyFa: notice.bodyFa,
        resume: { entity: { type: 'CONTENT_ITEM', id: item.id }, step: decision, originRoute: notice.route },
      });
    }
    return { decision, closed: closed.length };
  });
}

// ── Restrictions ──────────────────────────────────────────────────────────

export async function restrictionHistory(database: DbClient, actor: Actor, now: Date = new Date()) {
  assertContentAdmin(actor);
  const rows = await database
    .select({ restriction: publisherRestrictions, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(publisherRestrictions)
    .innerJoin(accounts, eq(accounts.id, publisherRestrictions.accountId))
    .leftJoin(profiles, eq(profiles.accountId, publisherRestrictions.accountId))
    .orderBy(desc(publisherRestrictions.createdAt))
    .limit(100);
  return rows.map(({ restriction, firstName, lastName }) => ({
    ...restriction,
    authorName: firstName ? firstName + ' ' + (lastName ?? '') : 'نویسنده بدون پروفایل',
    active: isRestrictionActive(restriction, now),
  }));
}

export async function liftRestriction(
  database: Database,
  actor: Actor,
  input: { restrictionId: string; reason: string },
  now: Date = new Date(),
): Promise<RestrictionRow> {
  assertContentAdmin(actor);
  if (!UUID.test(input.restrictionId)) throw notFound('محدودیت پیدا نشد.');
  const reason = requireReason(input.reason);

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(publisherRestrictions)
      .set({ liftedAt: now, liftedByAccountId: actor.accountId, liftReason: reason })
      .where(and(eq(publisherRestrictions.id, input.restrictionId), isNull(publisherRestrictions.liftedAt)))
      .returning();
    if (!row) throw notFound('محدودیت فعالی با این شناسه پیدا نشد.');
    await recordAudit(tx, actor, {
      action: 'PUBLISHER_RESTRICTION_LIFTED',
      targetType: 'ACCOUNT',
      targetId: row.accountId,
      before: { restrictionId: row.id, liftedAt: null },
      after: { restrictionId: row.id, liftedAt: now },
      reason,
    });
    await createNotification(tx, {
      recipientAccountId: row.accountId,
      kind: 'CONTENT_MODERATION_RESTRICTION_LIFTED',
      titleFa: 'محدودیت انتشار برداشته شد',
      bodyFa: 'دوباره می‌توانید محتوا منتشر کنید. دلیل: ' + reason,
      resume: { entity: { type: 'CONTENT_ITEM', id: row.sourceContentId ?? row.id }, step: 'RESTRICTION_LIFTED', originRoute: '/author' },
    });
    return row;
  });
}
