/**
 * Paying for a practice licence period, renewing it, and losing it — Phase 2.5 PROMPT-008.
 *
 * The association's approval opens payment and nothing more (PROMPT-006): the
 * licensed tag and the active status are made here, and only inside the
 * transaction that verifies a payment on the server. A failed, cancelled,
 * mismatched or replayed callback grants nothing, because all of that is decided
 * by `verifyAttempt` and this module is only its effect.
 *
 * Every figure — tariff, period length, reminder window, grace days — is a
 * managed setting read at the moment the payment starts and frozen on the
 * period, so a later settings edit never rewrites what was bought. Nothing here
 * carries a production value of its own: an unconfigured tariff or period length
 * keeps the payment closed instead of inventing one.
 *
 * There is no scheduler. Expiry is read from the frozen window and applied the
 * next time the licence is read, the same way an advertising package expires.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { vetLicencePeriods, vetProfessionalCases, vetProfiles } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt, snapshotSetting } from '../settings/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { AppError, conflict, notConfigured, notFound } from '../domain/errors.ts';
import { toman } from '../domain/money.ts';
import type { Actor } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus } from './professional-model.ts';
import { replaceVetTag } from './professional-tags.ts';
import {
  GRACE_DAYS_KEY,
  LICENCE_PERIOD_KIND_FA,
  LICENCE_PERIOD_SERVICE,
  LICENCE_TARIFF_KEY,
  PERIOD_DAYS_KEY,
  REMINDER_DAYS_KEY,
  daysLeft,
  periodEnd,
  periodStanding,
  periodStart,
  reminderDue,
  type LicencePeriodKind,
  type LicenceStanding,
} from './licence-period-model.ts';

const ROUTE = '/account/vet-profile';
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
/** The statuses from which a licence period may be bought: approved, active, or lapsed. */
const PAYABLE: readonly VetCaseStatus[] = ['LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'EXPIRED'];

export type PeriodRow = typeof vetLicencePeriods.$inferSelect;
type CaseRow = typeof vetProfessionalCases.$inferSelect;
type ProfileRow = typeof vetProfiles.$inferSelect;

/** An optional setting: unconfigured means the product has not said, not zero. */
async function optionalInt(database: DbClient, key: string): Promise<number | null> {
  try {
    return await readInt(database, key);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_CONFIGURED') return null;
    throw error;
  }
}

async function licenceCaseOf(tx: DbClient, accountId: string): Promise<CaseRow | null> {
  const [row] = await tx
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, accountId), eq(vetProfessionalCases.caseType, 'LICENCE')))
    .orderBy(desc(vetProfessionalCases.updatedAt))
    .limit(1);
  return row ?? null;
}

/** The newest paid period of an account, whatever its window now says. */
export async function latestPaidPeriod(tx: DbClient, accountId: string): Promise<PeriodRow | null> {
  const [row] = await tx
    .select()
    .from(vetLicencePeriods)
    .where(and(eq(vetLicencePeriods.accountId, accountId), eq(vetLicencePeriods.status, 'ACTIVE')))
    .orderBy(desc(vetLicencePeriods.endsAt))
    .limit(1);
  return row ?? null;
}

async function pendingPeriod(tx: DbClient, caseId: string): Promise<PeriodRow | null> {
  const [row] = await tx
    .select()
    .from(vetLicencePeriods)
    .where(and(eq(vetLicencePeriods.caseId, caseId), eq(vetLicencePeriods.status, 'PENDING_PAYMENT')))
    .limit(1);
  return row ?? null;
}

/**
 * The licence facts the association verified. Payment is refused unless they are
 * all still there: an approval alone is not a licence.
 */
function licenceFactsProblem(profile: ProfileRow | undefined): string | null {
  if (!profile) return 'پروفایل حرفه‌ای این حساب پیدا نشد.';
  if (profile.applicantType === 'STUDENT') return 'دانشجوی دامپزشکی دوره فعالیت پروانه ندارد.';
  if (profile.hasLicence !== true) return 'پروانه تأییدشده‌ای روی این پروفایل ثبت نیست.';
  if (!profile.licenceCode || !profile.licenceDate || !profile.licenceFileId) return 'اطلاعات پروانه کامل نیست؛ پرداخت باز نمی‌شود.';
  if (profile.licenceVerifiedAt === null) return 'پروانه این پروفایل هنوز تأیید نشده است.';
  if (profile.practiceScope === null || profile.practiceScope === 'NOT_DECLARED') return 'عمومی یا متخصص بودن اعلام نشده است؛ پرداخت باز نمی‌شود.';
  return null;
}

export interface StartedLicencePayment {
  readonly period: PeriodRow;
  readonly batch: BatchRecord;
  readonly kind: LicencePeriodKind;
  readonly reused: boolean;
}

/**
 * Open the payment for a licence period.
 *
 * Everything is checked again here, immediately before the money path opens:
 * the approval still stands, the verified licence facts are still on the
 * profile, the account is still eligible, and the tariff and period length are
 * read from settings and frozen on the period. A pending period whose frozen
 * figures no longer match the current settings is cancelled and replaced, so an
 * attempt is never started against a stale amount.
 */
export async function startLicencePayment(database: Database, actor: Actor, now: Date = new Date()): Promise<StartedLicencePayment> {
  const current = await licenceCaseOf(database, actor.accountId);
  if (!current) throw notFound('پرونده پروانه‌ای برای این حساب نیست.');
  if (!PAYABLE.includes(current.status as VetCaseStatus)) {
    throw conflict('پرداخت دوره فعالیت فقط پس از تأیید مدارک پروانه باز می‌شود.');
  }

  const [profile] = await database.select().from(vetProfiles).where(eq(vetProfiles.accountId, actor.accountId)).limit(1);
  const problem = licenceFactsProblem(profile);
  if (problem) throw conflict(problem);

  const live = await latestPaidPeriod(database, actor.accountId);
  const kind: LicencePeriodKind = live === null ? 'ACTIVATION' : 'RENEWAL';
  // A missing tariff or period length stops here with a named reason; neither is invented.
  const tariff = await snapshotSetting(database, LICENCE_TARIFF_KEY[kind]);
  const amountToman = toman(String(tariff.value));
  if (amountToman <= 0n) throw notConfigured('تعرفه ' + LICENCE_PERIOD_KIND_FA[kind]);
  const periodDays = await readInt(database, PERIOD_DAYS_KEY);
  const [graceDays, reminderDaysBefore] = await Promise.all([optionalInt(database, GRACE_DAYS_KEY), optionalInt(database, REMINDER_DAYS_KEY)]);

  return database.transaction(async (tx) => {
    const existing = await pendingPeriod(tx, current.id);
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
      // The frozen figures no longer match what is charged today: the unpaid
      // period is closed and a new one takes its place.
      const [cancelled] = await tx
        .update(vetLicencePeriods)
        .set({ status: 'CANCELLED', version: existing.version + 1, updatedAt: now })
        .where(and(eq(vetLicencePeriods.id, existing.id), eq(vetLicencePeriods.version, existing.version)))
        .returning();
      if (!cancelled) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'VET_LICENCE_PERIOD_CANCELLED',
        targetType: 'VET_LICENCE_PERIOD',
        targetId: existing.id,
        targetVersion: cancelled.version,
        before: { status: existing.status, amountToman: existing.amountToman, settingVersion: existing.tariffSettingVersion },
        after: { status: 'CANCELLED', reason: 'TARIFF_OR_PERIOD_CHANGED' },
      });
    }

    const [period] = await tx
      .insert(vetLicencePeriods)
      .values({
        accountId: actor.accountId,
        caseId: current.id,
        kind,
        tariffSettingKey: LICENCE_TARIFF_KEY[kind],
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
      service: LICENCE_PERIOD_SERVICE[kind],
      items: [{ targetType: 'VET_LICENCE_PERIOD', targetId: period!.id, settingKey: LICENCE_TARIFF_KEY[kind] }],
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: current.id }, step: 'REVIEW_LICENCE_PERIOD_FEE', originRoute: ROUTE },
    });

    const [linked] = await tx
      .update(vetLicencePeriods)
      .set({ paymentBatchId: batch.id, version: period!.version + 1, updatedAt: now })
      .where(and(eq(vetLicencePeriods.id, period!.id), eq(vetLicencePeriods.version, period!.version)))
      .returning();
    if (!linked) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'VET_LICENCE_PERIOD_PAYMENT_STARTED',
      targetType: 'VET_LICENCE_PERIOD',
      targetId: linked.id,
      targetVersion: linked.version,
      after: {
        kind,
        caseId: current.id,
        caseStatus: current.status,
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

/**
 * Activate the period of a verified payment — runs inside the verifying
 * transaction, so an active licence exists exactly where money was taken.
 *
 * Renewing early neither overlaps nor loses paid time: the new period starts
 * where the live one ends. A repeated or concurrent callback finds the work
 * already done and changes nothing.
 */
export async function activateLicencePeriodFromPayment(tx: DbClient, batch: { id: string; accountId: string }, now: Date = new Date()): Promise<void> {
  const [period] = await tx.select().from(vetLicencePeriods).where(eq(vetLicencePeriods.paymentBatchId, batch.id)).limit(1);
  if (!period) return;
  if (period.status !== 'PENDING_PAYMENT') return;

  const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, period.caseId)).limit(1);
  if (!current) return;
  const [profile] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, period.accountId)).limit(1);
  if (licenceFactsProblem(profile) !== null) return;

  const live = await latestPaidPeriod(tx, period.accountId);
  const liveEndsAt = live?.endsAt ?? null;
  const startsAt = periodStart(liveEndsAt, now);
  const endsAt = periodEnd(startsAt, period.periodDays);

  const [row] = await tx
    .update(vetLicencePeriods)
    .set({ status: 'ACTIVE', startsAt, endsAt, version: period.version + 1, updatedAt: now })
    .where(and(eq(vetLicencePeriods.id, period.id), eq(vetLicencePeriods.version, period.version)))
    .returning();
  if (!row) return;

  const status = current.status as VetCaseStatus;
  if (status !== 'ACTIVE_LICENSED_VET' && vetCaseMove(status, 'ACTIVE_LICENSED_VET', 'SYSTEM')) {
    await tx
      .update(vetProfessionalCases)
      .set({ status: 'ACTIVE_LICENSED_VET', version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)));
    await recordAudit(tx, null, {
      action: 'VET_LICENCE_CASE_ACTIVATED',
      targetType: 'VET_PROFESSIONAL_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { status },
      after: { status: 'ACTIVE_LICENSED_VET', periodId: row.id, paymentBatchId: batch.id },
    });
  }

  // The licensed tag is written by the server alone, and only here (DEC-0193).
  await replaceVetTag(
    tx,
    null,
    {
      accountId: period.accountId,
      tag: 'LICENSED',
      practiceScope: profile!.practiceScope,
      reasonFa: 'پرداخت تأییدشده ' + LICENCE_PERIOD_KIND_FA[period.kind as LicencePeriodKind],
      source: { type: 'VET_LICENCE_PERIOD', id: row.id },
    },
    now,
  );

  await recordAudit(tx, null, {
    action: 'VET_LICENCE_PERIOD_ACTIVATED',
    targetType: 'VET_LICENCE_PERIOD',
    targetId: row.id,
    targetVersion: row.version,
    before: { status: period.status, startsAt: null, endsAt: null },
    after: {
      status: row.status,
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
    kind: 'VET_LICENCE_PERIOD_ACTIVATED',
    titleFa: row.kind === 'RENEWAL' ? 'دوره فعالیت پروانه شما تمدید شد' : 'پروانه فعالیت شما فعال شد',
    bodyFa: 'پرداخت روی سرور تأیید شد و دوره فعالیت تا پایان آن ثبت است.',
    resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: current.id }, step: 'LICENCE_ACTIVE', originRoute: ROUTE },
  });
}

export interface LicenceStandingView {
  readonly standing: LicenceStanding;
  readonly endsAt: string | null;
  readonly daysLeft: number | null;
  readonly caseStatus: VetCaseStatus | null;
  readonly canPay: boolean;
  readonly kind: LicencePeriodKind;
  readonly pendingBatchId: string | null;
  readonly amountToman: string | null;
}

/** What the account page shows, after any due downgrade or reminder is applied. */
export async function licenceStanding(database: Database, accountId: string, now: Date = new Date()): Promise<LicenceStandingView> {
  await enforceLicencePeriod(database, accountId, now);
  const current = await licenceCaseOf(database, accountId);
  const period = await latestPaidPeriod(database, accountId);
  const pending = current ? await pendingPeriod(database, current.id) : null;
  const standing = period === null && pending !== null ? 'PENDING_PAYMENT' : periodStanding(period, now);
  const caseStatus = (current?.status ?? null) as VetCaseStatus | null;
  return {
    standing,
    endsAt: period?.endsAt ? period.endsAt.toISOString() : null,
    daysLeft: period?.endsAt ? daysLeft(period.endsAt, now) : null,
    caseStatus,
    canPay: caseStatus !== null && PAYABLE.includes(caseStatus),
    kind: period === null ? 'ACTIVATION' : 'RENEWAL',
    pendingBatchId: pending?.paymentBatchId ?? null,
    amountToman: pending?.amountToman ?? null,
  };
}

/**
 * Apply what time has done to a licence: the renewal reminder while a period is
 * still live, and the downgrade once it and its grace are over.
 *
 * Idempotent and safe to call on every read: each notice is written once, and
 * the downgrade only runs while the case is still active.
 */
export async function enforceLicencePeriod(database: Database, accountId: string, now: Date = new Date()): Promise<void> {
  const period = await latestPaidPeriod(database, accountId);
  if (!period || period.endsAt === null) return;
  const standing = periodStanding(period, now);

  if (standing === 'ACTIVE') {
    if (period.reminderSentAt !== null) return;
    if (!reminderDue({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, period.reminderDaysBefore, now)) return;
    await database.transaction(async (tx) => {
      // The version guard makes the reminder exactly once, even from two reads at the same moment.
      const [marked] = await tx
        .update(vetLicencePeriods)
        .set({ reminderSentAt: now, version: period.version + 1, updatedAt: now })
        .where(and(eq(vetLicencePeriods.id, period.id), eq(vetLicencePeriods.version, period.version)))
        .returning();
      if (!marked) return;
      await createNotification(tx, {
        recipientAccountId: accountId,
        kind: 'VET_LICENCE_PERIOD_ENDING',
        titleFa: 'دوره فعالیت پروانه شما رو به پایان است',
        bodyFa: 'برای اینکه Tag دارای پروانه فعالیت بماند، دوره را تمدید کنید. تمدید زودهنگام روزهای پرداخت‌شده را از بین نمی‌برد.',
        resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: period.caseId }, step: 'LICENCE_RENEWAL_DUE', originRoute: ROUTE },
      });
    });
    return;
  }

  if (standing !== 'EXPIRED') return;
  if (period.expiredNoticeAt !== null) return;

  await database.transaction(async (tx) => {
    const [claimed] = await tx
      .update(vetLicencePeriods)
      .set({ expiredNoticeAt: now, version: period.version + 1, updatedAt: now })
      .where(and(eq(vetLicencePeriods.id, period.id), eq(vetLicencePeriods.version, period.version)))
      .returning();
    if (!claimed) return;

    const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, period.caseId)).limit(1);
    if (current && current.status === 'ACTIVE_LICENSED_VET' && vetCaseMove('ACTIVE_LICENSED_VET', 'EXPIRED', 'SYSTEM')) {
      await tx
        .update(vetProfessionalCases)
        .set({ status: 'EXPIRED', version: current.version + 1, updatedAt: now })
        .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)));
      await recordAudit(tx, null, {
        action: 'VET_LICENCE_CASE_EXPIRED',
        targetType: 'VET_PROFESSIONAL_CASE',
        targetId: current.id,
        targetVersion: current.version + 1,
        before: { status: current.status },
        after: { status: 'EXPIRED', periodId: period.id, endsAt: period.endsAt!.toISOString(), graceDays: period.graceDays },
      });
    }

    // The doctor keeps the standing the association verified: the council code
    // stays, only the paid licence goes (PHASE_2_5_SPEC_FA §5).
    const [profile] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
    await replaceVetTag(
      tx,
      null,
      {
        accountId,
        tag: 'UNLICENSED',
        practiceScope: profile?.practiceScope ?? null,
        reasonFa: 'پایان دوره فعالیت پرداخت‌شده پروانه',
        source: { type: 'VET_LICENCE_PERIOD', id: period.id },
      },
      now,
    );

    await createNotification(tx, {
      recipientAccountId: accountId,
      kind: 'VET_LICENCE_PERIOD_EXPIRED',
      titleFa: 'دوره فعالیت پروانه شما به پایان رسید',
      bodyFa: 'Tag شما به «دکتر دامپزشک بدون پروانه فعالیت» برگشت. با تمدید و پرداخت تأییدشده دوباره فعال می‌شود.',
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: period.caseId }, step: 'LICENCE_EXPIRED', originRoute: ROUTE },
    });
  });
}

/** Periods of one account, newest first, for the account page and the association. */
export async function licencePeriods(database: DbClient, accountId: string): Promise<readonly PeriodRow[]> {
  return database
    .select()
    .from(vetLicencePeriods)
    .where(and(eq(vetLicencePeriods.accountId, accountId), inArray(vetLicencePeriods.status, ['ACTIVE', 'CANCELLED'])))
    .orderBy(desc(vetLicencePeriods.createdAt));
}
