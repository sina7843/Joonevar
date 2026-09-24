/**
 * Reporting and moderating the animal marketplace — PROMPT-004.
 *
 * Publication is direct: an advert goes live after the server validates it, and
 * a human looks at it afterwards, when somebody reports it or a signal suggests
 * it is worth a look. That is the product decision, so nothing here pretends
 * there was a review queue before publication.
 *
 * Two things this module is careful about.
 *
 * **Signals are not findings.** The queue computes how many people reported an
 * advert and whether its seller has been restricted before. Those numbers order
 * the work; they never decide it, never change what the public sees, and are
 * labelled as what they are wherever they are shown. A brigade of reports is
 * not evidence of anything except a brigade.
 *
 * **Nothing transactional is deleted.** Hiding an advert suspends it and leaves
 * every revision, report, decision and appeal in place, because a dispute about
 * a sale is answered from exactly those rows.
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { moderationAppeals, moderationReports, publisherRestrictions } from '../db/schema/moderation.ts';
import { animalListingMedia, animalListings } from '../db/schema/marketplace.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { isModerationDecision, reportInputProblems, reportStatusFor } from '../moderation/model.ts';
import { isMarketReportTarget } from './moderation-model.ts';

export * from './moderation-model.ts';
import { assertMarketplaceCapability } from './model.ts';
import { moderateListing } from './listings.ts';
import { publicListing } from './public-listings.ts';


// ── reporting ──────────────────────────────────────────────────────────────

export interface SubmitMarketReportInput {
  readonly target: string;
  /** The advert, for ANIMAL_LISTING and LISTING_MEDIA; the seller is read from it. */
  readonly listingId: string;
  readonly mediaId?: string | null;
  readonly reason: string;
  readonly details: string | null;
}

/**
 * Report an advert, one of its pictures, or its seller.
 *
 * Only a publicly visible advert is reportable, so this cannot be used to
 * discover that a hidden one exists. A second open report from the same account
 * about the same thing is refused by the database, not by a lookup: a duplicate
 * is a duplicate however fast it arrives.
 */
export async function submitMarketReport(
  database: Database,
  actor: Actor,
  input: SubmitMarketReportInput,
): Promise<{ id: string }> {
  const target = input.target;
  if (!isMarketReportTarget(target)) throw validation('موضوع گزارش معتبر نیست.');
  const problems = reportInputProblems({ reason: input.reason, details: input.details });
  if (problems.length > 0) throw validation(problems[0]!);

  const listing = await publicListing(database, input.listingId);
  if (listing === null) throw notFound('این آگهی پیدا نشد.');

  const [row] = await database
    .select({ sellerAccountId: animalListings.sellerAccountId })
    .from(animalListings)
    .where(eq(animalListings.id, input.listingId))
    .limit(1);
  const sellerAccountId = row!.sellerAccountId;
  if (sellerAccountId === actor.accountId) throw validation('گزارش آگهی خودتان ممکن نیست.');

  let mediaId: string | null = null;
  if (target === 'LISTING_MEDIA') {
    if (!input.mediaId) throw validation('رسانه مورد نظر را انتخاب کنید.');
    const [media] = await database
      .select({ id: animalListingMedia.id })
      .from(animalListingMedia)
      .where(and(eq(animalListingMedia.id, input.mediaId), eq(animalListingMedia.listingId, listing.id)))
      .limit(1);
    if (!media) throw notFound('این رسانه پیدا نشد.');
    mediaId = media.id;
  }

  return database.transaction(async (tx) => {
    let id: string;
    try {
      const [created] = await tx
        .insert(moderationReports)
        .values({
          targetKind: target,
          reporterAccountId: actor.accountId,
          reason: input.reason as never,
          details: input.details?.trim() || null,
          // Only an advert report names the advert directly: a media report
          // names its picture, and a seller report names the account.
          listingId: target === 'ANIMAL_LISTING' ? listing.id : null,
          listingMediaId: mediaId,
          sellerAccountId: target === 'SELLER' ? sellerAccountId : null,
          // The version the reporter was reading, so a later edit is visible
          // against what they actually saw.
          listingRevision: listing.listingRevision,
        })
        .returning({ id: moderationReports.id });
      id = created!.id;
    } catch (error) {
      const text = String(error) + String((error as { cause?: unknown }).cause ?? '');
      if (text.includes('moderation_report_one_open')) {
        throw conflict('گزارش باز شما درباره همین مورد ثبت شده است و در حال بررسی است.');
      }
      throw error;
    }

    await recordAudit(tx, actor, {
      action: 'MARKET_REPORT_SUBMITTED',
      targetType: target,
      targetId: mediaId ?? (target === 'SELLER' ? sellerAccountId : listing.id),
      after: { reportId: id, reason: input.reason },
    });
    return { id };
  });
}

// ── the queue ──────────────────────────────────────────────────────────────

export interface RiskSignals {
  /** How many separate accounts currently have an open report about this advert. */
  readonly openReporters: number;
  /** Open reports about this advert, however many each account made. */
  readonly openReports: number;
  /** Whether this seller has been restricted before. A history, not a verdict. */
  readonly sellerRestrictedBefore: boolean;
  /** Whether an advert of this seller has been suspended before. */
  readonly sellerSuspendedBefore: boolean;
}

export interface ListingQueueEntry {
  readonly listingId: string;
  readonly titleFa: string;
  readonly status: string;
  readonly sellerAccountId: string;
  readonly sellerMobile: string;
  readonly reasonsFa: readonly string[];
  readonly firstReportedAt: Date;
  readonly signals: RiskSignals;
  readonly reportIds: readonly string[];
}

/**
 * Adverts with open reports, the most-reported first.
 *
 * The order is a workload order and nothing more. Two people disagreeing about
 * the same advert does not make it worse than one person describing something
 * serious, and the screen says so next to the number.
 */
export async function listingReportQueue(
  database: DbClient,
  actor: Actor,
): Promise<readonly ListingQueueEntry[]> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');

  const reports = await database
    .select({
      id: moderationReports.id,
      listingId: moderationReports.listingId,
      mediaListingId: sql<string | null>`(
        select m.listing_id from animal_listing_media m where m.id = ${moderationReports.listingMediaId}
      )`,
      reason: moderationReports.reason,
      reporterAccountId: moderationReports.reporterAccountId,
      createdAt: moderationReports.createdAt,
    })
    .from(moderationReports)
    .where(
      and(
        eq(moderationReports.status, 'OPEN'),
        inArray(moderationReports.targetKind, ['ANIMAL_LISTING', 'LISTING_MEDIA']),
      ),
    )
    .orderBy(desc(moderationReports.createdAt));

  const grouped = new Map<string, typeof reports>();
  for (const report of reports) {
    const key = report.listingId ?? report.mediaListingId;
    if (!key) continue;
    const bucket = grouped.get(key) ?? [];
    bucket.push(report);
    grouped.set(key, bucket);
  }
  if (grouped.size === 0) return [];

  const listings = await database
    .select({
      id: animalListings.id,
      status: animalListings.status,
      sellerAccountId: animalListings.sellerAccountId,
      sellerMobile: accounts.mobile,
      titleFa: animals.name,
    })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .innerJoin(accounts, eq(accounts.id, animalListings.sellerAccountId))
    .where(inArray(animalListings.id, [...grouped.keys()]));

  const entries: ListingQueueEntry[] = [];
  for (const listing of listings) {
    const bucket = grouped.get(listing.id) ?? [];
    entries.push({
      listingId: listing.id,
      titleFa: listing.titleFa ?? 'بدون نام',
      status: listing.status,
      sellerAccountId: listing.sellerAccountId,
      sellerMobile: listing.sellerMobile,
      reasonsFa: [...new Set(bucket.map((r) => r.reason))],
      firstReportedAt: bucket.reduce(
        (earliest, r) => (r.createdAt < earliest ? r.createdAt : earliest),
        bucket[0]!.createdAt,
      ),
      signals: await riskSignals(database, listing.id, listing.sellerAccountId),
      reportIds: bucket.map((r) => r.id),
    });
  }

  // Most distinct reporters first, then the oldest complaint, so nothing sits
  // in the queue for ever just because only one person noticed it.
  return entries.sort(
    (a, b) =>
      b.signals.openReporters - a.signals.openReporters ||
      a.firstReportedAt.getTime() - b.firstReportedAt.getTime(),
  );
}

/**
 * Computed, never stored.
 *
 * Everything here is derived from rows that already exist, so there is no
 * flag table to fall out of date and no automated judgement pretending to be
 * a finding.
 */
export async function riskSignals(
  database: DbClient,
  listingId: string,
  sellerAccountId: string,
): Promise<RiskSignals> {
  const [reports] = await database
    .select({
      total: count(),
      reporters: sql<string>`count(distinct ${moderationReports.reporterAccountId})`,
    })
    .from(moderationReports)
    .where(
      and(
        eq(moderationReports.status, 'OPEN'),
        sql`(${moderationReports.listingId} = ${listingId} or exists (
          select 1 from animal_listing_media m
          where m.id = ${moderationReports.listingMediaId} and m.listing_id = ${listingId}
        ))`,
      ),
    );

  const [restricted] = await database
    .select({ total: count() })
    .from(publisherRestrictions)
    .where(eq(publisherRestrictions.accountId, sellerAccountId));

  const [suspended] = await database
    .select({ total: count() })
    .from(moderationReports)
    .where(
      and(
        eq(moderationReports.sellerAccountId, sellerAccountId),
        eq(moderationReports.status, 'ACTIONED'),
      ),
    );

  return {
    openReports: Number(reports?.total ?? 0),
    openReporters: Number(reports?.reporters ?? 0),
    sellerRestrictedBefore: Number(restricted?.total ?? 0) > 0,
    sellerSuspendedBefore: Number(suspended?.total ?? 0) > 0,
  };
}

// ── decisions ──────────────────────────────────────────────────────────────

export interface ListingDecisionInput {
  readonly listingId: string;
  readonly decision: string;
  readonly reasonFa: string;
  /** Required for RESTRICT_PUBLISHER; null means «until further notice». */
  readonly restrictionEndsAt?: Date | null;
  readonly expectedListingVersion: number;
}

/**
 * Decide every open report about one advert at once.
 *
 * One decision closes the whole group, because a moderator looks at the advert
 * and not at each complaint separately. The reports themselves keep their own
 * rows, their reasons and their reporters; what changes is their status and the
 * decision written onto them.
 */
export async function decideListingReports(
  database: Database,
  actor: Actor,
  input: ListingDecisionInput,
): Promise<{ closed: number; listingStatus: string }> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  if (!isModerationDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const decision = input.decision;
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل این تصمیم را بنویسید؛ برای فروشنده و در تاریخچه ثبت می‌شود.');

  const [listing] = await database
    .select({
      id: animalListings.id,
      status: animalListings.status,
      version: animalListings.version,
      sellerAccountId: animalListings.sellerAccountId,
    })
    .from(animalListings)
    .where(eq(animalListings.id, input.listingId))
    .limit(1);
  if (!listing) throw notFound('این آگهی پیدا نشد.');

  /*
   * The advert moves first, outside this transaction's own update, because the
   * listing service owns its state machine and its version guard. A decision
   * that cannot be carried out must not close the reports either.
   */
  let listingStatus = listing.status;
  if (decision === 'HIDE' || decision === 'SOFT_DELETE') {
    const moved = await moderateListing(database, actor, {
      listingId: listing.id,
      to: decision === 'HIDE' ? 'SUSPENDED' : 'REMOVED',
      reasonFa,
      expectedVersion: input.expectedListingVersion,
    });
    listingStatus = moved.status;
  }

  return database.transaction(async (tx) => {
    if (decision === 'RESTRICT_PUBLISHER') {
      await tx.insert(publisherRestrictions).values({
        accountId: listing.sellerAccountId,
        reason: reasonFa,
        endsAt: input.restrictionEndsAt ?? null,
        createdByAccountId: actor.accountId,
      });
      await recordAudit(tx, actor, {
        action: 'MARKET_SELLER_RESTRICTED',
        targetType: 'ACCOUNT',
        targetId: listing.sellerAccountId,
        after: { endsAt: input.restrictionEndsAt?.toISOString() ?? null },
        reason: reasonFa,
      });
    }

    const closed = await tx
      .update(moderationReports)
      .set({
        status: reportStatusFor(decision),
        decision,
        decisionReason: reasonFa,
        decidedByAccountId: actor.accountId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(moderationReports.status, 'OPEN'),
          // Every open complaint about this advert: the ones that name it, and
          // the ones that name one of its pictures. A report about the seller
          // is a separate subject and is decided on its own.
          sql`(${moderationReports.listingId} = ${listing.id} or exists (
            select 1 from animal_listing_media m
            where m.id = ${moderationReports.listingMediaId} and m.listing_id = ${listing.id}
          ))`,
        ),
      )
      .returning({ id: moderationReports.id });

    await recordAudit(tx, actor, {
      action: 'MARKET_REPORTS_DECIDED',
      targetType: 'ANIMAL_LISTING',
      targetId: listing.id,
      after: { decision, closed: closed.length, listingStatus },
      reason: reasonFa,
    });

    return { closed: closed.length, listingStatus };
  });
}

// ── appeals ────────────────────────────────────────────────────────────────

export interface AppealView {
  readonly id: string;
  readonly reportId: string;
  readonly statementFa: string;
  readonly status: string;
  readonly decisionReasonFa: string | null;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly listingId: string | null;
  readonly listingTitleFa: string | null;
}

/**
 * Object to a decision.
 *
 * Only the seller the decision was about may appeal, and only against a report
 * that was actually acted on: there is nothing to appeal against a dismissal.
 * The original decision is never rewritten — the appeal is its own row with its
 * own outcome, so afterwards both are readable.
 */
export async function submitAppeal(
  database: Database,
  actor: Actor,
  input: { reportId: string; statementFa: string },
): Promise<{ id: string }> {
  const statementFa = input.statementFa.trim();
  if (statementFa === '') throw validation('توضیح اعتراض را بنویسید.');
  if (statementFa.length > 2000) throw validation('توضیح اعتراض بیش از حد طولانی است.');

  const [report] = await database
    .select({
      id: moderationReports.id,
      status: moderationReports.status,
      listingId: moderationReports.listingId,
      sellerAccountId: moderationReports.sellerAccountId,
      listingSeller: sql<string | null>`(
        select l.seller_account_id from animal_listing l where l.id = ${moderationReports.listingId}
      )`,
    })
    .from(moderationReports)
    .where(eq(moderationReports.id, input.reportId))
    .limit(1);
  if (!report) throw notFound('این گزارش پیدا نشد.');

  const subject = report.sellerAccountId ?? report.listingSeller;
  if (subject !== actor.accountId) throw notFound('این گزارش پیدا نشد.');
  if (report.status !== 'ACTIONED') throw conflict('فقط درباره تصمیمی که اقدام داشته می‌توان اعتراض کرد.');

  return database.transaction(async (tx) => {
    let id: string;
    try {
      const [created] = await tx
        .insert(moderationAppeals)
        .values({ reportId: report.id, appellantAccountId: actor.accountId, statementFa })
        .returning({ id: moderationAppeals.id });
      id = created!.id;
    } catch (error) {
      const text = String(error) + String((error as { cause?: unknown }).cause ?? '');
      if (text.includes('moderation_appeal_one_open_key')) {
        throw conflict('اعتراض باز شما درباره همین تصمیم ثبت شده است.');
      }
      throw error;
    }

    await recordAudit(tx, actor, {
      action: 'MARKET_APPEAL_SUBMITTED',
      targetType: 'MODERATION_REPORT',
      targetId: report.id,
      after: { appealId: id },
    });
    return { id };
  });
}

/**
 * Decisions about this advert that its seller may still object to.
 *
 * Only decisions that were acted on, only for the seller they were about, and
 * only where that seller has not already objected — a second appeal about the
 * same decision is the same objection.
 */
export async function appealableReports(
  database: DbClient,
  actor: Actor,
  listingId: string,
): Promise<readonly { id: string; decisionReason: string | null; decidedAt: Date | null }[]> {
  const rows = await database
    .select({
      id: moderationReports.id,
      decisionReason: moderationReports.decisionReason,
      decidedAt: moderationReports.decidedAt,
    })
    .from(moderationReports)
    .innerJoin(animalListings, eq(animalListings.id, moderationReports.listingId))
    .where(
      and(
        eq(moderationReports.listingId, listingId),
        eq(moderationReports.status, 'ACTIONED'),
        eq(animalListings.sellerAccountId, actor.accountId),
        sql`not exists (
          select 1 from moderation_appeal a
          where a.report_id = ${moderationReports.id} and a.appellant_account_id = ${actor.accountId}
        )`,
      ),
    )
    .orderBy(desc(moderationReports.decidedAt));
  return rows;
}

export async function appealQueue(database: DbClient, actor: Actor): Promise<readonly AppealView[]> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const rows = await database
    .select({
      id: moderationAppeals.id,
      reportId: moderationAppeals.reportId,
      statementFa: moderationAppeals.statementFa,
      status: moderationAppeals.status,
      decisionReasonFa: moderationAppeals.decisionReasonFa,
      createdAt: moderationAppeals.createdAt,
      decidedAt: moderationAppeals.decidedAt,
      listingId: moderationReports.listingId,
      listingTitleFa: animals.name,
    })
    .from(moderationAppeals)
    .innerJoin(moderationReports, eq(moderationReports.id, moderationAppeals.reportId))
    .leftJoin(animalListings, eq(animalListings.id, moderationReports.listingId))
    .leftJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(moderationAppeals.status, 'OPEN'))
    .orderBy(desc(moderationAppeals.createdAt));
  return rows as AppealView[];
}

/** My own appeals, so a seller can see what happened to their objection. */
export async function myAppeals(database: DbClient, actor: Actor): Promise<readonly AppealView[]> {
  const rows = await database
    .select({
      id: moderationAppeals.id,
      reportId: moderationAppeals.reportId,
      statementFa: moderationAppeals.statementFa,
      status: moderationAppeals.status,
      decisionReasonFa: moderationAppeals.decisionReasonFa,
      createdAt: moderationAppeals.createdAt,
      decidedAt: moderationAppeals.decidedAt,
      listingId: moderationReports.listingId,
      listingTitleFa: animals.name,
    })
    .from(moderationAppeals)
    .innerJoin(moderationReports, eq(moderationReports.id, moderationAppeals.reportId))
    .leftJoin(animalListings, eq(animalListings.id, moderationReports.listingId))
    .leftJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(moderationAppeals.appellantAccountId, actor.accountId))
    .orderBy(desc(moderationAppeals.createdAt));
  return rows as AppealView[];
}

/**
 * Answer an appeal.
 *
 * Overturning it is a decision of its own: the listing is restored by the same
 * state machine that suspended it, and both the original decision and the
 * reversal stay readable. Nothing is deleted either way.
 */
export async function decideAppeal(
  database: Database,
  actor: Actor,
  input: { appealId: string; uphold: boolean; reasonFa: string; expectedListingVersion?: number },
): Promise<{ status: string }> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل پاسخ به اعتراض را بنویسید.');

  const [appeal] = await database
    .select({
      id: moderationAppeals.id,
      status: moderationAppeals.status,
      reportId: moderationAppeals.reportId,
      listingId: moderationReports.listingId,
    })
    .from(moderationAppeals)
    .innerJoin(moderationReports, eq(moderationReports.id, moderationAppeals.reportId))
    .where(eq(moderationAppeals.id, input.appealId))
    .limit(1);
  if (!appeal) throw notFound('این اعتراض پیدا نشد.');
  if (appeal.status !== 'OPEN') throw conflict('این اعتراض قبلاً پاسخ داده شده است.');

  if (!input.uphold && appeal.listingId) {
    const [listing] = await database
      .select({ status: animalListings.status, version: animalListings.version })
      .from(animalListings)
      .where(eq(animalListings.id, appeal.listingId))
      .limit(1);
    if (listing && listing.status === 'SUSPENDED') {
      await moderateListing(database, actor, {
        listingId: appeal.listingId,
        to: 'PUBLISHED',
        reasonFa: 'اعتراض پذیرفته شد: ' + reasonFa,
        expectedVersion: input.expectedListingVersion ?? listing.version,
      });
    }
  }

  const status = input.uphold ? 'UPHELD' : 'OVERTURNED';
  await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(moderationAppeals)
      .set({
        status,
        decisionReasonFa: reasonFa,
        decidedByAccountId: actor.accountId,
        decidedAt: new Date(),
      })
      .where(and(eq(moderationAppeals.id, appeal.id), eq(moderationAppeals.status, 'OPEN')))
      .returning({ id: moderationAppeals.id });
    if (!updated) throw conflict('این اعتراض هم‌زمان پاسخ داده شد.');

    await recordAudit(tx, actor, {
      action: 'MARKET_APPEAL_DECIDED',
      targetType: 'MODERATION_REPORT',
      targetId: appeal.reportId,
      after: { appealId: appeal.id, status },
      reason: reasonFa,
    });
  });

  return { status };
}
