/**
 * Who may say what, how prices come down, and points that are not money —
 * PROMPT-012.
 *
 * Rules and arithmetic with no database, because these are the places where
 * being quietly wrong is expensive or unfair: a review from somebody who
 * never bought, two discounts that silently add up below cost, points that
 * can be spent twice, a recommendation nobody can explain.
 */

// ── reviews ────────────────────────────────────────────────────────────────

export type ReviewSubject = 'ANIMAL_DEAL' | 'COMMERCE_SUBORDER';

/**
 * The three things each kind of purchase is judged on.
 *
 * An animal deal and a bag of food have almost nothing in common, so they do
 * not share a rating scale: asking about "packaging" after a puppy is
 * meaningless, and asking about "the handover" after a delivery is worse.
 */
export const REVIEW_DIMENSIONS: Record<ReviewSubject, readonly [string, string, string]> = {
  ANIMAL_DEAL: ['درستی آگهی', 'رفتار فروشنده', 'روند تحویل'],
  COMMERCE_SUBORDER: ['خود کالا', 'بسته‌بندی', 'ارسال'],
};

export type ReviewBlocker =
  | 'NOT_THE_BUYER'
  | 'NOT_FINISHED'
  | 'ALREADY_REVIEWED'
  | 'WINDOW_CLOSED';

export const REVIEW_BLOCKER_FA: Record<ReviewBlocker, string> = {
  NOT_THE_BUYER: 'فقط خریدار همین معامله می‌تواند نظر بگذارد.',
  NOT_FINISHED: 'تا پایان معامله و تحویل کالا، ثبت نظر باز نمی‌شود.',
  ALREADY_REVIEWED: 'برای این خرید یک نظر ثبت شده است.',
  WINDOW_CLOSED: 'مهلت ثبت نظر برای این خرید گذشته است.',
};

/**
 * Whether this person may review this purchase.
 *
 * Every one of these is about the transaction, not about the reviewer's
 * standing: a review exists because somebody bought something and it
 * finished, and there is no other way to get one. Paid placement is not among
 * the inputs and could not be, which is the point.
 */
export function reviewBlockers(input: {
  isBuyer: boolean;
  /** COMPLETED for an animal deal; DELIVERED for a shop sub-order. */
  finished: boolean;
  alreadyReviewed: boolean;
  finishedAt: Date | null;
  windowDays: number | null;
  now?: Date;
}): readonly ReviewBlocker[] {
  const blockers: ReviewBlocker[] = [];
  if (!input.isBuyer) blockers.push('NOT_THE_BUYER');
  if (!input.finished) blockers.push('NOT_FINISHED');
  if (input.alreadyReviewed) blockers.push('ALREADY_REVIEWED');
  // An unconfigured window is not a closed one: without a number, a review
  // stays open rather than being refused by a figure nobody entered.
  if (input.windowDays !== null && input.finishedAt !== null) {
    const closesAt = input.finishedAt.getTime() + input.windowDays * 86_400_000;
    if ((input.now ?? new Date()).getTime() > closesAt) blockers.push('WINDOW_CLOSED');
  }
  return blockers;
}

export interface Aggregate {
  readonly count: number;
  /** Each dimension's mean, to two decimal places, and the overall one. */
  readonly one: number;
  readonly two: number;
  readonly three: number;
  readonly overall: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * A reputation, computed from reviews and from nothing else.
 *
 * There is no argument here for placement, spend or plan, so no amount of
 * money can move the figure. Hidden reviews are excluded by the caller not
 * passing them, which is the only way one ever leaves the average.
 */
export function aggregateOf(
  scores: readonly { one: number; two: number; three: number }[],
): Aggregate {
  if (scores.length === 0) return { count: 0, one: 0, two: 0, three: 0, overall: 0 };
  const mean = (pick: (s: { one: number; two: number; three: number }) => number) =>
    round2(scores.reduce((sum, score) => sum + pick(score), 0) / scores.length);
  const one = mean((s) => s.one);
  const two = mean((s) => s.two);
  const three = mean((s) => s.three);
  return { count: scores.length, one, two, three, overall: round2((one + two + three) / 3) };
}

// ── discounts ──────────────────────────────────────────────────────────────

export const DISCOUNT_KINDS = [
  'SELLER_DISCOUNT',
  'SELLER_CODE',
  'PLATFORM_CODE',
  'CATEGORY_CAMPAIGN',
  'FREE_SHIPPING',
] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const DISCOUNT_KIND_FA: Record<DiscountKind, string> = {
  SELLER_DISCOUNT: 'تخفیف فروشگاه',
  SELLER_CODE: 'کد تخفیف فروشگاه',
  PLATFORM_CODE: 'کد تخفیف همزیست',
  CATEGORY_CAMPAIGN: 'کمپین دسته',
  FREE_SHIPPING: 'ارسال رایگان',
};

/** Whose money a discount comes out of. It is a property of the kind, not a choice. */
export const bornByPlatform = (kind: DiscountKind): boolean =>
  kind === 'PLATFORM_CODE' || kind === 'CATEGORY_CAMPAIGN';

export interface DiscountTerms {
  readonly id: string;
  readonly kind: DiscountKind;
  readonly labelFa: string;
  readonly percentBp: number | null;
  readonly amountToman: bigint | null;
  readonly maxDiscountToman: bigint | null;
  readonly minBasketToman: bigint | null;
  readonly priority: number;
}

export type DiscountRefusal =
  | 'NOT_ACTIVE'
  | 'NOT_STARTED'
  | 'ENDED'
  | 'BASKET_TOO_SMALL'
  | 'TOTAL_USES_SPENT'
  | 'ACCOUNT_USES_SPENT'
  | 'NOT_APPLICABLE'
  | 'STACKING_REFUSED';

export const DISCOUNT_REFUSAL_FA: Record<DiscountRefusal, string> = {
  NOT_ACTIVE: 'این تخفیف در حال حاضر فعال نیست.',
  NOT_STARTED: 'زمان استفاده از این تخفیف هنوز نرسیده است.',
  ENDED: 'مهلت این تخفیف تمام شده است.',
  BASKET_TOO_SMALL: 'مبلغ سبد به حد نصاب این تخفیف نمی‌رسد.',
  TOTAL_USES_SPENT: 'ظرفیت این کد تمام شده است.',
  ACCOUNT_USES_SPENT: 'شما پیش از این از این کد استفاده کرده‌اید.',
  NOT_APPLICABLE: 'این تخفیف به قلم‌های این سبد نمی‌خورد.',
  STACKING_REFUSED: 'این تخفیف با تخفیف دیگری که روی این سبد نشسته جمع نمی‌شود.',
};

/**
 * What one rule takes off a given amount.
 *
 * Truncating, so a fraction of a toman is never given away upward, and capped
 * both by its own ceiling and by the amount itself — a discount larger than
 * the thing it discounts would make a basket owe the buyer money.
 */
export function discountFor(terms: DiscountTerms, baseToman: bigint): bigint {
  if (baseToman <= 0n) return 0n;
  const byPercent =
    terms.percentBp === null ? 0n : (baseToman * BigInt(terms.percentBp)) / 10_000n;
  const flat = terms.amountToman ?? 0n;
  let amount = byPercent > flat ? byPercent : flat;
  if (terms.maxDiscountToman !== null && amount > terms.maxDiscountToman) amount = terms.maxDiscountToman;
  return amount > baseToman ? baseToman : amount;
}

export interface StackingPolicy {
  /** Kinds that may sit on the same basket together. Anything else is alone. */
  readonly combinable: readonly (readonly [DiscountKind, DiscountKind])[];
  /** Applied lowest first, so the order two discounts compose in is decided. */
  readonly order: readonly DiscountKind[];
}

/**
 * With no published policy, nothing stacks.
 *
 * Silence has to mean the cautious thing: two discounts that quietly add up
 * are how a marketplace sells below cost without anybody deciding to.
 */
export const NO_STACKING: StackingPolicy = { combinable: [], order: [...DISCOUNT_KINDS] };

export const mayStack = (policy: StackingPolicy, a: DiscountKind, b: DiscountKind): boolean =>
  a === b
    ? false
    : policy.combinable.some(
        ([left, right]) => (left === a && right === b) || (left === b && right === a),
      );

export interface AppliedDiscount {
  readonly terms: DiscountTerms;
  readonly amountToman: bigint;
  readonly borneByPlatform: boolean;
}

/**
 * Which of these rules actually apply, in what order, and for how much.
 *
 * Each one is computed against what is left after the ones before it, so two
 * percentages never both come off the original figure — that is the quiet way
 * a basket ends up cheaper than anybody agreed to. A rule that the policy
 * will not let sit beside one already applied is refused by name rather than
 * dropped silently.
 */
export function applyDiscounts(input: {
  candidates: readonly DiscountTerms[];
  baseToman: bigint;
  policy: StackingPolicy;
}): { applied: readonly AppliedDiscount[]; refused: readonly { terms: DiscountTerms; reason: DiscountRefusal }[] } {
  const ordered = [...input.candidates].sort((a, b) => {
    const byPriority = a.priority - b.priority;
    if (byPriority !== 0) return byPriority;
    return input.policy.order.indexOf(a.kind) - input.policy.order.indexOf(b.kind);
  });

  const applied: AppliedDiscount[] = [];
  const refused: { terms: DiscountTerms; reason: DiscountRefusal }[] = [];
  let remaining = input.baseToman;

  for (const terms of ordered) {
    if (applied.length > 0 && !applied.every((other) => mayStack(input.policy, other.terms.kind, terms.kind))) {
      refused.push({ terms, reason: 'STACKING_REFUSED' });
      continue;
    }
    if (terms.minBasketToman !== null && input.baseToman < terms.minBasketToman) {
      refused.push({ terms, reason: 'BASKET_TOO_SMALL' });
      continue;
    }
    const amount = discountFor(terms, remaining);
    if (amount <= 0n) {
      refused.push({ terms, reason: 'NOT_APPLICABLE' });
      continue;
    }
    applied.push({ terms, amountToman: amount, borneByPlatform: bornByPlatform(terms.kind) });
    remaining -= amount;
  }
  return { applied, refused };
}

/** Whether a rule is usable at all, before anything is computed from it. */
export function ruleRefusal(input: {
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  totalUses: number | null;
  usedTotal: number;
  usesPerAccount: number | null;
  usedByAccount: number;
  now?: Date;
}): DiscountRefusal | null {
  const now = input.now ?? new Date();
  if (input.status !== 'ACTIVE') return 'NOT_ACTIVE';
  if (input.startsAt !== null && now < input.startsAt) return 'NOT_STARTED';
  if (input.endsAt !== null && now >= input.endsAt) return 'ENDED';
  if (input.totalUses !== null && input.usedTotal >= input.totalUses) return 'TOTAL_USES_SPENT';
  if (input.usesPerAccount !== null && input.usedByAccount >= input.usesPerAccount) return 'ACCOUNT_USES_SPENT';
  return null;
}

// ── loyalty ────────────────────────────────────────────────────────────────

/**
 * What an order earns.
 *
 * Whole points on whole thousands of toman, truncating, so 1,999 toman earns
 * what 1,000 does rather than being rounded up into a point nobody paid for.
 * An unconfigured rate earns nothing at all — it is not a reason to invent a
 * generosity nobody approved.
 */
export function pointsEarned(input: { paidToman: bigint; pointsPer1000: number | null }): number {
  if (input.pointsPer1000 === null || input.pointsPer1000 <= 0) return 0;
  if (input.paidToman <= 0n) return 0;
  return Number((input.paidToman / 1000n) * BigInt(input.pointsPer1000));
}

/**
 * What points are worth when spent.
 *
 * Only ever as a discount on a basket: there is no operation anywhere that
 * turns points into a payout, which is what "no cash-out" has to mean to be
 * true rather than merely stated.
 */
export function redemptionValue(input: {
  points: number;
  pointValueToman: bigint | null;
  basketToman: bigint;
}): { points: number; toman: bigint } {
  if (input.pointValueToman === null || input.pointValueToman <= 0n || input.points <= 0) {
    return { points: 0, toman: 0n };
  }
  const wanted = BigInt(input.points) * input.pointValueToman;
  // Never more than the basket: points do not become change.
  if (wanted <= input.basketToman) return { points: input.points, toman: wanted };
  const affordable = Number(input.basketToman / input.pointValueToman);
  return { points: affordable, toman: BigInt(affordable) * input.pointValueToman };
}

export const LOYALTY_KIND_FA: Record<string, string> = {
  EARN: 'امتیاز خرید',
  REDEEM: 'استفاده در سبد',
  EXPIRE: 'انقضا',
  ADJUST: 'اصلاح',
};

export const loyaltyBalance = (entries: readonly { points: number }[]): number =>
  entries.reduce((sum, entry) => sum + entry.points, 0);

/** When points earned now stop counting. Null means no expiry has been set. */
export const pointsExpireAt = (earnedAt: Date, expiryDays: number | null): Date | null =>
  expiryDays === null || expiryDays <= 0 ? null : new Date(earnedAt.getTime() + expiryDays * 86_400_000);

// ── recommendations ────────────────────────────────────────────────────────

export type RecommendationReason =
  | 'SAME_CATEGORY'
  | 'SAME_SPECIES'
  | 'BOUGHT_BEFORE'
  | 'POPULAR_IN_CATEGORY';

export const RECOMMENDATION_REASON_FA: Record<RecommendationReason, string> = {
  SAME_CATEGORY: 'چون کالایی از همین دسته را دیده‌اید',
  SAME_SPECIES: 'چون برای همان گونه‌ای است که دنبالش بوده‌اید',
  BOUGHT_BEFORE: 'چون پیش از این چیزی شبیه آن خریده‌اید',
  POPULAR_IN_CATEGORY: 'چون در این دسته پرفروش است',
};

export interface Recommendation {
  readonly productId: string;
  readonly reason: RecommendationReason;
  readonly reasonFa: string;
}

/**
 * What to suggest, and why — in that order.
 *
 * Every suggestion carries the rule that produced it, because a
 * recommendation nobody can explain is one nobody can argue with. The inputs
 * are a category, a species and what this person bought: no inference about
 * who they are, what they can afford or anything a profile might imply, and
 * no model that could learn one.
 *
 * With nothing to go on it falls back to what sells in a category, which is
 * a fact about the catalogue rather than about the person.
 */
export function recommend(input: {
  recentCategoryIds: readonly string[];
  recentSpeciesCodes: readonly string[];
  boughtProductIds: readonly string[];
  candidates: readonly { productId: string; categoryId: string; speciesCodes: readonly string[]; sold: number }[];
  limit?: number;
}): readonly Recommendation[] {
  const limit = input.limit ?? 8;
  const seen = new Set(input.boughtProductIds);
  const picked = new Map<string, Recommendation>();

  const take = (productId: string, reason: RecommendationReason) => {
    if (seen.has(productId) || picked.has(productId) || picked.size >= limit) return;
    picked.set(productId, { productId, reason, reasonFa: RECOMMENDATION_REASON_FA[reason] });
  };

  for (const candidate of input.candidates) {
    if (input.recentCategoryIds.includes(candidate.categoryId)) take(candidate.productId, 'SAME_CATEGORY');
  }
  for (const candidate of input.candidates) {
    if (candidate.speciesCodes.some((code) => input.recentSpeciesCodes.includes(code))) {
      take(candidate.productId, 'SAME_SPECIES');
    }
  }
  // Nothing personal to go on: what the catalogue sells, which says nothing
  // about this person at all.
  for (const candidate of [...input.candidates].sort((a, b) => b.sold - a.sold)) {
    take(candidate.productId, 'POPULAR_IN_CATEGORY');
  }
  return [...picked.values()];
}

// ── comparison ─────────────────────────────────────────────────────────────

export type ComparisonRefusal = 'TOO_FEW' | 'TOO_MANY' | 'MIXED_CATEGORIES';

export const COMPARISON_REFUSAL_FA: Record<ComparisonRefusal, string> = {
  TOO_FEW: 'برای مقایسه حداقل دو کالا انتخاب کنید.',
  TOO_MANY: 'حداکثر چهار کالا را می‌توان با هم مقایسه کرد.',
  MIXED_CATEGORIES: 'مقایسه فقط میان کالاهای یک دسته معنا دارد.',
};

export const COMPARISON_LIMIT = 4;

/**
 * Whether these products can usefully be put side by side.
 *
 * Only within one category, because the specifications are what a comparison
 * shows and two categories do not share any: a table of food against collars
 * would be rows of blanks pretending to be a comparison.
 */
export function comparisonRefusal(categoryIds: readonly string[]): ComparisonRefusal | null {
  if (categoryIds.length < 2) return 'TOO_FEW';
  if (categoryIds.length > COMPARISON_LIMIT) return 'TOO_MANY';
  return new Set(categoryIds).size > 1 ? 'MIXED_CATEGORIES' : null;
}

// ── price drops ────────────────────────────────────────────────────────────

/**
 * Whether this is a drop worth telling somebody about.
 *
 * Measured against what they saw when they saved it, not against the highest
 * it has ever been — the second makes a sale out of a price that merely went
 * back to normal.
 */
export function priceDropped(input: {
  savedPriceToman: bigint | null;
  currentPriceToman: bigint;
  minimumDropBp?: number;
}): boolean {
  if (input.savedPriceToman === null || input.savedPriceToman <= 0n) return false;
  if (input.currentPriceToman >= input.savedPriceToman) return false;
  const bp = input.minimumDropBp ?? 0;
  if (bp <= 0) return true;
  const fall = ((input.savedPriceToman - input.currentPriceToman) * 10_000n) / input.savedPriceToman;
  return fall >= BigInt(bp);
}
