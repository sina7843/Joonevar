/**
 * The paid period of a trusted veterinarian — Phase 2.5 §7 (PROMPT-011).
 *
 * The association's approval opens a payment and nothing else (PROMPT-010). Only
 * a payment the server verified makes the three things that matter, all inside
 * the verifying transaction: the period itself, the internal TRUSTED_VET role,
 * and the single public trusted tag. A failed, cancelled, mismatched or replayed
 * callback makes none of them.
 *
 * Everything the standing rests on is asked again immediately before the payment
 * opens and again at activation: an active licence period, a valid association
 * membership, an approved application, and a self-declaration that still matches
 * the published terms. A prerequisite that lapses between the two moments stops
 * the activation rather than handing out a standing nobody qualifies for.
 *
 * When the period ends or the association suspends it, the trusted capability
 * goes and the licensed tag comes back — but only while that licence period is
 * itself still valid, otherwise the doctor keeps the standing the council
 * verified. Nothing historical is deleted: the role row stays as suspended, the
 * periods stay, and the work already done stays exactly where it is.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { vetProfessionalCases, vetProfiles, vetTrustedDeclarations, vetTrustedPeriods } from '../db/schema/vets.ts';
import { accountRoles } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt, snapshotSetting } from '../settings/service.ts';
import { AppError, conflict, forbidden, notConfigured, notFound, validation } from '../domain/errors.ts';
import { toman } from '../domain/money.ts';
import { addDays, daysLeft, periodEnd, periodStanding, periodStart, reminderDue, type PeriodStanding } from '../domain/period.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus, type VetPracticeScope } from './professional-model.ts';
import { CASE_STATUS_FA } from './professional-profile-model.ts';
import { currentVetTag, replaceVetTag } from './professional-tags.ts';
import { vetTagLabel } from './professional-model.ts';
import { licenceStanding } from './licence-period.ts';
import { LICENCE_STANDING_FA } from './licence-period-model.ts';
import { membershipStanding } from '../billing/membership.ts';
import { trustedTerms } from './trusted-application.ts';

const ROUTE = '/account/vet-profile';
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];

export const TRUSTED_TARIFF_KEY: Record<'ACTIVATION' | 'RENEWAL', string> = {
  ACTIVATION: 'trusted_vet.activation_toman',
  RENEWAL: 'trusted_vet.renewal_toman',
};
export const TRUSTED_PERIOD_DAYS_KEY = 'trusted_vet.period_days';
export const TRUSTED_REMINDER_DAYS_KEY = 'trusted_vet.reminder_days_before';
export const TRUSTED_GRACE_DAYS_KEY = 'trusted_vet.grace_days';
export const TRUSTED_PERIOD_SERVICE: Record<'ACTIVATION' | 'RENEWAL', 'TRUSTED_VET_ACTIVATION' | 'TRUSTED_VET_RENEWAL'> = {
  ACTIVATION: 'TRUSTED_VET_ACTIVATION',
  RENEWAL: 'TRUSTED_VET_RENEWAL',
};
const KIND_FA: Record<'ACTIVATION' | 'RENEWAL', string> = { ACTIVATION: 'دوره معتمد', RENEWAL: 'تمدید دوره معتمد' };

/** The case states from which a trusted period may be bought. */
const PAYABLE: readonly VetCaseStatus[] = ['TRUSTED_APPROVED_AWAITING_PAYMENT', 'ACTIVE_TRUSTED_VET', 'EXPIRED'];

export type TrustedPeriodRow = typeof vetTrustedPeriods.$inferSelect;

async function optionalInt(database: DbClient, key: string): Promise<number | null> {
  try {
    return await readInt(database, key);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_CONFIGURED') return null;
    throw error;
  }
}

async function trustedCaseOf(tx: DbClient, accountId: string) {
  const [row] = await tx
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, accountId), eq(vetProfessionalCases.caseType, 'TRUSTED')))
    .orderBy(desc(vetProfessionalCases.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function latestPaidTrustedPeriod(tx: DbClient, accountId: string): Promise<TrustedPeriodRow | null> {
  const [row] = await tx
    .select()
    .from(vetTrustedPeriods)
    .where(and(eq(vetTrustedPeriods.accountId, accountId), eq(vetTrustedPeriods.status, 'ACTIVE')))
    .orderBy(desc(vetTrustedPeriods.endsAt))
    .limit(1);
  return row ?? null;
}

async function pendingTrustedPeriod(tx: DbClient, caseId: string): Promise<TrustedPeriodRow | null> {
  const [row] = await tx
    .select()
    .from(vetTrustedPeriods)
    .where(and(eq(vetTrustedPeriods.caseId, caseId), eq(vetTrustedPeriods.status, 'PENDING_PAYMENT')))
    .limit(1);
  return row ?? null;
}

// ── the prerequisites, asked again ────────────────────────────────────────

export interface TrustedPrerequisites {
  readonly ok: boolean;
  readonly problemFa: string | null;
  readonly caseRow: typeof vetProfessionalCases.$inferSelect | null;
  readonly declarationVersion: string | null;
  readonly practiceScope: VetPracticeScope | null;
}

/**
 * Everything the trusted standing rests on, at this instant.
 *
 * Asked immediately before a payment opens and again inside the transaction that
 * would activate it, so a licence or a membership that lapsed in between is
 * caught at both moments.
 */
export async function trustedPrerequisites(database: Database, accountId: string, now: Date = new Date()): Promise<TrustedPrerequisites> {
  const none = { caseRow: null, declarationVersion: null, practiceScope: null };
  const current = await trustedCaseOf(database, accountId);
  if (!current || !PAYABLE.includes(current.status as VetCaseStatus)) {
    return { ok: false, problemFa: 'پرداخت دوره معتمد پس از تأیید درخواست از سوی انجمن باز می‌شود.', ...none };
  }
  const [licence, membership, terms] = await Promise.all([
    licenceStanding(database, accountId, now),
    membershipStanding(database, accountId, now),
    trustedTerms(database),
  ]);
  const licenceActive = licence.caseStatus === 'ACTIVE_LICENSED_VET' && (licence.standing === 'ACTIVE' || licence.standing === 'GRACE');
  if (!licenceActive) {
    return { ok: false, problemFa: 'دوره فعالیت پروانه شما فعال نیست (' + LICENCE_STANDING_FA[licence.standing] + ')؛ دوره معتمد روی پروانه فعال بنا می‌شود.', ...none, caseRow: current };
  }
  if (!membership.valid) {
    return { ok: false, problemFa: 'عضویت انجمن شما معتبر نیست (' + membership.statusFa + ')؛ برای دوره معتمد، عضویت باید معتبر باشد.', ...none, caseRow: current };
  }

  const [declaration] = await database
    .select()
    .from(vetTrustedDeclarations)
    .where(and(eq(vetTrustedDeclarations.caseId, current.id), eq(vetTrustedDeclarations.submissionVersion, current.currentSubmissionVersion)))
    .limit(1);
  if (!declaration || !declaration.microchipReaderDeclared) {
    return { ok: false, problemFa: 'خوداظهاری تجهیزات برای نسخه جاری درخواست ثبت نشده است.', ...none, caseRow: current };
  }
  if (!terms.configured) {
    return { ok: false, problemFa: 'متن و نسخه تعهدنامه معتمد در پنل مدیریت ثبت نشده است.', ...none, caseRow: current };
  }
  if (declaration.termsVersion !== terms.termsVersion) {
    // The undertaking changed after this application: what was accepted is no
    // longer what is published, so it is accepted again rather than assumed.
    return {
      ok: false,
      problemFa: 'تعهدنامه معتمد به‌روز شده است؛ نسخه تازه را در همین صفحه بپذیرید و درخواست را دوباره بفرستید.',
      ...none,
      caseRow: current,
    };
  }

  const [profile] = await database.select({ practiceScope: vetProfiles.practiceScope }).from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  return { ok: true, problemFa: null, caseRow: current, declarationVersion: declaration.declarationVersion, practiceScope: profile?.practiceScope ?? null };
}

// ── paying for a period ───────────────────────────────────────────────────

export interface StartedTrustedPayment {
  readonly period: TrustedPeriodRow;
  readonly batch: BatchRecord;
  readonly kind: 'ACTIVATION' | 'RENEWAL';
  readonly reused: boolean;
}

/**
 * Open the payment for one trusted period.
 *
 * Waiting has no deadline: an approved application stays payable for as long as
 * its prerequisites hold. The tariff and the period length are read from managed
 * settings and frozen on the period; an unpaid period whose figures no longer
 * match today's settings is cancelled and replaced.
 */
export async function startTrustedPayment(database: Database, actor: Actor, now: Date = new Date()): Promise<StartedTrustedPayment> {
  const prerequisites = await trustedPrerequisites(database, actor.accountId, now);
  if (!prerequisites.ok) throw conflict(prerequisites.problemFa!);
  const current = prerequisites.caseRow!;

  const live = await latestPaidTrustedPeriod(database, actor.accountId);
  const kind: 'ACTIVATION' | 'RENEWAL' = live === null ? 'ACTIVATION' : 'RENEWAL';
  const tariff = await snapshotSetting(database, TRUSTED_TARIFF_KEY[kind]);
  const amountToman = toman(String(tariff.value ?? '0'));
  if (amountToman <= 0n) throw notConfigured('تعرفه ' + KIND_FA[kind]);
  const periodDays = await readInt(database, TRUSTED_PERIOD_DAYS_KEY);
  const [graceDays, reminderDaysBefore] = await Promise.all([optionalInt(database, TRUSTED_GRACE_DAYS_KEY), optionalInt(database, TRUSTED_REMINDER_DAYS_KEY)]);

  return database.transaction(async (tx) => {
    const existing = await pendingTrustedPeriod(tx, current.id);
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
        .update(vetTrustedPeriods)
        .set({ status: 'CANCELLED', version: existing.version + 1, updatedAt: now })
        .where(and(eq(vetTrustedPeriods.id, existing.id), eq(vetTrustedPeriods.version, existing.version)))
        .returning();
      if (!cancelled) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'VET_TRUSTED_PERIOD_CANCELLED',
        targetType: 'VET_TRUSTED_PERIOD',
        targetId: existing.id,
        targetVersion: cancelled.version,
        before: { status: existing.status, amountToman: existing.amountToman, settingVersion: existing.tariffSettingVersion },
        after: { status: 'CANCELLED', reason: 'TARIFF_OR_PERIOD_CHANGED' },
      });
    }

    const [period] = await tx
      .insert(vetTrustedPeriods)
      .values({
        accountId: actor.accountId,
        caseId: current.id,
        kind,
        tariffSettingKey: TRUSTED_TARIFF_KEY[kind],
        tariffSettingVersion: tariff.version,
        amountToman: amountToman.toString(),
        periodDays,
        graceDays,
        reminderDaysBefore,
        declarationVersion: prerequisites.declarationVersion,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const batch = await createBatch(tx as unknown as Database, actor, {
      service: TRUSTED_PERIOD_SERVICE[kind],
      items: [{ targetType: 'VET_TRUSTED_PERIOD', targetId: period!.id, settingKey: TRUSTED_TARIFF_KEY[kind] }],
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: current.id }, step: 'REVIEW_TRUSTED_PERIOD_FEE', originRoute: ROUTE },
    });

    const [linked] = await tx
      .update(vetTrustedPeriods)
      .set({ paymentBatchId: batch.id, version: period!.version + 1, updatedAt: now })
      .where(and(eq(vetTrustedPeriods.id, period!.id), eq(vetTrustedPeriods.version, period!.version)))
      .returning();
    if (!linked) throw conflict(STALE);

    await recordAudit(tx, actor, {
      action: 'VET_TRUSTED_PERIOD_PAYMENT_STARTED',
      targetType: 'VET_TRUSTED_PERIOD',
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
        declarationVersion: prerequisites.declarationVersion,
        paymentBatchId: batch.id,
      },
    });
    return { period: linked, batch, kind, reused: false };
  });
}

/**
 * Activate the trusted period of a verified payment — runs inside the verifying
 * transaction. The prerequisites are asked one last time here: if the licence or
 * the membership lapsed while the payer was at the gateway, nothing is granted
 * and the money is still recorded, so the association can act on it.
 */
export async function activateTrustedPeriodFromPayment(tx: DbClient, batch: { id: string; accountId: string }, now: Date = new Date()): Promise<void> {
  const [period] = await tx.select().from(vetTrustedPeriods).where(eq(vetTrustedPeriods.paymentBatchId, batch.id)).limit(1);
  if (!period || period.status !== 'PENDING_PAYMENT') return;

  const prerequisites = await trustedPrerequisites(tx as unknown as Database, period.accountId, now);
  if (!prerequisites.ok) {
    await recordAudit(tx, null, {
      action: 'VET_TRUSTED_PERIOD_ACTIVATION_BLOCKED',
      targetType: 'VET_TRUSTED_PERIOD',
      targetId: period.id,
      targetVersion: period.version,
      after: { paymentBatchId: batch.id, reason: prerequisites.problemFa },
    });
    await createNotification(tx, {
      recipientAccountId: period.accountId,
      kind: 'VET_TRUSTED_PERIOD_BLOCKED',
      titleFa: 'پرداخت شما ثبت شد، ولی دوره معتمد فعال نشد',
      bodyFa: (prerequisites.problemFa ?? '') + ' پرداخت شما ثبت است؛ برای ادامه با انجمن تماس بگیرید.',
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: period.caseId }, step: 'TRUSTED_BLOCKED', originRoute: ROUTE },
    });
    return;
  }

  const live = await latestPaidTrustedPeriod(tx, period.accountId);
  const liveEndsAt = live?.endsAt ?? null;
  const startsAt = periodStart(liveEndsAt, now);
  const endsAt = periodEnd(startsAt, period.periodDays, 'طول دوره معتمد معتبر نیست.');

  const [row] = await tx
    .update(vetTrustedPeriods)
    .set({ status: 'ACTIVE', startsAt, endsAt, version: period.version + 1, updatedAt: now })
    .where(and(eq(vetTrustedPeriods.id, period.id), eq(vetTrustedPeriods.version, period.version)))
    .returning();
  if (!row) return;

  const current = prerequisites.caseRow!;
  const status = current.status as VetCaseStatus;
  if (status !== 'ACTIVE_TRUSTED_VET' && vetCaseMove(status, 'ACTIVE_TRUSTED_VET', 'SYSTEM')) {
    await tx
      .update(vetProfessionalCases)
      .set({ status: 'ACTIVE_TRUSTED_VET', version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)));
  }

  // The internal role: granted, or brought back from a suspension. The row is
  // never deleted, so its history and everything assigned to it survive.
  const [role] = await tx
    .select()
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, period.accountId), eq(accountRoles.role, 'TRUSTED_VET')))
    .limit(1);
  if (role) {
    await tx.update(accountRoles).set({ status: 'ACTIVE', grantedAt: role.grantedAt ?? now, updatedAt: now }).where(eq(accountRoles.id, role.id));
  } else {
    await tx.insert(accountRoles).values({ accountId: period.accountId, role: 'TRUSTED_VET', status: 'ACTIVE', grantedAt: now });
  }

  // The one public tag: trusted, written by the server alone (DEC-0193).
  await replaceVetTag(
    tx,
    null,
    {
      accountId: period.accountId,
      tag: 'TRUSTED',
      practiceScope: prerequisites.practiceScope,
      reasonFa: 'پرداخت تأییدشده ' + KIND_FA[period.kind as 'ACTIVATION'],
      source: { type: 'VET_TRUSTED_PERIOD', id: row.id },
    },
    now,
  );

  await recordAudit(tx, null, {
    action: 'VET_TRUSTED_PERIOD_ACTIVATED',
    targetType: 'VET_TRUSTED_PERIOD',
    targetId: row.id,
    targetVersion: row.version,
    before: { status: period.status, caseStatus: status, startsAt: null, endsAt: null },
    after: {
      status: row.status,
      caseStatus: 'ACTIVE_TRUSTED_VET',
      kind: row.kind,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      continuedFromLivePeriod: liveEndsAt !== null && liveEndsAt.getTime() > now.getTime(),
      amountToman: row.amountToman,
      paymentBatchId: batch.id,
      role: 'TRUSTED_VET',
    },
  });
  await createNotification(tx, {
    recipientAccountId: period.accountId,
    kind: 'VET_TRUSTED_PERIOD_ACTIVATED',
    titleFa: row.kind === 'RENEWAL' ? 'دوره دامپزشک معتمد شما تمدید شد' : 'دامپزشک معتمد شدید',
    bodyFa: 'پرداخت روی سرور تأیید شد؛ دسترسی معتمد و Tag معتمد تا پایان این دوره برقرار است.',
    resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: current.id }, step: 'TRUSTED_ACTIVE', originRoute: ROUTE },
  });
}

// ── losing it: expiry, and the association's own decision ─────────────────

/**
 * What a trusted standing falls back to.
 *
 * The licensed tag comes back only while that licence period is itself valid;
 * otherwise the doctor keeps the standing the council verified. Nothing the
 * doctor did is removed — only what they may do next changes.
 */
async function fallbackTag(tx: DbClient, accountId: string, reasonFa: string, sourceId: string, now: Date): Promise<'LICENSED' | 'UNLICENSED'> {
  const licence = await licenceStanding(tx as unknown as Database, accountId, now);
  const licensed = licence.caseStatus === 'ACTIVE_LICENSED_VET' && (licence.standing === 'ACTIVE' || licence.standing === 'GRACE');
  const [profile] = await tx.select({ practiceScope: vetProfiles.practiceScope }).from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  const tag = licensed ? 'LICENSED' : 'UNLICENSED';
  await replaceVetTag(tx, null, { accountId, tag, practiceScope: profile?.practiceScope ?? null, reasonFa, source: { type: 'VET_TRUSTED_PERIOD', id: sourceId } }, now);
  return tag;
}

/** Take the trusted capability away without destroying anything it did. */
async function withdrawTrusted(
  tx: DbClient,
  input: { accountId: string; caseId: string; nextCaseStatus: 'EXPIRED' | 'SUSPENDED'; reasonFa: string; periodId: string; by: Actor | null },
  now: Date,
): Promise<'LICENSED' | 'UNLICENSED'> {
  const [role] = await tx
    .select()
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, input.accountId), eq(accountRoles.role, 'TRUSTED_VET')))
    .limit(1);
  if (role && role.status === 'ACTIVE') {
    // Suspended, never deleted: the role's history and its assigned work remain.
    await tx.update(accountRoles).set({ status: 'SUSPENDED', updatedAt: now }).where(eq(accountRoles.id, role.id));
  }

  const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
  if (current && current.status !== input.nextCaseStatus && vetCaseMove(current.status as VetCaseStatus, input.nextCaseStatus, input.by === null ? 'SYSTEM' : 'REVIEWER')) {
    await tx
      .update(vetProfessionalCases)
      .set({ status: input.nextCaseStatus, reviewNoteFa: input.by === null ? current.reviewNoteFa : input.reasonFa, version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)));
  }

  return fallbackTag(tx, input.accountId, input.reasonFa, input.periodId, now);
}

/**
 * Apply what time has done: the renewal reminder while the period is live, and
 * the withdrawal once the period and its bought grace are over. Idempotent, and
 * safe on every read.
 */
export async function enforceTrustedPeriod(database: Database, accountId: string, now: Date = new Date()): Promise<void> {
  const period = await latestPaidTrustedPeriod(database, accountId);
  if (!period || period.endsAt === null) return;
  const standing = periodStanding({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, now);

  if (standing === 'ACTIVE' || standing === 'GRACE') {
    if (period.reminderSentAt !== null) return;
    if (!reminderDue({ status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays }, period.reminderDaysBefore, now)) return;
    await database.transaction(async (tx) => {
      const [marked] = await tx
        .update(vetTrustedPeriods)
        .set({ reminderSentAt: now, version: period.version + 1, updatedAt: now })
        .where(and(eq(vetTrustedPeriods.id, period.id), eq(vetTrustedPeriods.version, period.version)))
        .returning();
      if (!marked) return;
      await createNotification(tx, {
        recipientAccountId: accountId,
        kind: 'VET_TRUSTED_PERIOD_ENDING',
        titleFa: 'دوره دامپزشک معتمد شما رو به پایان است',
        bodyFa: 'برای اینکه دسترسی و Tag معتمد برقرار بماند، دوره را تمدید کنید. تمدید زودهنگام روزهای پرداخت‌شده را از بین نمی‌برد.',
        resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: period.caseId }, step: 'TRUSTED_RENEWAL_DUE', originRoute: ROUTE },
      });
    });
    return;
  }

  if (standing !== 'EXPIRED' || period.expiredNoticeAt !== null) return;

  await database.transaction(async (tx) => {
    const [claimed] = await tx
      .update(vetTrustedPeriods)
      .set({ expiredNoticeAt: now, version: period.version + 1, updatedAt: now })
      .where(and(eq(vetTrustedPeriods.id, period.id), eq(vetTrustedPeriods.version, period.version)))
      .returning();
    if (!claimed) return;

    const tag = await withdrawTrusted(
      tx,
      { accountId, caseId: period.caseId, nextCaseStatus: 'EXPIRED', reasonFa: 'پایان دوره پرداخت‌شده معتمد', periodId: period.id, by: null },
      now,
    );
    await recordAudit(tx, null, {
      action: 'VET_TRUSTED_PERIOD_EXPIRED',
      targetType: 'VET_TRUSTED_PERIOD',
      targetId: period.id,
      targetVersion: claimed.version,
      before: { caseStatus: 'ACTIVE_TRUSTED_VET', role: 'ACTIVE' },
      after: { caseStatus: 'EXPIRED', role: 'SUSPENDED', fallbackTag: tag, endsAt: period.endsAt!.toISOString(), graceDays: period.graceDays },
    });
    await createNotification(tx, {
      recipientAccountId: accountId,
      kind: 'VET_TRUSTED_PERIOD_EXPIRED',
      titleFa: 'دوره دامپزشک معتمد شما به پایان رسید',
      bodyFa:
        tag === 'LICENSED'
          ? 'دسترسی معتمد برداشته شد و Tag شما به «دارای پروانه فعالیت» برگشت. کارهای انجام‌شده شما دست‌نخورده می‌مانند.'
          : 'دسترسی معتمد برداشته شد. چون دوره پروانه هم فعال نیست، Tag شما «بدون پروانه فعالیت» است. کارهای انجام‌شده شما دست‌نخورده می‌مانند.',
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: period.caseId }, step: 'TRUSTED_EXPIRED', originRoute: ROUTE },
    });
  });
}

/**
 * The association suspends a trusted standing it granted, with a written reason.
 *
 * This is not a payment and not a refund: it removes what the doctor may do next
 * and falls back to the licensed tag when that licence is still valid.
 */
export async function suspendTrustedStanding(
  database: Database,
  actor: Actor,
  input: { accountId: string; reasonFa: string },
  now: Date = new Date(),
): Promise<void> {
  if (!REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('تعلیق دسترسی معتمد از محیط عملیاتی انجمن انجام می‌شود.');
  const reasonFa = (input.reasonFa ?? '').trim();
  if (reasonFa === '') throw validation('دلیل تعلیق را بنویسید؛ برای دامپزشک نمایش داده می‌شود.');
  const current = await trustedCaseOf(database, input.accountId);
  if (!current) throw notFound('پرونده معتمدی برای این حساب نیست.');
  if (current.status !== 'ACTIVE_TRUSTED_VET' && current.status !== 'TRUSTED_APPROVED_AWAITING_PAYMENT') {
    throw conflict('این حساب دسترسی معتمد فعالی ندارد.');
  }
  const period = await latestPaidTrustedPeriod(database, input.accountId);

  await database.transaction(async (tx) => {
    const tag = await withdrawTrusted(
      tx,
      { accountId: input.accountId, caseId: current.id, nextCaseStatus: 'SUSPENDED', reasonFa, periodId: period?.id ?? current.id, by: actor },
      now,
    );
    await recordAudit(tx, actor, {
      action: 'VET_TRUSTED_SUSPENDED',
      targetType: 'VET_PROFESSIONAL_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { caseStatus: current.status, role: 'ACTIVE' },
      after: { caseStatus: 'SUSPENDED', role: 'SUSPENDED', fallbackTag: tag },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: input.accountId,
      kind: 'VET_TRUSTED_SUSPENDED',
      titleFa: 'دسترسی دامپزشک معتمد شما معلق شد',
      bodyFa: reasonFa,
      resume: { entity: { type: 'VET_PROFESSIONAL_CASE', id: current.id }, step: 'TRUSTED_SUSPENDED', originRoute: ROUTE },
    });
  });
}

// ── what the pages show ───────────────────────────────────────────────────

export interface TrustedStandingView {
  readonly standing: PeriodStanding;
  readonly caseStatus: VetCaseStatus | null;
  readonly caseStatusFa: string | null;
  readonly endsAt: string | null;
  readonly daysLeft: number | null;
  readonly inGrace: boolean;
  readonly isTrustedNow: boolean;
  readonly canPay: boolean;
  readonly kind: 'ACTIVATION' | 'RENEWAL';
  readonly blockedReasonFa: string | null;
  readonly pendingBatchId: string | null;
  readonly pendingAmountToman: string | null;
  readonly tagFa: string | null;
}

/** The trusted standing after any due reminder or withdrawal has been applied. */
export async function trustedStanding(database: Database, accountId: string, now: Date = new Date()): Promise<TrustedStandingView> {
  await enforceTrustedPeriod(database, accountId, now);
  const current = await trustedCaseOf(database, accountId);
  const period = await latestPaidTrustedPeriod(database, accountId);
  const pending = current ? await pendingTrustedPeriod(database, current.id) : null;
  const standing = periodStanding(
    period ? { status: 'ACTIVE', startsAt: period.startsAt, endsAt: period.endsAt, graceDays: period.graceDays } : null,
    now,
  );
  const prerequisites = current ? await trustedPrerequisites(database, accountId, now) : null;
  const tag = await currentVetTag(database, accountId);

  return {
    standing,
    caseStatus: (current?.status ?? null) as VetCaseStatus | null,
    caseStatusFa: current ? CASE_STATUS_FA[current.status as VetCaseStatus] : null,
    endsAt: period?.endsAt ? period.endsAt.toISOString() : null,
    daysLeft: period?.endsAt ? daysLeft(period.endsAt, now) : null,
    inGrace: standing === 'GRACE',
    isTrustedNow: current?.status === 'ACTIVE_TRUSTED_VET' && (standing === 'ACTIVE' || standing === 'GRACE'),
    canPay: prerequisites?.ok === true,
    kind: period === null ? 'ACTIVATION' : 'RENEWAL',
    blockedReasonFa: prerequisites && !prerequisites.ok ? prerequisites.problemFa : null,
    pendingBatchId: pending?.paymentBatchId ?? null,
    pendingAmountToman: pending?.amountToman ?? null,
    tagFa: tag ? vetTagLabel(tag.tag, tag.practiceScope) : null,
  };
}

/** Every trusted period of one account, newest first: the receipts of what was paid. */
export async function trustedPeriodHistory(database: DbClient, accountId: string): Promise<readonly TrustedPeriodRow[]> {
  return database.select().from(vetTrustedPeriods).where(eq(vetTrustedPeriods.accountId, accountId)).orderBy(desc(vetTrustedPeriods.createdAt));
}

export { addDays };
