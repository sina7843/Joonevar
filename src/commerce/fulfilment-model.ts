/**
 * Delivery charges, return rights, balances and settlement periods — PROMPT-011.
 *
 * All arithmetic and rules, with no database, because these are the places
 * where being quietly wrong moves somebody's money: a weight rounded the
 * generous way, a return window that outlives its category's exception, a
 * balance that drifts from the entries it is supposed to be the sum of, a
 * period that settles money which has not cleared.
 */

export const SHIPPING_METHOD_KINDS = ['COURIER', 'POST', 'PICKUP'] as const;
export type ShippingMethodKind = (typeof SHIPPING_METHOD_KINDS)[number];

export const SHIPPING_METHOD_KIND_FA: Record<ShippingMethodKind, string> = {
  COURIER: 'پیک',
  POST: 'پست',
  PICKUP: 'تحویل حضوری در فروشگاه',
};

export type ShippingPricingKind = 'FIXED' | 'WEIGHT_BASED';
export type ShippingCoverageKind = 'WHOLE_COUNTRY' | 'PROVINCES';

export interface ShippingMethodTerms {
  readonly kind: ShippingMethodKind;
  readonly coverageKind: ShippingCoverageKind;
  readonly provinceCodes: readonly string[];
  readonly pricingKind: ShippingPricingKind;
  readonly baseFeeToman: bigint;
  readonly perKgToman: bigint | null;
  readonly includedGrams: number | null;
  readonly freeThresholdToman: bigint | null;
  readonly preparationDays: number;
}

/**
 * Whether this method reaches where the parcel is going.
 *
 * Collection from the shop reaches nowhere and everywhere at once: it is not
 * a delivery, so a province does not decide it. A buyer choosing it is
 * choosing to come, which the label says plainly.
 */
export function methodCovers(method: ShippingMethodTerms, provinceCode: string | null): boolean {
  if (method.kind === 'PICKUP') return true;
  if (method.coverageKind === 'WHOLE_COUNTRY') return true;
  if (provinceCode === null) return false;
  return method.provinceCodes.includes(provinceCode);
}

export type ShippingQuoteProblem = 'NOT_COVERED' | 'WEIGHT_UNKNOWN' | 'ABOVE_CEILING';

export interface ShippingQuote {
  readonly toman: bigint;
  readonly waived: boolean;
  readonly chargeableGrams: number;
}

/**
 * What this method charges for this basket.
 *
 * Weight is charged by the started kilogram past whatever the method
 * includes, which is what a courier does; charging a fraction of a kilogram
 * would be a figure no carrier quotes. A line whose weight nobody recorded
 * does not become weightless — the quote refuses and names the reason,
 * because guessing a weight is guessing a price.
 *
 * Collection from the shop is free by construction: there is no delivery to
 * charge for, and a shop that wants a counter fee is describing something
 * else.
 */
export function quoteShipping(input: {
  method: ShippingMethodTerms;
  itemsTotalToman: bigint;
  /** One entry per line: its weight in grams, or null where none is recorded. */
  lineWeightsGrams: readonly (number | null)[];
  provinceCode: string | null;
  ceilingToman?: bigint | null;
}): ShippingQuote | { problem: ShippingQuoteProblem } {
  const { method } = input;
  if (!methodCovers(method, input.provinceCode)) return { problem: 'NOT_COVERED' };
  if (method.kind === 'PICKUP') return { toman: 0n, waived: false, chargeableGrams: 0 };

  if (method.freeThresholdToman !== null && input.itemsTotalToman >= method.freeThresholdToman) {
    return { toman: 0n, waived: true, chargeableGrams: 0 };
  }

  if (method.pricingKind === 'FIXED') {
    const fixed = capped(method.baseFeeToman, input.ceilingToman ?? null);
    return fixed === null ? { problem: 'ABOVE_CEILING' } : { toman: fixed, waived: false, chargeableGrams: 0 };
  }

  if (input.lineWeightsGrams.some((grams) => grams === null)) return { problem: 'WEIGHT_UNKNOWN' };
  const total = input.lineWeightsGrams.reduce<number>((sum, grams) => sum + (grams ?? 0), 0);
  const included = method.includedGrams ?? 0;
  const over = Math.max(total - included, 0);
  // Every started kilogram, the way a courier counts them.
  const kilos = BigInt(Math.ceil(over / 1000));
  const toman = method.baseFeeToman + kilos * (method.perKgToman ?? 0n);
  const within = capped(toman, input.ceilingToman ?? null);
  return within === null
    ? { problem: 'ABOVE_CEILING' }
    : { toman: within, waived: false, chargeableGrams: total };
}

const capped = (toman: bigint, ceiling: bigint | null): bigint | null =>
  ceiling === null || toman <= ceiling ? toman : null;

export const SHIPPING_PROBLEM_FA: Record<ShippingQuoteProblem, string> = {
  NOT_COVERED: 'این روش ارسال به استان مقصد نمی‌رسد.',
  WEIGHT_UNKNOWN: 'وزن یکی از قلم‌های این فروشگاه ثبت نشده و هزینه ارسال وزنی قابل محاسبه نیست.',
  ABOVE_CEILING: 'هزینه این روش ارسال از سقف مجاز پلتفرم بیشتر می‌شود.',
};

/** The moment the shop promised to have the parcel ready by. */
export function preparationDeadline(paidAt: Date, preparationDays: number): Date {
  if (!Number.isInteger(preparationDays) || preparationDays < 0) {
    throw new RangeError('a preparation promise is a whole number of days');
  }
  return new Date(paidAt.getTime() + preparationDays * 86_400_000);
}

// ── returns ────────────────────────────────────────────────────────────────

export const RETURN_RULES = ['STANDARD', 'SEALED_ONLY', 'NOT_RETURNABLE'] as const;
export type ReturnRule = (typeof RETURN_RULES)[number];

export const RETURN_RULE_FA: Record<ReturnRule, string> = {
  STANDARD: 'قابل مرجوع در مهلت عمومی',
  SEALED_ONLY: 'فقط در صورت باز نشدن و استفاده نشدن',
  NOT_RETURNABLE: 'غیرقابل مرجوع',
};

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SHIPPED_BACK',
  'RECEIVED',
  'REFUNDED',
  'DISPUTED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_FA: Record<ReturnStatus, string> = {
  REQUESTED: 'در انتظار بررسی فروشنده',
  APPROVED: 'پذیرفته‌شده — در انتظار ارسال به فروشگاه',
  REJECTED: 'ردشده',
  SHIPPED_BACK: 'در راه بازگشت',
  RECEIVED: 'دریافت‌شده در فروشگاه',
  REFUNDED: 'بازپرداخت‌شده',
  DISPUTED: 'در حال بررسی اختلاف',
};

export const RETURNED_CONDITIONS = ['AS_SOLD', 'OPENED', 'DAMAGED', 'NOT_AS_DESCRIBED', 'MISSING'] as const;
export type ReturnedCondition = (typeof RETURNED_CONDITIONS)[number];

export const RETURNED_CONDITION_FA: Record<ReturnedCondition, string> = {
  AS_SOLD: 'همان‌طور که فروخته شده بود',
  OPENED: 'باز شده',
  DAMAGED: 'آسیب‌دیده',
  NOT_AS_DESCRIBED: 'با آنچه اعلام شده بود نمی‌خواند',
  MISSING: 'نرسید',
};

type ReturnMover = 'BUYER' | 'SELLER' | 'OPERATOR';

const RETURN_TRANSITIONS: Record<ReturnStatus, readonly { to: ReturnStatus; by: readonly ReturnMover[] }[]> = {
  REQUESTED: [
    { to: 'APPROVED', by: ['SELLER', 'OPERATOR'] },
    { to: 'REJECTED', by: ['SELLER', 'OPERATOR'] },
    // A buyer may withdraw by disputing nothing; they simply stop. Arguing
    // about a refusal is the operator's to open once one exists.
    { to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] },
  ],
  APPROVED: [
    { to: 'SHIPPED_BACK', by: ['BUYER'] },
    { to: 'DISPUTED', by: ['BUYER', 'SELLER', 'OPERATOR'] },
  ],
  // A refusal the buyer will not accept is a disagreement, not a closed matter.
  REJECTED: [{ to: 'DISPUTED', by: ['BUYER', 'OPERATOR'] }],
  SHIPPED_BACK: [
    { to: 'RECEIVED', by: ['SELLER', 'OPERATOR'] },
    { to: 'DISPUTED', by: ['BUYER', 'SELLER', 'OPERATOR'] },
  ],
  RECEIVED: [
    // The refund figure is decided here, from what actually came back.
    { to: 'REFUNDED', by: ['SELLER', 'OPERATOR'] },
    { to: 'DISPUTED', by: ['BUYER', 'SELLER', 'OPERATOR'] },
  ],
  REFUNDED: [],
  DISPUTED: [
    { to: 'REFUNDED', by: ['OPERATOR'] },
    { to: 'REJECTED', by: ['OPERATOR'] },
    { to: 'RECEIVED', by: ['OPERATOR'] },
  ],
};

export const returnTransitionAllowed = (from: ReturnStatus, to: ReturnStatus, by: ReturnMover): boolean =>
  RETURN_TRANSITIONS[from].some((t) => t.to === to && t.by.includes(by));

export const returnMovesFor = (from: ReturnStatus, by: ReturnMover): readonly ReturnStatus[] =>
  RETURN_TRANSITIONS[from].filter((t) => t.by.includes(by)).map((t) => t.to);

export const returnIsFinal = (status: ReturnStatus): boolean => RETURN_TRANSITIONS[status].length === 0;

/**
 * When the right to return one line runs out.
 *
 * A category exception may shorten the window and never lengthen it: the
 * platform's promise is a floor the categories cut into, not a figure they
 * negotiate up. A category that cannot be returned at all has no window.
 */
export function returnDeadline(input: {
  deliveredAt: Date;
  platformWindowDays: number;
  rule: ReturnRule;
  categoryWindowDays: number | null;
}): Date | null {
  if (input.rule === 'NOT_RETURNABLE') return null;
  const days =
    input.categoryWindowDays === null
      ? input.platformWindowDays
      : Math.min(input.categoryWindowDays, input.platformWindowDays);
  return new Date(input.deliveredAt.getTime() + days * 86_400_000);
}

export const withinReturnWindow = (deadline: Date | null, now: Date = new Date()): boolean =>
  deadline !== null && now.getTime() <= deadline.getTime();

/**
 * What a return is worth back, given what came back.
 *
 * Goods as sold are refunded in full. Goods opened where the category only
 * allowed unopened ones are not — that is the whole point of the exception,
 * and refunding anyway would make the rule decorative. Damage and a parcel
 * that never arrived are not the buyer's to lose, so they refund in full and
 * whose fault it was is settled as an argument rather than by arithmetic here.
 */
export function refundForCondition(input: {
  lineRefundToman: bigint;
  condition: ReturnedCondition;
  rule: ReturnRule;
}): { toman: bigint; reasonFa: string } {
  if (input.lineRefundToman < 0n) throw new RangeError('a line refund cannot be negative');
  switch (input.condition) {
    case 'AS_SOLD':
      return { toman: input.lineRefundToman, reasonFa: 'کالا همان‌طور که فروخته شده بود برگشت.' };
    case 'DAMAGED':
    case 'NOT_AS_DESCRIBED':
    case 'MISSING':
      return {
        toman: input.lineRefundToman,
        reasonFa: 'کالا سالم به دست خریدار نرسید؛ مبلغ کامل بازگردانده می‌شود.',
      };
    case 'OPENED':
      return input.rule === 'SEALED_ONLY'
        ? { toman: 0n, reasonFa: 'این دسته فقط در صورت باز نشدن قابل مرجوع است.' }
        : { toman: input.lineRefundToman, reasonFa: 'کالا باز شده بود ولی این دسته محدودیت پلمب ندارد.' };
  }
}

// ── the ledger ─────────────────────────────────────────────────────────────

export const LEDGER_BUCKETS = ['PENDING', 'HELD', 'AVAILABLE', 'DEBT'] as const;
export type LedgerBucket = (typeof LEDGER_BUCKETS)[number];

export const LEDGER_BUCKET_FA: Record<LedgerBucket, string> = {
  PENDING: 'در جریان',
  HELD: 'نگه‌داشته‌شده',
  AVAILABLE: 'قابل تسویه',
  DEBT: 'بدهی به همزیست',
};

export const LEDGER_KINDS = [
  'SALE',
  'COMMISSION',
  'REFUND',
  'PROMOTION_CHARGE',
  'PENALTY',
  'ADJUSTMENT',
  'RELEASE',
  'PAYOUT',
  'DEBT_RECOVERY',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_FA: Record<LedgerKind, string> = {
  SALE: 'فروش',
  COMMISSION: 'کارمزد همزیست',
  REFUND: 'بازپرداخت به خریدار',
  PROMOTION_CHARGE: 'هزینه تبلیغ',
  PENALTY: 'جریمه',
  ADJUSTMENT: 'اصلاح دستی',
  RELEASE: 'آزادسازی',
  PAYOUT: 'واریز تسویه',
  DEBT_RECOVERY: 'کسر بدهی',
};

export interface LedgerLine {
  readonly bucket: LedgerBucket;
  readonly kind: LedgerKind;
  readonly amountToman: bigint;
  readonly descriptionFa: string;
  readonly clearsAt?: Date | null;
}

/**
 * Whether these lines merely move money, or bring it in and out.
 *
 * A group that sums to zero moved money between this shop's own balances and
 * nothing appeared from nowhere. A group that does not sum to zero is money
 * entering or leaving, and has to say so rather than being written as if it
 * were a move — which is the difference the database check enforces.
 */
export const linesBalance = (lines: readonly LedgerLine[]): boolean =>
  lines.reduce((sum, line) => sum + line.amountToman, 0n) === 0n;

export function assertLedgerGroup(lines: readonly LedgerLine[], balanced: boolean): void {
  if (lines.length === 0) throw new RangeError('a ledger event writes at least one entry');
  if (lines.some((line) => line.amountToman === 0n)) {
    throw new RangeError('an entry that changes nothing is not an entry');
  }
  if (balanced !== linesBalance(lines)) {
    throw new RangeError('a group marked balanced must sum to zero, and one that sums to zero must say so');
  }
}

export type Balances = Record<LedgerBucket, bigint>;

export const emptyBalances = (): Balances => ({ PENDING: 0n, HELD: 0n, AVAILABLE: 0n, DEBT: 0n });

/** Every balance is the sum of its entries, never a number anybody wrote. */
export function balancesOf(
  entries: readonly { bucket: LedgerBucket; amountToman: bigint }[],
): Balances {
  const balances = emptyBalances();
  for (const entry of entries) balances[entry.bucket] += entry.amountToman;
  return balances;
}

/**
 * What a paid sub-order does to a shop's balances.
 *
 * The buyer's whole payment is the shop's to begin with and the platform's
 * commission comes straight back out of it, both into PENDING, because
 * neither is earned until the goods arrive. Written as one unbalanced group:
 * money entered the shop's world here, and saying it merely moved would be
 * false.
 */
export function saleLines(input: {
  buyerTotalToman: bigint;
  commissionToman: bigint;
  referenceFa: string;
}): readonly LedgerLine[] {
  if (input.buyerTotalToman <= 0n) throw new RangeError('a sale is a positive amount');
  if (input.commissionToman < 0n || input.commissionToman > input.buyerTotalToman) {
    throw new RangeError('the commission is part of the sale, not more than it');
  }
  const lines: LedgerLine[] = [
    {
      bucket: 'PENDING',
      kind: 'SALE',
      amountToman: input.buyerTotalToman,
      descriptionFa: 'فروش ' + input.referenceFa,
    },
  ];
  if (input.commissionToman > 0n) {
    lines.push({
      bucket: 'PENDING',
      kind: 'COMMISSION',
      amountToman: -input.commissionToman,
      descriptionFa: 'کارمزد همزیست برای ' + input.referenceFa,
    });
  }
  return lines;
}

/**
 * Delivery moves the shop's share from pending to held.
 *
 * Held rather than available, because the buyer may still send it back: the
 * return window has to close before this is anybody's to take out.
 */
export function deliveryLines(input: {
  netToman: bigint;
  clearsAt: Date;
  referenceFa: string;
}): readonly LedgerLine[] {
  if (input.netToman <= 0n) throw new RangeError('there is nothing to hold');
  return [
    { bucket: 'PENDING', kind: 'RELEASE', amountToman: -input.netToman, descriptionFa: 'تحویل ' + input.referenceFa },
    {
      bucket: 'HELD',
      kind: 'RELEASE',
      amountToman: input.netToman,
      descriptionFa: 'نگه‌داشت تا پایان مهلت مرجوعی — ' + input.referenceFa,
      clearsAt: input.clearsAt,
    },
  ];
}

/** The window closed and nobody argued: the money becomes settleable. */
export function clearingLines(input: { netToman: bigint; referenceFa: string }): readonly LedgerLine[] {
  if (input.netToman <= 0n) throw new RangeError('there is nothing to clear');
  return [
    { bucket: 'HELD', kind: 'RELEASE', amountToman: -input.netToman, descriptionFa: 'پایان مهلت مرجوعی — ' + input.referenceFa },
    { bucket: 'AVAILABLE', kind: 'RELEASE', amountToman: input.netToman, descriptionFa: 'قابل تسویه — ' + input.referenceFa },
  ];
}

/**
 * Money going back to a buyer, taken from wherever the shop actually has it.
 *
 * Held first, then pending, then available, and whatever is left over becomes
 * a debt rather than a negative balance. A negative balance would be a number
 * that reads like money the shop has; a debt reads like what it is, and the
 * next settlement recovers it before paying anything out.
 */
export function refundLines(input: {
  refundToman: bigint;
  held: bigint;
  pending: bigint;
  available: bigint;
  referenceFa: string;
}): readonly LedgerLine[] {
  if (input.refundToman <= 0n) throw new RangeError('a refund is a positive amount');
  const lines: LedgerLine[] = [];
  let outstanding = input.refundToman;

  for (const [bucket, balance] of [
    ['HELD', input.held],
    ['PENDING', input.pending],
    ['AVAILABLE', input.available],
  ] as const) {
    if (outstanding === 0n) break;
    const usable = balance > 0n ? (balance < outstanding ? balance : outstanding) : 0n;
    if (usable === 0n) continue;
    lines.push({
      bucket,
      kind: 'REFUND',
      amountToman: -usable,
      descriptionFa: 'بازپرداخت ' + input.referenceFa,
    });
    outstanding -= usable;
  }

  if (outstanding > 0n) {
    lines.push({
      bucket: 'DEBT',
      kind: 'REFUND',
      amountToman: outstanding,
      descriptionFa: 'بدهی بابت بازپرداخت ' + input.referenceFa,
    });
  }
  return lines;
}

/** Taking settled money out. Debt is recovered first, from the same balance. */
export function payoutLines(input: {
  availableToman: bigint;
  debtToman: bigint;
  referenceFa: string;
}): { lines: readonly LedgerLine[]; payoutToman: bigint; recoveredToman: bigint } {
  if (input.availableToman <= 0n) throw new RangeError('there is nothing to settle');
  if (input.debtToman < 0n) throw new RangeError('a debt is not negative');
  const recovered = input.debtToman > input.availableToman ? input.availableToman : input.debtToman;
  const payout = input.availableToman - recovered;
  const lines: LedgerLine[] = [];
  if (recovered > 0n) {
    lines.push(
      {
        bucket: 'AVAILABLE',
        kind: 'DEBT_RECOVERY',
        amountToman: -recovered,
        descriptionFa: 'کسر بدهی پیش از تسویه — ' + input.referenceFa,
      },
      {
        bucket: 'DEBT',
        kind: 'DEBT_RECOVERY',
        amountToman: -recovered,
        descriptionFa: 'تسویه بدهی — ' + input.referenceFa,
      },
    );
  }
  if (payout > 0n) {
    lines.push({
      bucket: 'AVAILABLE',
      kind: 'PAYOUT',
      amountToman: -payout,
      descriptionFa: 'واریز تسویه ' + input.referenceFa,
    });
  }
  return { lines, payoutToman: payout, recoveredToman: recovered };
}

// ── settlement periods ─────────────────────────────────────────────────────

export const CADENCES = ['WEEKLY', 'MONTHLY'] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_FA: Record<Cadence, string> = { WEEKLY: 'هفتگی', MONTHLY: 'ماهانه' };

/**
 * When a requested change of cadence starts applying.
 *
 * At the end of the period the shop is already in, never inside it: a shop
 * cannot shorten a period it is halfway through by asking, and cannot
 * lengthen one either.
 */
export function cadenceEffectiveFrom(requestedAt: Date, current: Cadence): Date {
  return periodEnd(requestedAt, current);
}

/** The end of the period this moment falls in, by this cadence. */
export function periodEnd(at: Date, cadence: Cadence): Date {
  if (cadence === 'WEEKLY') {
    const days = 7 - ((at.getUTCDay() + 1) % 7 || 7);
    const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    end.setUTCDate(end.getUTCDate() + days + 1);
    return end;
  }
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

export const cadenceInForce = (input: {
  live: Cadence | null;
  requested: Cadence | null;
  effectiveFrom: Date | null;
  now?: Date;
}): Cadence => {
  const now = input.now ?? new Date();
  if (input.requested !== null && input.effectiveFrom !== null && now.getTime() >= input.effectiveFrom.getTime()) {
    return input.requested;
  }
  return input.live ?? 'WEEKLY';
};

/**
 * Whether a shop may be paid at all.
 *
 * A settleable balance is not enough: the account has to have been checked by
 * a person, the shop has to be trading, and the figure has to clear whatever
 * minimum the platform configured. An unconfigured minimum is not enforced
 * rather than being treated as zero or as infinity.
 */
export type PayoutBlocker =
  | 'NOTHING_AVAILABLE'
  | 'ACCOUNT_UNVERIFIED'
  | 'SELLER_NOT_ACTIVE'
  | 'BELOW_MINIMUM'
  | 'BATCH_ALREADY_OPEN';

export const PAYOUT_BLOCKER_FA: Record<PayoutBlocker, string> = {
  NOTHING_AVAILABLE: 'مبلغ قابل تسویه‌ای وجود ندارد.',
  ACCOUNT_UNVERIFIED: 'مالکیت حساب بانکی این فروشگاه هنوز بررسی و تأیید نشده است.',
  SELLER_NOT_ACTIVE: 'این فروشگاه در حال حاضر فعال نیست.',
  BELOW_MINIMUM: 'مبلغ قابل تسویه از حداقل مقرر کمتر است و به دوره بعد منتقل می‌شود.',
  BATCH_ALREADY_OPEN: 'یک دسته تسویه باز برای این فروشگاه وجود دارد.',
};

export function payoutBlockers(input: {
  availableToman: bigint;
  ibanVerified: boolean;
  sellerActive: boolean;
  minimumToman: bigint | null;
  openBatch: boolean;
}): readonly PayoutBlocker[] {
  const blockers: PayoutBlocker[] = [];
  if (input.availableToman <= 0n) blockers.push('NOTHING_AVAILABLE');
  if (!input.ibanVerified) blockers.push('ACCOUNT_UNVERIFIED');
  if (!input.sellerActive) blockers.push('SELLER_NOT_ACTIVE');
  if (input.minimumToman !== null && input.availableToman > 0n && input.availableToman < input.minimumToman) {
    blockers.push('BELOW_MINIMUM');
  }
  if (input.openBatch) blockers.push('BATCH_ALREADY_OPEN');
  return blockers;
}

export const SETTLEMENT_STATUSES = ['DRAFT', 'READY', 'PAID', 'RECONCILED', 'FAILED', 'CANCELLED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_FA: Record<SettlementStatus, string> = {
  DRAFT: 'پیش‌نویس',
  READY: 'آماده واریز',
  PAID: 'واریزشده — در انتظار مغایرت‌گیری',
  RECONCILED: 'مغایرت‌گیری‌شده',
  FAILED: 'واریز ناموفق',
  CANCELLED: 'لغوشده',
};

const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['PAID', 'FAILED', 'CANCELLED'],
  // A failed transfer goes back to being ready to try again; the money never
  // left, so the batch is not finished with.
  FAILED: ['READY', 'CANCELLED'],
  PAID: ['RECONCILED', 'FAILED'],
  RECONCILED: [],
  CANCELLED: [],
};

export const settlementTransitionAllowed = (from: SettlementStatus, to: SettlementStatus): boolean =>
  SETTLEMENT_TRANSITIONS[from].includes(to);

export const settlementMovesFrom = (from: SettlementStatus): readonly SettlementStatus[] =>
  SETTLEMENT_TRANSITIONS[from];

/** A shop cannot change where money goes while a batch is on its way there. */
export const settlementLocksAccount = (status: SettlementStatus): boolean =>
  status === 'DRAFT' || status === 'READY' || status === 'PAID';

/** A batch reference a person can read down a telephone. */
export function settlementReference(now: Date, random: string): string {
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const tail = random.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 6).padEnd(6, '0');
  return 'HSS' + year + month + '-' + tail;
}

export function returnReference(now: Date, random: string): string {
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const tail = random.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 6).padEnd(6, '0');
  return 'HSR' + year + month + '-' + tail;
}
