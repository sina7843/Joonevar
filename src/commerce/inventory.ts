/**
 * Offers, their SKUs, and the stock behind them — PROMPT-009.
 *
 * Stock is never a number somebody sets. Every change is a row in an
 * append-only ledger, and the two counters on the SKU are a reading of it kept
 * in step inside the same transaction.
 *
 * The rule that matters most here is that two checkouts cannot oversell the
 * last item. That is not a comparison in code — two transactions can both pass
 * one — but a conditional update that only one of them can win:
 *
 *     update offer_sku
 *        set stock_reserved = stock_reserved + n
 *      where id = ? and stock_on_hand - stock_reserved >= n
 *
 * with a check constraint behind it as the second line of defence. A hold has
 * its own expiry, read when it is used, so an abandoned basket stops holding
 * the last bag without anything having to run.
 */
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { commerceProducts, inventoryMoves, offerSkus, productVariants, sellerOffers, stockReservations } from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertSellerCapability, loadSeller } from './sellers.ts';
import { currentSubscription } from './plans.ts';
import { loadProduct, resolveProduct } from './catalog.ts';
import { recordPrice } from './alerts.ts';
import {
  availableStock,
  bulkPriceProblems,
  canMoveOffer,
  isSkuShape,
  moveDelta,
  normaliseSku,
  reservationExpired,
  BULK_LIMIT,
  type CommerceOfferStatus,
  type OfferCondition,
} from './catalog-model.ts';

export type OfferRow = typeof sellerOffers.$inferSelect;
export type SkuRow = typeof offerSkus.$inferSelect;
export type ReservationRow = typeof stockReservations.$inferSelect;

// ── offers ─────────────────────────────────────────────────────────────────

/**
 * Put one seller's terms on one product.
 *
 * The product must be something the public can be shown — a published base or
 * one this seller owns and is still preparing — and the store must be trading
 * on a live plan, because the plan is what says how many products it may list.
 */
export async function createOffer(
  database: Database,
  actor: Actor,
  input: {
    sellerId: string;
    productId: string;
    condition: string;
    shipsToWholeCountry: boolean;
    shippingNoteFa?: string | null;
  },
): Promise<OfferRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const seller = await loadSeller(database, input.sellerId);
  if (seller.status !== 'ACTIVE') throw conflict('تا فعال‌شدن فروشگاه، ثبت عرضه ممکن نیست.');

  const product = await resolveProduct(database, input.productId);
  const ownItem = product.ownerSellerId === seller.id;
  if (product.status !== 'PUBLISHED' && !ownItem) throw notFound('این کالا پیدا نشد.');

  const limit = (await currentSubscription(database, seller.id)).productLimit;
  if (limit !== null) {
    const [count] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(sellerOffers)
      .where(and(eq(sellerOffers.sellerId, seller.id), inArray(sellerOffers.status, ['DRAFT', 'ACTIVE', 'PAUSED'])));
    if ((count?.total ?? 0) >= limit) {
      throw conflict(
        'سقف محصول پلن فعلی شما ' + limit.toLocaleString('fa-IR') + ' قلم است؛ برای بیشتر، پلن را ارتقا دهید.',
      );
    }
  }

  try {
    const [offer] = await database
      .insert(sellerOffers)
      .values({
        sellerId: seller.id,
        productId: product.id,
        condition: input.condition as OfferCondition,
        shipsToWholeCountry: input.shipsToWholeCountry,
        shippingNoteFa: input.shippingNoteFa?.trim() || null,
        status: 'DRAFT',
      })
      .returning();

    await recordAudit(database, actor, {
      action: 'COMMERCE_OFFER_CREATED',
      targetType: 'COMMERCE_OFFER',
      targetId: offer!.id,
      after: { sellerId: seller.id, productId: product.id, condition: input.condition },
    });
    return offer!;
  } catch (error) {
    if (violates(error, 'seller_offer_key')) throw conflict('شما روی این کالا از قبل عرضه دارید.');
    throw error;
  }
}

export async function loadOffer(database: DbClient, offerId: string): Promise<OfferRow> {
  const [row] = await database.select().from(sellerOffers).where(eq(sellerOffers.id, offerId)).limit(1);
  if (!row) throw notFound('این عرضه پیدا نشد.');
  return row;
}

/** Start selling, pause, or put an offer away. */
export async function moveOffer(
  database: Database,
  actor: Actor,
  input: { offerId: string; to: CommerceOfferStatus; reasonFa?: string | null; expectedVersion: number },
): Promise<OfferRow> {
  const offer = await loadOffer(database, input.offerId);
  await assertSellerCapability(database, actor, offer.sellerId, 'STORE_OPERATE');
  if (!canMoveOffer(offer.status as CommerceOfferStatus, input.to)) throw conflict('این تغییر وضعیت مجاز نیست.');

  if (input.to === 'ACTIVE') {
    const product = await loadProduct(database, offer.productId);
    if (product.status !== 'PUBLISHED') throw conflict('تا انتشار کالا، عرضه آن فعال نمی‌شود.');
    const skus = await database
      .select({ id: offerSkus.id })
      .from(offerSkus)
      .where(eq(offerSkus.offerId, offer.id))
      .limit(1);
    if (skus.length === 0) throw validation('برای فعال‌کردن عرضه، دست‌کم یک قیمت و موجودی ثبت کنید.');
  }

  const now = new Date();
  const [updated] = await database
    .update(sellerOffers)
    .set({
      status: input.to,
      statusReasonFa: input.reasonFa?.trim() || null,
      version: offer.version + 1,
      updatedAt: now,
    })
    .where(and(eq(sellerOffers.id, offer.id), eq(sellerOffers.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این عرضه در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_OFFER_STATUS_CHANGED',
    targetType: 'COMMERCE_OFFER',
    targetId: offer.id,
    before: { status: offer.status },
    after: { status: input.to },
  });
  return updated;
}

// ── SKUs ───────────────────────────────────────────────────────────────────

/**
 * A price and a line of stock for one variant.
 *
 * The seller's own code has to be theirs alone, which is a shop-wide rule
 * rather than a global one: two shops may each have a `BAG-2KG`.
 */
export async function addSku(
  database: Database,
  actor: Actor,
  input: {
    offerId: string;
    variantId: string | null;
    sku: string;
    priceToman: bigint;
    initialStock: number;
    reasonFa?: string | null;
  },
): Promise<SkuRow> {
  const offer = await loadOffer(database, input.offerId);
  await assertSellerCapability(database, actor, offer.sellerId, 'STORE_OPERATE');

  const sku = normaliseSku(input.sku);
  if (!isSkuShape(sku)) throw validation('کد کالا فقط حروف لاتین بزرگ، رقم و خط تیره می‌پذیرد.');
  if (input.priceToman <= 0n) throw validation('قیمت باید بزرگ‌تر از صفر باشد.');
  if (!Number.isInteger(input.initialStock) || input.initialStock < 0) {
    throw validation('موجودی اولیه باید عددی نامنفی باشد.');
  }

  if (input.variantId !== null) {
    const [variant] = await database
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.id, input.variantId), eq(productVariants.productId, offer.productId)))
      .limit(1);
    if (!variant) throw notFound('این تنوع برای این کالا تعریف نشده است.');
  }

  // Shop-wide uniqueness of the seller's own code, checked against their rows.
  const clash = await database
    .select({ id: offerSkus.id })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(and(eq(sellerOffers.sellerId, offer.sellerId), eq(offerSkus.sku, sku)))
    .limit(1);
  if (clash.length > 0) throw conflict('کد کالا در فروشگاه شما تکراری است.');

  return database.transaction(async (tx) => {
    let row: SkuRow;
    try {
      const [created] = await tx
        .insert(offerSkus)
        .values({
          offerId: offer.id,
          variantId: input.variantId,
          sku,
          priceToman: input.priceToman,
          stockOnHand: 0,
          stockReserved: 0,
        })
        .returning();
      row = created!;
    } catch (error) {
      if (violates(error, 'offer_sku_variant_key')) {
        throw conflict('برای این تنوع از قبل قیمت و موجودی ثبت شده است.');
      }
      throw error;
    }

    if (input.initialStock > 0) {
      await applyMove(tx, actor, {
        skuId: row.id,
        kind: 'RECEIVE',
        quantity: input.initialStock,
        reasonFa: input.reasonFa?.trim() || 'ثبت موجودی اولیه',
      });
      row = await loadSku(tx, row.id);
    }

    // Every price this line has had is written down, so a later drop is a
    // fact about a history rather than a sentence in an email (PROMPT-012).
    await recordPrice(tx, row.id, input.priceToman);

    await recordAudit(tx, actor, {
      action: 'COMMERCE_SKU_CREATED',
      targetType: 'COMMERCE_OFFER',
      targetId: offer.id,
      after: { skuId: row.id, sku, priceToman: input.priceToman.toString(), initialStock: input.initialStock },
    });
    return row;
  });
}

export async function loadSku(database: DbClient, skuId: string): Promise<SkuRow> {
  const [row] = await database.select().from(offerSkus).where(eq(offerSkus.id, skuId)).limit(1);
  if (!row) throw notFound('این قلم کالا پیدا نشد.');
  return row;
}

/**
 * Change many prices at once, within limits.
 *
 * The ceiling on how many lines and how far a price may move exists so a slip
 * in a spreadsheet cannot reprice a whole shop, and a deliberate large change
 * can still be made in two steps.
 */
export async function bulkUpdatePrices(
  database: Database,
  actor: Actor,
  input: { sellerId: string; lines: readonly { skuId: string; priceToman: bigint }[] },
): Promise<number> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  if (input.lines.length === 0) throw validation('هیچ قلمی برای تغییر انتخاب نشده است.');
  if (input.lines.length > BULK_LIMIT) {
    throw validation('هر بار حداکثر ' + BULK_LIMIT.toLocaleString('fa-IR') + ' قلم تغییر می‌کند.');
  }

  const rows = await database
    .select({ id: offerSkus.id, priceToman: offerSkus.priceToman, sellerId: sellerOffers.sellerId })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(inArray(offerSkus.id, input.lines.map((line) => line.skuId)));

  // Every line has to belong to this shop: a bulk tool is exactly where one
  // stray id would otherwise reach into somebody else's prices.
  if (rows.length !== input.lines.length || rows.some((row) => row.sellerId !== input.sellerId)) {
    throw notFound('یکی از قلم‌های انتخاب‌شده در این فروشگاه نیست.');
  }

  const current = new Map(rows.map((row) => [row.id, row.priceToman]));
  const problems = bulkPriceProblems(
    input.lines.map((line) => ({
      skuId: line.skuId,
      currentToman: current.get(line.skuId)!,
      nextToman: line.priceToman,
    })),
  );
  if (problems.length > 0) throw validation(problems[0]!.messageFa);

  const now = new Date();
  return database.transaction(async (tx) => {
    let changed = 0;
    for (const line of input.lines) {
      const updated = await tx
        .update(offerSkus)
        .set({ priceToman: line.priceToman, updatedAt: now })
        .where(eq(offerSkus.id, line.skuId))
        .returning({ id: offerSkus.id });
      changed += updated.length;
      if (updated.length > 0) await recordPrice(tx, line.skuId, line.priceToman);
    }
    await recordAudit(tx, actor, {
      action: 'COMMERCE_SKU_PRICES_BULK_UPDATED',
      targetType: 'COMMERCE_SELLER',
      targetId: input.sellerId,
      after: { lines: input.lines.length, changed },
    });
    return changed;
  });
}

// ── the ledger ─────────────────────────────────────────────────────────────

export interface MoveInput {
  readonly skuId: string;
  readonly kind: 'RECEIVE' | 'ADJUST' | 'RESERVE' | 'RELEASE' | 'SELL' | 'RETURN';
  readonly quantity: number;
  readonly reasonFa?: string | null;
  readonly refType?: string | null;
  readonly refId?: string | null;
}

/**
 * Write one movement and move the counters with it.
 *
 * The counters are updated conditionally, so a movement that would take stock
 * below zero or reserve more than exists fails instead of being written. The
 * ledger row and the new counters are one transaction: there is no moment where
 * the count and its explanation disagree.
 */
export async function applyMove(tx: DbClient, actor: Actor | null, input: MoveInput): Promise<void> {
  const delta = moveDelta(input.kind, input.quantity);

  const updated = await tx
    .update(offerSkus)
    .set({
      stockOnHand: sql`${offerSkus.stockOnHand} + ${delta.onHand}`,
      stockReserved: sql`${offerSkus.stockReserved} + ${delta.reserved}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(offerSkus.id, input.skuId),
        sql`${offerSkus.stockOnHand} + ${delta.onHand} >= 0`,
        sql`${offerSkus.stockReserved} + ${delta.reserved} >= 0`,
        sql`${offerSkus.stockReserved} + ${delta.reserved} <= ${offerSkus.stockOnHand} + ${delta.onHand}`,
      ),
    )
    .returning({ id: offerSkus.id });
  if (updated.length === 0) {
    throw conflict('موجودی برای این تغییر کافی نیست.');
  }

  await tx.insert(inventoryMoves).values({
    offerSkuId: input.skuId,
    kind: input.kind,
    quantity: input.quantity,
    reasonFa: input.reasonFa ?? null,
    actorAccountId: actor?.accountId ?? null,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
  });
}

/** Receive stock, or correct a count, with a reason on the row. */
export async function recordStockMove(
  database: Database,
  actor: Actor,
  input: { skuId: string; kind: 'RECEIVE' | 'ADJUST' | 'RETURN'; quantity: number; reasonFa: string },
): Promise<SkuRow> {
  const sku = await loadSku(database, input.skuId);
  const offer = await loadOffer(database, sku.offerId);
  await assertSellerCapability(database, actor, offer.sellerId, 'STORE_OPERATE');

  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل این تغییر موجودی را بنویسید؛ در دفتر موجودی می‌ماند.');
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw validation('تعداد باید عددی غیر صفر باشد.');
  }
  if (input.kind !== 'ADJUST' && input.quantity < 0) {
    throw validation('برای کاهش موجودی از «اصلاح شمارش» استفاده کنید.');
  }

  await database.transaction(async (tx) => {
    await applyMove(tx, actor, {
      skuId: sku.id,
      kind: input.kind,
      quantity: input.quantity,
      reasonFa,
    });
  });
  return loadSku(database, sku.id);
}

export async function ledgerOf(database: DbClient, actor: Actor, skuId: string) {
  const sku = await loadSku(database, skuId);
  const offer = await loadOffer(database, sku.offerId);
  await assertSellerCapability(database, actor, offer.sellerId, 'STORE_VIEW');
  return database
    .select()
    .from(inventoryMoves)
    .where(eq(inventoryMoves.offerSkuId, skuId))
    .orderBy(desc(inventoryMoves.createdAt));
}

// ── reservations ───────────────────────────────────────────────────────────

export interface ReserveInput {
  readonly skuId: string;
  readonly quantity: number;
  readonly holdRef: string;
  readonly minutes: number;
}

/**
 * Hold stock for somebody who is checking out.
 *
 * The conditional update is the whole guard: two people racing for the last
 * item both try it, and the one that arrives second finds the condition false.
 * No read-then-write, and therefore no window between them.
 */
export async function reserveStock(
  database: Database,
  actor: Actor,
  input: ReserveInput,
): Promise<ReservationRow> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw validation('تعداد باید عددی مثبت باشد.');
  if (!Number.isInteger(input.minutes) || input.minutes <= 0) throw validation('مدت رزرو معتبر نیست.');

  const sku = await loadSku(database, input.skuId);
  const offer = await loadOffer(database, sku.offerId);
  if (offer.status !== 'ACTIVE') throw conflict('این عرضه در حال فروش نیست.');
  if (!sku.isActive) throw conflict('این قلم کالا در حال حاضر قابل خرید نیست.');

  return database.transaction(async (tx) => reserveStockIn(tx, actor, input));
}

/**
 * The same hold, taken inside a transaction the caller already owns.
 *
 * Placing an order reserves every one of its lines together with writing the
 * order itself: either the whole basket is held and recorded, or none of it is
 * and nothing was taken off the shelf.
 */
export async function reserveStockIn(
  tx: DbClient,
  actor: Actor,
  input: ReserveInput,
): Promise<ReservationRow> {
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);

  // Anything this basket was already holding on this line is released first,
  // so a repeated click holds one lot rather than two.
  await releaseExpiredFor(tx, input.skuId);

  let reservation: ReservationRow;
  try {
    const [row] = await tx
      .insert(stockReservations)
      .values({
        offerSkuId: input.skuId,
        holderAccountId: actor.accountId,
        holdRef: input.holdRef,
        quantity: input.quantity,
        expiresAt,
      })
      .returning();
    reservation = row!;
  } catch (error) {
    if (violates(error, 'stock_reservation_hold_key')) {
      throw conflict('برای همین سبد، این قلم از قبل رزرو شده است.');
    }
    throw error;
  }

  await applyMove(tx, actor, {
    skuId: input.skuId,
    kind: 'RESERVE',
    quantity: input.quantity,
    reasonFa: 'رزرو برای تکمیل خرید',
    refType: 'STOCK_RESERVATION',
    refId: reservation.id,
  });
  return reservation;
}

/** Give held stock back, whether the basket was abandoned or the hold expired. */
export async function releaseReservation(
  database: Database,
  actor: Actor | null,
  reservationId: string,
  reasonFa = 'آزادسازی رزرو',
): Promise<void> {
  const [reservation] = await database
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.id, reservationId))
    .limit(1);
  if (!reservation) throw notFound('این رزرو پیدا نشد.');
  if (reservation.status !== 'ACTIVE') return;

  await database.transaction(async (tx) => {
    const closed = await tx
      .update(stockReservations)
      .set({
        status: 'RELEASED',
        releasedAt: new Date(),
        version: reservation.version + 1,
      })
      .where(and(eq(stockReservations.id, reservation.id), eq(stockReservations.status, 'ACTIVE')))
      .returning({ id: stockReservations.id });
    if (closed.length === 0) return;

    await applyMove(tx, actor, {
      skuId: reservation.offerSkuId,
      kind: 'RELEASE',
      quantity: reservation.quantity,
      reasonFa,
      refType: 'STOCK_RESERVATION',
      refId: reservation.id,
    });
  });
}

/**
 * Turn a hold into a sale.
 *
 * Called by the order flow of the next prompt, inside its own transaction: the
 * goods and the hold that covered them leave together, so nothing is sold twice
 * and nothing stays reserved for an order that already happened.
 */
export async function consumeReservation(
  tx: DbClient,
  reservationId: string,
  refType: string,
  refId: string,
): Promise<void> {
  const [reservation] = await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.id, reservationId))
    .limit(1);
  if (!reservation || reservation.status !== 'ACTIVE') throw conflict('این رزرو دیگر فعال نیست.');

  const closed = await tx
    .update(stockReservations)
    .set({ status: 'CONSUMED', version: reservation.version + 1 })
    .where(and(eq(stockReservations.id, reservation.id), eq(stockReservations.status, 'ACTIVE')))
    .returning({ id: stockReservations.id });
  if (closed.length === 0) throw conflict('این رزرو در این فاصله تغییر کرده است.');

  await applyMove(tx, null, {
    skuId: reservation.offerSkuId,
    kind: 'SELL',
    quantity: reservation.quantity,
    reasonFa: 'فروش و تحویل قلم رزروشده',
    refType,
    refId,
  });
}

/**
 * Free the holds on one line whose moment has passed.
 *
 * Run wherever stock is about to be read or taken, so an expired hold never
 * blocks a sale even though nothing sweeps the table on a timer.
 */
export async function releaseExpiredFor(tx: DbClient, skuId: string, now: Date = new Date()): Promise<number> {
  const expired = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.offerSkuId, skuId),
        eq(stockReservations.status, 'ACTIVE'),
        lte(stockReservations.expiresAt, now),
      ),
    );

  let released = 0;
  for (const reservation of expired) {
    const closed = await tx
      .update(stockReservations)
      .set({ status: 'EXPIRED', releasedAt: now, version: reservation.version + 1 })
      .where(and(eq(stockReservations.id, reservation.id), eq(stockReservations.status, 'ACTIVE')))
      .returning({ id: stockReservations.id });
    if (closed.length === 0) continue;
    await applyMove(tx, null, {
      skuId,
      kind: 'RELEASE',
      quantity: reservation.quantity,
      reasonFa: 'مهلت رزرو گذشت',
      refType: 'STOCK_RESERVATION',
      refId: reservation.id,
    });
    released += 1;
  }
  return released;
}

/** The whole shop's expired holds, for an operator or a future worker. */
export async function releaseExpiredReservations(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select({ skuId: stockReservations.offerSkuId })
    .from(stockReservations)
    .where(and(eq(stockReservations.status, 'ACTIVE'), lte(stockReservations.expiresAt, now)));

  const lines = [...new Set(due.map((row) => row.skuId))];
  let released = 0;
  for (const skuId of lines) {
    released += await database.transaction((tx) => releaseExpiredFor(tx, skuId, now));
  }
  return released;
}

/** What can actually be bought on this line right now. */
export async function availableFor(database: Database, skuId: string, now: Date = new Date()): Promise<number> {
  await database.transaction((tx) => releaseExpiredFor(tx, skuId, now));
  const sku = await loadSku(database, skuId);
  return availableStock({ onHand: sku.stockOnHand, reserved: sku.stockReserved });
}

export const isReservationExpired = reservationExpired;

// ── reads ──────────────────────────────────────────────────────────────────

export interface SellerSkuRow {
  readonly id: string;
  readonly sku: string;
  readonly priceToman: bigint;
  readonly stockOnHand: number;
  readonly stockReserved: number;
  readonly available: number;
  readonly variantLabelFa: string | null;
  readonly productNameFa: string;
  readonly offerId: string;
  readonly offerStatus: string;
}

/** Everything this shop sells, for its own catalogue screen. */
export async function sellerCatalogue(
  database: DbClient,
  actor: Actor,
  sellerId: string,
): Promise<readonly SellerSkuRow[]> {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  const rows = await database
    .select({
      id: offerSkus.id,
      sku: offerSkus.sku,
      priceToman: offerSkus.priceToman,
      stockOnHand: offerSkus.stockOnHand,
      stockReserved: offerSkus.stockReserved,
      variantLabelFa: productVariants.labelFa,
      productNameFa: commerceProducts.nameFa,
      offerId: sellerOffers.id,
      offerStatus: sellerOffers.status,
    })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, sellerOffers.productId))
    .leftJoin(productVariants, eq(productVariants.id, offerSkus.variantId))
    .where(eq(sellerOffers.sellerId, sellerId))
    .orderBy(asc(commerceProducts.nameFa));

  return rows.map((row) => ({
    ...row,
    available: availableStock({ onHand: row.stockOnHand, reserved: row.stockReserved }),
  }));
}

export interface PublicOfferRow {
  readonly offerId: string;
  readonly skuId: string;
  readonly sellerId: string;
  readonly sellerNameFa: string;
  readonly priceToman: bigint;
  readonly available: number;
  readonly condition: string;
  readonly variantLabelFa: string | null;
  readonly shipsToWholeCountry: boolean;
}

/**
 * The offers on one product, as the public sees them.
 *
 * Only active offers of trading stores, and the seller's name is read from the
 * store rather than assumed. Nothing here knows which seller is the platform's
 * own, so nothing here can favour it.
 */
export async function publicOffersOf(
  database: DbClient,
  productId: string,
): Promise<readonly PublicOfferRow[]> {
  const rows = await database
    .select({
      offerId: sellerOffers.id,
      skuId: offerSkus.id,
      sellerId: commerceSellers.id,
      sellerNameFa: commerceSellers.displayNameFa,
      priceToman: offerSkus.priceToman,
      stockOnHand: offerSkus.stockOnHand,
      stockReserved: offerSkus.stockReserved,
      condition: sellerOffers.condition,
      variantLabelFa: productVariants.labelFa,
      shipsToWholeCountry: sellerOffers.shipsToWholeCountry,
    })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .innerJoin(commerceSellers, eq(commerceSellers.id, sellerOffers.sellerId))
    .leftJoin(productVariants, eq(productVariants.id, offerSkus.variantId))
    .where(
      and(
        eq(sellerOffers.productId, productId),
        eq(sellerOffers.status, 'ACTIVE'),
        eq(commerceSellers.status, 'ACTIVE'),
        eq(offerSkus.isActive, true),
      ),
    );

  return rows.map((row) => ({
    offerId: row.offerId,
    skuId: row.skuId,
    sellerId: row.sellerId,
    sellerNameFa: row.sellerNameFa ?? 'فروشگاه',
    priceToman: row.priceToman,
    available: availableStock({ onHand: row.stockOnHand, reserved: row.stockReserved }),
    condition: row.condition,
    variantLabelFa: row.variantLabelFa,
    shipsToWholeCountry: row.shipsToWholeCountry,
  }));
}

/** This shop's offers, for its own screens. */
export async function offersOfSeller(database: DbClient, actor: Actor, sellerId: string) {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  return database
    .select({
      id: sellerOffers.id,
      productId: sellerOffers.productId,
      productNameFa: commerceProducts.nameFa,
      productStatus: commerceProducts.status,
      status: sellerOffers.status,
      condition: sellerOffers.condition,
      version: sellerOffers.version,
    })
    .from(sellerOffers)
    .innerJoin(commerceProducts, eq(commerceProducts.id, sellerOffers.productId))
    .where(eq(sellerOffers.sellerId, sellerId))
    .orderBy(asc(commerceProducts.nameFa));
}
