/**
 * The arithmetic of a paid, time-bounded period — Phase 2.5.
 *
 * A practice licence (PROMPT-008) and an association membership (PROMPT-009)
 * are both bought for a while: they start, they end, they may be renewed early
 * without losing a day, they may be reminded before the end and forgiven for a
 * grace after it. That shape is the same in both places, so it lives here once,
 * free of any database, tariff or duration of its own. Every figure is passed
 * in from managed settings.
 */
import { validation } from './errors.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS);

/**
 * Where a paid period starts.
 *
 * Renewing early must neither overlap nor lose paid time: the new period starts
 * exactly where the live one ends. With nothing live it starts now.
 */
export function periodStart(livePeriodEndsAt: Date | null, now: Date): Date {
  return livePeriodEndsAt !== null && livePeriodEndsAt.getTime() > now.getTime() ? livePeriodEndsAt : now;
}

export function periodEnd(startsAt: Date, periodDays: number, problemFa = 'طول دوره معتبر نیست.'): Date {
  if (!Number.isInteger(periodDays) || periodDays < 1) throw validation(problemFa);
  return addDays(startsAt, periodDays);
}

/** What a stored period is right now. `EXPIRED` and `GRACE` are read, never stored. */
export type PeriodStanding = 'NONE' | 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED';

export interface PeriodFacts {
  readonly status: 'PENDING_PAYMENT' | 'ACTIVE' | 'CANCELLED';
  readonly startsAt: Date | null;
  /** Null means a period with no end: nothing expires on its own. */
  readonly endsAt: Date | null;
  /** The grace days frozen on the period when it was paid for; null means none. */
  readonly graceDays: number | null;
}

/**
 * A period's standing at an instant. The end is exclusive: at exactly `endsAt`
 * the period is over, and grace only delays the consequence — it never extends
 * what the next period is paid for.
 */
export function periodStanding(period: PeriodFacts | null, now: Date): PeriodStanding {
  if (period === null) return 'NONE';
  if (period.status === 'CANCELLED') return 'CANCELLED';
  if (period.status === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (period.endsAt === null) return 'ACTIVE';
  if (now.getTime() < period.endsAt.getTime()) return 'ACTIVE';
  const graceEnd = addDays(period.endsAt, period.graceDays ?? 0);
  return now.getTime() < graceEnd.getTime() ? 'GRACE' : 'EXPIRED';
}

/** A standing that still carries what was bought. */
export const stillHolds = (standing: PeriodStanding): boolean => standing === 'ACTIVE' || standing === 'GRACE';

/**
 * Whether a renewal reminder is due for a paid period.
 *
 * With no configured window nothing is due: the product has not said when to
 * remind, and a reminder is not invented. A period already past its end is not
 * reminded either — that is the expiry notice, not a reminder.
 */
export function reminderDue(period: PeriodFacts, reminderDaysBefore: number | null, now: Date): boolean {
  if (period.status !== 'ACTIVE' || period.endsAt === null) return false;
  if (reminderDaysBefore === null || reminderDaysBefore < 1) return false;
  if (now.getTime() >= period.endsAt.getTime()) return false;
  return now.getTime() >= addDays(period.endsAt, -reminderDaysBefore).getTime();
}

/** Days left of a paid period, rounded up, for what a page shows. */
export function daysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}
