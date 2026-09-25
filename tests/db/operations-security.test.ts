/**
 * Least privilege, integrity and limits against a real database — PROMPT-013.
 *
 * Four questions, each asked of the real code rather than of a policy
 * document: can one account read another's record, can any role declare money
 * moved without the evidence its contract requires, does a limit actually
 * stop anything, and does an operational screen leak what it is not supposed
 * to show.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { productCategories } from '../../src/db/schema/catalog.ts';
import { commerceOrders } from '../../src/db/schema/orders.ts';
import { settlementBatches } from '../../src/db/schema/fulfilment.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
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
import { addSku, createOffer, moveOffer } from '../../src/commerce/inventory.ts';
import { addShippingMethod } from '../../src/commerce/shipping.ts';
import { placeOrder, setCartLine, viewCart } from '../../src/commerce/cart.ts';
import { moveSubOrder, orderForBuyer, sellerOrders, startOrderPayment } from '../../src/commerce/orders.ts';
import { clearDueHolds, moveBatch, openSettlementBatch } from '../../src/commerce/ledger.ts';
import { invoiceSpec } from '../../src/commerce/invoice.ts';
import { analyticsFor } from '../../src/analytics/service.ts';
import { riskQueue, supportSummary } from '../../src/security/risk.ts';
import { assertWithinLimit, consume } from '../../src/security/rate-limit.ts';
import { exportAccount, runRetentionSweeps } from '../../src/security/retention.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099944000',
  tmpPrefix: 'hamzist-ops-',
  councilCode: 'SYNTH-OP-9',
  chipBase: 5_700_000,
};

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');
const finance = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'FINANCE_OPERATOR');
const support = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SUPPORT_AGENT');
const moderator = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'LISTING_MODERATOR');

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
    initialStock: 8,
  });
  await moveOffer(ctx.testDb.db, actor, { offerId: offer.id, to: 'ACTIVE', expectedVersion: offer.version });
  return created;
}

async function paidOrder(ctx: MatingCtx, buyer: ReturnType<typeof actorFor>, skuId: string) {
  await setCartLine(ctx.testDb.db, buyer, { skuId, quantity: 1 });
  const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
  const placed = await placeOrder(ctx.testDb.db, buyer, {
    delivery: DELIVERY,
    confirmedTotalToman: view.grandTotalToman,
  });
  const [order] = await ctx.testDb.db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.id, placed.order.id));
  const batch = await startOrderPayment(ctx.testDb.db, buyer, placed.order.id);
  const gateway = payingGateway(order!.grandTotalToman * 10n);
  const started = await startAttempt(
    ctx.testDb.db,
    buyer,
    { batchId: batch.id, callbackUrl: '/account/orders/' + placed.order.id + '/return' },
    gateway,
    'DEV',
  );
  const outcome = await verifyAttempt(ctx.testDb.db, { reference: started.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
  return placed;
}

// ── one account cannot read another's record ───────────────────────────────

test('an order, its invoice and its sub-order are unreachable by anybody else', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const stranger = ctx.second.actor;
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000501',
      iban: 'IR820540102680020817909401',
      name: 'SYNTHETIC فروشگاه یک',
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 300_000n, 'A-2KG');
    const placed = await paidOrder(ctx, buyer, sku.id);

    // A stranger is told it does not exist, not that they are not allowed:
    // the difference is itself information.
    await assert.rejects(orderForBuyer(ctx.testDb.db, stranger, placed.order.id), code('NOT_FOUND'));
    await assert.rejects(invoiceSpec(ctx.testDb.db, stranger, placed.order.id), code('NOT_FOUND'));
    await assert.rejects(
      moveSubOrder(ctx.testDb.db, stranger, {
        subOrderId: placed.subOrders[0]!.id,
        to: 'ACCEPTED_BY_SELLER',
      }),
      code('NOT_FOUND'),
    );
    // And asking for a shop's queue by its id gets nowhere either.
    await assert.rejects(sellerOrders(ctx.testDb.db, stranger, shop.id), code('NOT_FOUND'));

    // The buyer and the shop reach exactly their own halves.
    const view = await orderForBuyer(ctx.testDb.db, buyer, placed.order.id);
    assert.equal(view.parts.length, 1);
    const queue = await sellerOrders(ctx.testDb.db, ctx.first.actor, shop.id);
    assert.equal(queue.length, 1);
    // The shop is given the delivery details and nothing about the order's
    // total, which the invoice test above already proved it cannot fetch.
    assert.equal(queue[0]!.contact.recipientPhone, DELIVERY.recipientPhone);
  });
});

test('an invoice is refused before the payment is verified', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000502',
      iban: 'IR820540102680020817909402',
      name: 'SYNTHETIC فروشگاه دو',
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 300_000n, 'B-2KG');

    await setCartLine(ctx.testDb.db, buyer, { skuId: sku.id, quantity: 1 });
    const view = await viewCart(ctx.testDb.db, buyer, { provinceFa: DELIVERY.provinceFa });
    const placed = await placeOrder(ctx.testDb.db, buyer, {
      delivery: DELIVERY,
      confirmedTotalToman: view.grandTotalToman,
    });
    // An invoice for an order nobody paid for is a receipt for nothing.
    await assert.rejects(invoiceSpec(ctx.testDb.db, buyer, placed.order.id), code('CONFLICT'));
  });
});

// ── no role may declare money moved ────────────────────────────────────────

test('no role can record a bank payment without the bank’s own reference', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000503',
      iban: 'IR820540102680020817909403',
      name: 'SYNTHETIC فروشگاه سه',
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 400_000n, 'C-2KG');
    const placed = await paidOrder(ctx, buyer, sku.id);
    const part = placed.subOrders[0]!;
    for (const [to, tracking] of [
      ['ACCEPTED_BY_SELLER', ''],
      ['PREPARING', ''],
      ['SHIPPED', 'SYN-1'],
    ] as const) {
      await moveSubOrder(ctx.testDb.db, ctx.first.actor, {
        subOrderId: part.id,
        to,
        trackingCode: tracking || null,
      });
    }
    await moveSubOrder(ctx.testDb.db, buyer, { subOrderId: part.id, to: 'DELIVERED' });
    await clearDueHolds(ctx.testDb.db, new Date(Date.now() + 30 * 86_400_000));

    const batch = await openSettlementBatch(ctx.testDb.db, finance(ctx), shop.id);
    await moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'READY' });

    // The finance operator is the role that may do this, and even they cannot
    // do it without the evidence the contract requires.
    await assert.rejects(
      moveBatch(ctx.testDb.db, finance(ctx), { batchId: batch.id, to: 'PAID' }),
      code('VALIDATION'),
    );
    // A reviewer, a moderator and support hold no settlement capability at all.
    for (const actor of [reviewer(ctx), moderator(ctx), support(ctx)]) {
      await assert.rejects(
        moveBatch(ctx.testDb.db, actor, { batchId: batch.id, to: 'PAID', bankReference: 'SYN-X' }),
        code('FORBIDDEN'),
      );
    }

    await moveBatch(ctx.testDb.db, finance(ctx), {
      batchId: batch.id,
      to: 'PAID',
      bankReference: 'SYN-BANK-1',
    });
    const [paid] = await ctx.testDb.db
      .select()
      .from(settlementBatches)
      .where(eq(settlementBatches.id, batch.id));
    assert.equal(paid!.bankReference, 'SYN-BANK-1');
    assert.ok(paid!.paidAt !== null);
  });
});

test('every operational decision leaves an audited reason behind it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000504',
      iban: 'IR820540102680020817909404',
      name: 'SYNTHETIC فروشگاه چهار',
    });

    const rows = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.targetType, 'COMMERCE_SELLER'), eq(auditEvents.targetId, shop.id)));
    assert.ok(rows.length >= 2, 'the review and the account verification are both written down');
    // And nothing in those rows carries the bank account in full.
    const text = JSON.stringify(rows);
    assert.ok(!text.includes('IR820540102680020817909404'), 'the audit keeps no full IBAN');
  });
});

// ── limits actually stop something ─────────────────────────────────────────

test('an unconfigured ceiling allows everything and writes nothing', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    const actor = ctx.first.actor;
    for (let index = 0; index < 5; index += 1) {
      const outcome = await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor });
      assert.equal(outcome.allowed, true);
      assert.equal(outcome.ceiling, null);
      // Nothing is counted, because keeping a log of what people do for a
      // limit that does not exist is keeping it for no reason.
      assert.equal(outcome.count, 0);
    }
  });
});

test('a configured ceiling counts refused attempts too, and says when to try again', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.limit.question_per_hour',
      value: 2,
      reason: 'SYNTHETIC — سقف آزمایشی',
    });
    const actor = ctx.first.actor;

    assert.equal((await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor })).allowed, true);
    assert.equal((await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor })).allowed, true);
    const third = await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor });
    assert.equal(third.allowed, false);
    assert.equal(third.count, 3);
    assert.ok(third.retryAfter !== null, 'the refusal says when, not merely no');

    // A refused attempt still counts, so refusals cannot be used to wait out
    // the window.
    const fourth = await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor });
    assert.equal(fourth.count, 4);

    await assert.rejects(
      assertWithinLimit(ctx.testDb.db, { action: 'QUESTION_ASK', actor }),
      code('RATE_LIMITED'),
    );

    // Somebody else is unaffected: a limit is per subject.
    assert.equal((await consume(ctx.testDb.db, { action: 'QUESTION_ASK', actor: ctx.second.actor })).allowed, true);
  });
});

test('a visitor with no account is limited without an address being stored', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.limit.search_per_hour',
      value: 1,
      reason: 'SYNTHETIC — سقف آزمایشی',
    });
    const first = await consume(ctx.testDb.db, {
      action: 'SEARCH_QUERY',
      actor: null,
      fingerprint: '203.0.113.9',
    });
    assert.equal(first.allowed, true);
    const second = await consume(ctx.testDb.db, {
      action: 'SEARCH_QUERY',
      actor: null,
      fingerprint: '203.0.113.9',
    });
    assert.equal(second.allowed, false);

    const { rateLimitHits } = await import('../../src/db/schema/security.ts');
    const rows = await ctx.testDb.db.select().from(rateLimitHits);
    assert.ok(rows.length > 0);
    // The address itself is nowhere in the table.
    assert.ok(rows.every((row) => row.subjectHash !== '203.0.113.9'));
    assert.ok(!JSON.stringify(rows).includes('203.0.113.9'));
  });
});

test('counters are forgotten once their windows have passed', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await updateSetting(ctx.testDb.db, ctx.admin.actor, {
      key: 'market.limit.report_per_hour',
      value: 5,
      reason: 'SYNTHETIC — سقف آزمایشی',
    });
    await consume(ctx.testDb.db, { action: 'REPORT_SUBMIT', actor: ctx.first.actor });
    const { rateLimitHits } = await import('../../src/db/schema/security.ts');
    assert.equal((await ctx.testDb.db.select().from(rateLimitHits)).length, 1);

    // Nothing is due yet.
    const quiet = await runRetentionSweeps(ctx.testDb.db);
    assert.equal(quiet.rateLimitWindows, 0);

    // A day later it is.
    const swept = await runRetentionSweeps(ctx.testDb.db, new Date(Date.now() + 2 * 86_400_000));
    assert.equal(swept.rateLimitWindows, 1);
    assert.equal((await ctx.testDb.db.select().from(rateLimitHits)).length, 0);
  });
});

// ── the operational screens show what they should ──────────────────────────

test('analytics is aggregate, and hides a group too small to be a statistic', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000505',
      iban: 'IR820540102680020817909405',
      name: 'SYNTHETIC فروشگاه پنج',
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 250_000n, 'D-2KG');
    await paidOrder(ctx, buyer, sku.id);

    const view = await analyticsFor(ctx.testDb.db, ctx.admin.actor);
    assert.equal(view.shop.gmv.count, 1);
    assert.equal(view.shop.gmv.totalToman, 250_000n);
    // One sub-order is fewer than the default cohort of five, so its row is
    // there and its number is not.
    assert.ok(view.shop.subOrders.every((row) => row.suppressed));

    // Nothing in the whole view is a name, a number or an address.
    const text = JSON.stringify(view, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    assert.ok(!text.includes(DELIVERY.recipientPhone));
    assert.ok(!text.includes(DELIVERY.recipientNameFa));
    assert.ok(!text.includes(DELIVERY.addressFa));
    assert.ok(!text.includes('IR820540102680020817909405'));

    // And an account with no marketplace capability cannot open it at all.
    await assert.rejects(analyticsFor(ctx.testDb.db, ctx.first.actor), code('FORBIDDEN'));
  });
});

test('support shows counts and a masked number, never the number itself', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const summary = await supportSummary(ctx.testDb.db, support(ctx), ctx.vet.accountId);
    assert.ok(summary.maskedMobile.includes('*'), 'the number is masked');
    assert.ok(!summary.maskedMobile.startsWith('0999'), 'the prefix is gone too');
    assert.equal(typeof summary.openInquiries, 'number');

    // Somebody without the capability cannot read it.
    await assert.rejects(
      supportSummary(ctx.testDb.db, ctx.first.actor, ctx.vet.accountId),
      code('FORBIDDEN'),
    );
    // Nor can they open the risk queue.
    await assert.rejects(riskQueue(ctx.testDb.db, ctx.first.actor), code('FORBIDDEN'));
    // An operator can, and on a quiet database it is simply empty.
    assert.deepEqual(await riskQueue(ctx.testDb.db, ctx.admin.actor), []);
  });
});

test('somebody may take their own record, and nobody may take another’s', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const buyer = actorFor(ctx.vet.accountId);
    const shop = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000506',
      iban: 'IR820540102680020817909406',
      name: 'SYNTHETIC فروشگاه شش',
    });
    const sku = await sellable(ctx, ctx.first.actor, shop.id, 'SYNTHETIC غذا', 150_000n, 'E-2KG');
    await paidOrder(ctx, buyer, sku.id);

    const own = await exportAccount(ctx.testDb.db, buyer, ctx.vet.accountId);
    assert.equal(own.orders.length, 1);
    assert.ok(own.maskedMobile.includes('*'), 'even their own number is not written out in a file that travels');
    assert.match(own.noteFa, /اطلاعات شخصی دیگران/);

    // Somebody else's is refused outright.
    await assert.rejects(
      exportAccount(ctx.testDb.db, ctx.first.actor, ctx.vet.accountId),
      code('FORBIDDEN'),
    );

    // Support may take it on somebody's behalf, and that is written down.
    await exportAccount(ctx.testDb.db, support(ctx), ctx.vet.accountId);
    const audited = await ctx.testDb.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ACCOUNT_DATA_EXPORTED'), eq(auditEvents.targetId, ctx.vet.accountId)));
    assert.equal(audited.length, 1);
  });
});
