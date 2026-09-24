/**
 * Marketplace moderation vocabulary — PROMPT-004.
 *
 * Kept apart from the service so a client component can import the labels
 * without pulling the database, the file system and the whole server graph in
 * with them. Pure values only.
 */
import type { ModerationDecision } from '../moderation/model.ts';

/** The three things the public market gets reported for. */
export const MARKET_REPORT_TARGETS = ['ANIMAL_LISTING', 'LISTING_MEDIA', 'SELLER'] as const;
export type MarketReportTarget = (typeof MARKET_REPORT_TARGETS)[number];

export const MARKET_TARGET_FA: Record<MarketReportTarget, string> = {
  ANIMAL_LISTING: 'آگهی',
  LISTING_MEDIA: 'تصویر یا ویدئوی آگهی',
  SELLER: 'فروشنده',
};

/*
 * Chat evidence is deliberately not in that list (PROMPT-005). A message inside
 * a deal thread is reported from inside the thread by one of its two parties;
 * it is not a subject the public report form can offer, because nobody outside
 * those two people can see it in the first place.
 */
export const INQUIRY_MESSAGE_TARGET = 'INQUIRY_MESSAGE';
export const INQUIRY_MESSAGE_TARGET_FA = 'پیام در گفت‌وگوی خرید';

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
