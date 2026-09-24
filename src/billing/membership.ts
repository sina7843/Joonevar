/**
 * Association membership — §7 and Phase 2.5 §6 (PROMPT-009).
 *
 * Phase 1 sold a lifetime membership: paying was joining, nothing expired and
 * nobody reviewed anything (D04). The Phase 2.5 product decision replaces that
 * with a reviewed, time-bounded membership. What is kept and what changes:
 *
 *  - an account applies, and the association approves, asks for a correction or
 *    rejects with a written reason; payment opens only after an approval;
 *  - a verified payment buys one period, whose length, tariff, reminder window
 *    and grace days are managed settings frozen on the period when the payment
 *    starts, so a later settings edit never rewrites what was bought;
 *  - renewing early starts the new period where the live one ends, so no paid
 *    day is lost and none is bought twice;
 *  - there is no scheduler: the reminder and the expiry are applied when the
 *    membership is next read, exactly as a licence period is (PROMPT-008);
 *  - a membership that was already active keeps its lifetime promise and is
 *    never given an expiry nobody sold it (DEC-0195).
 *
 * `membershipStanding` is the one authoritative answer to «is this membership
 * valid now», and every rule — eligibility, the trusted veterinarian, the club
 * conditions — reads it rather than the status column.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { memberships, membershipApplications, membershipPeriods } from '../db/schema/billing.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt, readMoney, snapshotSetting } from '../settings/service.ts';
import { AppError, conflict, forbidden, notConfigured, notFound, validation } from '../domain/errors.ts';
import { toman, type MoneyValue } from '../domain/money.ts';
import { addDays, daysLeft, periodEnd, periodStanding, periodStart, reminderDue } from '../domain/period.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { boundedRows } from '../privacy/limits.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { createBatch, findBatch, type BatchRecord } from './payments.ts';
import {
  APPLICABLE_MEMBERSHIP_STATUSES,
  MEMBERSHIP_APPLICATION_STATUS_FA,
  MEMBERSHIP_DECISION_OUTCOME,
  MEMBERSHIP_GRACE_DAYS_KEY,
  MEMBERSHIP_PERIOD_DAYS_KEY,
  MEMBERSHIP_PERIOD_KIND_FA,
  MEMBERSHIP_REMINDER_DAYS_KEY,
  MEMBERSHIP_STATUS_FA,
  MEMBERSHIP_TARIFF_KEY,
  PAYABLE_MEMBERSHIP_STATUSES,
  assertReason,
  isMembershipDecision,
  membershipIsValid,
  statementProblem,
  type MembershipStatus,
} from './membership-model.ts';

export const MEMBERSHIP_FEE_KEY = MEMBERSHIP_TARIFF_KEY.INITIAL;
export const MEMBERSHIP_REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];
const ROUTE = '/membership';
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MembershipRow = typeof memberships.$inferSelect;
export type ApplicationRow = typeof membershipApplications.$inferSelect;
export type PeriodRow = typeof membershipPeriods.$inferSelect;

export interface MembershipRecord {
  readonly accountId: string;
  readonly status: MembershipStatus;
  readonly activatedAt: Date | null;
  readonly membershipNo: string | null;
  readonly numberStatus: 'PENDING' | 'ISSUED';
  readonly paymentBatchId: string | null;
  readonly lifetime: boolean;
  readonly currentPeriodEndsAt: Date | null;
  readonly statusReasonFa: string | null;
  readonly version: number;
}

export async function findMembership(database: DbClient, accountId: string): Promise<MembershipRecord | null> {
  const [row] = await database.select().from(memberships).where(eq(memberships.accountId, accountId)).limit(1);
  return row ? (row as MembershipRecord) : null;
}

/** The first-period fee shown and charged, read from managed data (D16). */
export async function membershipFee(database: DbClient): Promise<MoneyValue> {
  return readMoney(database, MEMBERSHIP_FEE_KEY);
}

export async function membershipRenewalFee(database: DbClient): Promise<MoneyValue> {
  return readMoney(database, MEMBERSHIP_TARIFF_KEY.RENEWAL);
}

async function optionalInt(database: DbClient, key: string): Promise<number | null> {
  try {
    return await readInt(database, key);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_CONFIGURED') return null;
    throw error;
  }
}

async function ensureRow(tx: DbClient, accountId: string): Promise<MembershipRecord> {
  const [existing] = await tx.select().from(memberships).where(eq(memberships.accountId, accountId)).limit(1);
  if (existing) return existing as MembershipRecord;
  const [created] = await tx.insert(memberships).values({ accountId, status: 'NONE' }).returning();
  return created as MembershipRecord;
}

export async function latestPaidPeriod(tx: DbClient, accountId: string): Promise<PeriodRow | null> {
  const [row] = await tx
    .select()
    .from(membershipPeriods)
    .where(and(eq(membershipPeriods.accountId, accountId), eq(membershipPeriods.status, 'ACTIVE')))
    .orderBy(desc(membershipPeriods.endsAt))
    .limit(1);
  return row ?? null;
}

async function pendingPeriod(tx: DbClient, accountId: string): Promise<PeriodRow | null> {
  const [row] = await tx
    .select()
    .from(membershipPeriods)
    .where(and(eq(membershipPeriods.accountId, accountId), eq(membershipPeriods.status, 'PENDING_PAYMENT')))
    .limit(1);
  return row ?? null;
}

export async function openApplication(tx: DbClient, accountId: string): Promise<ApplicationRow | null> {
  const [row] = await tx
    .select()
    .from(membershipApplications)
    .where(and(eq(membershipApplications.accountId, accountId), eq(membershipApplications.status, 'SUBMITTED')))
    .limit(1);
  if (row) return row;
  const [correction] = await tx
    .select()
    .from(membershipApplications)
    .where(and(eq(membershipApplications.accountId, accountId), eq(membershipApplications.status, 'NEEDS_CORRECTION')))
    .limit(1);
  return correction ?? null;
}

// ── the authoritative standing ─────────────────────────────────────────────

export interface MembershipStanding {
  readonly status: MembershipStatus;
  readonly statusFa: string;
  /** The one answer the rest of the product needs. */
  readonly valid: boolean;
  readonly lifetime: boolean;
  readonly endsAt: string | null;
  readonly daysLeft: number | null;
  readonly inGrace: boolean;
  readonly membershipNo: string | null;
  readonly numberStatus: 'PENDING' | 'ISSUED';
  readonly statusReasonFa: string | null;
  readonly canApply: boolean;
  readonly canPay: boolean;
  readonly kind: 'INITIAL' | 'RENEWAL';
  readonly pendingBatchId: string | null;
  readonly pendingAmountToman: string | null;
  readonly applicationStatusFa: string | null;
  readonly applicationNoteFa: string | null;
}

/**
 * The membership as it stands now, after applying whatever time has done to it.
 *
 * This is the single authoritative query of PROMPT-009: eligibility, the trusted
 * veterinarian rules and the club conditions all read `valid` from here rather
 * than looking at a status column that time may have overtaken.
 */
export async function membershipStanding(database: Database, accountId: string, now: Date = new Date()): Promise<MembershipStanding> {
  await enforceMembershipPeriod(database, accountId, now);
  const row = await findMembership(database, accountId);
  const period = await latestPaidPeriod(database, accountId);
  const pending = await pendingPeriod(database, accountId);
  const application = await openApplication(database, accountId);
  const status = (row?.status ?? 'NONE') as MembershipStatus;
  const lifetime = row?.lifetime ?? false;
  const valid = row ? membershipIsValid({ status, lifetime, currentPeriodEndsAt: row.currentPeriodEndsAt }, now) : false;
  const standingOfPeriod = period
    ? periodStanding({ status: period.status as 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, now)
    : 'NONE';

  return {
    status,
    statusFa: MEMBERSHIP_STATUS_FA[status],
    valid,
    lifetime,
    endsAt: period?.endsAt ? period.endsAt.toISOString() : null,
    daysLeft: period?.endsAt ? daysLeft(period.endsAt, now) : null,
    inGrace: standingOfPeriod === 'GRACE',
    membershipNo: row?.membershipNo ?? null,
    numberStatus: (row?.numberStatus ?? 'PENDING') as 'PENDING' | 'ISSUED',
    statusReasonFa: row?.statusReasonFa ?? null,
    canApply: application === null && APPLICABLE_MEMBERSHIP_STATUSES.includes(status) && !lifetime,
    canPay: PAYABLE_MEMBERSHIP_STATUSES.includes(status) && !lifetime,
    kind: period === null ? 'INITIAL' : 'RENEWAL',
    pendingBatchId: pending?.paymentBatchId ?? null,
    pendingAmountToman: pending?.amountToman ?? null,
    applicationStatusFa: application ? MEMBERSHIP_APPLICATION_STATUS_FA[application.status as 'SUBMITTED'] : null,
    applicationNoteFa: application?.reviewNoteFa ?? null,
  };
}

/** The one boolean every other rule consumes. */
export async function hasValidMembership(database: Database, accountId: string, now: Date = new Date()): Promise<boolean> {
  return (await membershipStanding(database, accountId, now)).valid;
}

/** Kept for callers that only need the flag; routed through the same rule. */
export async function isMembershipActive(database: Database, accountId: string, now: Date = new Date()): Promise<boolean> {
  return hasValidMembership(database, accountId, now);
}

// ── application and review ─────────────────────────────────────────────────

export async function applyForMembership(
  database: Database,
  actor: Actor,
  input: { statementFa?: string | null } = {},
  now: Date = new Date(),
): Promise<ApplicationRow> {
  await assertEligible(database, actor.accountId, 'MEMBERSHIP');
  const problem = statementProblem(input.statementFa);
  if (problem) throw validation(problem);
  const statementFa = (input.statementFa ?? '').trim() || null;

  return database.transaction(async (tx) => {
    const current = await ensureRow(tx, actor.accountId);
    if (current.lifetime && current.status === 'ACTIVE') throw conflict('عضویت مادام‌العمر شما برقرار است و نیازی به درخواست تازه ندارد.');
    if (current.status === 'ACTIVE' || current.status === 'APPROVED_AWAITING_PAYMENT') throw conflict('برای این حساب عضویت یا تأیید فعالی وجود دارد.');
    if (current.status === 'SUSPENDED') throw conflict('عضویت این حساب معلق است؛ رفع تعلیق با انجمن است.');
    const open = await openApplication(tx, actor.accountId);
    if (open) throw conflict('یک درخواست باز عضویت دارید.');

    const [application] = await tx
      .insert(membershipApplications)
      .values({ accountId: actor.accountId, statementFa, createdAt: now, updatedAt: now })
      .returning();
    await tx
      .update(memberships)
      .set({ status: 'PENDING_REVIEW', statusReasonFa: null, version: current.version + 1, updatedAt: now })
      .where(and(eq(memberships.accountId, actor.accountId), eq(memberships.version, current.version)));

    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_APPLIED',
      targetType: 'MEMBERSHIP_APPLICATION',
      targetId: application!.id,
      targetVersion: application!.version,
      before: { status: current.status },
      after: { status: 'SUBMITTED', membershipStatus: 'PENDING_REVIEW' },
    });
    return application!;
  });
}

/** Answer a correction the association asked for; the application returns to the queue. */
export async function reviseMembershipApplication(
  database: Database,
  actor: Actor,
  input: { applicationId: string; expectedVersion: number; statementFa?: string | null },
  now: Date = new Date(),
): Promise<ApplicationRow> {
  const problem = statementProblem(input.statementFa);
  if (problem) throw validation(problem);
  if (!UUID.test(input.applicationId)) throw notFound('درخواست عضویت پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(membershipApplications).where(eq(membershipApplications.id, input.applicationId)).limit(1);
    if (!current || current.accountId !== actor.accountId) throw notFound('درخواست عضویت پیدا نشد.');
    if (current.status !== 'NEEDS_CORRECTION') throw conflict('این درخواست در انتظار اصلاح نیست.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(membershipApplications)
      .set({ status: 'SUBMITTED', statementFa: (input.statementFa ?? '').trim() || null, version: current.version + 1, updatedAt: now })
      .where(and(eq(membershipApplications.id, current.id), eq(membershipApplications.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    const membership = await ensureRow(tx, actor.accountId);
    await tx
      .update(memberships)
      .set({ status: 'PENDING_REVIEW', version: membership.version + 1, updatedAt: now })
      .where(eq(memberships.accountId, actor.accountId));
    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_APPLICATION_REVISED',
      targetType: 'MEMBERSHIP_APPLICATION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status },
    });
    return row;
  });
}

function assertReviewer(actor: Actor, whatFa = 'بررسی عضویت'): void {
  if (!MEMBERSHIP_REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden(whatFa + ' از محیط عملیاتی انجمن انجام می‌شود.');
}

export async function membershipQueue(database: DbClient, actor: Actor, input: { status?: string; page?: number; pageSize?: number } = {}) {
  assertReviewer(actor);
  const status = (input.status ?? 'SUBMITTED') as 'SUBMITTED' | 'NEEDS_CORRECTION' | 'APPROVED' | 'REJECTED';
  if (!['SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED'].includes(status)) throw validation('نمای صف معتبر نیست.');
  const request = { page: Math.max(1, input.page ?? 1), pageSize: boundedRows(input.pageSize, 20) };
  const rows = await database
    .select()
    .from(membershipApplications)
    .where(eq(membershipApplications.status, status))
    .orderBy(status === 'SUBMITTED' ? membershipApplications.updatedAt : desc(membershipApplications.updatedAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const items = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    status: row.status,
    statusFa: MEMBERSHIP_APPLICATION_STATUS_FA[row.status as 'SUBMITTED'],
    statementFa: row.statementFa,
    reviewNoteFa: row.reviewNoteFa,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  }));
  return pageOf(items, items.length + offsetOf(request), request);
}

/**
 * Approve, ask for a correction, or reject — always with a written reason the
 * member reads. An approval opens payment and nothing more: the membership
 * becomes active only when a payment is verified.
 */
export async function decideMembershipApplication(
  database: Database,
  actor: Actor,
  input: { applicationId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<ApplicationRow> {
  assertReviewer(actor);
  if (!isMembershipDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const reasonFa = assertReason(input.reasonFa);
  if (!UUID.test(input.applicationId)) throw notFound('درخواست عضویت پیدا نشد.');
  const outcome = MEMBERSHIP_DECISION_OUTCOME[input.decision];

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(membershipApplications).where(eq(membershipApplications.id, input.applicationId)).limit(1);
    if (!current) throw notFound('درخواست عضویت پیدا نشد.');
    if (current.accountId === actor.accountId) throw forbidden('درخواست خودتان را نمی‌توانید بررسی کنید.');
    if (current.status !== 'SUBMITTED' && current.status !== 'NEEDS_CORRECTION') throw conflict('این درخواست در انتظار بررسی نیست.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);

    const [row] = await tx
      .update(membershipApplications)
      .set({
        status: outcome.application,
        reviewNoteFa: reasonFa,
        reviewedByAccountId: actor.accountId,
        reviewedAt: now,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(membershipApplications.id, current.id), eq(membershipApplications.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    const membership = await ensureRow(tx, current.accountId);
    // A member who is renewing keeps the membership they already hold; the
    // approval only opens the payment for the next period.
    const nextStatus: MembershipStatus = membership.status === 'ACTIVE' && outcome.membership === 'APPROVED_AWAITING_PAYMENT' ? 'ACTIVE' : outcome.membership;
    await tx
      .update(memberships)
      .set({ status: nextStatus, statusReasonFa: reasonFa, version: membership.version + 1, updatedAt: now })
      .where(eq(memberships.accountId, current.accountId));

    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_APPLICATION_DECIDED',
      targetType: 'MEMBERSHIP_APPLICATION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status, membershipStatus: membership.status },
      after: { status: row.status, membershipStatus: nextStatus },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: current.accountId,
      kind: 'MEMBERSHIP_APPLICATION_DECIDED',
      titleFa:
        outcome.application === 'APPROVED'
          ? 'درخواست عضویت شما تأیید شد'
          : outcome.application === 'REJECTED'
            ? 'درخواست عضویت شما رد شد'
            : 'درخواست عضویت شما نیازمند اصلاح است',
      bodyFa: reasonFa,
      resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'APPLICATION', originRoute: ROUTE },
    });
    return row;
  });
}

// ── paying for a period ────────────────────────────────────────────────────

export interface StartedMembershipPayment {
  readonly period: PeriodRow;
  readonly batch: BatchRecord;
  readonly kind: 'INITIAL' | 'RENEWAL';
  readonly reused: boolean;
}

/**
 * Open the payment for one membership period.
 *
 * Everything is checked again immediately before the money path opens: the
 * account is still eligible, the association's approval still stands, and the
 * tariff and period length are read from settings and frozen on the period. An
 * unpaid period whose frozen figures no longer match today's settings is
 * cancelled and replaced, so an attempt never starts against a stale amount.
 */
export async function startMembershipPeriodPayment(
  database: Database,
  actor: Actor,
  resume: ResumeContext = { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'REVIEW_FEE', originRoute: ROUTE },
  now: Date = new Date(),
): Promise<StartedMembershipPayment> {
  await assertEligible(database, actor.accountId, 'MEMBERSHIP');
  const current = await findMembership(database, actor.accountId);
  if (current === null || !PAYABLE_MEMBERSHIP_STATUSES.includes(current.status)) {
    throw conflict('پرداخت دوره عضویت پس از تأیید درخواست از سوی انجمن باز می‌شود.');
  }
  if (current.lifetime) throw conflict('عضویت مادام‌العمر شما برقرار است و دوره تازه‌ای لازم ندارد.');

  const live = await latestPaidPeriod(database, actor.accountId);
  const kind: 'INITIAL' | 'RENEWAL' = live === null ? 'INITIAL' : 'RENEWAL';
  const tariff = await snapshotSetting(database, MEMBERSHIP_TARIFF_KEY[kind]);
  const amountToman = toman(String(tariff.value ?? '0'));
  if (amountToman <= 0n) throw notConfigured('تعرفه ' + MEMBERSHIP_PERIOD_KIND_FA[kind]);
  const periodDays = await readInt(database, MEMBERSHIP_PERIOD_DAYS_KEY);
  const [graceDays, reminderDaysBefore] = await Promise.all([
    optionalInt(database, MEMBERSHIP_GRACE_DAYS_KEY),
    optionalInt(database, MEMBERSHIP_REMINDER_DAYS_KEY),
  ]);

  return database.transaction(async (tx) => {
    const existing = await pendingPeriod(tx, actor.accountId);
    if (existing) {
      const unchanged =
        existing.kind === kind &&
        existing.tariffSettingVersion === tariff.version &&
        toman(existing.amountToman) === amountToman &&
        existing.periodDays === periodDays &&
        existing.graceDays === graceDays &&
        existing.paymentBatchId !== null;
      if (unchanged) {
        const batch = await findBatch(tx, existing.paymentBatchId!);
        if (batch && batch.status !== 'PAID') return { period: existing, batch, kind, reused: true };
      }
      const [cancelled] = await tx
        .update(membershipPeriods)
        .set({ status: 'CANCELLED', version: existing.version + 1, updatedAt: now })
        .where(and(eq(membershipPeriods.id, existing.id), eq(membershipPeriods.version, existing.version)))
        .returning();
      if (!cancelled) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'MEMBERSHIP_PERIOD_CANCELLED',
        targetType: 'MEMBERSHIP_PERIOD',
        targetId: existing.id,
        targetVersion: cancelled.version,
        before: { status: existing.status, amountToman: existing.amountToman, settingVersion: existing.tariffSettingVersion },
        after: { status: 'CANCELLED', reason: 'TARIFF_OR_PERIOD_CHANGED' },
      });
    }

    const [period] = await tx
      .insert(membershipPeriods)
      .values({
        accountId: actor.accountId,
        kind,
        tariffSettingKey: MEMBERSHIP_TARIFF_KEY[kind],
        tariffSettingVersion: tariff.version,
        amountToman: amountToman.toString(),
        periodDays,
        graceDays,
        reminderDaysBefore,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const batch = await createBatch(tx as unknown as Database, actor, {
      service: 'MEMBERSHIP',
      items: [{ targetType: 'MEMBERSHIP_PERIOD', targetId: period!.id, settingKey: MEMBERSHIP_TARIFF_KEY[kind] }],
      resume: resumeContext(resume),
    });

    const [linked] = await tx
      .update(membershipPeriods)
      .set({ paymentBatchId: batch.id, version: period!.version + 1, updatedAt: now })
      .where(and(eq(membershipPeriods.id, period!.id), eq(membershipPeriods.version, period!.version)))
      .returning();
    if (!linked) throw conflict(STALE);

    const membership = await ensureRow(tx, actor.accountId);
    await tx
      .update(memberships)
      .set({ paymentBatchId: batch.id, version: membership.version + 1, updatedAt: now })
      .where(eq(memberships.accountId, actor.accountId));

    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_PERIOD_PAYMENT_STARTED',
      targetType: 'MEMBERSHIP_PERIOD',
      targetId: linked.id,
      targetVersion: linked.version,
      after: {
        kind,
        amountToman: linked.amountToman,
        settingKey: linked.tariffSettingKey,
        settingVersion: linked.tariffSettingVersion,
        periodDays,
        graceDays,
        paymentBatchId: batch.id,
      },
    });
    return { period: linked, batch, kind, reused: false };
  });
}

/** The name Phase 1 used; it now buys one period instead of a lifetime membership. */
export async function startMembershipPayment(database: Database, actor: Actor, resume?: ResumeContext): Promise<BatchRecord> {
  return (await startMembershipPeriodPayment(database, actor, resume)).batch;
}

/**
 * Activate the period of a verified payment — runs inside the verifying
 * transaction, so a membership period exists exactly where money was taken. A
 * repeated or concurrent callback finds the work already done.
 */
export async function activateMembershipFromPayment(tx: DbClient, batch: { id: string; accountId: string }, now: Date = new Date()): Promise<void> {
  const [period] = await tx.select().from(membershipPeriods).where(eq(membershipPeriods.paymentBatchId, batch.id)).limit(1);
  if (!period || period.status !== 'PENDING_PAYMENT') return;

  const live = await latestPaidPeriod(tx, period.accountId);
  const liveEndsAt = live?.endsAt ?? null;
  const startsAt = periodStart(liveEndsAt, now);
  const endsAt = periodEnd(startsAt, period.periodDays, 'طول دوره عضویت معتبر نیست.');

  const [row] = await tx
    .update(membershipPeriods)
    .set({ status: 'ACTIVE', startsAt, endsAt, version: period.version + 1, updatedAt: now })
    .where(and(eq(membershipPeriods.id, period.id), eq(membershipPeriods.version, period.version)))
    .returning();
  if (!row) return;

  const [current] = await tx.select().from(memberships).where(eq(memberships.accountId, period.accountId)).limit(1);
  const before = (current?.status ?? 'NONE') as MembershipStatus;
  await tx
    .update(memberships)
    .set({
      status: 'ACTIVE',
      // The first activation is remembered; a renewal keeps the original date.
      activatedAt: current?.activatedAt ?? now,
      // Valid until the period ends plus whatever grace this period bought.
      currentPeriodEndsAt: addDays(endsAt, row.graceDays ?? 0),
      statusReasonFa: null,
      version: (current?.version ?? 1) + 1,
      updatedAt: now,
    })
    .where(eq(memberships.accountId, period.accountId));

  await recordAudit(tx, null, {
    action: 'MEMBERSHIP_PERIOD_ACTIVATED',
    targetType: 'MEMBERSHIP_PERIOD',
    targetId: row.id,
    targetVersion: row.version,
    before: { status: period.status, membershipStatus: before, startsAt: null, endsAt: null },
    after: {
      status: row.status,
      membershipStatus: 'ACTIVE',
      kind: row.kind,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      continuedFromLivePeriod: liveEndsAt !== null && liveEndsAt.getTime() > now.getTime(),
      amountToman: row.amountToman,
      paymentBatchId: batch.id,
    },
  });

  await createNotification(tx, {
    recipientAccountId: period.accountId,
    kind: 'MEMBERSHIP_ACTIVATED',
    titleFa: row.kind === 'RENEWAL' ? 'عضویت شما تمدید شد' : 'عضویت شما فعال شد',
    bodyFa: 'پرداخت روی سرور تأیید شد و دوره عضویت تا پایان آن ثبت است. شماره عضویت پس از صدور در همین صفحه دیده می‌شود.',
    resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'ACTIVE', originRoute: ROUTE },
  });
}

/**
 * Apply what time has done: the renewal reminder while a period is live, and the
 * expiry once the period and its bought grace are over. Idempotent, and safe to
 * call on every read — a lifetime membership is never touched.
 */
export async function enforceMembershipPeriod(database: Database, accountId: string, now: Date = new Date()): Promise<void> {
  const membership = await findMembership(database, accountId);
  if (!membership || membership.lifetime) return;
  const period = await latestPaidPeriod(database, accountId);
  if (!period || period.endsAt === null) return;
  const standing = periodStanding({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, now);

  if (standing === 'ACTIVE' || standing === 'GRACE') {
    if (period.reminderSentAt !== null) return;
    if (!reminderDue({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, period.reminderDaysBefore, now)) return;
    await database.transaction(async (tx) => {
      const [marked] = await tx
        .update(membershipPeriods)
        .set({ reminderSentAt: now, version: period.version + 1, updatedAt: now })
        .where(and(eq(membershipPeriods.id, period.id), eq(membershipPeriods.version, period.version)))
        .returning();
      if (!marked) return;
      await createNotification(tx, {
        recipientAccountId: accountId,
        kind: 'MEMBERSHIP_ENDING',
        titleFa: 'عضویت شما رو به پایان است',
        bodyFa: 'برای اینکه عضویت شما معتبر بماند، دوره را تمدید کنید. تمدید زودهنگام روزهای پرداخت‌شده را از بین نمی‌برد.',
        resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'RENEWAL_DUE', originRoute: ROUTE },
      });
    });
    return;
  }

  if (standing !== 'EXPIRED') return;
  if (period.expiredNoticeAt !== null && membership.status === 'EXPIRED') return;

  await database.transaction(async (tx) => {
    const [claimed] = await tx
      .update(membershipPeriods)
      .set({ expiredNoticeAt: now, version: period.version + 1, updatedAt: now })
      .where(and(eq(membershipPeriods.id, period.id), eq(membershipPeriods.version, period.version)))
      .returning();
    if (!claimed) return;

    const [current] = await tx.select().from(memberships).where(eq(memberships.accountId, accountId)).limit(1);
    // Suspension and revocation are the association's decisions and outrank a lapsed period.
    if (!current || current.status !== 'ACTIVE') return;
    await tx
      .update(memberships)
      .set({ status: 'EXPIRED', version: current.version + 1, updatedAt: now })
      .where(eq(memberships.accountId, accountId));
    await recordAudit(tx, null, {
      action: 'MEMBERSHIP_EXPIRED',
      targetType: 'MEMBERSHIP',
      targetId: accountId,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: 'EXPIRED', periodId: period.id, endsAt: period.endsAt!.toISOString(), graceDays: period.graceDays },
    });
    await createNotification(tx, {
      recipientAccountId: accountId,
      kind: 'MEMBERSHIP_EXPIRED',
      titleFa: 'عضویت شما منقضی شد',
      bodyFa: 'برای بازگشت خدمات وابسته به عضویت، دوره تازه‌ای را تمدید و پرداخت کنید.',
      resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'EXPIRED', originRoute: ROUTE },
    });
  });
}

// ── the association's own decisions ────────────────────────────────────────

/**
 * Issue the membership number. A separate operational step (§7): the number can
 * stay PENDING while the membership is already active and usable.
 */
export async function issueMembershipNumber(
  database: Database,
  actor: Actor,
  input: { accountId: string; membershipNo: string },
): Promise<MembershipRecord> {
  assertReviewer(actor, 'صدور شماره عضویت');
  const value = input.membershipNo.trim();
  if (value === '') throw conflict('شماره عضویت خالی است.');

  const current = await findMembership(database, input.accountId);
  if (current === null) throw conflict('عضویتی برای این حساب ثبت نشده است.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(memberships)
      .set({ membershipNo: value, numberStatus: 'ISSUED', version: current.version + 1, updatedAt: new Date() })
      .where(eq(memberships.accountId, input.accountId))
      .returning();
    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_NUMBER_ISSUED',
      targetType: 'MEMBERSHIP',
      targetId: input.accountId,
      targetVersion: current.version + 1,
      before: { numberStatus: current.numberStatus },
      after: { numberStatus: 'ISSUED' },
    });
    return updated as MembershipRecord;
  });
}

/**
 * Suspend, revoke or reinstate a membership, always with a written reason.
 *
 * None of these is a payment: the association may stop a membership it already
 * granted, and it may lift its own suspension, but it cannot hand out a period
 * nobody paid for. Reinstating returns the membership to what its periods say —
 * active while one is live, expired otherwise.
 */
export async function setMembershipStanding(
  database: Database,
  actor: Actor,
  input: { accountId: string; action: 'SUSPEND' | 'REVOKE' | 'REINSTATE'; reasonFa: string },
  now: Date = new Date(),
): Promise<MembershipRecord> {
  assertReviewer(actor, 'تغییر وضعیت عضویت');
  if (input.reasonFa.trim().length < 3) throw conflict('ثبت دلیل الزامی است.');
  const reasonFa = assertReason(input.reasonFa, 'دلیل');
  const current = await findMembership(database, input.accountId);
  if (current === null) throw conflict('عضویتی برای این حساب ثبت نشده است.');
  if (input.action !== 'REINSTATE' && (current.status === 'NONE' || current.status === 'PENDING_REVIEW')) {
    throw conflict('این حساب هنوز عضویت فعال‌شده‌ای ندارد.');
  }
  if (input.action === 'REINSTATE' && current.status !== 'SUSPENDED') throw conflict('این عضویت معلق نیست.');

  const period = await latestPaidPeriod(database, input.accountId);
  const live = current.lifetime || (period?.endsAt != null && periodStanding({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, now) !== 'EXPIRED');
  const next: MembershipStatus = input.action === 'SUSPEND' ? 'SUSPENDED' : input.action === 'REVOKE' ? 'REVOKED' : live ? 'ACTIVE' : 'EXPIRED';

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(memberships)
      .set({ status: next, statusReasonFa: reasonFa, version: current.version + 1, updatedAt: now })
      .where(and(eq(memberships.accountId, input.accountId), eq(memberships.version, current.version)))
      .returning();
    if (!updated) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'MEMBERSHIP_' + input.action,
      targetType: 'MEMBERSHIP',
      targetId: input.accountId,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: next },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: input.accountId,
      kind: 'MEMBERSHIP_' + input.action,
      titleFa: input.action === 'SUSPEND' ? 'عضویت شما معلق شد' : input.action === 'REVOKE' ? 'عضویت شما لغو شد' : 'تعلیق عضویت شما برداشته شد',
      bodyFa: reasonFa,
      resume: { entity: { type: 'MEMBERSHIP', id: 'self' }, step: 'STATUS', originRoute: ROUTE },
    });
    return updated as MembershipRecord;
  });
}

/** Phase 1 name, kept for the operational screen: false suspends, true reinstates. */
export async function setMembershipActive(
  database: Database,
  actor: Actor,
  input: { accountId: string; active: boolean; reasonFa: string },
): Promise<MembershipRecord> {
  return setMembershipStanding(database, actor, { accountId: input.accountId, action: input.active ? 'REINSTATE' : 'SUSPEND', reasonFa: input.reasonFa });
}

/** Every period of one account, newest first: the receipts of what was paid. */
export async function membershipPeriodHistory(database: DbClient, accountId: string): Promise<readonly PeriodRow[]> {
  return database.select().from(membershipPeriods).where(eq(membershipPeriods.accountId, accountId)).orderBy(desc(membershipPeriods.createdAt));
}

export async function membershipApplicationHistory(database: DbClient, accountId: string): Promise<readonly ApplicationRow[]> {
  return database.select().from(membershipApplications).where(eq(membershipApplications.accountId, accountId)).orderBy(desc(membershipApplications.createdAt));
}
