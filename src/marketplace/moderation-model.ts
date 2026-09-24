/**
 * Marketplace moderation vocabulary — PROMPT-004.
 *
 * Kept apart from the service so a client component can import the labels
 * without pulling the database, the file system and the whole server graph in
 * with them. Pure values only.
 */
import type { ModerationDecision } from '../moderation/model.ts';

/** The three things a marketplace gets reported for. */
export const MARKET_REPORT_TARGETS = ['ANIMAL_LISTING', 'LISTING_MEDIA', 'SELLER'] as const;
export type MarketReportTarget = (typeof MARKET_REPORT_TARGETS)[number];

export const MARKET_TARGET_FA: Record<MarketReportTarget, string> = {
  ANIMAL_LISTING: 'آگهی',
  LISTING_MEDIA: 'تصویر یا ویدئوی آگهی',
  SELLER: 'فروشنده',
};

export const isMarketReportTarget = (value: unknown): value is MarketReportTarget =>
  typeof value === 'string' && (MARKET_REPORT_TARGETS as readonly string[]).includes(value);

/**
 * What each decision means for an advert.
 *
 * The existing decision list is reused rather than extended: hiding an advert
 * is a suspension, soft-deleting one is a removal, and restricting the
 * publisher is what stops a seller. A second set of names for the same four
 * actions would only be another thing to keep in step.
 */
export const LISTING_DECISION_FA: Record<ModerationDecision, string> = {
  DISMISS: 'رد گزارش',
  REQUEST_CORRECTION: 'درخواست اصلاح از فروشنده',
  HIDE: 'توقف آگهی توسط ناظر',
  SOFT_DELETE: 'حذف آگهی',
  RESTRICT_PUBLISHER: 'محدود کردن فروشنده',
};

/** Appeal outcomes, as the seller and the moderator read them. */
export const APPEAL_STATUS_FA: Record<string, string> = {
  OPEN: 'در انتظار بررسی',
  UPHELD: 'تصمیم قبلی پابرجا ماند',
  OVERTURNED: 'اعتراض پذیرفته شد',
};
