/**
 * Delivery, returns and money against a real database — PROMPT-011.
 *
 * Everything here is about money moving correctly when something goes wrong:
 * a partial return, a refund larger than the shop holds, a batch run twice, a
 * bank account changed while a payment is on its way to the old one, and one
 * shop's figures never appearing in another's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { offerSkus, productCategories } from '../../src/db/schema/catalog.ts';
import { commerceOrders, commerceOrderItems, commerceSubOrders } from '../../src/db/schema/orders.ts';
import { sellerLedgerEntries, settlementBatchLines, settlementBatches } from '../../src/db/schema/fulfilment.ts';
import { depositRefunds } from '../../src/db/schema/deals.ts';
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
  verifySettlementAccount,
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
import { addSku, createOffer, loadSku, moveOffer } from '../../src/commerce/inventory.ts';
import { addShippingMethod, setSkuWeight } from '../../src/commerce/shipping.ts';
import { placeOrder, setCartLine, viewCart } from '../../src/commerce/cart.ts';
import { moveSubOrder, startOrderPayment } from '../../src/commerce/orders.ts';
import { moveReturn, publishReturnPolicy, requestReturn } from '../../src/commerce/returns.ts';
import {
  balancesFor,
  clearDueHolds,
  liveCadence,
  moveBatch,
  openSettlementBatch,
  recordOperatorEntry,
  requestCadence,
  settlementPreview,
} from '../../src/commerce/ledger.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099942000',
  tmpPrefix: 'hamzist-fulfil-',
  councilCode: 'SYNTH-FL-9',
  chipBase: 5_500_000,
};

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');
const finance = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');
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
  await publishReturnPolicy(ctx.testDb.db, marketAdmin(ctx), {
    version: 'SYNTHETIC-RETURN-1',
    windowDays: 7,
    bodyFa: 'SYNTHETIC — متن آزمایشی سیاست مرجوعی برای تست خودکار این فاز.',
    exceptions: [],
  });
}

/** A store trading, with its bank account verified and one way of delivering. */
async function tradingStore(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  facts: { identifier: string; iban: string; name: string; shippingFeeToman?: bigint },
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
    baseFeeToman: facts.shippingFeeToman ?? 0n,
    perKgToman: null,
    includedGrams: null,
    freeThresholdToman: null,
    preparationDays: 1,
    noteFa: null,
  });
  // A person checked that the account belongs to this shop; without it
  // nothing can be settled to it.
  await verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
    sellerId: seller.id,
    noteFa: 'SYNTHETIC — بررسی آزمایشی مالکیت حساب',
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
  categoryCode = 'DRY_FOOD',
) {
  const [category] = await ctx.testDb.db
    .select()
    .from(productCategories)
    .where(eq(productCategories.code, categoryCode));
  const product = await createProduct(ctx.testDb.db, actor, {
    sellerId,
    categoryId: category!.id,
    nameFa,
    brandFa: 'SYNTHETIC برند',
    specifications: categoryCode === 'DRY_FOOD' ? { lifeStage: 'بالغ' } : {},
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
  return { sku: created, categoryId: category!.id };
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
}

/**
 * Sweep the holds as they will read once the return window has closed.
 *
 * The window is real days, so the sweep is asked about a moment past it
 * rather than the clock being faked: nothing clears early, and the test is
 * about what happens when it legitimately does.
 */
const sweepAfterWindow = (ctx: MatingCtx) =>
  clearDueHolds(ctx.testDb.db, new Date(Date.now() + 30 * 86_400_000));

/** One paid, accepted, shipped and delivered sub-order, ready to argue about. */
async function deliveredOrder(
  ctx: MatingCtx,
  buyer: ReturnType<typeof actorFor>,
  seller: ReturnType<typeof actorFor>,
  skuId: string,
  quantity: number,
) {
  await setCartLine(ctx.testDb.db, buyer, { skuId, quantity });
  const total = (await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa })).grandTotalToman;
  const placed = await placeOrder(ctx.testDb.db, buyer, {
    delivery: DELIVERY,
    confirmedTotalToman: total,
  });
  await payFor(ctx, buyer, placed.order.id);
  const part = placed.subOrders[0]!;
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'ACCEPTED_BY_SELLER' });
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'PREPARING' });
  await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'SHIPPED', trackingCode: 'SYN-1234' });
  await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });
  return { order: placed.order, subOrder: part };
}

// ── shipping ───────────────────────────────────────────────────────────────

test('a shop delivers only where it says, and prices by weight only where weights exist', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000301',
      iban: 'IR820540102680020817909201',
      name: 'SYNTHETIC فروشگاه ارسال',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'A-2KG');

    // A second method, priced by weight, on a line nobody has weighed yet.
    await addShippingMethod(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      labelFa: 'SYNTHETIC پیک وزنی',
      kind: 'COURIER',
      coverageKind: 'WHOLE_COUNTRY',
      provinceCodes: [],
      pricingKind: 'WEIGHT_BASED',
      baseFeeToman: 30_000n,
      perKgToman: 12_000n,
      includedGrams: 1_000,
      freeThresholdToman: null,
      preparationDays: 1,
      noteFa: null,
    });

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 2 });
    const before = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const weighted = before.groups[0]!.methodOffers.find((offer) => offer.labelFa.includes('وزنی'))!;
    // No weight recorded, so the weight-based method refuses by name rather
    // than quoting a figure it cannot know.
    assert.equal(weighted.problem, 'WEIGHT_UNKNOWN');
    // The fixed method still carries the basket, so the shop is not closed.
    assert.equal(before.blocked, false);

    await setSkuWeight(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      skuId: sku.id,
      weightGrams: 2_000,
    });
    const after = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const priced = after.groups[0]!.methodOffers.find((offer) => offer.labelFa.includes('وزنی'))!;
    // 4kg total, 1kg included, 3 started kilograms over: 30,000 + 3×12,000.
    assert.equal(priced.problem, null);
    assert.equal(priced.toman, 66_000n);

    // A method limited to some other province cannot carry this basket.
    const { provinces } = await import('../../src/db/schema/geography.ts');
    const all = await ctx.testDb.db.select({ code: provinces.code, nameFa: provinces.nameFa }).from(provinces);
    const elsewhere = all.find((row) => row.nameFa !== DELIVERY.provinceFa)!;
    await addShippingMethod(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      labelFa: 'SYNTHETIC فقط جای دیگر',
      kind: 'COURIER',
      coverageKind: 'PROVINCES',
      provinceCodes: [elsewhere.code],
      pricingKind: 'FIXED',
      baseFeeToman: 10_000n,
      perKgToman: null,
      includedGrams: null,
      freeThresholdToman: null,
      preparationDays: 1,
      noteFa: null,
    });
    const limited = (await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa })).groups[0]!;
    const blocked = limited.methodOffers.find((offer) => offer.labelFa.includes('جای دیگر'))!;
    assert.equal(blocked.problem, 'NOT_COVERED');
  });
});

test('the chosen delivery and its promise are frozen onto the sub-order', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000302',
      iban: 'IR820540102680020817909202',
      name: 'SYNTHETIC فروشگاه انجماد',
      shippingFeeToman: 45_000n,
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'B-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });

    const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const chosen = view.groups[0]!.chosenMethodId!;
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
      chosenMethods: { [shop.id]: chosen },
    });
    await payFor(ctx, buyer, placed.order.id);

    const [part] = await ctx.testDb.db
      .select()
      .from(commerceSubOrders)
      .where(eq(commerceSubOrders.id, placed.subOrders[0]!.id));
    assert.equal(part!.shippingMethodId, chosen);
    assert.equal(part!.shippingMethodLabelFa, 'SYNTHETIC پست');
    assert.equal(part!.shippingToman, 45_000n);
    assert.equal(part!.preparationDays, 1);
    // The promise became a moment when the money was verified.
    assert.ok(part!.preparationDueAt !== null);

    // Retiring the method afterwards changes nothing about what was promised.
    const { retireShippingMethod } = await import('../../src/commerce/shipping.ts');
    await retireShippingMethod(ctx.testDb.db, ctx.first.actor, { sellerId: shop.id, methodId: chosen });
    const [after] = await ctx.testDb.db
      .select()
      .from(commerceSubOrders)
      .where(eq(commerceSubOrders.id, part!.id));
    assert.equal(after!.shippingMethodLabelFa, 'SYNTHETIC پست');
  });
});

// ── returns ────────────────────────────────────────────────────────────────

test('a category exception is frozen onto the line and refuses the return by its own words', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000303',
      iban: 'IR820540102680020817909203',
      name: 'SYNTHETIC فروشگاه استثنا',
    });
    const { sku, categoryId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذای باز', 4, 300_000n, 'C-2KG');

    // The policy in force forbids returning this category at all.
    await publishReturnPolicy(ctx.testDb.db, marketAdmin(ctx), {
      version: 'SYNTHETIC-RETURN-2',
      windowDays: 7,
      bodyFa: 'SYNTHETIC — نسخه دوم سیاست مرجوعی برای تست استثناها.',
      exceptions: [
        {
          categoryId,
          rule: 'NOT_RETURNABLE',
          windowDays: null,
          reasonFa: 'SYNTHETIC — مواد غذایی باز شده قابل مرجوع نیست.',
        },
      ],
    });

    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);
    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, subOrder.id));
    // The rule and its sentence travelled onto the line when it was bought.
    assert.equal(item!.returnRuleCode, 'NOT_RETURNABLE');
    assert.match(item!.returnRuleReasonFa ?? '', /مواد غذایی باز شده/);

    await assert.rejects(
      requestReturn(ctx.testDb.db, buyer, {
        subOrderId: subOrder.id,
        reasonFa: 'SYNTHETIC نظرم عوض شد',
        lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC دلیل قلم' }],
      }),
      code('CONFLICT'),
    );

    // A policy published afterwards does not reach backwards: the line was
    // bought under the old terms and keeps them.
    await publishReturnPolicy(ctx.testDb.db, marketAdmin(ctx), {
      version: 'SYNTHETIC-RETURN-3',
      windowDays: 7,
      bodyFa: 'SYNTHETIC — نسخه سوم، بدون هیچ استثنایی.',
      exceptions: [],
    });
    await assert.rejects(
      requestReturn(ctx.testDb.db, buyer, {
        subOrderId: subOrder.id,
        reasonFa: 'SYNTHETIC دوباره',
        lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC دلیل قلم' }],
      }),
      code('CONFLICT'),
    );
  });
});

test('a partial return refunds only what came back, and the rest stays delivered', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000304',
      iban: 'IR820540102680020817909204',
      name: 'SYNTHETIC فروشگاه جزئی',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 100_000n, 'D-2KG');
    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 3);

    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, subOrder.id));

    const created = await requestReturn(ctx.testDb.db, buyer, {
      subOrderId: subOrder.id,
      reasonFa: 'SYNTHETIC یکی از سه تا را نمی‌خواهم',
      lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC قلم اضافی' }],
    });

    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'APPROVED' });
    await moveReturn(ctx.testDb.db, buyer, { returnId: created.id, to: 'SHIPPED_BACK', trackingCode: 'SYN-99' });
    const received = await moveReturn(ctx.testDb.db, ctx.first.actor, {
      returnId: created.id,
      to: 'RECEIVED',
      condition: 'AS_SOLD',
    });
    // One of three, at what it actually cost.
    assert.equal(received.refundAmountToman, 100_000n);

    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'REFUNDED' });

    // The goods came back and the sub-order is delivered again, because two
    // of the three still are.
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 4);
    const [after] = await ctx.testDb.db
      .select()
      .from(commerceSubOrders)
      .where(eq(commerceSubOrders.id, subOrder.id));
    assert.equal(after!.status, 'DELIVERED');
    const [line] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.id, item!.id));
    assert.equal(line!.returnedQuantity, 1);

    // The money owed back is one line's worth, not the whole sub-order's.
    const [refund] = await ctx.testDb.db
      .select()
      .from(depositRefunds)
      .where(eq(depositRefunds.subOrderId, subOrder.id));
    assert.equal(refund!.amountToman, 100_000n);
  });
});

test('goods returned opened where only sealed ones were allowed refund nothing', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000305',
      iban: 'IR820540102680020817909205',
      name: 'SYNTHETIC فروشگاه پلمب',
    });
    const { sku, categoryId } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 4, 250_000n, 'E-2KG');
    await publishReturnPolicy(ctx.testDb.db, marketAdmin(ctx), {
      version: 'SYNTHETIC-RETURN-SEALED',
      windowDays: 7,
      bodyFa: 'SYNTHETIC — نسخه با محدودیت پلمب برای تست.',
      exceptions: [
        {
          categoryId,
          rule: 'SEALED_ONLY',
          windowDays: null,
          reasonFa: 'SYNTHETIC — فقط در صورت باز نشدن قابل مرجوع است.',
        },
      ],
    });

    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);
    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, subOrder.id));

    // Asking is allowed: the category limits the condition, not the request.
    const created = await requestReturn(ctx.testDb.db, buyer, {
      subOrderId: subOrder.id,
      reasonFa: 'SYNTHETIC کالا مناسب نبود',
      lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC دلیل قلم' }],
    });
    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'APPROVED' });
    await moveReturn(ctx.testDb.db, buyer, { returnId: created.id, to: 'SHIPPED_BACK', trackingCode: 'SYN-77' });
    const opened = await moveReturn(ctx.testDb.db, ctx.first.actor, {
      returnId: created.id,
      to: 'RECEIVED',
      condition: 'OPENED',
    });
    // The exception is not decorative: nothing comes back.
    assert.equal(opened.refundAmountToman, 0n);

    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'REFUNDED' });
    const refunds = await ctx.testDb.db
      .select()
      .from(depositRefunds)
      .where(eq(depositRefunds.subOrderId, subOrder.id));
    // No money owed means no refund record: an empty one would be a promise
    // to send nothing.
    assert.equal(refunds.length, 0);
  });
});

// ── the ledger ─────────────────────────────────────────────────────────────

test('every balance is the sum of its entries, and a move sums to zero', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000306',
      iban: 'IR820540102680020817909206',
      name: 'SYNTHETIC فروشگاه دفتر',
      shippingFeeToman: 20_000n,
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 500_000n, 'F-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const total = (await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa })).grandTotalToman;
    const placed = await placeOrder(ctx.testDb.db, buyer, { delivery: DELIVERY, confirmedTotalToman: total });
    await payFor(ctx, buyer, placed.order.id);

    const part = placed.subOrders[0]!;
    const afterSale = await balancesFor(ctx.testDb.db, shop.id);
    // The buyer's whole payment, less the platform's cut, waiting.
    assert.equal(afterSale.PENDING, part.buyerTotalToman - part.commissionToman);
    assert.equal(afterSale.HELD, 0n);
    assert.equal(afterSale.AVAILABLE, 0n);

    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: part.id, to: 'ACCEPTED_BY_SELLER' });
    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: part.id, to: 'PREPARING' });
    await moveSubOrder(ctx.testDb.db, ctx.first.actor, {
      subOrderId: part.id,
      to: 'SHIPPED',
      trackingCode: 'SYN-11',
    });
    await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });

    const afterDelivery = await balancesFor(ctx.testDb.db, shop.id);
    assert.equal(afterDelivery.PENDING, 0n);
    assert.equal(afterDelivery.HELD, part.buyerTotalToman - part.commissionToman);

    // Every group marked balanced actually sums to zero.
    const entries = await ctx.testDb.db
      .select()
      .from(sellerLedgerEntries)
      .where(eq(sellerLedgerEntries.sellerId, shop.id));
    const byGroup = new Map<string, bigint>();
    const balancedOf = new Map<string, boolean>();
    for (const entry of entries) {
      byGroup.set(entry.groupId, (byGroup.get(entry.groupId) ?? 0n) + entry.amountToman);
      balancedOf.set(entry.groupId, entry.balanced);
    }
    for (const [groupId, sum] of byGroup) {
      if (balancedOf.get(groupId)) assert.equal(sum, 0n, 'a balanced group sums to zero');
      else assert.notEqual(sum, 0n, 'an unbalanced group moved money in or out');
    }
  });
});

test('a refund larger than the shop holds becomes a debt, not a negative balance', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000307',
      iban: 'IR820540102680020817909207',
      name: 'SYNTHETIC فروشگاه بدهکار',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 400_000n, 'G-2KG');
    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);

    // The shop's money clears and is taken out before the return arrives.
    assert.ok((await sweepAfterWindow(ctx)) >= 1);
    const batch = await openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id);
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-1',
    });
    const emptied = await balancesFor(ctx.testDb.db, shop.id);
    assert.equal(emptied.AVAILABLE, 0n);

    // Now the buyer sends it back, and there is nothing left to take it from.
    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, subOrder.id));
    const created = await requestReturn(ctx.testDb.db, buyer, {
      subOrderId: subOrder.id,
      reasonFa: 'SYNTHETIC کالا مناسب نبود',
      lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC دلیل قلم' }],
    });
    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'APPROVED' });
    await moveReturn(ctx.testDb.db, buyer, { returnId: created.id, to: 'SHIPPED_BACK', trackingCode: 'SYN-55' });
    await moveReturn(ctx.testDb.db, ctx.first.actor, {
      returnId: created.id,
      to: 'RECEIVED',
      condition: 'AS_SOLD',
    });
    await moveReturn(ctx.testDb.db, ctx.first.actor, { returnId: created.id, to: 'REFUNDED' });

    const owing = await balancesFor(ctx.testDb.db, shop.id);
    // A debt, which reads like what it is; not a negative available balance,
    // which would read like money the shop has.
    assert.ok(owing.DEBT > 0n, 'the uncovered part is owed');
    assert.ok(owing.AVAILABLE >= 0n, 'no balance goes negative');
    assert.ok(owing.HELD >= 0n);

    // And the next settlement recovers it before paying anything out.
    await recordOperatorEntry(ctx.testDb.db, finance(ctx), {
      sellerId: shop.id,
      kind: 'ADJUSTMENT',
      amountToman: 1_000_000n,
      reasonFa: 'SYNTHETIC — واریز آزمایشی برای بررسی کسر بدهی',
    });
    const preview = await settlementPreview(ctx.testDb.db, shop.id);
    assert.ok(preview.payoutToman < preview.availableToman, 'the debt comes off before the payout');
  });
});

test('a settlement batch gathers each entry once, however often it is run', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000308',
      iban: 'IR820540102680020817909208',
      name: 'SYNTHETIC فروشگاه تسویه',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 300_000n, 'H-2KG');
    await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);
    await sweepAfterWindow(ctx);

    const batch = await openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id);
    // A second run finds a batch already open rather than gathering again.
    await assert.rejects(openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id), code('CONFLICT'));

    const lines = await ctx.testDb.db
      .select()
      .from(settlementBatchLines)
      .where(eq(settlementBatchLines.batchId, batch.id));
    assert.ok(lines.length > 0);
    assert.equal(
      lines.reduce((sum, line) => sum + line.amountToman, 0n),
      batch.totalToman,
    );

    // Paying takes the money out of the ledger exactly once.
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });
    await assert.rejects(
      moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'PAID' }),
      code('VALIDATION'),
    );
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-2',
    });
    assert.equal((await balancesFor(ctx.testDb.db, shop.id)).AVAILABLE, 0n);

    // And it cannot be paid a second time from the same batch.
    await assert.rejects(
      moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'PAID', bankReference: 'SYN-BANK-3' }),
      code('CONFLICT'),
    );

    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'RECONCILED' });
    const [done] = await ctx.testDb.db
      .select()
      .from(settlementBatches)
      .where(eq(settlementBatches.id, batch.id));
    assert.equal(done!.status, 'RECONCILED');
    assert.equal(done!.bankReference, 'SYN-BANK-2');
  });
});

test('a failed transfer puts the money back and the batch can be tried again', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000309',
      iban: 'IR820540102680020817909209',
      name: 'SYNTHETIC فروشگاه ناموفق',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 300_000n, 'I-2KG');
    await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);
    await sweepAfterWindow(ctx);

    const batch = await openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id);
    const before = (await balancesFor(ctx.testDb.db, shop.id)).AVAILABLE;
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-4',
    });
    assert.equal((await balancesFor(ctx.testDb.db, shop.id)).AVAILABLE, 0n);

    // The bank rejected it, so the money never left.
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'FAILED',
      reasonFa: 'SYNTHETIC — حساب مقصد پاسخ نداد',
    });
    assert.equal((await balancesFor(ctx.testDb.db, shop.id)).AVAILABLE, before);
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-5',
    });
    assert.equal((await balancesFor(ctx.testDb.db, shop.id)).AVAILABLE, 0n);
  });
});

test('the bank account cannot be re-verified while money is on its way to it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000310',
      iban: 'IR820540102680020817909210',
      name: 'SYNTHETIC فروشگاه قفل',
    });
    const { sku } = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 300_000n, 'J-2KG');
    await deliveredOrder(ctx, buyer, ctx.first.actor, sku.id, 1);
    await sweepAfterWindow(ctx);

    const batch = await openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id);
    // While a batch is open, where the money goes is settled: re-verifying the
    // destination underneath a payment in flight is refused.
    await assert.rejects(
      verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
        sellerId: shop.id,
        noteFa: 'SYNTHETIC — تلاش برای تأیید مجدد وسط تسویه',
      }),
      code('CONFLICT'),
    );

    // The batch carries its own copy of where it was sent, so a later change
    // cannot rewrite where last month's money went.
    assert.equal(batch.ibanSnapshot, 'IR820540102680020817909210');

    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });
    // Still locked while it is ready to go and while it has gone.
    await assert.rejects(
      verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
        sellerId: shop.id,
        noteFa: 'SYNTHETIC — تلاش دوم',
      }),
      code('CONFLICT'),
    );
    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-6',
    });
    await assert.rejects(
      verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
        sellerId: shop.id,
        noteFa: 'SYNTHETIC — تلاش سوم',
      }),
      code('CONFLICT'),
    );

    // Reconciled: the money has arrived and been checked, so the account opens.
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'RECONCILED' });
    await verifySettlementAccount(ctx.testDb.db, reviewer(ctx), {
      sellerId: shop.id,
      noteFa: 'SYNTHETIC — بررسی مجدد پس از پایان تسویه',
    });
  });
});

test('one shop’s money never appears in another’s, and a disputed return stays held', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shopOne = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000311',
      iban: 'IR820540102680020817909211',
      name: 'SYNTHETIC فروشگاه الف',
    });
    const shopTwo = await tradingStore(ctx, ctx.second.actor, {
      identifier: '10000000312',
      iban: 'IR820540102680020817909212',
      name: 'SYNTHETIC فروشگاه ب',
    });
    const first = await sellable(ctx, ctx.first.actor, shopOne.id, 'SYNTHETIC الف', 6, 300_000n, 'K-2KG');
    const second = await sellable(ctx, ctx.second.actor, shopTwo.id, 'SYNTHETIC ب', 6, 700_000n, 'L-2KG');

    const { subOrder } = await deliveredOrder(ctx, buyer, ctx.first.actor, first.sku.id, 1);
    await deliveredOrder(ctx, buyer, ctx.second.actor, second.sku.id, 1);

    // Every entry belongs to exactly one shop, and the sums differ.
    const oneBalances = await balancesFor(ctx.testDb.db, shopOne.id);
    const twoBalances = await balancesFor(ctx.testDb.db, shopTwo.id);
    assert.notEqual(oneBalances.HELD, twoBalances.HELD);
    const foreign = await ctx.testDb.db
      .select()
      .from(sellerLedgerEntries)
      .where(and(eq(sellerLedgerEntries.sellerId, shopOne.id), eq(sellerLedgerEntries.subOrderId, subOrder.id)));
    assert.ok(foreign.length > 0);
    const leaked = await ctx.testDb.db
      .select()
      .from(sellerLedgerEntries)
      .where(and(eq(sellerLedgerEntries.sellerId, shopTwo.id), eq(sellerLedgerEntries.subOrderId, subOrder.id)));
    assert.equal(leaked.length, 0, 'no entry of one shop carries another shop’s sub-order');

    // A disputed return keeps its shop's money held however long it waits.
    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, subOrder.id));
    const created = await requestReturn(ctx.testDb.db, buyer, {
      subOrderId: subOrder.id,
      reasonFa: 'SYNTHETIC کالا با توضیح نمی‌خواند',
      lines: [{ orderItemId: item!.id, quantity: 1, reasonFa: 'SYNTHETIC دلیل قلم' }],
    });
    await moveReturn(ctx.testDb.db, ctx.first.actor, {
      returnId: created.id,
      to: 'REJECTED',
      noteFa: 'SYNTHETIC — کالا سالم تحویل شده بود',
    });
    await moveReturn(ctx.testDb.db, buyer, {
      returnId: created.id,
      to: 'DISPUTED',
      noteFa: 'SYNTHETIC — با تصمیم فروشنده موافق نیستم',
    });

    const heldBefore = (await balancesFor(ctx.testDb.db, shopOne.id)).HELD;
    // The window has long passed, and the money still does not clear.
    await clearDueHolds(ctx.testDb.db, new Date(Date.now() + 400 * 86_400_000));
    const heldAfter = await balancesFor(ctx.testDb.db, shopOne.id);
    assert.equal(heldAfter.HELD, heldBefore, 'an argued sub-order keeps its money held');
    assert.equal(heldAfter.AVAILABLE, 0n);
    // And it cannot be settled either.
    await assert.rejects(openSettlementBatch(ctx.testDb.db, finance(ctx), shopOne.id), code('CONFLICT'));
  });
});

test('a cadence change waits for the end of the period the shop is already in', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000313',
      iban: 'IR820540102680020817909213',
      name: 'SYNTHETIC فروشگاه دوره',
    });
    const before = await liveCadence(ctx.testDb.db, shop.id);
    const from = await requestCadence(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      cadence: before === 'WEEKLY' ? 'MONTHLY' : 'WEEKLY',
    });
    assert.ok(from.getTime() > Date.now(), 'the change starts later, not now');
    // Until that moment the old cadence is still the one in force.
    assert.equal(await liveCadence(ctx.testDb.db, shop.id), before);
  });
});

test('an operator’s own entry says why, and a shop cannot write one at all', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000314',
      iban: 'IR820540102680020817909214',
      name: 'SYNTHETIC فروشگاه جریمه',
    });

    await assert.rejects(
      recordOperatorEntry(ctx.testDb.db, finance(ctx), {
        sellerId: shop.id,
        kind: 'PENALTY',
        amountToman: 50_000n,
        reasonFa: 'کم',
      }),
      code('VALIDATION'),
    );
    // A shop cannot put figures on its own balance.
    await assert.rejects(
      recordOperatorEntry(ctx.testDb.db, ctx.first.actor, {
        sellerId: shop.id,
        kind: 'ADJUSTMENT',
        amountToman: 1_000_000n,
        reasonFa: 'SYNTHETIC — تلاش فروشنده برای افزودن موجودی',
      }),
      code('FORBIDDEN'),
    );

    await recordOperatorEntry(ctx.testDb.db, finance(ctx), {
      sellerId: shop.id,
      kind: 'PROMOTION_CHARGE',
      amountToman: 80_000n,
      reasonFa: 'SYNTHETIC — هزینه بسته تبلیغ هفته گذشته',
    });
    const balances = await balancesFor(ctx.testDb.db, shop.id);
    assert.equal(balances.DEBT, 80_000n);

    const entries = await ctx.testDb.db
      .select()
      .from(sellerLedgerEntries)
      .where(eq(sellerLedgerEntries.sellerId, shop.id));
    assert.equal(entries.length, 1);
    assert.match(entries[0]!.descriptionFa, /بسته تبلیغ/);
  });
});
