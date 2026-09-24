/**
 * What ending a deal costs — PROMPT-006.
 *
 * Every rule here reads the policy that was frozen on the deal, never the
 * settings as they stand today: a penalty edited this morning must not reach
 * back into a deal somebody agreed to last month.
 *
 * Two things this file refuses to do. It never turns an unset penalty into
 * zero-or-anything-else silently — an unconfigured penalty means no penalty was
 * agreed, and the outcome says so. And it never decides a claim: a mismatch, a
 * false advert, a health problem or a handover nobody attended are assertions
 * about the world, so they produce `AWAITING_REVIEW` and a dispute rather than
 * a refund computed from somebody's own account of events.
 */

export const CANCELLATION_REASONS = [
  'BUYER_CANCELLED',
  'SELLER_CANCELLED',
  'INFO_MISMATCH',
  'FALSE_LISTING',
  'HEALTH_ISSUE',
  'BUYER_NO_SHOW',
  'SELLER_NO_SHOW',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_FA: Record<CancellationReason, string> = {
  BUYER_CANCELLED: 'انصراف خریدار',
  SELLER_CANCELLED: 'انصراف فروشنده',
  INFO_MISMATCH: 'عدم تطابق حیوان با اطلاعات آگهی',
  FALSE_LISTING: 'اطلاعات خلاف واقع در آگهی',
  HEALTH_ISSUE: 'مشکل سلامت حیوان',
  BUYER_NO_SHOW: 'عدم حضور خریدار در زمان تحویل',
  SELLER_NO_SHOW: 'عدم حضور فروشنده در زمان تحویل',
};

export const CANCELLATION_OUTCOMES = [
  'FULL_REFUND',
  'PARTIAL_REFUND',
  'NO_REFUND',
  'AWAITING_REVIEW',
] as const;
export type CancellationOutcome = (typeof CANCELLATION_OUTCOMES)[number];

export const CANCELLATION_OUTCOME_FA: Record<CancellationOutcome, string> = {
  FULL_REFUND: 'استرداد کامل بیعانه',
  PARTIAL_REFUND: 'استرداد بیعانه پس از کسر جریمه',
  NO_REFUND: 'بدون استرداد',
  AWAITING_REVIEW: 'در انتظار رأی داور',
};

export type DealParty = 'BUYER' | 'SELLER';

/** Who may give each reason. A claim about the other side is still their claim. */
const REASON_PARTY: Record<CancellationReason, DealParty> = {
  BUYER_CANCELLED: 'BUYER',
  SELLER_CANCELLED: 'SELLER',
  INFO_MISMATCH: 'BUYER',
  FALSE_LISTING: 'BUYER',
  HEALTH_ISSUE: 'BUYER',
  BUYER_NO_SHOW: 'SELLER',
  SELLER_NO_SHOW: 'BUYER',
};

export const canGiveReason = (reason: CancellationReason, party: DealParty): boolean =>
  REASON_PARTY[reason] === party;

/**
 * The reasons that are claims rather than decisions.
 *
 * Each of these says something about the animal, the advert or a meeting that
 * only one side witnessed. None of them may move money on that say-so.
 */
export const CLAIMED_REASONS: readonly CancellationReason[] = [
  'INFO_MISMATCH',
  'FALSE_LISTING',
  'HEALTH_ISSUE',
  'BUYER_NO_SHOW',
  'SELLER_NO_SHOW',
];

export const needsReview = (reason: CancellationReason): boolean =>
  CLAIMED_REASONS.includes(reason);

/** The policy as it was frozen on the deal, not as the settings read now. */
export interface FrozenPolicy {
  readonly policyVersion: string | null;
  /** Null means no buyer penalty had been configured when the deal was struck. */
  readonly buyerPenaltyBp: number | null;
  /** Null means no seller penalty had been configured then. */
  readonly sellerPenaltyToman: bigint | null;
  readonly sellerRestrictionDays: number | null;
}

export interface CancellationEffect {
  readonly outcome: CancellationOutcome;
  /** Deducted from the deposit and kept by Hamzist. */
  readonly penaltyToman: bigint;
  /** Paid back to the buyer. */
  readonly refundToman: bigint;
  /** Recorded against the seller as owed. Never taken automatically. */
  readonly sellerDebtToman: bigint;
  /** Whether a dispute has to decide this before any money moves. */
  readonly opensDispute: boolean;
  readonly noteFa: string;
}

/**
 * Work out what a cancellation does.
 *
 * `depositToman` is the figure frozen on the deal, so the arithmetic is always
 * against what was actually paid. Penalties are basis points of that deposit,
 * truncated, and can never exceed it.
 */
export function cancellationEffect(
  reason: CancellationReason,
  depositToman: bigint,
  policy: FrozenPolicy,
): CancellationEffect {
  if (needsReview(reason)) {
    return {
      outcome: 'AWAITING_REVIEW',
      penaltyToman: 0n,
      refundToman: 0n,
      sellerDebtToman: 0n,
      opensDispute: true,
      noteFa:
        'این دلیل ادعایی درباره حیوان، آگهی یا جلسه تحویل است و با اظهار یک طرف تعیین تکلیف نمی‌شود؛ پرونده اختلاف باز شد و داور تصمیم می‌گیرد.',
    };
  }

  if (reason === 'SELLER_CANCELLED') {
    // The buyer did nothing wrong, so the buyer gets everything back. What the
    // seller owes is recorded as a debt; nothing is deducted from a refund that
    // is not the seller's money.
    return {
      outcome: 'FULL_REFUND',
      penaltyToman: 0n,
      refundToman: depositToman,
      sellerDebtToman: policy.sellerPenaltyToman ?? 0n,
      opensDispute: false,
      noteFa:
        policy.sellerPenaltyToman === null
          ? 'استرداد کامل به خریدار. در زمان این معامله جریمه‌ای برای انصراف فروشنده تعیین نشده بود، پس بدهی ثبت نمی‌شود.'
          : 'استرداد کامل به خریدار و ثبت جریمه انصراف برای فروشنده.',
    };
  }

  // The buyer changing their mind after acceptance, which is the one case the
  // versioned penalty is actually for.
  if (policy.buyerPenaltyBp === null || policy.buyerPenaltyBp === 0) {
    return {
      outcome: 'FULL_REFUND',
      penaltyToman: 0n,
      refundToman: depositToman,
      sellerDebtToman: 0n,
      opensDispute: false,
      noteFa:
        policy.buyerPenaltyBp === null
          ? 'در زمان این معامله جریمه انصراف خریدار تعیین نشده بود، پس کسری اعمال نمی‌شود و استرداد کامل است.'
          : 'جریمه انصراف خریدار در این معامله صفر بود؛ استرداد کامل است.',
    };
  }

  const penalty = (depositToman * BigInt(policy.buyerPenaltyBp)) / 10_000n;
  const capped = penalty > depositToman ? depositToman : penalty;
  const refund = depositToman - capped;
  return {
    outcome: refund === 0n ? 'NO_REFUND' : 'PARTIAL_REFUND',
    penaltyToman: capped,
    refundToman: refund,
    sellerDebtToman: 0n,
    opensDispute: false,
    noteFa: 'جریمه انصراف خریدار طبق سیاست نسخه‌دار همین معامله از بیعانه کسر شد.',
  };
}

/**
 * How long a seller is restricted after cancelling.
 *
 * Progressive on purpose: the second cancellation costs twice the base period
 * and the third three times, so a pattern is treated differently from an
 * accident. An unset base period restricts nobody — a limit nobody chose is not
 * a limit of zero days and not one of forever.
 */
export function sellerRestrictionUntil(
  previousCancellations: number,
  baseDays: number | null,
  from: Date,
): Date | null {
  if (baseDays === null || baseDays <= 0) return null;
  const multiplier = previousCancellations + 1;
  return new Date(from.getTime() + baseDays * multiplier * 24 * 60 * 60 * 1000);
}

// ── disputes ───────────────────────────────────────────────────────────────

export const DISPUTE_SCOPES = ['DEPOSIT', 'LISTING_FACTS', 'HANDOVER'] as const;
export type DisputeScope = (typeof DISPUTE_SCOPES)[number];

export const DISPUTE_SCOPE_FA: Record<DisputeScope, string> = {
  DEPOSIT: 'بیعانه',
  LISTING_FACTS: 'صحت اطلاعات ثبت‌شده آگهی',
  HANDOVER: 'انجام‌شدن تحویل',
};

/**
 * What Hamzist will not arbitrate, said plainly.
 *
 * The rest of the price is settled between the two people outside the product;
 * pretending otherwise would promise an arbitration that has no evidence, no
 * record and no way to enforce an answer.
 */
export const OUT_OF_SCOPE_FA =
  'داوری همزیست فقط بیعانه، صحت اطلاعات ثبت‌شده آگهی و انجام‌شدن تحویل را پوشش می‌دهد. تسویه باقی قیمت بیرون از همزیست انجام می‌شود و همزیست درباره آن داوری نمی‌کند.';

export const DISPUTE_DECISIONS = [
  'BUYER_FAVOURED',
  'SELLER_FAVOURED',
  'NO_FAULT',
  'OUT_OF_SCOPE',
] as const;
export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];

export const DISPUTE_DECISION_FA: Record<DisputeDecision, string> = {
  BUYER_FAVOURED: 'به سود خریدار — استرداد بیعانه',
  SELLER_FAVOURED: 'به سود فروشنده — بیعانه مسترد نمی‌شود',
  NO_FAULT: 'بدون تقصیر طرفین — استرداد کامل بیعانه',
  OUT_OF_SCOPE: 'خارج از دامنه داوری همزیست',
};

export const DISPUTE_STATUS_FA: Record<string, string> = {
  OPEN: 'باز',
  UNDER_REVIEW: 'در حال بررسی',
  RESOLVED: 'تعیین تکلیف شد',
  WITHDRAWN: 'پس گرفته شد',
};

/**
 * How much of the deposit a decision returns.
 *
 * A reviewer may return less than the whole deposit, but never more than what
 * was paid, and `OUT_OF_SCOPE` returns nothing because it decided nothing.
 */
export function decisionRefund(
  decision: DisputeDecision,
  depositToman: bigint,
  requested: bigint | null,
): bigint {
  if (decision === 'SELLER_FAVOURED' || decision === 'OUT_OF_SCOPE') return 0n;
  if (decision === 'NO_FAULT') return depositToman;
  const amount = requested ?? depositToman;
  if (amount < 0n) return 0n;
  return amount > depositToman ? depositToman : amount;
}

// ── refunds ────────────────────────────────────────────────────────────────

export const REFUND_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار اجرا',
  PROCESSING: 'در حال اجرا',
  PAID: 'پرداخت شد',
  FAILED: 'اجرا ناموفق بود',
  MANUAL_REQUIRED: 'نیازمند اقدام دستی مالی',
  CANCELLED: 'لغو شد',
};

/** Tried enough times that a person should look at it rather than a loop. */
export const MAX_AUTOMATIC_REFUND_ATTEMPTS = 3;

export const refundRetryable = (status: string, attempts: number): boolean =>
  (status === 'FAILED' || status === 'PENDING') && attempts < MAX_AUTOMATIC_REFUND_ATTEMPTS;
