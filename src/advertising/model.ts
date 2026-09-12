/**
 * Advertising package rules that need no database — Requirements-Phase-2 §14,
 * §15, P2-D03, P2-D05 (PROMPT-011).
 *
 * Three things are decided here and nowhere else: how long a period lasts, when
 * a subscription is live (read at request time, never by a job), and when a
 * purchase may not start. A package is its own axis: it never verifies a
 * licence, never makes a profile trusted and never completes a profile.
 */

export const AD_TIERS = ['FEATURED', 'PRO'] as const;
export type AdTier = (typeof AD_TIERS)[number];

export const AD_TIER_FA: Record<AdTier, string> = {
  FEATURED: 'ویژه',
  PRO: 'حرفه‌ای',
};

export const AD_PERIODS = ['D30', 'D90', 'D365'] as const;
export type AdPeriod = (typeof AD_PERIODS)[number];

/** §14 names these three lengths; nothing else is offered. */
export const AD_PERIOD_DAYS: Record<AdPeriod, number> = { D30: 30, D90: 90, D365: 365 };

export const AD_PERIOD_FA: Record<AdPeriod, string> = {
  D30: '۳۰ روزه',
  D90: '۹۰ روزه',
  D365: '۳۶۵ روزه',
};

export const AD_TARGET_TYPES = ['VET', 'CENTRE', 'COMMUNITY'] as const;
export type AdTargetType = (typeof AD_TARGET_TYPES)[number];

export const AD_TARGET_FA: Record<AdTargetType, string> = {
  VET: 'پروفایل دامپزشک',
  CENTRE: 'مرکز دامپزشکی',
  COMMUNITY: 'انجمن یا کلاب',
};

/** What a subscription row stores. `EXPIRED` is never stored — it is read. */
export type AdStoredStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'CANCELLED' | 'PAYMENT_FAILED';
/** What a reader sees, once `ends_at` has been compared with the current time. */
export type AdState = AdStoredStatus | 'EXPIRED';

export const AD_STATE_FA: Record<AdState, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  ACTIVE: 'فعال',
  EXPIRED: 'منقضی',
  CANCELLED: 'لغوشده',
  PAYMENT_FAILED: 'پرداخت ناموفق',
};

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isAdTier = oneOf(AD_TIERS);
export const isAdPeriod = oneOf(AD_PERIODS);
export const isAdTargetType = oneOf(AD_TARGET_TYPES);

/** The catalogue §14 describes: two paid tiers in three periods, each priced from managed data. */
export const AD_PLAN_CATALOGUE: ReadonlyArray<{
  tier: AdTier;
  period: AdPeriod;
  durationDays: number;
  priceSettingKey: string;
  featuresFa: string;
}> = AD_TIERS.flatMap((tier) =>
  AD_PERIODS.map((period) => ({
    tier,
    period,
    durationDays: AD_PERIOD_DAYS[period],
    priceSettingKey:
      'advertising.' + (tier === 'FEATURED' ? 'featured' : 'pro') + '_' + String(AD_PERIOD_DAYS[period]) + '_toman',
    featuresFa:
      tier === 'FEATURED'
        ? 'نمایش با برچسب «تبلیغ» در فهرست‌های مرتبط، در بازه خریداری‌شده.'
        : 'نمایش با برچسب «تبلیغ» در فهرست‌های مرتبط و اولویت جایگاه حرفه‌ای، در بازه خریداری‌شده.',
  })),
);

/**
 * Whether this subscription is live now.
 *
 * A period that has run out is simply not live any more; no job writes that
 * down, exactly as the package expiry rule of the Phase 2 boundary requires.
 */
export function adState(
  row: { status: string; endsAt: Date | null },
  now: Date = new Date(),
): AdState {
  if (row.status !== 'ACTIVE') return row.status as AdState;
  if (row.endsAt !== null && row.endsAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export const isLivePackage = (row: { status: string; endsAt: Date | null }, now: Date = new Date()): boolean =>
  adState(row, now) === 'ACTIVE';

/**
 * When a newly paid period starts.
 *
 * Renewing early must not throw away days that were already paid for, so a
 * renewal starts where the live period ends; a lapsed one starts now.
 */
export const packageStart = (liveEndsAt: Date | null, now: Date = new Date()): Date =>
  liveEndsAt !== null && liveEndsAt.getTime() > now.getTime() ? liveEndsAt : now;

/** The end of a period, counted in whole days from its start. */
export function packageEnd(startsAt: Date, durationDays: number): Date {
  const end = new Date(startsAt.getTime());
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end;
}

export const remainingDays = (endsAt: Date | null, now: Date = new Date()): number =>
  endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));

/**
 * Why this purchase may not start — §14, P2-D07.
 *
 * Only the manager of a claimed record buys, the plan has to be on sale, its
 * price has to exist as a real recorded figure, and a plan whose slots are full
 * is refused rather than oversold.
 */
export function purchaseProblem(input: {
  readonly ownerAccountId: string | null;
  readonly actorAccountId: string;
  readonly planActive: boolean;
  readonly priceConfigured: boolean;
  readonly pendingExists: boolean;
  readonly activeOfPlan: number;
  readonly slotCapacity: number | null;
}): string | null {
  if (input.ownerAccountId === null) return 'این پرونده مدیری ندارد؛ تا واگذاری مدیریت، بسته‌ای خریداری نمی‌شود.';
  if (input.ownerAccountId !== input.actorAccountId) return 'بسته این پرونده را فقط مدیر خودش می‌خرد.';
  if (!input.planActive) return 'این بسته در حال حاضر ارائه نمی‌شود.';
  if (!input.priceConfigured) return 'قیمت این بسته هنوز ثبت نشده است؛ تا ثبت مبلغ، خرید ممکن نیست.';
  if (input.pendingExists) return 'یک خرید در انتظار پرداخت برای همین پرونده باز است؛ آن را کامل یا لغو کنید.';
  if (input.slotCapacity !== null && input.activeOfPlan >= input.slotCapacity) {
    return 'ظرفیت این بسته تکمیل است.';
  }
  return null;
}

/** What the panel may set on a plan. A price is never one of them (§22, P2-D03). */
export function planCapacityProblem(slotCapacity: number | null): string | null {
  if (slotCapacity === null) return null;
  if (!Number.isInteger(slotCapacity) || slotCapacity < 0) return 'ظرفیت جایگاه باید عدد صحیح و صفر یا بیشتر باشد.';
  if (slotCapacity > 10_000) return 'ظرفیت جایگاه بیش از اندازه بزرگ است.';
  return null;
}
