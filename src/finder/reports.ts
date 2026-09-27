/**
 * The finder report queue — PHASE-4 PROMPT-007.
 *
 * Reports live in the shared `moderation_report` (typed target, one open report
 * per reporter and target) with a finder category. What is new here is the
 * work around them:
 *  - a queue for FINDER_REPORT_MODERATE only, showing the reported item and
 *    nothing around it: one message, never the conversation; a request's status,
 *    never its chat or contract text; a person as a masked label, never a number;
 *  - one moderator per report (take/release), a reasoned decision whose action
 *    is applied in the same transaction, and a conditional update so two
 *    decisions on one report cannot both land;
 *  - an appeal by the person the decision affected, decided by someone else,
 *    whose reversal undoes the action and lifts any sanction tied to the report;
 *  - private evidence files, served to the queue's moderators only, every view
 *    audited.
 */
import fs from 'node:fs/promises';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { storedFiles } from '../db/schema/core.ts';
import { accountSanctions, moderationAppeals, moderationReportEvidence, moderationReports } from '../db/schema/moderation.ts';
import { finderMessages, matingProfileMedia, matingProfiles, matingRequests } from '../db/schema/finder.ts';
import { animals } from '../db/schema/animals.ts';
import { accounts } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { assertAcceptable } from '../files/signature.ts';
import { assertWithinLimit } from '../security/rate-limit.ts';
import { redactText } from '../security/redaction.ts';
import { reportInputProblems } from '../moderation/model.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderCapability, hasFinderCapability } from './model.ts';
import { deactivateProfileOf, submitProfileReport } from './profiles.ts';
import { reportMessage } from './conversation.ts';
import { counterpartOf, loadForParty } from './requests.ts';
import {
  ACTION_FA,
  appealProblem,
  CATEGORY_FA,
  decisionProblem,
  FINDER_TARGET_KINDS,
  isFinderCategory,
  MAX_EVIDENCE_FILES,
  REASON_FOR,
  TARGET_FA,
  type FinderAction,
  type FinderReportCategory,
  type FinderTarget,
} from './reports-model.ts';

type ReportRow = typeof moderationReports.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inFinder = sql`${moderationReports.targetKind}::text in (${sql.join(FINDER_TARGET_KINDS.map((k) => sql`${k}`), sql`, `)})`;

export interface EvidenceUpload {
  readonly bytes: Uint8Array;
  readonly originalName: string;
}

// ── submitting ───────────────────────────────────────────────────────────────

/**
 * One way in for every finder report. Each target is checked by the rule that
 * already guards it: a profile the reporter can see, a message of a
 * conversation the reporter is in, a request the reporter is party to. A person
 * is reported through a request both were in, never by an account id, so the
 * form cannot be used to find out which accounts exist.
 */
export async function submitFinderReport(
  db: Database,
  storageRoot: string,
  actor: Actor,
  input: { target: FinderTarget; id: string; mediaId?: string | null; category: string; details: string | null; evidence?: readonly EvidenceUpload[] },
): Promise<{ id: string }> {
  if (!isFinderCategory(input.category)) throw validation('نوع گزارش را انتخاب کنید.');
  const category: FinderReportCategory = input.category;
  const reason = REASON_FOR[category];
  const evidence = input.evidence ?? [];
  if (evidence.length > MAX_EVIDENCE_FILES) throw validation('حداکثر ' + MAX_EVIDENCE_FILES + ' فایل مدرک.');
  // Signatures are checked before anything is written, so a bad file creates no report.
  for (const file of evidence) assertAcceptable('FINDER_REPORT_EVIDENCE', file.bytes);
  const attach = async (tx: DbClient, reportId: string) => {
    for (const file of evidence) {
      const stored = await putPrivateFile(tx, storageRoot, actor, { ownerAccountId: actor.accountId, purpose: 'FINDER_REPORT_EVIDENCE', bytes: file.bytes, originalName: file.originalName });
      await tx.insert(moderationReportEvidence).values({ reportId, fileId: stored.id, uploadedByAccountId: actor.accountId });
    }
  };

  if (input.target === 'PROFILE' || input.target === 'MEDIA') {
    return submitProfileReport(db, actor, { profileId: input.id, mediaId: input.target === 'MEDIA' ? (input.mediaId ?? null) : null, reason, details: input.details, finderCategory: category }, attach);
  }
  if (input.target === 'MESSAGE') {
    return reportMessage(db, actor, { messageId: input.id, reason, details: input.details, finderCategory: category }, attach);
  }

  const problems = reportInputProblems({ reason, details: input.details });
  if (problems.length > 0) throw validation(problems[0]!);
  if (!UUID.test(input.id)) throw notFound('پیدا نشد.');
  await assertWithinLimit(db, { action: 'REPORT_SUBMIT', actor });
  return db.transaction(async (tx) => {
    const { request } = await loadForParty(tx, actor, input.id);
    const values =
      input.target === 'REQUEST'
        ? { targetKind: 'FINDER_REQUEST' as never, finderRequestId: request.id }
        : { targetKind: 'FINDER_ACCOUNT' as never, reportedAccountId: counterpartOf(request, actor.accountId) };
    let id: string;
    try {
      const [created] = await tx
        .insert(moderationReports)
        .values({ ...values, reporterAccountId: actor.accountId, reason: reason as never, details: input.details?.trim() || null, finderCategory: category })
        .returning({ id: moderationReports.id });
      id = created!.id;
    } catch (error) {
      if ((String(error) + String((error as { cause?: unknown }).cause ?? '')).includes('moderation_report_one_open_finder')) {
        throw conflict('گزارش باز شما درباره همین مورد ثبت شده است و در حال بررسی است.');
      }
      throw error;
    }
    await recordAudit(tx, actor, { action: 'FINDER_REPORTED', targetType: values.targetKind as string, targetId: id, after: { category } });
    await attach(tx, id);
    return { id };
  });
}

// ── who a report is about ────────────────────────────────────────────────────

/** The account a decision affects: the one who may appeal it. */
async function subjectOf(db: DbClient, report: ReportRow): Promise<string | null> {
  if (report.reportedAccountId) return report.reportedAccountId;
  if (report.finderMessageId) {
    const [m] = await db.select({ sender: finderMessages.senderAccountId }).from(finderMessages).where(eq(finderMessages.id, report.finderMessageId)).limit(1);
    return m?.sender ?? null;
  }
  if (report.matingProfileId || report.matingProfileMediaId) {
    const profileId =
      report.matingProfileId ??
      (await db.select({ p: matingProfileMedia.profileId }).from(matingProfileMedia).where(eq(matingProfileMedia.id, report.matingProfileMediaId!)).limit(1))[0]?.p;
    if (!profileId) return null;
    const [p] = await db.select({ owner: matingProfiles.ownerAccountId }).from(matingProfiles).where(eq(matingProfiles.id, profileId)).limit(1);
    return p?.owner ?? null;
  }
  if (report.finderRequestId) {
    const [r] = await db.select().from(matingRequests).where(eq(matingRequests.id, report.finderRequestId)).limit(1);
    return r ? counterpartOf(r, report.reporterAccountId) : null;
  }
  return null;
}

// ── the queue ────────────────────────────────────────────────────────────────

export interface QueueItem {
  readonly id: string;
  readonly category: FinderReportCategory;
  readonly categoryFa: string;
  readonly targetKind: string;
  readonly targetFa: string;
  readonly status: string;
  readonly details: string | null;
  readonly createdAt: Date;
  readonly assignedToMe: boolean;
  readonly assigned: boolean;
  readonly evidence: readonly string[];
  /** The reported item alone: one message, a request status, a profile's animal name — nothing around it. */
  readonly subjectFa: string;
  readonly decision: string | null;
  readonly decisionReason: string | null;
}

async function subjectSummary(db: DbClient, report: ReportRow): Promise<string> {
  if (report.finderMessageId) {
    const [m] = await db.select({ body: finderMessages.bodyFa, hidden: finderMessages.hiddenAt, file: finderMessages.fileId }).from(finderMessages).where(eq(finderMessages.id, report.finderMessageId)).limit(1);
    return (m?.hidden ? '[پنهان‌شده] ' : '') + (m?.body ?? (m?.file ? '[پیوست]' : '—'));
  }
  if (report.matingProfileId || report.matingProfileMediaId) {
    const [row] = await db
      .select({ name: animals.name, state: matingProfiles.state })
      .from(matingProfiles)
      .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
      .where(
        report.matingProfileId
          ? eq(matingProfiles.id, report.matingProfileId)
          : sql`${matingProfiles.id} = (select profile_id from mating_profile_media where id = ${report.matingProfileMediaId})`,
      )
      .limit(1);
    return 'حیوان «' + (row?.name ?? 'بدون نام') + '» — وضعیت پروفایل: ' + (row?.state ?? '—');
  }
  if (report.finderRequestId) {
    const [r] = await db.select({ status: matingRequests.status, route: matingRequests.route }).from(matingRequests).where(eq(matingRequests.id, report.finderRequestId)).limit(1);
    return 'درخواست در وضعیت ' + (r?.status ?? '—') + ' — مسیر ' + (r?.route ?? '—');
  }
  if (report.reportedAccountId) {
    const [a] = await db.select({ mobile: accounts.mobile }).from(accounts).where(eq(accounts.id, report.reportedAccountId)).limit(1);
    return 'کاربر ' + (a ? '••' + a.mobile.slice(-2) : '—');
  }
  return '—';
}

export async function finderReportQueue(db: DbClient, actor: Actor, opts: { status?: 'OPEN' | 'CLOSED' } = {}): Promise<QueueItem[]> {
  assertFinderCapability(actor, 'FINDER_REPORT_MODERATE');
  const rows = await db
    .select()
    .from(moderationReports)
    .where(and(inFinder, opts.status === 'CLOSED' ? sql`${moderationReports.status} <> 'OPEN'` : eq(moderationReports.status, 'OPEN')))
    .orderBy(desc(moderationReports.createdAt))
    .limit(100);
  const evidence = rows.length
    ? await db.select({ id: moderationReportEvidence.id, reportId: moderationReportEvidence.reportId }).from(moderationReportEvidence).where(inArray(moderationReportEvidence.reportId, rows.map((r) => r.id)))
    : [];
  const out: QueueItem[] = [];
  for (const r of rows) {
    const category = (r.finderCategory ?? 'OTHER_POLICY') as FinderReportCategory;
    out.push({
      id: r.id,
      category,
      categoryFa: CATEGORY_FA[category],
      targetKind: r.targetKind,
      targetFa: TARGET_FA[r.targetKind] ?? r.targetKind,
      status: r.status,
      // A number the reporter typed is not something the moderator needs to read.
      details: r.details === null ? null : redactText(r.details),
      createdAt: r.createdAt,
      assignedToMe: r.assignedToAccountId === actor.accountId,
      assigned: r.assignedToAccountId !== null,
      evidence: evidence.filter((e) => e.reportId === r.id).map((e) => e.id),
      subjectFa: await subjectSummary(db, r),
      decision: r.decision,
      decisionReason: r.decisionReason,
    });
  }
  return out;
}

/** Take a report to work on it; a report someone else holds stays theirs. */
export async function takeReport(db: Database, actor: Actor, input: { reportId: string; release?: boolean }, now: Date = new Date()) {
  assertFinderCapability(actor, 'FINDER_REPORT_MODERATE');
  const [row] = await db
    .update(moderationReports)
    .set(input.release ? { assignedToAccountId: null, assignedAt: null } : { assignedToAccountId: actor.accountId, assignedAt: now })
    .where(
      and(
        eq(moderationReports.id, input.reportId),
        inFinder,
        eq(moderationReports.status, 'OPEN'),
        input.release ? eq(moderationReports.assignedToAccountId, actor.accountId) : or(isNull(moderationReports.assignedToAccountId), eq(moderationReports.assignedToAccountId, actor.accountId)),
      ),
    )
    .returning();
  if (!row) throw conflict(input.release ? 'این گزارش در دست شما نیست.' : 'این گزارش را کس دیگری برداشته یا بسته شده است.');
  await recordAudit(db, actor, { action: input.release ? 'FINDER_REPORT_RELEASED' : 'FINDER_REPORT_TAKEN', targetType: 'MODERATION_REPORT', targetId: row.id });
  return row;
}

async function profileIdOf(tx: DbClient, report: ReportRow): Promise<string | null> {
  if (report.matingProfileId) return report.matingProfileId;
  if (!report.matingProfileMediaId) return null;
  const [m] = await tx.select({ p: matingProfileMedia.profileId }).from(matingProfileMedia).where(eq(matingProfileMedia.id, report.matingProfileMediaId)).limit(1);
  return m?.p ?? null;
}

/**
 * Decide a report the actor holds. The action lands in the same transaction as
 * the decision, the affected person is told the reason (and may appeal), and
 * the reporter hears only that it was reviewed.
 */
export async function decideFinderReport(
  db: Database,
  actor: Actor,
  input: { reportId: string; action: FinderAction; reasonFa: string },
  now: Date = new Date(),
): Promise<ReportRow> {
  assertFinderCapability(actor, 'FINDER_REPORT_MODERATE');
  if (input.action === 'UNLIST_PROFILE') assertFinderCapability(actor, 'FINDER_PROFILE_MODERATE');
  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(moderationReports).where(and(eq(moderationReports.id, input.reportId), inFinder)).for('update').limit(1);
    if (!report) throw notFound('گزارش پیدا نشد.');
    const problem = decisionProblem({ targetKind: report.targetKind, action: input.action, reasonFa: input.reasonFa, status: report.status, assignedTo: report.assignedToAccountId, actorId: actor.accountId });
    if (problem) throw conflict(problem);
    const reasonFa = input.reasonFa.trim();

    if (input.action === 'HIDE_MESSAGE') {
      await tx.update(finderMessages).set({ hiddenAt: now }).where(and(eq(finderMessages.id, report.finderMessageId!), isNull(finderMessages.hiddenAt)));
    } else if (input.action === 'HIDE_MEDIA') {
      await tx.update(matingProfileMedia).set({ status: 'HIDDEN' }).where(and(eq(matingProfileMedia.id, report.matingProfileMediaId!), eq(matingProfileMedia.status, 'ACTIVE')));
    } else if (input.action === 'UNLIST_PROFILE') {
      const profileId = await profileIdOf(tx, report);
      const [p] = profileId ? await tx.select({ animalId: matingProfiles.animalId }).from(matingProfiles).where(eq(matingProfiles.id, profileId)).limit(1) : [];
      if (p) await deactivateProfileOf(tx, p.animalId, 'MODERATION', actor, reasonFa, now);
    }

    const dismissed = input.action === 'DISMISS';
    const [row] = await tx
      .update(moderationReports)
      .set({
        status: dismissed ? 'DISMISSED' : 'ACTIONED',
        decision: (dismissed ? 'DISMISS' : 'HIDE') as never,
        decisionReason: ACTION_FA[input.action] + ': ' + reasonFa,
        decidedByAccountId: actor.accountId,
        decidedAt: now,
      })
      .where(and(eq(moderationReports.id, report.id), eq(moderationReports.status, 'OPEN'), eq(moderationReports.assignedToAccountId, actor.accountId)))
      .returning();
    if (!row) throw conflict('این گزارش هم‌زمان تصمیم گرفته شد.');
    await recordAudit(tx, actor, {
      action: 'FINDER_REPORT_DECIDED',
      targetType: 'MODERATION_REPORT',
      targetId: report.id,
      before: { status: 'OPEN' },
      after: { status: row.status, action: input.action },
      reason: reasonFa,
    });
    if (!dismissed) {
      const subject = await subjectOf(tx, report);
      if (subject) {
        await createNotification(tx, {
          recipientAccountId: subject,
          kind: 'FINDER_MODERATION_DECISION',
          titleFa: 'تصمیم مدیریت درباره گزارش جفت‌یابی',
          bodyFa: ACTION_FA[input.action] + '. دلیل: ' + reasonFa + ' — می‌توانید از بخش اعتراض‌ها اعتراض کنید.',
          resume: { entity: { type: 'MODERATION_REPORT', id: report.id }, step: 'APPEAL', originRoute: '/account/mating-finder/appeals' },
        });
      }
    }
    return row;
  });
}

// ── appeals ──────────────────────────────────────────────────────────────────

/** Decisions that affected this person and can be appealed. */
export async function myFinderDecisions(db: DbClient, actor: Actor) {
  const rows = await db
    .select()
    .from(moderationReports)
    .where(and(inFinder, eq(moderationReports.status, 'ACTIONED')))
    .orderBy(desc(moderationReports.decidedAt))
    .limit(200);
  const mine: Array<{ report: ReportRow; appeal: typeof moderationAppeals.$inferSelect | null }> = [];
  for (const report of rows) {
    if ((await subjectOf(db, report)) !== actor.accountId) continue;
    const [appeal] = await db.select().from(moderationAppeals).where(eq(moderationAppeals.reportId, report.id)).orderBy(desc(moderationAppeals.createdAt)).limit(1);
    mine.push({ report, appeal: appeal ?? null });
  }
  return mine;
}

export async function appealFinderDecision(db: Database, actor: Actor, input: { reportId: string; statementFa: string }, now: Date = new Date()) {
  const statementFa = input.statementFa.trim();
  if (statementFa.length < 10) throw validation('اعتراض خود را کامل بنویسید.');
  if (statementFa.length > 2000) throw validation('متن اعتراض حداکثر ۲۰۰۰ نویسه است.');
  if (!UUID.test(input.reportId)) throw notFound('پیدا نشد.');
  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(moderationReports).where(and(eq(moderationReports.id, input.reportId), inFinder)).limit(1);
    // Anyone the decision did not affect gets the same answer as a missing report.
    if (!report || report.status !== 'ACTIONED' || (await subjectOf(tx, report)) !== actor.accountId) throw notFound('پیدا نشد.');
    const [row] = await tx
      .insert(moderationAppeals)
      .values({ reportId: report.id, appellantAccountId: actor.accountId, statementFa, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('اعتراض باز شما برای همین تصمیم ثبت شده است.');
    await recordAudit(tx, actor, { action: 'FINDER_APPEAL_SUBMITTED', targetType: 'MODERATION_REPORT', targetId: report.id, after: { appealId: row.id } });
    return row;
  });
}

export async function finderAppealQueue(db: DbClient, actor: Actor) {
  assertFinderCapability(actor, 'FINDER_REPORT_MODERATE');
  return db
    .select({ appeal: moderationAppeals, report: moderationReports })
    .from(moderationAppeals)
    .innerJoin(moderationReports, eq(moderationReports.id, moderationAppeals.reportId))
    .where(and(inFinder, eq(moderationAppeals.status, 'OPEN')))
    .orderBy(moderationAppeals.createdAt);
}

/**
 * Decide an appeal. OVERTURNED undoes what the decision did: the message or
 * picture is shown again, and any sanction tied to the report is lifted. A
 * profile taken off the finder is not switched back on by the operator — the
 * owner re-activates it, passing the same checks as anyone else.
 */
export async function decideFinderAppeal(db: Database, actor: Actor, input: { appealId: string; uphold: boolean; reasonFa: string }, now: Date = new Date()) {
  assertFinderCapability(actor, 'FINDER_REPORT_MODERATE');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ appeal: moderationAppeals, report: moderationReports })
      .from(moderationAppeals)
      .innerJoin(moderationReports, eq(moderationReports.id, moderationAppeals.reportId))
      .where(and(eq(moderationAppeals.id, input.appealId), inFinder))
      .for('update', { of: moderationAppeals })
      .limit(1);
    if (!row) throw notFound('اعتراض پیدا نشد.');
    const problem = appealProblem({ reportDecidedBy: row.report.decidedByAccountId, actorId: actor.accountId, status: row.appeal.status, reasonFa: input.reasonFa });
    if (problem) throw conflict(problem);
    const reasonFa = input.reasonFa.trim();
    const [decided] = await tx
      .update(moderationAppeals)
      .set({ status: input.uphold ? 'UPHELD' : 'OVERTURNED', decisionReasonFa: reasonFa, decidedByAccountId: actor.accountId, decidedAt: now })
      .where(and(eq(moderationAppeals.id, row.appeal.id), eq(moderationAppeals.status, 'OPEN')))
      .returning();
    if (!decided) throw conflict('این اعتراض هم‌زمان بررسی شد.');
    if (!input.uphold) {
      if (row.report.finderMessageId) await tx.update(finderMessages).set({ hiddenAt: null }).where(eq(finderMessages.id, row.report.finderMessageId));
      if (row.report.matingProfileMediaId) {
        await tx.update(matingProfileMedia).set({ status: 'ACTIVE' }).where(and(eq(matingProfileMedia.id, row.report.matingProfileMediaId), eq(matingProfileMedia.status, 'HIDDEN')));
      }
      await tx
        .update(accountSanctions)
        .set({ liftedAt: now, liftedByAccountId: actor.accountId, liftReasonFa: 'اعتراض پذیرفته شد: ' + reasonFa })
        .where(and(eq(accountSanctions.reportId, row.report.id), isNull(accountSanctions.liftedAt)));
    }
    await recordAudit(tx, actor, {
      action: input.uphold ? 'FINDER_APPEAL_UPHELD' : 'FINDER_APPEAL_OVERTURNED',
      targetType: 'MODERATION_REPORT',
      targetId: row.report.id,
      after: { appealId: row.appeal.id },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: row.appeal.appellantAccountId,
      kind: 'FINDER_MODERATION_DECISION',
      titleFa: input.uphold ? 'اعتراض شما رد شد' : 'اعتراض شما پذیرفته شد',
      bodyFa: reasonFa,
      resume: { entity: { type: 'MODERATION_REPORT', id: row.report.id }, step: 'APPEAL', originRoute: '/account/mating-finder/appeals' },
    });
    return decided;
  });
}

// ── evidence ─────────────────────────────────────────────────────────────────

/** An evidence file, to a moderator of the finder queue; the view itself is recorded. */
export async function evidenceFile(db: DbClient, storageRoot: string, actor: Actor, evidenceId: string): Promise<{ bytes: Buffer; mime: string }> {
  if (!hasFinderCapability(actor, 'FINDER_REPORT_MODERATE')) throw notFound('پیدا نشد.');
  if (!UUID.test(evidenceId)) throw notFound('پیدا نشد.');
  const [row] = await db
    .select({ evidence: moderationReportEvidence, file: storedFiles })
    .from(moderationReportEvidence)
    .innerJoin(storedFiles, eq(storedFiles.id, moderationReportEvidence.fileId))
    .innerJoin(moderationReports, eq(moderationReports.id, moderationReportEvidence.reportId))
    .where(and(eq(moderationReportEvidence.id, evidenceId), inFinder))
    .limit(1);
  if (!row) throw notFound('پیدا نشد.');
  await recordAudit(db, actor, { action: 'FINDER_REPORT_EVIDENCE_VIEWED', targetType: 'MODERATION_REPORT', targetId: row.evidence.reportId, after: { evidenceId } });
  return { bytes: await fs.readFile(resolveWithinRoot(storageRoot, row.file.storageKey)), mime: row.file.mime };
}

