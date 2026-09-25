/**
 * The catalogue, offers and stock against a real database — PROMPT-009.
 *
 * Every test builds a real trading store first: a KYC-verified owner, an
 * application, a reviewer's approval and a plan period paid for at a gateway.
 * Nothing about a store's right to sell is written straight into the database,
 * because that right is exactly what the catalogue depends on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { actorFor, payingGateway, withMatingCtx, type MatingCtx } from '../helpers/mating.ts';
import {
  commerceProducts,
  inventoryMoves,
  offerSkus,
  productCategories,
  sellerOffers,
  stockReservations,
} from '../../src/db/schema/catalog.ts';
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
import { publishedPlans, ensureLaunchPlans, startPlanPurchase } from '../../src/commerce/plans.ts';
import {
  addProductImage,
  addVariant,
  createProduct,
  decideProduct,
  ensureCategories,
  loadProduct,
  mergeProduct,
  productReviewQueue,
  resolveProduct,
  submitProduct,
} from '../../src/commerce/catalog.ts';
import {
  addSku,
  availableFor,
  bulkUpdatePrices,
  createOffer,
  ledgerOf,
  loadSku,
  moveOffer,
  publicOffersOf,
  recordStockMove,
  releaseExpiredReservations,
  reserveStock,
} from '../../src/commerce/inventory.ts';
import { cities } from '../../src/db/schema/geography.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const OPTIONS = {
  mobilePrefix: '099939000',
  tmpPrefix: 'hamzist-catalog-',
  councilCode: 'SYNTH-CT-9',
  chipBase: 5_300_000,
};

const reviewer = (ctx: MatingCtx) => actorFor(ctx.admin.accountId, 'SELLER_REVIEWER');

async function openShop(ctx: MatingCtx): Promise<void> {
  const set = (key: string, value: unknown) =>
    updateSetting(ctx.testDb.db, ctx.admin.actor, { key, value, reason: 'SYNTHETIC — مقدار آزمایشی' });
  await set('market.flag.seller_onboarding_enabled', true);
  await set('market.shop.seller_agreement_version', 'SYNTHETIC-AGREEMENT-1');
  await set('market.shop.seller_plan_pro_monthly_toman', '0');
  await ensureCategories(ctx.testDb.db);
  await ensureLaunchPlans(ctx.testDb.db, ctx.admin.actor);
}

/** A store that is actually trading, built the real way. */
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
  const active = await loadSeller(ctx.testDb.db, seller.id);
  assert.equal(active.status, 'ACTIVE');
  return active;
}

const categoryByCode = async (ctx: MatingCtx, code: string) => {
  const [row] = await ctx.testDb.db
    .select()
    .from(productCategories)
    .where(eq(productCategories.code, code));
  return row!;
};

/** A published product with one variant, ready to be offered. */
async function publishedProduct(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  sellerId: string,
  nameFa: string,
  barcode: string | null = null,
) {
  const category = await categoryByCode(ctx, 'DRY_FOOD');
  const product = await createProduct(ctx.testDb.db, actor, {
    sellerId,
    categoryId: category.id,
    nameFa,
    brandFa: 'SYNTHETIC برند',
    barcode,
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
  const published = await decideProduct(ctx.testDb.db, reviewer(ctx), {
    productId: product.id,
    to: 'PUBLISHED',
    expectedVersion: submitted.version,
  });
  return { product: published, variant };
}

/** An active offer with one SKU carrying the given stock. */
async function offerWithStock(
  ctx: MatingCtx,
  actor: ReturnType<typeof actorFor>,
  sellerId: string,
  productId: string,
  variantId: string,
  stock: number,
  priceToman = 500_000n,
  sku = 'BAG-2KG',
) {
  const offer = await createOffer(ctx.testDb.db, actor, {
    sellerId,
    productId,
    condition: 'NEW',
    shipsToWholeCountry: true,
  });
  const created = await addSku(ctx.testDb.db, actor, {
    offerId: offer.id,
    variantId,
    sku,
    priceToman,
    initialStock: stock,
  });
  const live = await moveOffer(ctx.testDb.db, actor, {
    offerId: offer.id,
    to: 'ACTIVE',
    expectedVersion: offer.version,
  });
  return { offer: live, sku: created };
}

// ── the catalogue ──────────────────────────────────────────────────────────

test('a blocked category refuses with its own reason, whatever else is true', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000101',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه یک',
    });
    const medicine = await categoryByCode(ctx, 'MEDICINE');
    assert.equal(medicine.salePolicy, 'BLOCKED_PHARMACEUTICAL');

    await assert.rejects(
      createProduct(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        categoryId: medicine.id,
        nameFa: 'SYNTHETIC دارو',
        speciesCodes: ['DOG'],
      }),
      (error: unknown) =>
        code('CONFLICT')(error) && /تصمیم حقوقی/.test((error as { message: string }).message),
    );
  });
});

test('a product states only what its category defines, and one barcode names one article', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000102',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه دو',
    });
    const category = await categoryByCode(ctx, 'DRY_FOOD');

    // A specification nobody defined is refused rather than stored.
    await assert.rejects(
      createProduct(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        categoryId: category.id,
        nameFa: 'SYNTHETIC غذای سگ',
        specifications: { lifeStage: 'بالغ', secret: 'x' },
        speciesCodes: ['DOG'],
      }),
      code('VALIDATION'),
    );
    /*
     * An optional specification may simply be absent. The launch taxonomy marks
     * no specification of this category as required, and the test says that
     * rather than pretending a requirement the product decisions never state.
     */
    const withoutOptional = await createProduct(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      categoryId: category.id,
      nameFa: 'SYNTHETIC غذای بدون رده سنی',
      specifications: {},
      speciesCodes: ['DOG'],
    });
    assert.deepEqual(withoutOptional.specifications, {});

    // A species that does not exist is refused, because it is a real taxonomy.
    await assert.rejects(
      createProduct(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        categoryId: category.id,
        nameFa: 'SYNTHETIC کالای گونه نامعتبر',
        specifications: {},
        speciesCodes: ['DRAGON'],
      }),
      code('VALIDATION'),
    );

    const first = await createProduct(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      categoryId: category.id,
      nameFa: 'SYNTHETIC غذای سگ',
      barcode: '6261100500011',
      specifications: { lifeStage: 'بالغ' },
      speciesCodes: ['DOG'],
    });
    assert.equal(first.status, 'DRAFT');
    assert.ok(first.slug.length > 0);

    await assert.rejects(
      createProduct(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        categoryId: category.id,
        nameFa: 'SYNTHETIC همان غذا با نام دیگر',
        barcode: '626 110 050 0011',
        specifications: { lifeStage: 'بالغ' },
        speciesCodes: ['DOG'],
      }),
      code('CONFLICT'),
    );

    // One combination of attributes is one variant, however it was typed.
    await addVariant(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      productId: first.id,
      attributes: { weight: '۲ کیلو', flavour: 'مرغ' },
    });
    await assert.rejects(
      addVariant(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        productId: first.id,
        attributes: { flavour: 'مرغ', weight: '۲ کیلو' },
      }),
      code('CONFLICT'),
    );
  });
});

test('a product is reviewed before it is public, and merging keeps the old address working', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000103',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه سه',
    });
    const base = await publishedProduct(ctx, ctx.first.actor, seller.id, 'SYNTHETIC غذای پایه', '6261100500012');

    const otherActor = actorFor(ctx.second.accountId);
    const otherSeller = await tradingStore(ctx, otherActor, {
      identifier: '10000000104',
      iban: 'IR060540102680020817909002',
      name: 'SYNTHETIC فروشگاه چهار',
    });
    const duplicate = await publishedProduct(ctx, otherActor, otherSeller.id, 'SYNTHETIC همان غذا');

    // The duplicate's seller already has an offer on it, with real stock.
    const { sku } = await offerWithStock(
      ctx,
      otherActor,
      otherSeller.id,
      duplicate.product.id,
      duplicate.variant.id,
      4,
    );

    const queue = await productReviewQueue(ctx.testDb.db, reviewer(ctx));
    assert.equal(queue.length, 0, 'both products have already been decided');
    await assert.rejects(productReviewQueue(ctx.testDb.db, ctx.first.actor), code('FORBIDDEN'));

    const merged = await mergeProduct(ctx.testDb.db, reviewer(ctx), {
      productId: duplicate.product.id,
      intoProductId: base.product.id,
      reasonFa: 'SYNTHETIC همان کالا با نام دیگر ثبت شده بود.',
      expectedVersion: duplicate.product.version,
    });
    assert.equal(merged.status, 'MERGED');
    assert.equal(merged.mergedIntoProductId, base.product.id);

    // The old address still resolves, to the product it became part of.
    const resolved = await resolveProduct(ctx.testDb.db, duplicate.product.id);
    assert.equal(resolved.id, base.product.id);

    // And the seller's stock followed rather than being stranded.
    const [offer] = await ctx.testDb.db
      .select({ productId: sellerOffers.productId })
      .from(sellerOffers)
      .where(eq(sellerOffers.sellerId, otherSeller.id));
    assert.equal(offer!.productId, base.product.id);
    assert.equal((await loadSku(ctx.testDb.db, sku.id)).stockOnHand, 4);
  });
});

// ── stock ──────────────────────────────────────────────────────────────────

test('stock is the ledger, and every movement says why and by whom', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000105',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه پنج',
    });
    const { product, variant } = await publishedProduct(ctx, ctx.first.actor, seller.id, 'SYNTHETIC غذای موجودی');
    const { sku } = await offerWithStock(ctx, ctx.first.actor, seller.id, product.id, variant.id, 10);

    assert.equal(sku.stockOnHand, 10);
    assert.equal(sku.stockReserved, 0);

    // A correction needs a reason, and a negative receive is refused outright.
    await assert.rejects(
      recordStockMove(ctx.testDb.db, ctx.first.actor, {
        skuId: sku.id,
        kind: 'RECEIVE',
        quantity: 5,
        reasonFa: '   ',
      }),
      code('VALIDATION'),
    );
    await assert.rejects(
      recordStockMove(ctx.testDb.db, ctx.first.actor, {
        skuId: sku.id,
        kind: 'RECEIVE',
        quantity: -2,
        reasonFa: 'SYNTHETIC کاهش',
      }),
      code('VALIDATION'),
    );

    const corrected = await recordStockMove(ctx.testDb.db, ctx.first.actor, {
      skuId: sku.id,
      kind: 'ADJUST',
      quantity: -3,
      reasonFa: 'SYNTHETIC شمارش انبار',
    });
    assert.equal(corrected.stockOnHand, 7);

    // Stock cannot go below zero, whatever the correction says.
    await assert.rejects(
      recordStockMove(ctx.testDb.db, ctx.first.actor, {
        skuId: sku.id,
        kind: 'ADJUST',
        quantity: -100,
        reasonFa: 'SYNTHETIC اصلاح غیرممکن',
      }),
      code('CONFLICT'),
    );

    const ledger = await ledgerOf(ctx.testDb.db, ctx.first.actor, sku.id);
    assert.equal(ledger.length, 2, 'the receive and the correction, and nothing rewritten');
    assert.ok(ledger.every((row) => row.actorAccountId === ctx.first.accountId));
    assert.ok(ledger.some((row) => row.kind === 'ADJUST' && row.quantity === -3));
  });
});

test('two checkouts racing for the last item cannot both have it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000106',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه شش',
    });
    const { product, variant } = await publishedProduct(ctx, ctx.first.actor, seller.id, 'SYNTHETIC آخرین کالا');
    const { sku } = await offerWithStock(ctx, ctx.first.actor, seller.id, product.id, variant.id, 1);

    const buyerA = actorFor(ctx.second.accountId);
    const buyerB = actorFor(ctx.vet.accountId);
    const outcomes = await Promise.allSettled([
      reserveStock(ctx.testDb.db, buyerA, { skuId: sku.id, quantity: 1, holdRef: 'cart-a', minutes: 10 }),
      reserveStock(ctx.testDb.db, buyerB, { skuId: sku.id, quantity: 1, holdRef: 'cart-b', minutes: 10 }),
    ]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1, 'exactly one hold');

    const after = await loadSku(ctx.testDb.db, sku.id);
    assert.equal(after.stockOnHand, 1);
    assert.equal(after.stockReserved, 1);
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 0);

    // And nothing can reserve more than exists, however it is asked for.
    await assert.rejects(
      reserveStock(ctx.testDb.db, buyerA, { skuId: sku.id, quantity: 5, holdRef: 'cart-c', minutes: 10 }),
      code('CONFLICT'),
    );
  });
});

test('an expired hold stops holding stock, without anything having run', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000107',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه هفت',
    });
    const { product, variant } = await publishedProduct(ctx, ctx.first.actor, seller.id, 'SYNTHETIC کالای رزرو');
    const { sku } = await offerWithStock(ctx, ctx.first.actor, seller.id, product.id, variant.id, 2);

    const buyer = actorFor(ctx.second.accountId);
    const reservation = await reserveStock(ctx.testDb.db, buyer, {
      skuId: sku.id,
      quantity: 2,
      holdRef: 'cart-x',
      minutes: 10,
    });
    assert.equal(await availableFor(ctx.testDb.db, sku.id), 0);

    // Move its moment into the past: nothing has to run for it to be over.
    await ctx.testDb.db
      .update(stockReservations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(stockReservations.id, reservation.id));

    assert.equal(await availableFor(ctx.testDb.db, sku.id), 2, 'the stock is buyable again');
    const [row] = await ctx.testDb.db
      .select({ status: stockReservations.status })
      .from(stockReservations)
      .where(eq(stockReservations.id, reservation.id));
    assert.equal(row!.status, 'EXPIRED');

    const releases = await ctx.testDb.db
      .select({ id: inventoryMoves.id })
      .from(inventoryMoves)
      .where(and(eq(inventoryMoves.offerSkuId, sku.id), eq(inventoryMoves.kind, 'RELEASE')));
    assert.equal(releases.length, 1, 'the release is a movement like any other');

    // Sweeping the whole shop is available too and finds nothing left to do.
    assert.equal(await releaseExpiredReservations(ctx.testDb.db), 0);
  });
});

// ── isolation and the public view ──────────────────────────────────────────

test('a shop’s catalogue and its bulk tools reach nothing outside it', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const mine = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000108',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه من',
    });
    const otherActor = actorFor(ctx.second.accountId);
    const theirs = await tradingStore(ctx, otherActor, {
      identifier: '10000000109',
      iban: 'IR060540102680020817909002',
      name: 'SYNTHETIC فروشگاه دیگری',
    });

    const ours = await publishedProduct(ctx, ctx.first.actor, mine.id, 'SYNTHETIC کالای من');
    const mineOffer = await offerWithStock(ctx, ctx.first.actor, mine.id, ours.product.id, ours.variant.id, 5);
    const theirsOffer = await offerWithStock(
      ctx,
      otherActor,
      theirs.id,
      ours.product.id,
      ours.variant.id,
      5,
      600_000n,
      'THEIR-BAG',
    );

    // Their SKU cannot be repriced through my shop's bulk tool.
    await assert.rejects(
      bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
        sellerId: mine.id,
        lines: [{ skuId: theirsOffer.sku.id, priceToman: 1_000n }],
      }),
      code('NOT_FOUND'),
    );
    // Nor can I reach into their store at all.
    await assert.rejects(
      bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
        sellerId: theirs.id,
        lines: [{ skuId: theirsOffer.sku.id, priceToman: 1_000n }],
      }),
      code('NOT_FOUND'),
    );
    // A change beyond half is refused even inside my own shop.
    await assert.rejects(
      bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
        sellerId: mine.id,
        lines: [{ skuId: mineOffer.sku.id, priceToman: 5_000_000n }],
      }),
      code('VALIDATION'),
    );
    const changed = await bulkUpdatePrices(ctx.testDb.db, ctx.first.actor, {
      sellerId: mine.id,
      lines: [{ skuId: mineOffer.sku.id, priceToman: 550_000n }],
    });
    assert.equal(changed, 1);

    // The public sees both offers on the shared product, cheapest first.
    const offers = await publicOffersOf(ctx.testDb.db, ours.product.id);
    assert.equal(offers.length, 2);
    assert.ok(offers.every((offer) => offer.available === 5));
    assert.deepEqual(
      [...offers].sort((a, b) => Number(a.priceToman - b.priceToman)).map((offer) => offer.sellerId),
      [mine.id, theirs.id],
    );

    // A seller cannot offer the same product twice.
    await assert.rejects(
      createOffer(ctx.testDb.db, ctx.first.actor, {
        sellerId: mine.id,
        productId: ours.product.id,
        condition: 'NEW',
        shipsToWholeCountry: false,
      }),
      code('CONFLICT'),
    );
  });
});

test('a paused offer and an unpublished product are not on sale', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await tradingStore(ctx, ctx.first.actor, {
      identifier: '10000000110',
      iban: 'IR820540102680020817909002',
      name: 'SYNTHETIC فروشگاه هشت',
    });
    const { product, variant } = await publishedProduct(ctx, ctx.first.actor, seller.id, 'SYNTHETIC کالای متوقف');
    const { offer, sku } = await offerWithStock(ctx, ctx.first.actor, seller.id, product.id, variant.id, 3);

    assert.equal((await publicOffersOf(ctx.testDb.db, product.id)).length, 1);

    const paused = await moveOffer(ctx.testDb.db, ctx.first.actor, {
      offerId: offer.id,
      to: 'PAUSED',
      expectedVersion: offer.version,
    });
    assert.equal((await publicOffersOf(ctx.testDb.db, product.id)).length, 0);
    // And nothing can be held on a paused offer.
    await assert.rejects(
      reserveStock(ctx.testDb.db, actorFor(ctx.second.accountId), {
        skuId: sku.id,
        quantity: 1,
        holdRef: 'cart-paused',
        minutes: 5,
      }),
      code('CONFLICT'),
    );

    // An offer cannot go live on a product that is not published.
    const draft = await createProduct(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      categoryId: (await categoryByCode(ctx, 'TOY')).id,
      nameFa: 'SYNTHETIC اسباب‌بازی پیش‌نویس',
      speciesCodes: ['DOG'],
    });
    const draftOffer = await createOffer(ctx.testDb.db, ctx.first.actor, {
      sellerId: seller.id,
      productId: draft.id,
      condition: 'NEW',
      shipsToWholeCountry: false,
    });
    await assert.rejects(
      moveOffer(ctx.testDb.db, ctx.first.actor, {
        offerId: draftOffer.id,
        to: 'ACTIVE',
        expectedVersion: draftOffer.version,
      }),
      code('CONFLICT'),
    );

    void paused;
  });
});

test('a store that is not trading cannot list anything', async () => {
  await withMatingCtx(OPTIONS, async (ctx) => {
    await openShop(ctx);
    const seller = await startSellerApplication(ctx.testDb.db, ctx.first.actor, {
      kind: 'PET_SHOP',
      displayNameFa: 'SYNTHETIC فروشگاه بی‌پلن',
    });
    const category = await categoryByCode(ctx, 'DRY_FOOD');

    await assert.rejects(
      createProduct(ctx.testDb.db, ctx.first.actor, {
        sellerId: seller.id,
        categoryId: category.id,
        nameFa: 'SYNTHETIC کالای فروشگاه غیرفعال',
        specifications: { lifeStage: 'بالغ' },
        speciesCodes: ['DOG'],
      }),
      code('CONFLICT'),
    );

    const [products] = await ctx.testDb.db
      .select({ id: commerceProducts.id })
      .from(commerceProducts)
      .where(eq(commerceProducts.ownerSellerId, seller.id));
    assert.equal(products, undefined);
    const [skus] = await ctx.testDb.db.select({ id: offerSkus.id }).from(offerSkus).limit(1);
    assert.equal(skus, undefined);
  });
});
