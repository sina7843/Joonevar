/**
 * What the numbers mean, before any of them are fetched — PROMPT-013.
 *
 * Arithmetic and redaction rules with no database, so the two things that are
 * easy to get quietly wrong can be read on their own: a rate computed from a
 * denominator that is sometimes zero, and a breakdown small enough to be
 * about one identifiable person.
 */

/**
 * A share, as a percentage to one decimal place.
 *
 * An empty denominator is not zero per cent — zero per cent is a claim about
 * a population that exists. It is null, and a screen showing it says «—».
 */
export function share(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Money divided by a count, truncating, because a fraction of a toman is not money. */
export function averageToman(total: bigint, count: number): bigint {
  if (!Number.isInteger(count) || count <= 0) return 0n;
  return total / BigInt(count);
}

export interface Funnel {
  readonly listed: number;
  readonly enquired: number;
  readonly accepted: number;
  readonly reserved: number;
  readonly completed: number;
}

export interface FunnelStep {
  readonly labelFa: string;
  readonly count: number;
  /** Of the step before it, so a drop is visible where it happened. */
  readonly ofPrevious: number | null;
  /** Of the top, so the whole path is visible at once. */
  readonly ofTop: number | null;
}

/**
 * The path from an advert to a finished deal.
 *
 * Each step is shown against the one before it and against the top, because
 * a single percentage hides where people actually leave.
 */
export function funnelSteps(funnel: Funnel): readonly FunnelStep[] {
  const steps: { labelFa: string; count: number }[] = [
    { labelFa: 'آگهی منتشرشده', count: funnel.listed },
    { labelFa: 'درخواست خرید', count: funnel.enquired },
    { labelFa: 'پذیرش فروشنده', count: funnel.accepted },
    { labelFa: 'رزرو با بیعانه', count: funnel.reserved },
    { labelFa: 'معامله کامل‌شده', count: funnel.completed },
  ];
  return steps.map((step, index) => ({
    labelFa: step.labelFa,
    count: step.count,
    ofPrevious: index === 0 ? null : share(step.count, steps[index - 1]!.count),
    ofTop: index === 0 ? null : share(step.count, steps[0]!.count),
  }));
}

export interface Breakdown {
  readonly labelFa: string;
  readonly count: number;
  readonly totalToman?: bigint;
}

export interface RedactedBreakdown extends Breakdown {
  /** True where the group was too small to show as a number. */
  readonly suppressed: boolean;
}

export const BELOW_THRESHOLD_FA = 'کمتر از حد نمایش';

/**
 * Hide the rows small enough to be about one person.
 *
 * A breakdown by province with one sale in it is not a statistic, it is a
 * fact about somebody, and an operator who can see it in a table can see it
 * whether or not they were entitled to the record. The row stays — its
 * absence would be as telling as its value — but the number is withheld and
 * the total is corrected so the figures still add up to something true.
 */
export function redactSmallGroups(
  rows: readonly Breakdown[],
  minimumCohort: number,
): readonly RedactedBreakdown[] {
  if (!Number.isInteger(minimumCohort) || minimumCohort <= 1) {
    return rows.map((row) => ({ ...row, suppressed: false }));
  }
  return rows.map((row) =>
    row.count < minimumCohort
      ? { labelFa: row.labelFa, count: 0, totalToman: undefined, suppressed: true }
      : { ...row, suppressed: false },
  );
}

/** What a suppressed cell reads as, so a screen never prints a bare zero for it. */
export const cellFa = (row: RedactedBreakdown): string =>
  row.suppressed ? BELOW_THRESHOLD_FA : row.count.toLocaleString('fa-IR');

export interface RiskSignal {
  readonly kind:
    | 'MANY_FAILED_PAYMENTS'
    | 'MANY_CANCELLED_DEALS'
    | 'MANY_REPORTS_AGAINST'
    | 'MANY_REFUNDS'
    | 'RATE_LIMIT_TRIPPED';
  readonly labelFa: string;
  readonly count: number;
  /** What an operator should look at, never an accusation. */
  readonly noteFa: string;
}

export const RISK_KIND_FA: Record<RiskSignal['kind'], string> = {
  MANY_FAILED_PAYMENTS: 'پرداخت‌های ناموفق پیاپی',
  MANY_CANCELLED_DEALS: 'لغو پیاپی معامله',
  MANY_REPORTS_AGAINST: 'گزارش‌های متعدد علیه',
  MANY_REFUNDS: 'بازپرداخت‌های متعدد',
  RATE_LIMIT_TRIPPED: 'برخورد با سقف نرخ',
};

/**
 * Which counts are worth an operator's attention.
 *
 * A signal is a reason to look, never a finding: nothing here suspends
 * anybody, changes a standing or marks an account. Reading it wrongly as a
 * verdict is the failure this shape is meant to prevent, which is why every
 * signal carries the sentence saying so.
 */
export function riskSignals(input: {
  failedPayments: number;
  cancelledDeals: number;
  reportsAgainst: number;
  refunds: number;
  rateLimitTrips: number;
  thresholds?: Partial<Record<RiskSignal['kind'], number>>;
}): readonly RiskSignal[] {
  const threshold = (kind: RiskSignal['kind'], fallback: number): number =>
    input.thresholds?.[kind] ?? fallback;

  const candidates: { kind: RiskSignal['kind']; count: number; at: number; noteFa: string }[] = [
    {
      kind: 'MANY_FAILED_PAYMENTS',
      count: input.failedPayments,
      at: threshold('MANY_FAILED_PAYMENTS', 5),
      noteFa: 'ممکن است مشکل درگاه باشد یا تلاش برای آزمودن کارت؛ پیش از هر تصمیمی سابقه پرداخت را بخوانید.',
    },
    {
      kind: 'MANY_CANCELLED_DEALS',
      count: input.cancelledDeals,
      at: threshold('MANY_CANCELLED_DEALS', 3),
      noteFa: 'لغو زیاد می‌تواند نشانه بدقولی باشد یا نشانه آگهی‌هایی که با واقعیت نمی‌خوانند.',
    },
    {
      kind: 'MANY_REPORTS_AGAINST',
      count: input.reportsAgainst,
      at: threshold('MANY_REPORTS_AGAINST', 3),
      noteFa: 'تعداد گزارش به‌تنهایی تصمیم نیست؛ خود گزارش‌ها را بخوانید.',
    },
    {
      kind: 'MANY_REFUNDS',
      count: input.refunds,
      at: threshold('MANY_REFUNDS', 3),
      noteFa: 'بازپرداخت زیاد می‌تواند کیفیت کالا باشد یا سوءاستفاده؛ هر دو را می‌شود از پرونده‌ها فهمید.',
    },
    {
      kind: 'RATE_LIMIT_TRIPPED',
      count: input.rateLimitTrips,
      at: threshold('RATE_LIMIT_TRIPPED', 1),
      noteFa: 'برخورد با سقف نرخ یعنی الگوی خودکار یا استفاده بسیار پرتکرار.',
    },
  ];

  return candidates
    .filter((candidate) => candidate.count >= candidate.at && candidate.count > 0)
    .map((candidate) => ({
      kind: candidate.kind,
      labelFa: RISK_KIND_FA[candidate.kind],
      count: candidate.count,
      noteFa: candidate.noteFa,
    }));
}
