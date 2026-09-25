/**
 * The basket, and the moment it becomes an order — PROMPT-010.
 *
 * A basket stores quantities, not prices. What it costs is read from the
 * catalogue every time it is opened, because a price somebody saw last week is
 * not a price they are owed, and because a basket that quietly remembers an
 * old figure is a basket that eventually charges one.
 *
 * Everything becomes fixed at one point and only there: `placeOrder`. It
 * re-reads every line against the shop, the offer, the stock and the delivery
 * charge; it tells the buyer what moved since they last looked; it refuses to
 * go on unless the buyer has confirmed the exact figure it is about to charge;
 * and it holds the stock and writes the order in one transaction, so nothing
 * is taken off a shelf for an order that was not recorded.
 */
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  cartItems,
  commerceOrderItems,
  commerceOrders,
  commerceSubOrders,
  shoppingCarts,
  subOrderEvents,
} from '../db/schema/orders.ts';
import {
  commerceProducts,
  offerSkus,
  productCategories,
  productMedia,
  productVariants,
  sellerOffers,
} from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { residences } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { assertFlagEnabled } from '../marketplace/flags.ts';
import type { Actor } from '../authz/actor.ts';
import { availableStock } from './catalog-model.ts';
import { releaseExpiredFor, releaseReservation, reserveStockIn } from './inventory.ts';
import { tradingTerms } from './plans.ts';
import {
  CHECKOUT_HOLD_MINUTES,
  checkoutBlocked,
  confirmationMatches,
  lineTotal,
  orderMoney,
  orderReference,
  shippingFor,
  subOrderMoney,
  subOrderReference,
  type BasketChange,
  type SubOrderMoney,
} from './order-model.ts';

export type CartRow = typeof shoppingCarts.$inferSelect;
export type OrderRow = typeof commerceOrders.$inferSelect;
export type SubOrderRow = typeof commerceSubOrders.$inferSelect;
export type OrderItemRow = typeof commerceOrderItems.$inferSelect;

/** One line of the basket, priced as it reads right now. */
export interface CartLine {
  readonly itemId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly unitPriceToman: bigint;
  readonly lineTotalToman: bigint;
  readonly available: number;
  readonly buyable: boolean;
  readonly reasonFa: string | null;
  readonly productId: string;
  readonly productNameFa: string;
  readonly brandFa: string | null;
  readonly variantLabelFa: string | null;
  readonly skuCode: string;
  readonly conditionCode: string;
  readonly imageFileId: string | null;
  readonly sellerId: string;
  readonly sellerNameFa: string;
  readonly sellerSlug: string | null;
  readonly productSlug: string;
}

/** One shop's part of the basket, with its own delivery charge and total. */
export interface CartGroup {
  readonly sellerId: string;
  readonly sellerNameFa: string;
  readonly lines: readonly CartLine[];
  readonly itemsTotalToman: bigint;
  /** Null when this shop has never said what it charges to deliver. */
  readonly shippingToman: bigint | null;
  readonly shippingWaived: boolean;
  readonly freeShippingThresholdToman: bigint | null;
  readonly buyerTotalToman: bigint;
  readonly sellerTrading: boolean;
}

export interface CartView {
  readonly cartId: string | null;
  readonly groups: readonly CartGroup[];
  readonly itemsTotalToman: bigint;
  readonly shippingTotalToman: bigint;
  readonly grandTotalToman: bigint;
  readonly changes: readonly BasketChange[];
  readonly blocked: boolean;
  readonly empty: boolean;
}

/** Find this person's open basket, or make one. */
export async function openCart(database: Database, actor: Actor): Promise<CartRow> {
  if (!actor.accountId) throw forbidden('برای خرید باید وارد حساب شوید.');
  const [existing] = await database
    .select()
    .from(shoppingCarts)
    .where(and(eq(shoppingCarts.accountId, actor.accountId), eq(shoppingCarts.status, 'ACTIVE')))
    .limit(1);
  if (existing) return existing;

  // Two tabs pressing "add to basket" at the same moment both try this; the
  // partial unique index decides, and the loser reads the winner's basket.
  const inserted = await database
    .insert(shoppingCarts)
    .values({ accountId: actor.accountId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const [raced] = await database
    .select()
    .from(shoppingCarts)
    .where(and(eq(shoppingCarts.accountId, actor.accountId), eq(shoppingCarts.status, 'ACTIVE')))
    .limit(1);
  if (!raced) throw conflict('سبد خرید باز نشد؛ دوباره تلاش کنید.');
  return raced;
}

const MAX_LINE_QUANTITY = 20;

/**
 * Put something in the basket, or change how many of it.
 *
 * Nothing is held here. A basket is an intention, and holding stock for every
 * intention would make the shop look empty to everybody who had not yet
 * decided. The hold happens once, at checkout, for as long as a payment takes.
 */
export async function setCartLine(
  database: Database,
  actor: Actor,
  input: { skuId: string; quantity: number },
): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) throw validation('تعداد معتبر نیست.');
  if (input.quantity > MAX_LINE_QUANTITY) {
    throw validation('در هر سفارش حداکثر ' + MAX_LINE_QUANTITY.toLocaleString('fa-IR') + ' عدد از یک قلم.');
  }
  const cart = await openCart(database, actor);

  if (input.quantity === 0) {
    await database.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.offerSkuId, input.skuId)));
    return;
  }

  const [sku] = await database
    .select({ id: offerSkus.id, isActive: offerSkus.isActive, offerStatus: sellerOffers.status })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(eq(offerSkus.id, input.skuId))
    .limit(1);
  if (!sku) throw notFound('این قلم کالا پیدا نشد.');
  // A line that could never be bought does not go in: the basket is allowed to
  // hold things that later become unavailable, not things that already are.
  if (!sku.isActive || sku.offerStatus !== 'ACTIVE') throw conflict('این قلم در حال حاضر قابل خرید نیست.');

  await database
    .insert(cartItems)
    .values({ cartId: cart.id, offerSkuId: input.skuId, quantity: input.quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.offerSkuId],
      set: { quantity: input.quantity, updatedAt: new Date() },
    });
}

export async function clearCart(database: Database, actor: Actor): Promise<void> {
  const cart = await openCart(database, actor);
  await database.delete(cartItems).where(eq(cartItems.cartId, cart.id));
}

/**
 * Read the basket as it stands, priced now, grouped by shop.
 *
 * Expired holds on each line are released first, so what the buyer is told is
 * available is what is actually available rather than what an abandoned basket
 * somewhere else is still nominally sitting on.
 */
export async function viewCart(database: Database, actor: Actor): Promise<CartView> {
  if (!actor.accountId) return emptyCart(null);
  const [cart] = await database
    .select()
    .from(shoppingCarts)
    .where(and(eq(shoppingCarts.accountId, actor.accountId), eq(shoppingCarts.status, 'ACTIVE')))
    .limit(1);
  if (!cart) return emptyCart(null);

  const rows = await database
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      skuId: offerSkus.id,
      skuCode: offerSkus.sku,
      priceToman: offerSkus.priceToman,
      stockOnHand: offerSkus.stockOnHand,
      stockReserved: offerSkus.stockReserved,
      skuActive: offerSkus.isActive,
      offerStatus: sellerOffers.status,
      conditionCode: sellerOffers.condition,
      variantLabelFa: productVariants.labelFa,
      productId: commerceProducts.id,
      productNameFa: commerceProducts.nameFa,
      productSlug: commerceProducts.slug,
      brandFa: commerceProducts.brandFa,
      productStatus: commerceProducts.status,
      salePolicy: productCategories.salePolicy,
      sellerId: commerceSellers.id,
      sellerNameFa: commerceSellers.displayNameFa,
      sellerSlug: commerceSellers.slug,
      sellerStatus: commerceSellers.status,
      shippingFeeToman: commerceSellers.shippingFeeToman,
      freeShippingThresholdToman: commerceSellers.freeShippingThresholdToman,
    })
    .from(cartItems)
    .innerJoin(offerSkus, eq(offerSkus.id, cartItems.offerSkuId))
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, sellerOffers.productId))
    .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
    .innerJoin(commerceSellers, eq(commerceSellers.id, sellerOffers.sellerId))
    .leftJoin(productVariants, eq(productVariants.id, offerSkus.variantId))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(commerceSellers.displayNameFa, commerceProducts.nameFa);

  if (rows.length === 0) return emptyCart(cart.id);

  // Free whatever has timed out before deciding what is available.
  await Promise.all(rows.map((row) => releaseExpiredFor(database, row.skuId)));
  const fresh = await database
    .select({ id: offerSkus.id, stockOnHand: offerSkus.stockOnHand, stockReserved: offerSkus.stockReserved })
    .from(offerSkus)
    .where(inArray(offerSkus.id, rows.map((row) => row.skuId)));
  const stock = new Map(
    fresh.map((row) => [row.id, availableStock({ onHand: row.stockOnHand, reserved: row.stockReserved })]),
  );

  const images = await productImages(database, rows.map((row) => row.productId));
  const trading = await tradingSellers(database, rows.map((row) => row.sellerId));

  const changes: BasketChange[] = [];
  const bySeller = new Map<string, { rows: typeof rows; lines: CartLine[] }>();

  for (const row of rows) {
    const available = stock.get(row.skuId) ?? 0;
    const sellerTrading = trading.has(row.sellerId);
    let reasonFa: string | null = null;

    if (row.productStatus !== 'PUBLISHED' || row.salePolicy !== 'ALLOWED' || !row.skuActive || row.offerStatus !== 'ACTIVE') {
      reasonFa = 'این قلم دیگر در فروشگاه عرضه نمی‌شود.';
      changes.push({
        kind: 'UNAVAILABLE',
        skuId: row.skuId,
        sellerId: row.sellerId,
        labelFa: row.productNameFa,
        detailFa: reasonFa,
        blocking: true,
      });
    } else if (!sellerTrading) {
      reasonFa = 'این فروشگاه در حال حاضر فروش فعال ندارد.';
      changes.push({
        kind: 'SELLER_UNAVAILABLE',
        skuId: row.skuId,
        sellerId: row.sellerId,
        labelFa: row.sellerNameFa ?? 'فروشگاه',
        detailFa: reasonFa,
        blocking: true,
      });
    } else if (available < row.quantity) {
      reasonFa =
        'موجودی این قلم ' + available.toLocaleString('fa-IR') + ' عدد است و شما ' + row.quantity.toLocaleString('fa-IR') + ' عدد خواسته‌اید.';
      changes.push({
        kind: 'STOCK_SHORT',
        skuId: row.skuId,
        sellerId: row.sellerId,
        labelFa: row.productNameFa,
        detailFa: reasonFa,
        blocking: true,
      });
    }

    const line: CartLine = {
      itemId: row.itemId,
      skuId: row.skuId,
      quantity: row.quantity,
      unitPriceToman: row.priceToman,
      lineTotalToman: lineTotal({ unitPriceToman: row.priceToman, quantity: row.quantity }),
      available,
      buyable: reasonFa === null,
      reasonFa,
      productId: row.productId,
      productNameFa: row.productNameFa,
      brandFa: row.brandFa,
      variantLabelFa: row.variantLabelFa,
      skuCode: row.skuCode,
      conditionCode: row.conditionCode,
      imageFileId: images.get(row.productId) ?? null,
      sellerId: row.sellerId,
      sellerNameFa: row.sellerNameFa ?? 'فروشگاه',
      sellerSlug: row.sellerSlug,
      productSlug: row.productSlug,
    };
    const bucket = bySeller.get(row.sellerId) ?? { rows: [] as unknown as typeof rows, lines: [] };
    bucket.lines.push(line);
    bySeller.set(row.sellerId, bucket);
  }

  const sellerFacts = new Map(rows.map((row) => [row.sellerId, row]));
  const groups: CartGroup[] = [];
  for (const [sellerId, bucket] of bySeller) {
    const facts = sellerFacts.get(sellerId)!;
    const itemsTotalToman = bucket.lines.reduce((sum, line) => sum + line.lineTotalToman, 0n);
    const shipping = shippingFor({
      feeToman: facts.shippingFeeToman,
      freeThresholdToman: facts.freeShippingThresholdToman,
      itemsTotalToman,
    });
    if (shipping === null && trading.has(sellerId)) {
      changes.push({
        kind: 'SHIPPING_UNKNOWN',
        skuId: null,
        sellerId,
        labelFa: facts.sellerNameFa ?? 'فروشگاه',
        detailFa: 'این فروشگاه هزینه ارسال خود را اعلام نکرده و تا اعلام آن، خرید از آن ممکن نیست.',
        blocking: true,
      });
    }
    groups.push({
      sellerId,
      sellerNameFa: facts.sellerNameFa ?? 'فروشگاه',
      lines: bucket.lines,
      itemsTotalToman,
      shippingToman: shipping?.toman ?? null,
      shippingWaived: shipping?.waived ?? false,
      freeShippingThresholdToman: facts.freeShippingThresholdToman,
      buyerTotalToman: itemsTotalToman + (shipping?.toman ?? 0n),
      sellerTrading: trading.has(sellerId),
    });
  }

  const itemsTotalToman = groups.reduce((sum, group) => sum + group.itemsTotalToman, 0n);
  const shippingTotalToman = groups.reduce((sum, group) => sum + (group.shippingToman ?? 0n), 0n);
  return {
    cartId: cart.id,
    groups,
    itemsTotalToman,
    shippingTotalToman,
    grandTotalToman: itemsTotalToman + shippingTotalToman,
    changes,
    blocked: checkoutBlocked(changes),
    empty: false,
  };
}

const emptyCart = (cartId: string | null): CartView => ({
  cartId,
  groups: [],
  itemsTotalToman: 0n,
  shippingTotalToman: 0n,
  grandTotalToman: 0n,
  changes: [],
  blocked: false,
  empty: true,
});

/** The first picture of each product, for the basket to show. */
async function productImages(
  database: DbClient,
  productIds: readonly string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await database
    .select({ productId: productMedia.productId, fileId: productMedia.fileId, position: productMedia.sortOrder })
    .from(productMedia)
    .where(inArray(productMedia.productId, [...new Set(productIds)]))
    .orderBy(productMedia.productId, productMedia.sortOrder);
  const first = new Map<string, string>();
  for (const row of rows) if (!first.has(row.productId)) first.set(row.productId, row.fileId);
  return first;
}

/** Which of these shops are actually open for business right now. */
async function tradingSellers(database: Database, sellerIds: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(sellerIds)];
  const open = new Set<string>();
  for (const sellerId of unique) {
    const [seller] = await database
      .select({ status: commerceSellers.status })
      .from(commerceSellers)
      .where(eq(commerceSellers.id, sellerId))
      .limit(1);
    if (seller?.status !== 'ACTIVE') continue;
    if ((await tradingTerms(database, sellerId)) !== null) open.add(sellerId);
  }
  return open;
}

export interface DeliveryInput {
  readonly recipientNameFa: string;
  readonly recipientPhone: string;
  readonly provinceFa?: string | null;
  readonly cityFa?: string | null;
  readonly addressFa: string;
  readonly postalCode?: string | null;
  readonly noteFa?: string | null;
}

/** What the profile already knows, so the buyer is not asked twice. */
export async function deliveryDefaults(
  database: DbClient,
  accountId: string,
): Promise<{ provinceFa: string | null; cityFa: string | null; addressFa: string | null; postalCode: string | null }> {
  const [row] = await database
    .select({
      province: residences.province,
      city: residences.city,
      address: residences.address,
      postalCode: residences.postalCode,
    })
    .from(residences)
    .where(eq(residences.accountId, accountId))
    .limit(1);
  return {
    provinceFa: row?.province ?? null,
    cityFa: row?.city ?? null,
    addressFa: row?.address ?? null,
    postalCode: row?.postalCode ?? null,
  };
}

function validDelivery(input: DeliveryInput): DeliveryInput {
  const name = input.recipientNameFa.trim();
  const phone = input.recipientPhone.trim();
  const address = input.addressFa.trim();
  if (name.length < 3) throw validation('نام گیرنده را کامل بنویسید.');
  if (!/^09\d{9}$/.test(phone)) throw validation('شماره تماس گیرنده معتبر نیست.');
  if (address.length < 10) throw validation('نشانی تحویل را کامل‌تر بنویسید.');
  const postalCode = (input.postalCode ?? '').trim();
  if (postalCode.length > 0 && !/^\d{10}$/.test(postalCode)) throw validation('کد پستی باید ۱۰ رقم باشد.');
  return {
    recipientNameFa: name,
    recipientPhone: phone,
    provinceFa: (input.provinceFa ?? '').trim() || null,
    cityFa: (input.cityFa ?? '').trim() || null,
    addressFa: address,
    postalCode: postalCode || null,
    noteFa: (input.noteFa ?? '').trim() || null,
  };
}

export interface PlacedOrder {
  readonly order: OrderRow;
  readonly subOrders: readonly SubOrderRow[];
}

/**
 * Turn the basket into an order and hold the stock behind it.
 *
 * Three refusals happen before anything is written, in this order, because
 * each makes the next meaningful: the shop must be open at all, the basket
 * must be buyable as it stands, and the buyer must have confirmed the exact
 * figure this is about to charge. That last one is why a price that moves
 * between the basket page and this call stops the checkout instead of
 * silently charging the newer number — a buyer agreed to an amount, not to
 * whatever the amount becomes.
 *
 * Then the order, its sub-orders, its item snapshots and the holds on every
 * line are written in one transaction. The conditional update inside the hold
 * is what makes two buyers racing for the last bag resolve: one of them gets a
 * conflict here and no order at all, rather than both getting one.
 */
export async function placeOrder(
  database: Database,
  actor: Actor,
  input: { delivery: DeliveryInput; confirmedTotalToman: bigint | null },
): Promise<PlacedOrder> {
  if (!actor.accountId) throw forbidden('برای ثبت سفارش باید وارد حساب شوید.');
  await assertFlagEnabled(database, 'market.flag.commerce_checkout_enabled');

  const delivery = validDelivery(input.delivery);
  const view = await viewCart(database, actor);
  if (view.empty) throw validation('سبد خرید خالی است.');
  if (view.blocked) {
    throw conflict('سبد خرید تغییر کرده است؛ تغییرها را ببینید و دوباره تأیید کنید.', {
      changes: view.changes.map((change) => change.detailFa),
    });
  }
  if (!confirmationMatches(input.confirmedTotalToman, view.grandTotalToman)) {
    throw conflict('مبلغ سبد با مبلغی که تأیید کرده‌اید یکی نیست؛ مبلغ تازه را ببینید و دوباره تأیید کنید.', {
      currentToman: view.grandTotalToman.toString(),
    });
  }

  // The commission each shop is on, read now and frozen onto its sub-order.
  const terms = new Map<string, { subscriptionId: string | null; percentBp: number; minimumToman: bigint | null }>();
  for (const group of view.groups) {
    const term = await tradingTerms(database, group.sellerId);
    if (term === null) throw conflict('این فروشگاه در حال حاضر فروش فعال ندارد.');
    terms.set(group.sellerId, term);
  }

  const now = new Date();
  const reference = orderReference(now, randomBytes(6).toString('hex'));
  const holdsExpireAt = new Date(now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000);

  const money: SubOrderMoney[] = view.groups.map((group) =>
    subOrderMoney({
      lines: group.lines.map((line) => ({ unitPriceToman: line.unitPriceToman, quantity: line.quantity })),
      shippingToman: group.shippingToman ?? 0n,
      commissionPercentBp: terms.get(group.sellerId)!.percentBp,
      commissionMinimumToman: terms.get(group.sellerId)!.minimumToman,
    }),
  );
  const totals = orderMoney(money);
  if (totals.grandTotalToman !== view.grandTotalToman) {
    throw conflict('محاسبه مبلغ سفارش با آنچه نشان داده شده یکی نیست؛ صفحه را دوباره باز کنید.');
  }

  return database.transaction(async (tx) => {
    const [order] = await tx
      .insert(commerceOrders)
      .values({
        buyerAccountId: actor.accountId!,
        reference,
        itemsTotalToman: totals.itemsTotalToman,
        discountTotalToman: totals.discountTotalToman,
        shippingTotalToman: totals.shippingTotalToman,
        grandTotalToman: totals.grandTotalToman,
        recipientNameFa: delivery.recipientNameFa,
        recipientPhone: delivery.recipientPhone,
        provinceFa: delivery.provinceFa ?? null,
        cityFa: delivery.cityFa ?? null,
        addressFa: delivery.addressFa,
        postalCode: delivery.postalCode ?? null,
        noteFa: delivery.noteFa ?? null,
        holdsExpireAt,
      })
      .returning();

    const subOrders: SubOrderRow[] = [];
    for (const [index, group] of view.groups.entries()) {
      const figures = money[index]!;
      const term = terms.get(group.sellerId)!;
      const [subOrder] = await tx
        .insert(commerceSubOrders)
        .values({
          orderId: order!.id,
          sellerId: group.sellerId,
          reference: subOrderReference(reference, index),
          itemsTotalToman: figures.itemsTotalToman,
          discountToman: figures.discountToman,
          shippingToman: figures.shippingToman,
          buyerTotalToman: figures.buyerTotalToman,
          subscriptionId: term.subscriptionId,
          commissionPercentBp: term.percentBp,
          commissionToman: figures.commissionToman,
          payoutToman: figures.payoutToman,
          shippingWaived: group.shippingWaived,
        })
        .returning();
      subOrders.push(subOrder!);

      for (const line of group.lines) {
        // The hold and the line it covers are written together. If the last
        // bag went to somebody else a moment ago, this throws and the whole
        // order — every shop in it — is rolled back rather than half-placed.
        const reservation = await reserveStockIn(tx, actor, {
          skuId: line.skuId,
          quantity: line.quantity,
          holdRef: order!.id,
          minutes: CHECKOUT_HOLD_MINUTES,
        });
        await tx.insert(commerceOrderItems).values({
          subOrderId: subOrder!.id,
          offerSkuId: line.skuId,
          productId: line.productId,
          reservationId: reservation.id,
          quantity: line.quantity,
          unitPriceToman: line.unitPriceToman,
          discountToman: 0n,
          lineTotalToman: line.lineTotalToman,
          productNameFa: line.productNameFa,
          brandFa: line.brandFa,
          variantLabelFa: line.variantLabelFa,
          skuCode: line.skuCode,
          conditionCode: line.conditionCode,
          sellerNameFa: line.sellerNameFa,
          imageFileId: line.imageFileId,
        });
      }

      await tx.insert(subOrderEvents).values({
        subOrderId: subOrder!.id,
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        actorAccountId: actor.accountId,
        reasonFa: 'ثبت سفارش',
      });
    }

    // The basket closes here rather than emptying, so the lines that became
    // this order stay with it and the next basket starts clean.
    await tx
      .update(shoppingCarts)
      .set({ status: 'CHECKED_OUT', updatedAt: new Date() })
      .where(eq(shoppingCarts.id, view.cartId!));

    await recordAudit(tx, actor, {
      action: 'COMMERCE_ORDER_PLACED',
      targetType: 'COMMERCE_ORDER',
      targetId: order!.id,
      after: {
        reference,
        sellers: view.groups.length,
        grandTotalToman: totals.grandTotalToman.toString(),
        holdsExpireAt: holdsExpireAt.toISOString(),
      },
    });

    return { order: order!, subOrders };
  });
}

/**
 * Give up on an unpaid order and put the goods back on the shelf.
 *
 * Called by the buyer, and by the sweep that finds orders whose holds have run
 * out. A paid order is never cancelled this way: money has moved, so what
 * happens next is a refund, which is a different thing with a different record.
 */
export async function cancelUnpaidOrder(
  database: Database,
  actor: Actor | null,
  orderId: string,
  reasonFa: string,
): Promise<boolean> {
  const [order] = await database.select().from(commerceOrders).where(eq(commerceOrders.id, orderId)).limit(1);
  if (!order) throw notFound('این سفارش پیدا نشد.');
  if (actor?.accountId && order.buyerAccountId !== actor.accountId) {
    throw forbidden('این سفارش متعلق به شما نیست.');
  }
  if (order.status === 'CANCELLED') return false;
  if (order.status !== 'PENDING_PAYMENT') throw conflict('این سفارش پرداخت شده و لغو آن از این مسیر ممکن نیست.');

  const [cancelled] = await database
    .update(commerceOrders)
    .set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReasonFa: reasonFa,
      version: order.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(commerceOrders.id, order.id), eq(commerceOrders.status, 'PENDING_PAYMENT')))
    .returning({ id: commerceOrders.id });
  if (!cancelled) return false;

  const items = await database
    .select({ reservationId: commerceOrderItems.reservationId })
    .from(commerceOrderItems)
    .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, commerceOrderItems.subOrderId))
    .where(eq(commerceSubOrders.orderId, order.id));
  for (const item of items) {
    if (item.reservationId) await releaseReservation(database, actor, item.reservationId, 'لغو سفارش پرداخت‌نشده');
  }

  await database
    .update(commerceSubOrders)
    .set({ status: 'CANCELLED', statusReasonFa: reasonFa, updatedAt: new Date() })
    .where(and(eq(commerceSubOrders.orderId, order.id), eq(commerceSubOrders.status, 'PENDING_PAYMENT')));

  await recordAudit(database, actor, {
    action: 'COMMERCE_ORDER_CANCELLED',
    targetType: 'COMMERCE_ORDER',
    targetId: order.id,
    before: { status: order.status },
    after: { status: 'CANCELLED', reasonFa },
  });
  return true;
}

/**
 * Clear away orders nobody ever paid for.
 *
 * Read-time expiry frees the stock already, so this is about the order rows
 * rather than the shelf: an order that says «در انتظار پرداخت» a week later,
 * with nothing held behind it, is a lie the buyer's own history would tell.
 */
export async function cancelExpiredOrders(database: Database, now: Date = new Date()): Promise<number> {
  const stale = await database
    .select({ id: commerceOrders.id })
    .from(commerceOrders)
    .where(and(eq(commerceOrders.status, 'PENDING_PAYMENT'), sql`${commerceOrders.holdsExpireAt} <= ${now}`))
    .limit(200);
  let cancelled = 0;
  for (const row of stale) {
    if (await cancelUnpaidOrder(database, null, row.id, 'مهلت پرداخت این سفارش تمام شد.')) cancelled += 1;
  }
  return cancelled;
}

/** The orders this person placed, newest first. */
export async function myOrders(database: DbClient, actor: Actor) {
  if (!actor.accountId) throw forbidden('برای دیدن سفارش‌ها باید وارد حساب شوید.');
  return database
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.buyerAccountId, actor.accountId))
    .orderBy(desc(commerceOrders.createdAt))
    .limit(50);
}
