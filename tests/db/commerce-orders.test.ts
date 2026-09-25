/**
 * Baskets, one payment and independent sub-orders, against a real database —
 * PROMPT-010.
 *
 * Every test builds two real trading stores and a real buyer, and pays through
 * the gateway stub, because everything worth testing here is about what
 * happens when money and stock move together: that one payment covers several
 * shops exactly, that a replayed callback cannot sell the same unit twice,
 * that two buyers racing for the last one leave one order, and that a shop
 * falling through takes only its own part of the order with it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { inventoryMoves, offerSkus, productCategories, stockReservations } from '../../src/db/schema/catalog.ts';
import { commerceOrders, commerceOrderItems, commerceSubOrders } from '../../src/db/schema/orders.ts';
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
import { addSku, availableFor, createOffer, loadSku, moveOffer } from '../../src/commerce/inventory.ts';
import { addShippingMethod } from '../../src/commerce/shipping.ts';
import { cancelUnpaidOrder, placeOrder, setCartLine, viewCart } from '../../src/commerce/cart.ts';
import {
  expireUnacceptedSubOrders,
  loadSubOrder,
  moveSubOrder,
  orderForBuyer,
  sellerOrders,
  startOrderPayment,
} from '../../src/commerce/orders.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099941000',
  tmpPrefix: 'hamzist-orders-',
  councilCode: 'SYNTH-OR-9',
  chipBase: 5_400_000,
};

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');
const financeOperator = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');

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
  await ensureCategories(ctx.testDb.db);
  await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
}

/** A store that is actually trading, built the real way, with its delivery terms stated. */
async function tradingStore(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  facts: { identifier: string; iban: string; name: string; shippingFeeToman?: bigint | null },
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
  // A shop states how it delivers, or states nothing at all: there is no flat
  // fee on the store any more, so a fixture that wants one says so as a method
  // the way a real shop would (PROMPT-011).
  if (facts.shippingFeeToman !== null) {
    await addShippingMethod(ctx.testDb.db, actor, {
      sellerId: seller.id,
      labelFa: 'SYNTHETIC پست',
      kind: 'POST',
      coverageKind: 'WHOLE_COUNTRY',
      provinceCodes: [],
      pricingKind: 'FIXED',
      baseFeeToman: facts.shippingFeeToman ?? 45_000n,
      perKgToman: null,
      includedGrams: null,
      freeThresholdToman: null,
      preparationDays: 1,
      noteFa: null,
    });
  }
  const active = await loadSeller(ctx.testDb.db, seller.id);
  assert.equal(active.status, 'ACTIVE');
  return active;
}

/** A published product, an active offer and a SKU with stock, in one step. */
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
  return created;
}

/** Take one order all the way through a verified payment. */
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
  const outcome = await verifyAttempt(
    ctx.testDb.db,
    { reference: started.reference },
    gateway,
    paidEffects,
  );
  assert.equal(outcome.state, 'PAID');
  return { reference: started.reference, gateway };
}

// ── one basket, several shops ──────────────────────────────────────────────

test('one basket across two shops pays once and becomes two independent sub-orders', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shopOne = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000201',
      iban: 'IR820540102680020817909101',
      name: 'SYNTHETIC فروشگاه یک',
      shippingFeeToman: 45_000n,
    });
    const shopTwo = await tradingStore(ctx, ctx.second.actor, {
      identifier: '10000000202',
      iban: 'IR820540102680020817909102',
      name: 'SYNTHETIC فروشگاه دو',
      shippingFeeToman: 30_000n,
    });
    const first = await sellable(ctx, ctx.first.actor, shopOne.id, 'SYNTHETIC غذای سگ', 10, 480_000n, 'A-2KG');
    const second = await sellable(ctx, ctx.second.actor, shopTwo.id, 'SYNTHETIC غذای گربه', 5, 250_000n, 'B-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: first.id, quantity: 2 });
    await setCartLine(ctx.testDb.db, buyer, { skuId: second.id, quantity: 1 });

    const view = await viewCart(ctx.testDb.db, buyer);
    assert.equal(view.groups.length, 2);
    // 2×480,000 + 45,000 + 250,000 + 30,000
    assert.equal(view.grandTotalToman, 1_285_000n);
    assert.equal(view.blocked, false);

    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
    });
    assert.equal(placed.subOrders.length, 2);
    assert.equal(placed.order.grandTotalToman, 1_285_000n);

    // Every shop's figures are its own, and the two shares are the whole of it.
    for (const subOrder of placed.subOrders) {
      assert.equal(subOrder.commissionToman + subOrder.payoutToman, subOrder.buyerTotalToman);
      assert.equal(
        subOrder.buyerTotalToman,
        subOrder.itemsTotalToman - subOrder.discountToman + subOrder.shippingToman,
      );
    }
    const summed = placed.subOrders.reduce((total, row) => total + row.buyerTotalToman, 0n);
    assert.equal(summed, placed.order.grandTotalToman);

    // Stock is held but not yet sold: that happens at the verification.
    assert.equal(await availableFor(ctx.testDb.db, first.id), 8);
    assert.equal((await loadSku(ctx.testDb.db, first.id)).stockOnHand, 10);

    await payFor(ctx, buyer, placed.order.id);

    const view2 = await orderForBuyer(ctx.testDb.db, buyer, placed.order.id);
    assert.equal(view2.order.status, 'PAID');
    assert.deepEqual(
      view2.parts.map((part) => part.subOrder.status),
      ['PAID', 'PAID'],
    );
    // Now they are gone from the shelf, and each sub-order has a deadline.
    assert.equal((await loadSku(ctx.testDb.db, first.id)).stockOnHand, 8);
    assert.equal(await availableFor(ctx.testDb.db, first.id), 8);
    for (const part of view2.parts) assert.ok(part.subOrder.acceptanceDueAt !== null);

    // One payment, and the basket closed rather than emptied.
    const batches = await ctx.testDb.db
      .select({ id: commerceOrders.paymentBatchId })
      .from(commerceOrders)
      .where(eq(commerceOrders.id, placed.order.id));
    assert.ok(batches[0]!.id !== null);
    assert.equal((await viewCart(ctx.testDb.db, buyer)).empty, true);
  });
});

test('a shop that has not said what delivery costs cannot be checked out from', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000203',
      iban: 'IR820540102680020817909103',
      name: 'SYNTHETIC فروشگاه بی‌ارسال',
      shippingFeeToman: null,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 4, 300_000n, 'C-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });

    const view = await viewCart(ctx.testDb.db, buyer);
    assert.equal(view.blocked, true);
    assert.ok(view.changes.some((change) => change.kind === 'SHIPPING_UNKNOWN'));
    // Not billed as free; refused by name.
    assert.equal(view.groups[0]!.shippingToman, null);
    await assert.rejects(
      placeOrder(ctx.testDb.db, buyer, { delivery: DELIVERY, confirmedTotalToman: view.grandTotalToman }),
      code('CONFLICT'),
    );

    // Once the shop states a way of delivering — free, chosen on purpose —
    // the basket clears.
    await addShippingMethod(ctx.testDb.db, ctx.first.actor, {
      sellerId: shop.id,
      labelFa: 'SYNTHETIC تحویل رایگان',
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
    const after = await viewCart(ctx.testDb.db, buyer);
    assert.equal(after.blocked, false);
    assert.equal(after.groups[0]!.shippingToman, 0n);
    assert.equal(after.grandTotalToman, 300_000n);
  });
});

test('a price that moved since the buyer agreed to it stops the checkout', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000204',
      iban: 'IR820540102680020817909104',
      name: 'SYNTHETIC فروشگاه قیمت',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 4, 300_000n, 'D-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const agreed = (await viewCart(ctx.testDb.db, buyer)).grandTotalToman;
    assert.equal(agreed, 300_000n);

    // The shop reprices between the basket page and the gateway.
    await ctx.testDb.db.update(offerSkus).set({ priceToman: 360_000n }).where(eq(offerSkus.id, sku.id));

    await assert.rejects(
      placeOrder(ctx.testDb.db, buyer, { delivery: DELIVERY, confirmedTotalToman: agreed }),
      code('CONFLICT'),
    );
    // Nothing was written and nothing was held.
    assert.equal((await ctx.testDb.db.select().from(commerceOrders)).length, 0);
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 4);

    // Agreeing to the new figure works, and it is the new one that is charged.
    const now = (await viewCart(ctx.testDb.db, buyer)).grandTotalToman;
    assert.equal(now, 360_000n);
    const placed = await placeOrder(ctx.testDb.db, buyer, { delivery: DELIVERY, confirmedTotalToman: now });
    assert.equal(placed.order.grandTotalToman, 360_000n);
  });
});

test('two checkouts racing for the last unit leave exactly one order', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000205',
      iban: 'IR820540102680020817909105',
      name: 'SYNTHETIC فروشگاه آخرین قلم',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC آخرین قلم', 1, 500_000n, 'E-2KG');

    const buyerOne = actorFor(ctx.vet.accountId);
    const buyerTwo = ctx.second.actor;
    await setCartLine(ctx.testDb.db, buyerOne, { skuId: sku.id, quantity: 1 });
    await setCartLine(ctx.testDb.db, buyerTwo, { skuId: sku.id, quantity: 1 });

    const results = await Promise.allSettled([
      placeOrder(ctx.testDb.db, buyerOne, { delivery: DELIVERY, confirmedTotalToman: 500_000n }),
      placeOrder(ctx.testDb.db, buyerTwo, { delivery: DELIVERY, confirmedTotalToman: 500_000n }),
    ]);
    const won = results.filter((result) => result.status === 'fulfilled');
    assert.equal(won.length, 1, 'exactly one checkout may take the last unit');

    // One order, one live hold, and the shelf shows nothing left.
    assert.equal((await ctx.testDb.db.select().from(commerceOrders)).length, 1);
    const live = await ctx.testDb.db
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.offerSkuId, sku.id), eq(stockReservations.status, 'ACTIVE')));
    assert.equal(live.length, 1);
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 0);
  });
});

test('a replayed callback does not sell the same unit twice', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000206',
      iban: 'IR820540102680020817909106',
      name: 'SYNTHETIC فروشگاه تکرار',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 6, 200_000n, 'F-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 2 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 400_000n,
    });
    const { reference, gateway } = await payFor(ctx, buyer, placed.order.id);

    const afterFirst = await loadSku(ctx.testDb.db, sku.id);
    assert.equal(afterFirst.stockOnHand, 4);

    // The provider delivers the same result again, twice more.
    const replayOne = await verifyAttempt(ctx.testDb.db, { reference }, gateway, paidEffects);
    const replayTwo = await verifyAttempt(ctx.testDb.db, { reference }, gateway, paidEffects);
    assert.equal(replayOne.state, 'PAID');
    assert.equal(replayTwo.state, 'PAID');
    // "Already done" rather than "done again": that is what a replay must get.
    assert.equal(replayOne.state === 'PAID' && replayOne.performed, false);
    assert.equal(replayTwo.state === 'PAID' && replayTwo.performed, false);

    // Nothing moved: not the stock, not the ledger, not the order rows.
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 4);
    const sales = await ctx.testDb.db
      .select()
      .from(inventoryMoves)
      .where(and(eq(inventoryMoves.offerSkuId, sku.id), eq(inventoryMoves.kind, 'SELL')));
    assert.equal(sales.length, 1);
    assert.equal((await ctx.testDb.db.select().from(commerceOrders)).length, 1);
    assert.equal((await ctx.testDb.db.select().from(commerceSubOrders)).length, 1);
  });
});

test('a failed payment keeps the order and its holds, and the retry succeeds', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000207',
      iban: 'IR820540102680020817909107',
      name: 'SYNTHETIC فروشگاه تلاش دوباره',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 3, 150_000n, 'G-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 150_000n,
    });

    const batch = await startOrderPayment(ctx.testDb.db, buyer, placed.order.id);
    const refusing = { ...payingGateway(1_500_000n), verify: async () => ({ paid: false, amountRial: 0n, providerRef: 'X' }) };
    const started = await startAttempt(
      ctx.testDb.db,
      buyer,
      { batchId: batch.id, callbackUrl: '/account/orders/' + placed.order.id + '/return' },
      refusing,
      'DEV',
    );
    const failed = await verifyAttempt(ctx.testDb.db, { reference: started.reference }, refusing, paidEffects);
    assert.equal(failed.state, 'FAILED');

    // The order is intact and the goods are still held for this buyer.
    const [order] = await ctx.testDb.db.select().from(commerceOrders).where(eq(commerceOrders.id, placed.order.id));
    assert.equal(order!.status, 'PENDING_PAYMENT');
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 2);

    await payFor(ctx, buyer, placed.order.id);
    const [paid] = await ctx.testDb.db.select().from(commerceOrders).where(eq(commerceOrders.id, placed.order.id));
    assert.equal(paid!.status, 'PAID');
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 2);
  });
});

test('giving up on an unpaid order puts the goods straight back', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000208',
      iban: 'IR820540102680020817909108',
      name: 'SYNTHETIC فروشگاه لغو',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 2, 100_000n, 'H-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 2 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 200_000n,
    });
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 0);

    assert.equal(await cancelUnpaidOrder(ctx.testDb.db, buyer, placed.order.id, 'نظرم عوض شد'), true);
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 2);
    // Nothing was ever sold, so the count on hand never changed.
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 2);
    // And cancelling twice is not an error, nor a second release.
    assert.equal(await cancelUnpaidOrder(ctx.testDb.db, buyer, placed.order.id, 'دوباره'), false);
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 2);
  });
});

test('one shop missing its deadline cancels and refunds only its own part', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shopOne = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000209',
      iban: 'IR820540102680020817909109',
      name: 'SYNTHETIC فروشگاه پاسخگو',
      shippingFeeToman: 20_000n,
    });
    const shopTwo = await tradingStore(ctx, ctx.second.actor, {
      identifier: '10000000210',
      iban: 'IR820540102680020817909110',
      name: 'SYNTHETIC فروشگاه خاموش',
      shippingFeeToman: 10_000n,
    });
    const fast = await sellable(ctx, ctx.first.actor, shopOne.id, 'SYNTHETIC غذای الف', 5, 100_000n, 'I-2KG');
    const silent = await sellable(ctx, ctx.second.actor, shopTwo.id, 'SYNTHETIC غذای ب', 5, 200_000n, 'J-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: fast.id, quantity: 1 });
    await setCartLine(ctx.testDb.db, buyer, { skuId: silent.id, quantity: 1 });
    const total = (await viewCart(ctx.testDb.db, buyer)).grandTotalToman;
    const placed = await placeOrder(ctx.testDb.db, buyer, { delivery: DELIVERY, confirmedTotalToman: total });
    await payFor(ctx, buyer, placed.order.id);

    const answering = placed.subOrders.find((row) => row.sellerId === shopOne.id)!;
    const quiet = placed.subOrders.find((row) => row.sellerId === shopTwo.id)!;
    await moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: answering.id, to: 'ACCEPTED_BY_SELLER' });

    // The silent shop's deadline passes.
    await ctx.testDb.db
      .update(commerceSubOrders)
      .set({ acceptanceDueAt: new Date(Date.now() - 60_000) })
      .where(eq(commerceSubOrders.id, quiet.id));
    assert.equal(await expireUnacceptedSubOrders(ctx.testDb.db), 1);

    const cancelled = await loadSubOrder(ctx.testDb.db, quiet.id);
    const untouched = await loadSubOrder(ctx.testDb.db, answering.id);
    assert.equal(cancelled.status, 'CANCELLED');
    // The shop that answered is exactly where it was.
    assert.equal(untouched.status, 'ACCEPTED_BY_SELLER');

    // Its goods went back on the shelf, through the ledger.
    assert.equal((await loadSku(ctx.testDb.db, silent.id)).stockOnHand, 5);
    assert.equal((await loadSku(ctx.testDb.db, fast.id)).stockOnHand, 4);

    // And the money it took is recorded as owed, for that part only.
    const [refund] = await ctx.testDb.db
      .select()
      .from(depositRefunds)
      .where(eq(depositRefunds.subOrderId, quiet.id));
    assert.equal(refund!.amountToman, quiet.buyerTotalToman);
    assert.equal(refund!.inquiryId, null);
    assert.equal(refund!.status, 'PENDING');

    // The parent is still paid: one shop is still delivering.
    const view = await orderForBuyer(ctx.testDb.db, buyer, placed.order.id);
    assert.equal(view.order.status, 'PAID');

    // Running the sweep again changes nothing.
    assert.equal(await expireUnacceptedSubOrders(ctx.testDb.db), 0);
    assert.equal((await ctx.testDb.db.select().from(depositRefunds)).length, 1);
  });
});

test('a shop sees only its own sub-order, and only what a courier needs', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shopOne = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000211',
      iban: 'IR820540102680020817909111',
      name: 'SYNTHETIC فروشگاه الف',
      shippingFeeToman: 0n,
    });
    const shopTwo = await tradingStore(ctx, ctx.second.actor, {
      identifier: '10000000212',
      iban: 'IR820540102680020817909112',
      name: 'SYNTHETIC فروشگاه ب',
      shippingFeeToman: 0n,
    });
    const mine = await sellable(ctx, ctx.first.actor, shopOne.id, 'SYNTHETIC مال من', 5, 100_000n, 'K-2KG');
    const theirs = await sellable(ctx, ctx.second.actor, shopTwo.id, 'SYNTHETIC مال دیگری', 5, 700_000n, 'L-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: mine.id, quantity: 1 });
    await setCartLine(ctx.testDb.db, buyer, { skuId: theirs.id, quantity: 1 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 800_000n,
    });
    await payFor(ctx, buyer, placed.order.id);

    const queue = await sellerOrders(ctx.testDb.db, ctx.first.actor, shopOne.id);
    assert.equal(queue.length, 1);
    // Their own part, and the delivery details for it.
    assert.equal(queue[0]!.subOrder.sellerId, shopOne.id);
    assert.equal(queue[0]!.contact.recipientPhone, DELIVERY.recipientPhone);
    // Nothing about the other shop's goods or the order's total.
    const asText = JSON.stringify(queue, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    assert.ok(!asText.includes('SYNTHETIC مال دیگری'));
    assert.ok(!asText.includes('800000'));

    // Another shop's sub-order is not theirs to read or to move.
    const foreign = placed.subOrders.find((row) => row.sellerId === shopTwo.id)!;
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, ctx.first.actor, { subOrderId: foreign.id, to: 'ACCEPTED_BY_SELLER' }),
      code('NOT_FOUND'),
    );
    // Nor is the whole order theirs to open.
    await assert.rejects(
      orderForBuyer(ctx.testDb.db, ctx.first.actor, placed.order.id),
      code('NOT_FOUND'),
    );
    // And asking for the other store's queue by id gets nowhere.
    await assert.rejects(sellerOrders(ctx.testDb.db, ctx.first.actor, shopTwo.id), code('NOT_FOUND'));
  });
});

test('a sub-order walks to delivered, and a return puts the goods back and opens a refund', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000213',
      iban: 'IR820540102680020817909113',
      name: 'SYNTHETIC فروشگاه مرجوعی',
      shippingFeeToman: 25_000n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 4, 175_000n, 'M-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 200_000n,
    });
    await payFor(ctx, buyer, placed.order.id);
    const part = placed.subOrders[0]!;

    const seller = ctx.first.actor;
    await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'ACCEPTED_BY_SELLER' });
    await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'PREPARING' });
    // Shipping without a tracking code is not shipping.
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'SHIPPED' }),
      code('VALIDATION'),
    );
    await moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'SHIPPED', trackingCode: 'SYN-123456' });
    await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });

    // A return has to say why, and it is the buyer's to ask for.
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'RETURN_REQUESTED', reasonFa: 'بد' }),
      code('VALIDATION'),
    );
    await moveSubOrder(ctx.testDb.db, buyer, {
      subOrderId: part.id,
      to: 'RETURN_REQUESTED',
      reasonFa: 'SYNTHETIC کالا با توضیح نمی‌خواند',
    });
    // A seller cannot ask for a return on the buyer's behalf.
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'DELIVERED' }),
      code('CONFLICT'),
    );

    await moveSubOrder(ctx.testDb.db, seller, {
      subOrderId: part.id,
      to: 'RETURNED',
      reasonFa: 'SYNTHETIC کالا برگشت خورد',
    });

    // The goods are back, counted through the ledger rather than adjusted.
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 4);
    const returns = await ctx.testDb.db
      .select()
      .from(inventoryMoves)
      .where(and(eq(inventoryMoves.offerSkuId, sku.id), eq(inventoryMoves.kind, 'RETURN')));
    assert.equal(returns.length, 1);
    const [item] = await ctx.testDb.db
      .select()
      .from(commerceOrderItems)
      .where(eq(commerceOrderItems.subOrderId, part.id));
    assert.equal(item!.returnedQuantity, 1);

    // And the whole of that shop's part, delivery included, is owed back.
    const [refund] = await ctx.testDb.db
      .select()
      .from(depositRefunds)
      .where(eq(depositRefunds.subOrderId, part.id));
    assert.equal(refund!.amountToman, 200_000n);

    // Only an operator closes it, and only from RETURNED.
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, seller, { subOrderId: part.id, to: 'REFUNDED' }),
      code('CONFLICT'),
    );
    await moveSubOrder(ctx.testDb.db, financeOperator(ctx), { subOrderId: part.id, to: 'REFUNDED' });
    const view = await orderForBuyer(ctx.testDb.db, buyer, placed.order.id);
    // Every part of this order ended with the money going back, so the parent
    // says so — which it could not have done while one part was still open.
    assert.equal(view.order.status, 'REFUNDED');
  });
});

test('the item rows are a snapshot, and the shop cannot rewrite what was bought', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000214',
      iban: 'IR820540102680020817909114',
      name: 'SYNTHETIC فروشگاه ثبت',
      shippingFeeToman: 0n,
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC نام اولیه', 4, 500_000n, 'N-2KG');
    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: 500_000n,
    });
    await payFor(ctx, buyer, placed.order.id);

    // Afterwards the shop doubles the price and the offer is archived.
    await ctx.testDb.db.update(offerSkus).set({ priceToman: 1_000_000n }).where(eq(offerSkus.id, sku.id));

    const view = await orderForBuyer(ctx.testDb.db, buyer, placed.order.id);
    const item = view.parts[0]!.items[0]!;
    // What was bought, at what it cost, under the name it had.
    assert.equal(item.unitPriceToman, 500_000n);
    assert.equal(item.productNameFa, 'SYNTHETIC نام اولیه');
    assert.equal(item.skuCode, 'N-2KG');
    assert.equal(item.sellerNameFa, 'SYNTHETIC فروشگاه ثبت');
    assert.equal(view.order.grandTotalToman, 500_000n);
  });
});
