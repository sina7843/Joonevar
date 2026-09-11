/**
 * Moderation rules that need no database — Requirements-Phase-2 §13, §20, §22 (PROMPT-005).
 */
import type { ContentStatus } from '../content/model.ts';

export const REPORT_REASONS = [
  'INCORRECT_INFO',
  'HEALTH_MISINFORMATION',
  'OFFENSIVE',
  'SPAM',
  'COPYRIGHT',
  'PRIVACY',
  'OTHER',
] as const;
export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'ACTIONED'] as const;
export const MODERATION_DECISIONS = ['DISMISS', 'REQUEST_CORRECTION', 'HIDE', 'SOFT_DELETE', 'RESTRICT_PUBLISHER'] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

export const REASON_FA: Record<ReportReason, string> = {
  INCORRECT_INFO: 'اطلاعات نادرست',
  HEALTH_MISINFORMATION: 'ادعای سلامت نادرست یا خطرناک',
  OFFENSIVE: 'توهین‌آمیز یا نامناسب',
  SPAM: 'تبلیغ یا هرزنامه',
  COPYRIGHT: 'استفاده بدون اجازه از اثر دیگران',
  PRIVACY: 'انتشار اطلاعات شخصی',
  OTHER: 'دلیل دیگر',
};

export const REPORT_STATUS_FA: Record<ReportStatus, string> = {
  OPEN: 'در انتظار بررسی',
  DISMISSED: 'رد شد',
  ACTIONED: 'اقدام شد',
};

export const DECISION_FA: Record<ModerationDecision, string> = {
  DISMISS: 'رد گزارش',
  REQUEST_CORRECTION: 'درخواست اصلاح از نویسنده',
  HIDE: 'مخفی‌سازی محتوا',
  SOFT_DELETE: 'حذف نرم محتوا',
  RESTRICT_PUBLISHER: 'محدود کردن ناشر',
};

export const isReportReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
export const isModerationDecision = (value: unknown): value is ModerationDecision =>
  typeof value === 'string' && (MODERATION_DECISIONS as readonly string[]).includes(value);

/** Dismissing closes the reports as unfounded; every other decision closes them as acted upon. */
export const reportStatusFor = (decision: ModerationDecision): ReportStatus =>
  decision === 'DISMISS' ? 'DISMISSED' : 'ACTIONED';

export const REPORT_DETAILS_MAX = 1000;

export function reportInputProblems(input: { reason: unknown; details: string | null }): string[] {
  const problems: string[] = [];
  const details = (input.details ?? '').trim();
  if (!isReportReason(input.reason)) problems.push('دلیل گزارش را انتخاب کنید.');
  if (input.reason === 'OTHER' && details === '') problems.push('برای «دلیل دیگر» توضیح بنویسید.');
  if (details.length > REPORT_DETAILS_MAX) {
    problems.push('توضیح حداکثر ' + REPORT_DETAILS_MAX.toLocaleString('fa-IR') + ' نویسه است.');
  }
  return problems;
}

// ── Publisher restriction ─────────────────────────────────────────────────

export interface RestrictionWindow {
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly liftedAt: Date | null;
}

/** In force from its start until its end or until lifted — decided at read time. */
export function isRestrictionActive(restriction: RestrictionWindow, now: Date): boolean {
  return (
    restriction.liftedAt === null &&
    restriction.startsAt.getTime() <= now.getTime() &&
    (restriction.endsAt === null || restriction.endsAt.getTime() > now.getTime())
  );
}

export function restrictionEndProblem(endsAt: Date | null, now: Date): string | null {
  if (endsAt === null) return null;
  if (Number.isNaN(endsAt.getTime())) return 'تاریخ پایان محدودیت معتبر نیست.';
  return endsAt.getTime() <= now.getTime() ? 'پایان محدودیت باید در آینده باشد.' : null;
}

/**
 * What a restriction stops an author from doing (DEC-0162): publishing
 * anything, and changing what is already public. Drafts stay editable, so the
 * author can still prepare a correction for the content admin to see.
 */
export function blockedByRestriction(action: 'PUBLISH' | 'EDIT', status: ContentStatus): boolean {
  return action === 'PUBLISH' || status === 'PUBLISHED' || status === 'ARCHIVED';
}
