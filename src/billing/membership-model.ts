/**
 * What an association membership is, in Phase 2.5 — PROMPT-009.
 *
 * Phase 1 sold a lifetime membership (D04): paying was joining, and nothing
 * expired. The Phase 2.5 product decision replaces that with a reviewed,
 * time-bounded membership (PHASE_2_5_SPEC_FA §6, PRODUCT_DECISIONS «انجمن»),
 * which this file describes: the states, who may move between them, and the
 * words shown for each. The memberships that were already active keep their
 * lifetime promise and are marked as such rather than given an invented expiry
 * (DEC-0195).
 *
 * No duration, tariff, reminder window or grace rule lives here: all four are
 * managed settings read when a payment starts.
 */
import { validation } from '../domain/errors.ts';

export const MEMBERSHIP_STATUSES = [
  'NONE',
  'PENDING_REVIEW',
  'NEEDS_CORRECTION',
  'REJECTED',
  'APPROVED_AWAITING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
  // Kept only because a Phase 1 row may still hold them until 0035 maps it.
  'PAYMENT_PENDING',
  'INACTIVE',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MEMBERSHIP_STATUS_FA: Record<MembershipStatus, string> = {
  NONE: 'بدون عضویت',
  PENDING_REVIEW: 'در انتظار بررسی انجمن',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  REJECTED: 'ردشده',
  APPROVED_AWAITING_PAYMENT: 'تأییدشده، در انتظار پرداخت',
  ACTIVE: 'فعال',
  EXPIRED: 'منقضی',
  SUSPENDED: 'معلق',
  REVOKED: 'لغوشده',
  PAYMENT_PENDING: 'در انتظار پرداخت',
  INACTIVE: 'غیرفعال',
};

export const MEMBERSHIP_APPLICATION_STATUSES = ['SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type MembershipApplicationStatus = (typeof MEMBERSHIP_APPLICATION_STATUSES)[number];

export const MEMBERSHIP_APPLICATION_STATUS_FA: Record<MembershipApplicationStatus, string> = {
  SUBMITTED: 'در انتظار بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  WITHDRAWN: 'پس‌گرفته‌شده',
};

export const MEMBERSHIP_DECISIONS = ['APPROVE', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type MembershipDecision = (typeof MEMBERSHIP_DECISIONS)[number];

export const MEMBERSHIP_DECISION_FA: Record<MembershipDecision, string> = {
  APPROVE: 'تأیید درخواست؛ پرداخت دوره باز می‌شود',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد درخواست',
};

/** Where each decision leaves the application and the membership itself. */
export const MEMBERSHIP_DECISION_OUTCOME: Record<MembershipDecision, { application: MembershipApplicationStatus; membership: MembershipStatus }> = {
  APPROVE: { application: 'APPROVED', membership: 'APPROVED_AWAITING_PAYMENT' },
  REQUEST_CORRECTION: { application: 'NEEDS_CORRECTION', membership: 'NEEDS_CORRECTION' },
  REJECT: { application: 'REJECTED', membership: 'REJECTED' },
};

export const isMembershipDecision = (value: string): value is MembershipDecision => (MEMBERSHIP_DECISIONS as readonly string[]).includes(value);

/** The states from which a member may buy a period: approved, or renewing what they hold or held. */
export const PAYABLE_MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ['APPROVED_AWAITING_PAYMENT', 'ACTIVE', 'EXPIRED'];

/** The states from which an account may apply again; the rest already have an open case or a standing. */
export const APPLICABLE_MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ['NONE', 'REJECTED', 'EXPIRED', 'REVOKED', 'INACTIVE'];

/**
 * The single question the rest of the product asks: is this membership valid
 * right now? A lifetime Phase 1 membership is valid for good; a timed one is
 * valid while its period (or its bought grace) lasts. Suspension and revocation
 * end validity whatever the period says.
 */
export function membershipIsValid(facts: { status: MembershipStatus; lifetime: boolean; currentPeriodEndsAt: Date | null }, now: Date): boolean {
  if (facts.status === 'SUSPENDED' || facts.status === 'REVOKED') return false;
  if (facts.lifetime) return facts.status === 'ACTIVE';
  if (facts.status !== 'ACTIVE') return false;
  if (facts.currentPeriodEndsAt === null) return false;
  // The instant itself is over: validity ends exactly when the bought time ends.
  return now.getTime() < facts.currentPeriodEndsAt.getTime();
}

export function statementProblem(statementFa: string | null | undefined): string | null {
  const value = (statementFa ?? '').trim();
  if (value.length > 1000) return 'توضیح درخواست حداکثر ۱۰۰۰ نویسه است.';
  return null;
}

export function assertReason(reasonFa: string, what = 'دلیل تصمیم'): string {
  const value = (reasonFa ?? '').trim();
  if (value === '') throw validation(what + ' را بنویسید؛ برای عضو نمایش داده می‌شود.');
  if (value.length > 1000) throw validation(what + ' حداکثر ۱۰۰۰ نویسه است.');
  return value;
}

export const MEMBERSHIP_TARIFF_KEY: Record<'INITIAL' | 'RENEWAL', string> = {
  INITIAL: 'fee.membership_toman',
  RENEWAL: 'membership.renewal_toman',
};

export const MEMBERSHIP_PERIOD_DAYS_KEY = 'membership.period_days';
export const MEMBERSHIP_REMINDER_DAYS_KEY = 'membership.reminder_days_before';
export const MEMBERSHIP_GRACE_DAYS_KEY = 'membership.grace_days';
export const MEMBERSHIP_PERIOD_KIND_FA: Record<'INITIAL' | 'RENEWAL', string> = { INITIAL: 'عضویت', RENEWAL: 'تمدید عضویت' };
