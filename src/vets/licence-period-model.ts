/**
 * The arithmetic of a practice licence period — Phase 2.5 PROMPT-008.
 *
 * Kept free of the database so the rules that decide what a payment buys, when
 * a reminder is due and when a licence stops being active can be read and
 * tested on their own. Every figure comes from managed settings; nothing here
 * carries a tariff, a duration or a grace rule of its own.
 */
import { validation } from '../domain/errors.ts';

export const LICENCE_PERIOD_KINDS = ['ACTIVATION', 'RENEWAL'] as const;
export type LicencePeriodKind = (typeof LICENCE_PERIOD_KINDS)[number];

export const LICENCE_PERIOD_STATUSES = ['PENDING_PAYMENT', 'ACTIVE', 'CANCELLED'] as const;
export type LicencePeriodStatus = (typeof LICENCE_PERIOD_STATUSES)[number];

export const LICENCE_PERIOD_KIND_FA: Record<LicencePeriodKind, string> = {
  ACTIVATION: 'فعال‌سازی پروانه',
  RENEWAL: 'تمدید پروانه',
};

/** The service each kind is paid under; both go through the ordinary payment machinery. */
export const LICENCE_PERIOD_SERVICE: Record<LicencePeriodKind, 'VET_LICENSE_ACTIVATION' | 'VET_LICENSE_RENEWAL'> = {
  ACTIVATION: 'VET_LICENSE_ACTIVATION',
  RENEWAL: 'VET_LICENSE_RENEWAL',
};

export const LICENCE_TARIFF_KEY: Record<LicencePeriodKind, string> = {
  ACTIVATION: 'vet_licence.activation_toman',
  RENEWAL: 'vet_licence.renewal_toman',
};

export const PERIOD_DAYS_KEY = 'vet_licence.period_days';
export const REMINDER_DAYS_KEY = 'vet_licence.reminder_days_before';
export const GRACE_DAYS_KEY = 'vet_licence.grace_days';

const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS);

/**
 * Where a paid period starts.
 *
 * Renewing early must neither overlap nor lose paid time: the new period starts
 * exactly where the live one ends. A licence with nothing live starts now.
 */
export function periodStart(livePeriodEndsAt: Date | null, now: Date): Date {
  return livePeriodEndsAt !== null && livePeriodEndsAt.getTime() > now.getTime() ? livePeriodEndsAt : now;
}

export function periodEnd(startsAt: Date, periodDays: number): Date {
  if (!Number.isInteger(periodDays) || periodDays < 1) throw validation('طول دوره فعالیت پروانه معتبر نیست.');
  return addDays(startsAt, periodDays);
}

/** What a stored period is right now. `EXPIRED` and `GRACE` are read, never stored. */
export type LicenceStanding = 'NONE' | 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED';

export const LICENCE_STANDING_FA: Record<LicenceStanding, string> = {
  NONE: 'بدون دوره فعالیت',
  PENDING_PAYMENT: 'در انتظار پرداخت',
  ACTIVE: 'فعال',
  GRACE: 'در مهلت ارفاقی',
  EXPIRED: 'منقضی',
  CANCELLED: 'لغوشده',
};

export interface PeriodFacts {
  readonly status: LicencePeriodStatus;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  /** The grace days frozen on the period when it was paid for; null means none. */
  readonly graceDays: number | null;
}

/**
 * A period's standing at a moment. Grace only delays the downgrade — it never
 * extends what the next period is paid for, which still starts at `endsAt`.
 */
export function periodStanding(period: PeriodFacts | null, now: Date): LicenceStanding {
  if (period === null) return 'NONE';
  if (period.status === 'CANCELLED') return 'CANCELLED';
  if (period.status === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (period.endsAt === null) return 'ACTIVE';
  if (now.getTime() < period.endsAt.getTime()) return 'ACTIVE';
  const graceEnd = addDays(period.endsAt, period.graceDays ?? 0);
  return now.getTime() < graceEnd.getTime() ? 'GRACE' : 'EXPIRED';
}

/** A standing that still carries the licensed tag. */
export const holdsLicensedTag = (standing: LicenceStanding): boolean => standing === 'ACTIVE' || standing === 'GRACE';

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

/** Days left of a paid period, rounded up, for what the account page shows. */
export function daysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}
