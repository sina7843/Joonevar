/**
 * Who may say what, how prices combine, and points that are not money —
 * PROMPT-012.
 *
 * These are the places where being quietly wrong is expensive or unfair: a
 * review from somebody who never bought, two discounts that silently add up
 * below cost, points spent twice, a recommendation nobody can explain.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateOf,
  applyDiscounts,
  bornByPlatform,
  comparisonRefusal,
  discountFor,
  loyaltyBalance,
  mayStack,
  NO_STACKING,
  pointsEarned,
  pointsExpireAt,
  priceDropped,
  recommend,
  redemptionValue,
  reviewBlockers,
  REVIEW_DIMENSIONS,
  ruleRefusal,
  type DiscountTerms,
  type StackingPolicy,
} from '../../src/commerce/trust-model.ts';

const terms = (over: Partial<DiscountTerms> = {}): DiscountTerms => ({
  id: 'r1',
  kind: 'SELLER_DISCOUNT',
  labelFa: 'تخفیف',
  percentBp: 1_000,
  amountToman: null,
  maxDiscountToman: null,
  minBasketToman: null,
  priority: 100,
  ...over,
});

// ── reviews ────────────────────────────────────────────────────────────────

test('a review needs a finished purchase and the buyer who made it', () => {
  const base = {
    isBuyer: true,
    finished: true,
    alreadyReviewed: false,
    finishedAt: new Date('2026-09-01T00:00:00.000Z'),
    windowDays: 30,
    now: new Date('2026-09-10T00:00:00.000Z'),
  };
  assert.deepEqual(reviewBlockers(base), []);

  // Somebody who did not buy it has nothing to report.
  assert.deepEqual(reviewBlockers({ ...base, isBuyer: false }), ['NOT_THE_BUYER']);
  assert.deepEqual(reviewBlockers({ ...base, finished: false }), ['NOT_FINISHED']);
  assert.deepEqual(reviewBlockers({ ...base, alreadyReviewed: true }), ['ALREADY_REVIEWED']);
  assert.deepEqual(
    reviewBlockers({ ...base, now: new Date('2026-10-05T00:00:00.000Z') }),
    ['WINDOW_CLOSED'],
  );
  // An unconfigured window does not close anything: without a number, a
  // review stays open rather than being refused by a figure nobody entered.
  assert.deepEqual(
    reviewBlockers({ ...base, windowDays: null, now: new Date('2030-01-01T00:00:00.000Z') }),
    [],
  );
});

test('an animal deal and a bag of food are not judged on the same three things', () => {
  assert.deepEqual(REVIEW_DIMENSIONS.ANIMAL_DEAL, ['درستی آگهی', 'رفتار فروشنده', 'روند تحویل']);
  assert.deepEqual(REVIEW_DIMENSIONS.COMMERCE_SUBORDER, ['خود کالا', 'بسته‌بندی', 'ارسال']);
  // Asking about packaging after a puppy would be meaningless, and asking
  // about a handover after a delivery would be worse.
  assert.notDeepEqual(REVIEW_DIMENSIONS.ANIMAL_DEAL, REVIEW_DIMENSIONS.COMMERCE_SUBORDER);
});

test('a reputation is the mean of its reviews and has no other input', () => {
  assert.deepEqual(aggregateOf([]), { count: 0, one: 0, two: 0, three: 0, overall: 0 });

  const aggregate = aggregateOf([
    { one: 5, two: 4, three: 3 },
    { one: 4, two: 4, three: 4 },
  ]);
  assert.equal(aggregate.count, 2);
  assert.equal(aggregate.one, 4.5);
  assert.equal(aggregate.two, 4);
  assert.equal(aggregate.three, 3.5);
  assert.equal(aggregate.overall, 4);

  // The function takes scores and nothing else. There is no argument here
  // through which a promotion, a plan or a spend could reach the figure.
  assert.equal(aggregateOf.length, 1);
});

// ── discounts ──────────────────────────────────────────────────────────────

test('who pays for a discount is a property of its kind', () => {
  assert.equal(bornByPlatform('PLATFORM_CODE'), true);
  assert.equal(bornByPlatform('CATEGORY_CAMPAIGN'), true);
  assert.equal(bornByPlatform('SELLER_DISCOUNT'), false);
  assert.equal(bornByPlatform('SELLER_CODE'), false);
  assert.equal(bornByPlatform('FREE_SHIPPING'), false);
});

test('a discount truncates, is capped by its ceiling, and never exceeds what it discounts', () => {
  // 10% of 1,000,001 is 100,000.1 — the buyer gets 100,000, not 100,001.
  assert.equal(discountFor(terms(), 1_000_001n), 100_000n);
  // A flat amount and a percentage: the larger of the two, not both.
  assert.equal(discountFor(terms({ amountToman: 300_000n }), 1_000_000n), 300_000n);
  assert.equal(discountFor(terms({ maxDiscountToman: 50_000n }), 1_000_000n), 50_000n);
  // A discount larger than the basket would make it owe the buyer money.
  assert.equal(discountFor(terms({ amountToman: 900_000n }), 100_000n), 100_000n);
  assert.equal(discountFor(terms(), 0n), 0n);
});

test('with no published policy, nothing stacks', () => {
  assert.equal(mayStack(NO_STACKING, 'SELLER_CODE', 'PLATFORM_CODE'), false);
  // Not even with itself, which is what stops one rule applying twice.
  assert.equal(mayStack(NO_STACKING, 'SELLER_CODE', 'SELLER_CODE'), false);

  const policy: StackingPolicy = {
    combinable: [['SELLER_DISCOUNT', 'PLATFORM_CODE']],
    order: ['SELLER_DISCOUNT', 'PLATFORM_CODE', 'SELLER_CODE', 'CATEGORY_CAMPAIGN', 'FREE_SHIPPING'],
  };
  assert.equal(mayStack(policy, 'SELLER_DISCOUNT', 'PLATFORM_CODE'), true);
  // Order does not matter to the pair.
  assert.equal(mayStack(policy, 'PLATFORM_CODE', 'SELLER_DISCOUNT'), true);
  assert.equal(mayStack(policy, 'SELLER_CODE', 'PLATFORM_CODE'), false);
});

test('two discounts compose against what is left, never both against the original', () => {
  const policy: StackingPolicy = {
    combinable: [['SELLER_DISCOUNT', 'PLATFORM_CODE']],
    order: ['SELLER_DISCOUNT', 'PLATFORM_CODE', 'SELLER_CODE', 'CATEGORY_CAMPAIGN', 'FREE_SHIPPING'],
  };
  const outcome = applyDiscounts({
    candidates: [
      terms({ id: 'a', kind: 'SELLER_DISCOUNT', percentBp: 1_000, priority: 10 }),
      terms({ id: 'b', kind: 'PLATFORM_CODE', percentBp: 1_000, priority: 20 }),
    ],
    baseToman: 1_000_000n,
    policy,
  });
  assert.equal(outcome.applied.length, 2);
  // 100,000 then 90,000 — not 200,000, which is the quiet way a basket ends
  // up cheaper than anybody agreed to.
  assert.equal(outcome.applied[0]!.amountToman, 100_000n);
  assert.equal(outcome.applied[1]!.amountToman, 90_000n);
  assert.equal(outcome.applied[1]!.borneByPlatform, true);
});

test('a discount the policy will not let sit beside another is refused by name', () => {
  const outcome = applyDiscounts({
    candidates: [
      terms({ id: 'a', kind: 'SELLER_DISCOUNT', priority: 10 }),
      terms({ id: 'b', kind: 'PLATFORM_CODE', priority: 20 }),
    ],
    baseToman: 1_000_000n,
    policy: NO_STACKING,
  });
  assert.equal(outcome.applied.length, 1);
  assert.equal(outcome.refused.length, 1);
  assert.equal(outcome.refused[0]!.reason, 'STACKING_REFUSED');

  // A basket below the minimum is refused for that reason, not silently.
  const small = applyDiscounts({
    candidates: [terms({ minBasketToman: 500_000n })],
    baseToman: 100_000n,
    policy: NO_STACKING,
  });
  assert.deepEqual(small.applied, []);
  assert.equal(small.refused[0]!.reason, 'BASKET_TOO_SMALL');
});

test('a rule says why it cannot be used, rather than merely that it cannot', () => {
  const base = {
    status: 'ACTIVE',
    startsAt: null,
    endsAt: null,
    totalUses: null,
    usedTotal: 0,
    usesPerAccount: null,
    usedByAccount: 0,
    now: new Date('2026-09-25T00:00:00.000Z'),
  };
  assert.equal(ruleRefusal(base), null);
  assert.equal(ruleRefusal({ ...base, status: 'PAUSED' }), 'NOT_ACTIVE');
  assert.equal(ruleRefusal({ ...base, startsAt: new Date('2026-10-01T00:00:00.000Z') }), 'NOT_STARTED');
  assert.equal(ruleRefusal({ ...base, endsAt: new Date('2026-09-01T00:00:00.000Z') }), 'ENDED');
  assert.equal(ruleRefusal({ ...base, totalUses: 5, usedTotal: 5 }), 'TOTAL_USES_SPENT');
  assert.equal(ruleRefusal({ ...base, usesPerAccount: 1, usedByAccount: 1 }), 'ACCOUNT_USES_SPENT');
});

// ── loyalty ────────────────────────────────────────────────────────────────

test('points are earned on whole thousands, truncating', () => {
  assert.equal(pointsEarned({ paidToman: 1_999n, pointsPer1000: 1 }), 1);
  assert.equal(pointsEarned({ paidToman: 12_500n, pointsPer1000: 2 }), 24);
  // An unconfigured rate earns nothing: it is not a reason to invent a
  // generosity nobody approved.
  assert.equal(pointsEarned({ paidToman: 1_000_000n, pointsPer1000: null }), 0);
  assert.equal(pointsEarned({ paidToman: 0n, pointsPer1000: 5 }), 0);
});

test('points are worth something only when somebody says what, and never become change', () => {
  assert.deepEqual(
    redemptionValue({ points: 100, pointValueToman: null, basketToman: 1_000_000n }),
    { points: 0, toman: 0n },
  );
  assert.deepEqual(
    redemptionValue({ points: 100, pointValueToman: 500n, basketToman: 1_000_000n }),
    { points: 100, toman: 50_000n },
  );
  // More points than the basket can absorb: only as many as it can, because
  // points do not become change.
  assert.deepEqual(
    redemptionValue({ points: 100, pointValueToman: 500n, basketToman: 30_000n }),
    { points: 60, toman: 30_000n },
  );
});

test('a balance is the sum of its entries, and expiry needs a configured period', () => {
  assert.equal(loyaltyBalance([{ points: 100 }, { points: -30 }, { points: -10 }]), 60);
  const earnedAt = new Date('2026-09-25T00:00:00.000Z');
  assert.equal(pointsExpireAt(earnedAt, 30)!.toISOString(), '2026-10-25T00:00:00.000Z');
  assert.equal(pointsExpireAt(earnedAt, null), null);
  assert.equal(pointsExpireAt(earnedAt, 0), null);
});

// ── recommendations and comparison ─────────────────────────────────────────

test('every suggestion carries the rule that produced it', () => {
  const candidates = [
    { productId: 'p1', categoryId: 'c1', speciesCodes: ['DOG'], sold: 2 },
    { productId: 'p2', categoryId: 'c2', speciesCodes: ['CAT'], sold: 9 },
    { productId: 'p3', categoryId: 'c3', speciesCodes: ['DOG'], sold: 1 },
  ];
  const picked = recommend({
    recentCategoryIds: ['c1'],
    recentSpeciesCodes: ['DOG'],
    boughtProductIds: [],
    candidates,
  });
  assert.equal(picked[0]!.productId, 'p1');
  assert.equal(picked[0]!.reason, 'SAME_CATEGORY');
  // Every one of them explains itself; none is unexplained.
  assert.ok(picked.every((entry) => entry.reasonFa.length > 0));
  // Something already bought is not suggested back.
  const without = recommend({
    recentCategoryIds: ['c1'],
    recentSpeciesCodes: [],
    boughtProductIds: ['p1'],
    candidates,
  });
  assert.ok(!without.some((entry) => entry.productId === 'p1'));
});

test('with nothing personal to go on, the fallback is a fact about the catalogue', () => {
  const picked = recommend({
    recentCategoryIds: [],
    recentSpeciesCodes: [],
    boughtProductIds: [],
    candidates: [
      { productId: 'p1', categoryId: 'c1', speciesCodes: [], sold: 2 },
      { productId: 'p2', categoryId: 'c2', speciesCodes: [], sold: 9 },
    ],
  });
  // Best-selling first, and the reason says exactly that — nothing about the
  // person, because nothing about them was used.
  assert.equal(picked[0]!.productId, 'p2');
  assert.equal(picked[0]!.reason, 'POPULAR_IN_CATEGORY');
});

test('a comparison is only meaningful inside one category', () => {
  assert.equal(comparisonRefusal(['c1', 'c1']), null);
  assert.equal(comparisonRefusal(['c1']), 'TOO_FEW');
  assert.equal(comparisonRefusal(['c1', 'c1', 'c1', 'c1', 'c1']), 'TOO_MANY');
  // A table of food against collars would be rows of blanks pretending to be
  // a comparison.
  assert.equal(comparisonRefusal(['c1', 'c2']), 'MIXED_CATEGORIES');
});

test('a drop is measured against what this person saw, not against a peak', () => {
  assert.equal(priceDropped({ savedPriceToman: 500_000n, currentPriceToman: 450_000n }), true);
  assert.equal(priceDropped({ savedPriceToman: 500_000n, currentPriceToman: 500_000n }), false);
  assert.equal(priceDropped({ savedPriceToman: null, currentPriceToman: 1n }), false);

  // A minimum keeps a one-toman wobble from becoming a notification.
  assert.equal(
    priceDropped({ savedPriceToman: 500_000n, currentPriceToman: 499_999n, minimumDropBp: 500 }),
    false,
  );
  assert.equal(
    priceDropped({ savedPriceToman: 500_000n, currentPriceToman: 475_000n, minimumDropBp: 500 }),
    true,
  );
});
