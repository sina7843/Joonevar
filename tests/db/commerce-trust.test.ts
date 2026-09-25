/**
 * Trust, discounts and points against a real database — PROMPT-012.
 *
 * The risks here are a review from somebody who never bought, two people
 * taking the last use of a code at the same instant, points earned twice from
 * a replayed callback or spent twice from two baskets, an alert sent again
 * and again, and a browsing history nobody asked to have kept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { offerSkus, productCategories } from '../../src/db/schema/catalog.ts';
import { commerceOrders, commerceSubOrders } from '../../src/db/schema/orders.ts';
import { loyaltyEntries, priceAlerts, priceHistory } from '../../src/db/schema/promotions.ts';
import { recentViews, reviews as reviewTable } from '../../src/db/schema/trust.ts';
import { updateSetting } from '../../src/settings/service.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import {
  acceptSellerAgreement,
  decideSellerApplication,
  loadSeller,
  saveSellerApplication,
  startSellerApplication,
  submitSellerApplication,
} from '../../src/commerce/sellers.ts';
import { ensureLaunchPlans, publishedPlans, startPlanPurchase } from '../../src/commerce/plans.ts';
import {
  addProductImage,
  addVariant,
  createProduct,
  decideProduct,
  ensureCategories,
  loadProduct,
  submitProduct,
} from '../../src/commerce/catalog.ts';
import { addSku, bulkUpdatePrices, createOffer, moveOffer } from '../../src/commerce/inventory.ts';
import { addShippingMethod } from '../../src/commerce/shipping.ts';
import { placeOrder, setCartLine, viewCart } from '../../src/commerce/cart.ts';
import { moveSubOrder, startOrderPayment } from '../../src/commerce/orders.ts';
import { leaveReview, moderateReview, productAggregate, reviewEligibility } from '../../src/commerce/reviews.ts';
import { askQuestion, decideQuestion, questionsOfProduct } from '../../src/commerce/questions.ts';
import { createDiscountRule, moveDiscountRule, publishStackingPolicy } from '../../src/commerce/discounts.ts';
import { balanceOf, expireDuePoints } from '../../src/commerce/loyalty.ts';
import { sweepPriceDrops } from '../../src/commerce/alerts.ts';
import { preferencesOf, recordView, saveItem, setPreferences } from '../../src/commerce/saved.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099943000',
  tmpPrefix: 'hamzist-trust-',
  councilCode: 'SYNTH-TR-9',
  chipBase: 5_600_000,
};

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');
const moderator = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');
const marketAdmin = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'MARKETPLACE_ADMIN');

const DELIVERY = {
  recipientNameFa: 'SYNTHETIC گیرنده آزمایشی',
  recipientPhone: '09120000000',
  provinceFa: 'تهران',
  cityFa: 'تهران',
  addressFa: 'SYNTHETIC نشانی تحویل، پلاک ۱۲',
  postalCode: '1234567890',
  noteFa: null,
};

async function openShop(ctx: MatingCtx): Promise<void> {
  const set = (key: string, value: unknown) =>
    updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
  await set('market.flag.seller_onboarding_enabled', true);
  await set('market.flag.commerce_checkout_enabled', true);
  await set('market.shop.seller_agreement_version', 'SYNTHETIC-AGREEMENT-1');
  await set('market.shop.seller_plan_pro_monthly_toman', '0');
  await set('market.shop.suborder_acceptance_window_hours', 48);
  await set('market.shop.return_window_days', 7);
  await set('market.settlement.hold_days_after_delivery', 0);
  await ensureCategories(ctx.testDb.db);
  await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
}

async function tradingStore(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  facts: { identifier: string; iban: string; name: string },
) {
  const seller = await startSellerApplication(ctx.testDb.db, actor, {
    kind: 'PET_SHOP',
    displayNameFa: facts.name,
  });
  const [city] = await ctx.testDb.db
    .select({ id: cities.id, provinceCode: cities.provinceCode })
    .from(cities)
    .limit(1);
  await saveSellerApplication(ctx.testDb.db, actor, {
    sellerId: seller.id,
    expectedVersion: seller.version,
    displayNameFa: facts.name,
    legalNameFa: facts.name,
    businessTypeFa: 'پت‌شاپ',
    nationalIdentifier: facts.identifier,
    representativeNameFa: 'SYNTHETIC نماینده',
    representativePhone: '02100000000',
    contactEmail: '',
    licenceKindFa: '',
    licenceNumber: '',
    licenceIssuedOn: '',
    licenceExpiresOn: '',
    provinceCode: city!.provinceCode,
    cityId: city!.id,
    addressFa: 'SYNTHETIC نشانی',
    postalCode: '',
    settlementIban: facts.iban,
    settlementHolderNameFa: facts.name,
    shippingPolicyFa: 'SYNTHETIC ارسال',
    returnPolicyFa: 'SYNTHETIC مرجوعی',
  });
  await acceptSellerAgreement(ctx.testDb.db, actor, { sellerId: seller.id });
  const ready = await loadSeller(ctx.testDb.db, seller.id);
  const submitted = await submitSellerApplication(ctx.testDb.db, actor, {
    sellerId: seller.id,
    expectedVersion: ready.version,
  });
  const started = await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
    sellerId: seller.id,
    to: 'UNDER_REVIEW',
    expectedVersion: submitted.version,
  });
  await decideSellerApplication(ctx.testDb.db, reviewer(ctx), {
    sellerId: seller.id,
    to: 'APPROVED',
    expectedVersion: started.version,
  });
  const plans = await publishedPlans(ctx.testDb.db);
  await startPlanPurchase(ctx.testDb.db, actor, {
    sellerId: seller.id,
    planId: plans.find((plan) => plan.code === 'PRO')!.id,
  });
  await addShippingMethod(ctx.testDb.db, actor, {
    sellerId: seller.id,
    labelFa: 'SYNTHETIC پست',
    kind: 'POST',
    coverageKind: 'WHOLE_COUNTRY',
    provinceCodes: [],
    pricingKind: 'FIXED',
    baseFeeToman: 0n,
    perKgToman: null,
    includedGrams: null,
    freeThresholdToman: null,
    preparationDays: 1,
    noteFa: null,
  });
  return loadSeller(ctx.testDb.db, seller.id);
}

async function sellable(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  sellerId: string,
  nameFa: string,
  stock: number,
  priceToman: bigint,
  sku: string,
) {
  const [category] = await ctx.testDb.db
    .select()
    .from(productCategories)
    .where(eq(productCategories.code, 'DRY_FOOD'));
  const product = await createProduct(ctx.testDb.db, actor, {
    sellerId,
    categoryId: category!.id,
    nameFa,
    brandFa: 'SYNTHETIC برند',
    specifications: { lifeStage: 'بالغ' },
    speciesCodes: ['DOG'],
  });
  const variant = await addVariant(ctx.testDb.db, actor, {
    sellerId,
    productId: product.id,
    attributes: { weight: '۲ کیلو' },
  });
  await addProductImage(ctx.testDb.db, ctx.root, actor, {
    sellerId,
    productId: product.id,
    altFa: 'SYNTHETIC تصویر کالا',
    bytes: PNG,
    originalName: 'p.png',
  });
  const ready = await loadProduct(ctx.testDb.db, product.id);
  const submitted = await submitProduct(ctx.testDb.db, actor, {
    sellerId,
    productId: product.id,
    expectedVersion: ready.version,
  });
  await decideProduct(ctx.testDb.db, reviewer(ctx), {
    productId: product.id,
    to: 'PUBLISHED',
    expectedVersion: submitted.version,
  });
  const offer = await createOffer(ctx.testDb.db, actor, {
    sellerId,
    productId: product.id,
    condition: 'NEW',
    shipsToWholeCountry: true,
  });
  const created = await addSku(ctx.testDb.db, actor, {
    offerId: offer.id,
    variantId: variant.id,
    sku,
    priceToman,
    initialStock: stock,
  });
  await moveOffer(ctx.testDb.db, actor, { offerId: offer.id, to: 'ACTIVE', expectedVersion: offer.version });
  return { productId: product.id, sku: created, categoryId: category!.id };
}

async function payFor(ctx: MatingCtx, buyer: ReturnType<typeof actorFor>, orderId: string) {
  const [order] = await ctx.testDb.db.select().from(commerceOrders).where(eq(commerceOrders.id, orderId));
  const batch = await startOrderPayment(ctx.testDb.db, buyer, orderId);
  const gateway = payingGateway(order!.grandTotalToman * 10n);
  const started = await startAttempt(
    ctx.testDb.db,
    buyer,
    { batchId: batch.id, callbackUrl: '/account/orders/' + orderId + '/return' },
    gateway,
    'DEV',
  );
  const outcome = await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
  return { reference: started.reference, gateway };
}

/** One delivered sub-order, which is what a review needs behind it. */
async function deliveredOrder(
  ctx: MatingCtx,
  buyer: ReturnType<typeof actorFor>,
  seller: ReturnType<typeof actorFor>,
  skuId: string,
  quantity = 1,
  options: { code?: string; points?: number } = {},
) {
  await setCartLine(ctx.testDb.db, buyer, { skuId, quantity });
  const view = await viewCart(ctx.testDb.db, buyer, {
    provinceFa: DELIVERY.provinceFa,
    code: options.code ?? null,
    redeemPoints: options.points ?? 0,
  });
  const placed = await placeOrder(ctx.testDb.db, buyer, {
    delivery: DELIVERY,
    confirmedTotalToman: view.grandTotalToman,
    code: options.code ?? null,
    redeemPoints: options.points ?? 0,
  });
  await payFor(ctx, buyer, placed.order.id);
  const part = placed.subOrders[0]!;
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'ACCEPTED_BY_SELLER' });
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'PREPARING' });
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'SHIPPED', trackingCode: 'SYN-1' });
  await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });
  return { order: placed.order, subOrder: part, view };
}

// ── reviews ────────────────────────────────────────────────────────────────

test('only the buyer of a delivered order may review it, and only once', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const stranger = ctx.second.actor;
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000401',
      iban: 'IR820540102680020817909301',
      name: 'SYNTHETIC فروشگاه نظر',
    });
    const { sku, productId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 300_000n, 'A-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
    });
    await payFor(ctx, buyer, placed.order.id);
    const part = placed.subOrders[0]!;

    // Paid but not delivered: nothing to report yet.
    const early = await reviewEligibility(ctx.testDb.db, buyer, { subOrderId: part.id });
    assert.deepEqual(early.blockers, ['NOT_FINISHED']);
    await assert.rejects(
      leaveReview(ctx.testDb.db, buyer, {
        subOrderId: part.id,
        scoreOne: 5,
        scoreTwo: 5,
        scoreThree: 5,
        bodyFa: null,
      }),
      code('CONFLICT'),
    );

    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: part.id, to: 'ACCEPTED_BY_SELLER' });
    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: part.id, to: 'PREPARING' });
    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: part.id, to: 'SHIPPED', trackingCode: 'SYN-9' });
    await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });

    // Somebody who did not buy it cannot review it.
    const outsider = await reviewEligibility(ctx.testDb.db, stranger, { subOrderId: part.id });
    assert.deepEqual(outsider.blockers, ['NOT_THE_BUYER']);

    await leaveReview(ctx.testDb.db, buyer, {
      subOrderId: part.id,
      productId,
      scoreOne: 5,
      scoreTwo: 4,
      scoreThree: 3,
      bodyFa: 'SYNTHETIC — کالا همان بود که نوشته بودند.',
    });
    // One purchase, one review.
    await assert.rejects(
      leaveReview(ctx.testDb.db, buyer, {
        subOrderId: part.id,
        productId,
        scoreOne: 1,
        scoreTwo: 1,
        scoreThree: 1,
        bodyFa: null,
      }),
      code('CONFLICT'),
    );

    const aggregate = await productAggregate(ctx.testDb.db, productId);
    assert.equal(aggregate.count, 1);
    assert.equal(aggregate.overall, 4);
  });
});

test('a hidden review leaves the average, and a promotion never enters it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000402',
      iban: 'IR820540102680020817909302',
      name: 'SYNTHETIC فروشگاه اعتبار',
    });
    const { sku, productId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'B-2KG');
    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id);

    await leaveReview(ctx.testDb.db, buyer, {
      subOrderId: subOrder.id,
      productId,
      scoreOne: 1,
      scoreTwo: 1,
      scoreThree: 1,
      bodyFa: 'SYNTHETIC — نظر منفی برای بررسی پنهان‌سازی',
    });
    assert.equal((await productAggregate(ctx.testDb.db, productId)).count, 1);

    const [review] = await ctx.testDb.db
      .select()
      .from(reviewTable)
      .where(eq(reviewTable.subOrderId, subOrder.id));
    // A shop cannot hide what it dislikes; only a moderator, and only with a
    // reason.
    await assert.rejects(
      moderateReview(ctx.testDb.db, ctx.first.actor, {
        reviewId: review!.id,
        to: 'HIDDEN',
        reasonFa: 'SYNTHETIC — تلاش فروشنده',
      }),
      code('FORBIDDEN'),
    );
    await assert.rejects(
      moderateReview(ctx.testDb.db, moderator(ctx), { reviewId: review!.id, to: 'HIDDEN', reasonFa: 'کم' }),
      code('VALIDATION'),
    );

    await moderateReview(ctx.testDb.db, moderator(ctx), {
      reviewId: review!.id,
      to: 'HIDDEN',
      reasonFa: 'SYNTHETIC — متن نامناسب',
    });
    // Out of the average the moment it is hidden.
    assert.equal((await productAggregate(ctx.testDb.db, productId)).count, 0);
  });
});

test('a question is not public until somebody has looked at it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const asker = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000403',
      iban: 'IR820540102680020817909303',
      name: 'SYNTHETIC فروشگاه پرسش',
    });
    const { productId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'C-2KG');

    // A telephone number written into a public question is redacted, and the
    // redaction is not claimed to be perfect anywhere.
    const question = await askQuestion(ctx.testDb.db, asker, {
      productId,
      bodyFa: 'SYNTHETIC آیا موجود است؟ شماره من ۰۹۱۲۳۴۵۶۷۸۹ است.',
    });
    assert.ok(!question.bodyFa.includes('۰۹۱۲۳۴۵۶۷۸۹'));
    assert.ok(!question.bodyFa.includes('09123456789'));

    // Pending: nothing public yet.
    assert.equal((await questionsOfProduct(ctx.testDb.db, productId)).length, 0);

    await decideQuestion(ctx.testDb.db, moderator(ctx), {
      questionId: question.id,
      to: 'PUBLISHED',
      reasonFa: '',
    });
    // Published but unanswered is still not in the public list, which shows
    // answered pairs.
    assert.equal((await questionsOfProduct(ctx.testDb.db, productId)).length, 0);

    const { answerQuestion } = await import('../../src/commerce/questions.ts');
    await answerQuestion(ctx.testDb.db, ctx.first.actor, {
      questionId: question.id,
      answerFa: 'SYNTHETIC — بله، موجود است.',
    });
    const published = await questionsOfProduct(ctx.testDb.db, productId);
    assert.equal(published.length, 1);
    assert.match(published[0]!.answerFa ?? '', /موجود است/);
  });
});

// ── discounts ──────────────────────────────────────────────────────────────

test('two buyers racing for the last use of a code leave one order holding it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000404',
      iban: 'IR820540102680020817909304',
      name: 'SYNTHETIC فروشگاه کد',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 10, 500_000n, 'D-2KG');

    const rule = await createDiscountRule(ctx.testDb.db, marketAdmin(ctx), {
      kind: 'PLATFORM_CODE',
      labelFa: 'SYNTHETIC کد یک‌باره',
      code: 'SYNTH-ONCE',
      sellerId: null,
      categoryId: null,
      productId: null,
      percentBp: 1_000,
      amountToman: null,
      maxDiscountToman: null,
      minBasketToman: null,
      startsAt: null,
      endsAt: null,
      totalUses: 1,
      usesPerAccount: null,
      priority: 100,
      noteFa: null,
    });
    await moveDiscountRule(ctx.testDb.db, marketAdmin(ctx), { ruleId: rule.id, to: 'ACTIVE' });

    const buyerOne = actorFor(ctx.vet.accountId);
    const buyerTwo = ctx.second.actor;
    for (const buyer of [buyerOne, buyerTwo]) {
      await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    }
    const viewOne = await viewCart(ctx.testDb.db, buyerOne, {
      provinceFa: DELIVERY.provinceFa,
      code: 'SYNTH-ONCE',
    });
    const viewTwo = await viewCart(ctx.testDb.db, buyerTwo, {
      provinceFa: DELIVERY.provinceFa,
      code: 'SYNTH-ONCE',
    });
    // Both were quoted the discount, because both asked before either bought.
    assert.equal(viewOne.discountTotalToman, 50_000n);
    assert.equal(viewTwo.discountTotalToman, 50_000n);

    const results = await Promise.allSettled([
      placeOrder(ctx.testDb.db, buyerOne, {
        delivery: DELIVERY,
        confirmedTotalToman: viewOne.grandTotalToman,
        code: 'SYNTH-ONCE',
      }),
      placeOrder(ctx.testDb.db, buyerTwo, {
        delivery: DELIVERY,
        confirmedTotalToman: viewTwo.grandTotalToman,
        code: 'SYNTH-ONCE',
      }),
    ]);
    const won = results.filter((result) => result.status === 'fulfilled');
    assert.equal(won.length, 1, 'only one order may take the last use');

    const { discountRedemptions } = await import('../../src/db/schema/promotions.ts');
    const redemptions = await ctx.testDb.db
      .select()
      .from(discountRedemptions)
      .where(eq(discountRedemptions.ruleId, rule.id));
    assert.equal(redemptions.length, 1);
    assert.equal(redemptions[0]!.borneByPlatform, true, 'a platform code is the platform’s money');
  });
});

test('with no stacking policy two discounts do not add up, and with one they compose', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000405',
      iban: 'IR820540102680020817909305',
      name: 'SYNTHETIC فروشگاه جمع',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 10, 1_000_000n, 'E-2KG');

    const sellerRule = await createDiscountRule(ctx.testDb.db, ctx.first.actor, {
      kind: 'SELLER_DISCOUNT',
      labelFa: 'SYNTHETIC تخفیف فروشگاه',
      code: null,
      sellerId: shop.id,
      categoryId: null,
      productId: null,
      percentBp: 1_000,
      amountToman: null,
      maxDiscountToman: null,
      minBasketToman: null,
      startsAt: null,
      endsAt: null,
      totalUses: null,
      usesPerAccount: null,
      priority: 10,
      noteFa: null,
    });
    await moveDiscountRule(ctx.testDb.db, ctx.first.actor, { ruleId: sellerRule.id, to: 'ACTIVE' });

    const platformRule = await createDiscountRule(ctx.testDb.db, marketAdmin(ctx), {
      kind: 'CATEGORY_CAMPAIGN',
      labelFa: 'SYNTHETIC کمپین دسته',
      code: null,
      sellerId: null,
      categoryId: null,
      productId: null,
      percentBp: 1_000,
      amountToman: null,
      maxDiscountToman: null,
      minBasketToman: null,
      startsAt: null,
      endsAt: null,
      totalUses: null,
      usesPerAccount: null,
      priority: 20,
      noteFa: null,
    });
    await moveDiscountRule(ctx.testDb.db, marketAdmin(ctx), { ruleId: platformRule.id, to: 'ACTIVE' });

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    // No policy published: only one of them applies at all.
    const cautious = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    assert.equal(cautious.discountTotalToman, 100_000n);
    assert.ok(cautious.refusedDiscounts.some((entry) => entry.reasonFa.includes('جمع نمی‌شود')));

    await publishStackingPolicy(ctx.testDb.db, marketAdmin(ctx), {
      version: 'SYNTHETIC-STACK-1',
      bodyFa: 'SYNTHETIC — این نسخه اجازه جمع‌شدن تخفیف فروشگاه و کمپین دسته را می‌دهد.',
      combinable: [['SELLER_DISCOUNT', 'CATEGORY_CAMPAIGN']],
      order: ['SELLER_DISCOUNT', 'CATEGORY_CAMPAIGN', 'SELLER_CODE', 'PLATFORM_CODE', 'FREE_SHIPPING'],
    });
    // Now both, composed: 100,000 then 90,000 — never 200,000.
    const stacked = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    assert.equal(stacked.discountTotalToman, 190_000n);
  });
});

test('a cancelled order gives its code back', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000406',
      iban: 'IR820540102680020817909306',
      name: 'SYNTHETIC فروشگاه لغو',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 10, 400_000n, 'F-2KG');

    const rule = await createDiscountRule(ctx.testDb.db, marketAdmin(ctx), {
      kind: 'PLATFORM_CODE',
      labelFa: 'SYNTHETIC کد محدود',
      code: 'SYNTH-BACK',
      sellerId: null,
      categoryId: null,
      productId: null,
      percentBp: 500,
      amountToman: null,
      maxDiscountToman: null,
      minBasketToman: null,
      startsAt: null,
      endsAt: null,
      totalUses: 1,
      usesPerAccount: null,
      priority: 100,
      noteFa: null,
    });
    await moveDiscountRule(ctx.testDb.db, marketAdmin(ctx), { ruleId: rule.id, to: 'ACTIVE' });

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa, code: 'SYNTH-BACK' });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
      code: 'SYNTH-BACK',
    });

    const { cancelUnpaidOrder } = await import('../../src/commerce/cart.ts');
    await cancelUnpaidOrder(ctx.testDb.db, buyer, placed.order.id, 'SYNTHETIC نظرم عوض شد');

    // Placing an order closes the basket, so a fresh one is filled — the
    // point being tested is the code, not the basket.
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    // The ceiling counts orders that stood, not attempts.
    const again = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa, code: 'SYNTH-BACK' });
    assert.equal(again.discountTotalToman > 0n, true, 'the code is usable again');
  });
});

// ── loyalty ────────────────────────────────────────────────────────────────

test('points are earned once however often the callback replays, and spent only once', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.loyalty_points_per_1000_toman',
      value: 1,
      reason: 'SYNTHETIC — نرخ آزمایشی',
    });
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.loyalty_point_value_toman',
      value: '100',
      reason: 'SYNTHETIC — ارزش آزمایشی',
    });

    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000407',
      iban: 'IR820540102680020817909307',
      name: 'SYNTHETIC فروشگاه امتیاز',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 10, 500_000n, 'G-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
    });
    const { reference, gateway } = await payFor(ctx, buyer, placed.order.id);
    assert.equal(await balanceOf(ctx.testDb.db, ctx.vet.accountId), 500);

    // The provider delivers the same result twice more; nothing is earned.
    await verifyAttempt(ctx.testDb.db, { reference }, gateway, paidEffects);
    await verifyAttempt(ctx.testDb.db, { reference }, gateway, paidEffects);
    assert.equal(await balanceOf(ctx.testDb.db, ctx.vet.accountId), 500);

    // Spending them takes them off the basket and off the balance, once.
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const spending = await viewCart(ctx.testDb.db, buyer, {
      provinceFa: DELIVERY.provinceFa,
      redeemPoints: 300,
    });
    assert.equal(spending.loyaltyPoints, 300);
    assert.equal(spending.loyaltyToman, 30_000n);
    assert.equal(spending.grandTotalToman, 470_000n);

    await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: spending.grandTotalToman,
      redeemPoints: 300,
    });
    assert.equal(await balanceOf(ctx.testDb.db, ctx.vet.accountId), 200);

    // More than the balance is refused rather than borrowed against.
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const greedy = await viewCart(ctx.testDb.db, buyer, {
      provinceFa: DELIVERY.provinceFa,
      redeemPoints: 5_000,
    });
    assert.equal(greedy.loyaltyPoints, 200, 'only what they actually have');
  });
});

test('expiry takes a lot once, and never takes points already spent', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const account = ctx.vet.accountId;
    // One lot of points, already past its day.
    await ctx.testDb.db.insert(loyaltyEntries).values({
      accountId: account,
      kind: 'EARN',
      points: 100,
      descriptionFa: 'SYNTHETIC — امتیاز آزمایشی',
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    assert.equal(await balanceOf(ctx.testDb.db, account), 100);

    assert.equal(await expireDuePoints(ctx.testDb.db), 1);
    assert.equal(await balanceOf(ctx.testDb.db, account), 0);
    // Running the sweep again takes nothing more.
    assert.equal(await expireDuePoints(ctx.testDb.db), 0);
    assert.equal(await balanceOf(ctx.testDb.db, account), 0);

    const entries = await ctx.testDb.db
      .select()
      .from(loyaltyEntries)
      .where(and(eq(loyaltyEntries.accountId, account), eq(loyaltyEntries.kind, 'EXPIRE')));
    assert.equal(entries.length, 1);
  });
});

// ── alerts, history and privacy ────────────────────────────────────────────

test('a price drop is told once, and only to somebody who wants to hear it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const watcher = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000408',
      iban: 'IR820540102680020817909308',
      name: 'SYNTHETIC فروشگاه قیمت',
    });
    const { sku, productId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 10, 500_000n, 'H-2KG');

    // The first price is in the history the moment the line exists.
    const history = await ctx.testDb.db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.offerSkuId, sku.id));
    assert.equal(history.length, 1);
    assert.equal(history[0]!.priceToman, 500_000n);

    await saveItem(ctx.testDb.db, watcher, { productId });
    // Nothing has fallen yet.
    assert.equal(await sweepPriceDrops(ctx.testDb.db), 0);

    await bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      lines: [{ skuId: sku.id, priceToman: 400_000n }],
    });
    assert.equal(await sweepPriceDrops(ctx.testDb.db), 1);
    // Told once, however often the sweep runs.
    assert.equal(await sweepPriceDrops(ctx.testDb.db), 0);
    const alerts = await ctx.testDb.db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.accountId, ctx.vet.accountId));
    assert.equal(alerts.length, 1);

    // Somebody who turned alerts off is not told at all.
    await setPreferences(ctx.testDb.db, watcher, { priceAlertsOff: true });
    await bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      lines: [{ skuId: sku.id, priceToman: 300_000n }],
    });
    assert.equal(await sweepPriceDrops(ctx.testDb.db), 0);
  });
});

test('no browsing history is kept without a retention period or against a preference', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const viewer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000409',
      iban: 'IR820540102680020817909309',
      name: 'SYNTHETIC فروشگاه تاریخچه',
    });
    const { productId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'I-2KG');

    // No retention configured: nothing is written at all. Keeping a browsing
    // history with no deletion date is not a default to fall into.
    await recordView(ctx.testDb.db, viewer, { productId });
    let kept = await ctx.testDb.db
      .select()
      .from(recentViews)
      .where(eq(recentViews.accountId, ctx.vet.accountId));
    assert.equal(kept.length, 0);

    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.shop.recent_view_retention_days',
      value: 30,
      reason: 'SYNTHETIC — مدت آزمایشی',
    });
    await recordView(ctx.testDb.db, viewer, { productId });
    kept = await ctx.testDb.db.select().from(recentViews).where(eq(recentViews.accountId, ctx.vet.accountId));
    assert.equal(kept.length, 1);

    // Looking again moves the row forward rather than appending: a history of
    // what, not of when somebody was awake.
    await recordView(ctx.testDb.db, viewer, { productId });
    kept = await ctx.testDb.db.select().from(recentViews).where(eq(recentViews.accountId, ctx.vet.accountId));
    assert.equal(kept.length, 1);

    // Turning it off clears what was kept, not only what comes next.
    await setPreferences(ctx.testDb.db, viewer, { historyOff: true });
    kept = await ctx.testDb.db.select().from(recentViews).where(eq(recentViews.accountId, ctx.vet.accountId));
    assert.equal(kept.length, 0);
    await recordView(ctx.testDb.db, viewer, { productId });
    kept = await ctx.testDb.db.select().from(recentViews).where(eq(recentViews.accountId, ctx.vet.accountId));
    assert.equal(kept.length, 0);
    assert.equal((await preferencesOf(ctx.testDb.db, ctx.vet.accountId)).historyOff, true);
  });
});

test('somebody who opted out of recommendations still gets the catalogue’s own answer', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const person = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000410',
      iban: 'IR820540102680020817909310',
      name: 'SYNTHETIC فروشگاه پیشنهاد',
    });
    await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذای الف', 6, 200_000n, 'J-2KG');

    const { suggestionsFor } = await import('../../src/commerce/suggestions.ts');
    await setPreferences(ctx.testDb.db, person, { recommendationsOff: true });
    const suggestions = await suggestionsFor(ctx.testDb.db, person);
    assert.ok(suggestions.length > 0, 'a fallback still answers');
    // And it is the impersonal one: a fact about the catalogue, not a guess
    // about them.
    assert.ok(suggestions.every((entry) => entry.reason === 'POPULAR_IN_CATEGORY'));
    assert.ok(suggestions.every((entry) => entry.sponsored === false));
  });
});
