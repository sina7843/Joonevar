/**
 * Club membership statuses in words — Phase 2.5 §9 (PROMPT-013).
 *
 * Kept apart from the rule engine so a page can name a status without pulling
 * the evaluator in, and so the words an applicant reads live in one place.
 */
export const CLUB_MEMBERSHIP_STATUSES = [
  'INELIGIBLE',
  'PENDING_REVIEW',
  'AWAITING_PAYMENT',
  'ACTIVE',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
  'LEFT',
] as const;
export type ClubMembershipStatus = (typeof CLUB_MEMBERSHIP_STATUSES)[number];

/** What the status means to the person it belongs to. */
export const CLUB_MEMBERSHIP_STATUS_FA: Record<ClubMembershipStatus, string> = {
  INELIGIBLE: 'شرایط عضویت این کلاب هنوز برقرار نیست.',
  PENDING_REVIEW: 'درخواست شما در انتظار تصمیم کلاب است.',
  AWAITING_PAYMENT: 'برای تکمیل عضویت، حق عضویت کلاب را بپردازید.',
  ACTIVE: 'عضویت شما در این کلاب فعال است.',
  REJECTED: 'درخواست عضویت شما رد شده است.',
  EXPIRED: 'عضویت شما به پایان رسیده است.',
  SUSPENDED: 'عضویت شما تعلیق شده است.',
  LEFT: 'شما از این کلاب خارج شده‌اید.',
};

/** The short label the club's own member list shows. */
export const CLUB_MEMBERSHIP_STATUS_SHORT_FA: Record<ClubMembershipStatus, string> = {
  INELIGIBLE: 'فاقد شرایط',
  PENDING_REVIEW: 'در انتظار تصمیم',
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  ACTIVE: 'عضو فعال',
  REJECTED: 'ردشده',
  EXPIRED: 'منقضی',
  SUSPENDED: 'تعلیق‌شده',
  LEFT: 'خارج‌شده',
};

export const CLUB_MEMBERSHIP_TONE: Record<ClubMembershipStatus, 'success' | 'warning' | 'neutral' | 'error' | 'info'> = {
  INELIGIBLE: 'neutral',
  PENDING_REVIEW: 'warning',
  AWAITING_PAYMENT: 'info',
  ACTIVE: 'success',
  REJECTED: 'error',
  EXPIRED: 'neutral',
  SUSPENDED: 'error',
  LEFT: 'neutral',
};

export const isClubMembershipStatus = (value: unknown): value is ClubMembershipStatus =>
  typeof value === 'string' && (CLUB_MEMBERSHIP_STATUSES as readonly string[]).includes(value);
