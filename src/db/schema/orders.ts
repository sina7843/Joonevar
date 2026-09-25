/**
 * The basket, the order and each seller's part of it — PROMPT-010.
 *
 * One basket can hold goods from several shops, and the buyer pays once. What
 * happens afterwards does not: two sellers in one basket have nothing to do
 * with each other, so accepting, preparing, shipping, returning and refunding
 * all belong to the **sub-order**, and the parent order holds only the single
 * payment and the address the goods are going to.
 *
 * Money is exact because the parent is a sum, not a share. Every figure —
 * line totals, the discount on a line, the shop's delivery charge, the
 * platform's commission — is computed and stored on the sub-order it belongs
 * to, and the order's grand total is the sum of those. Nothing is distributed
 * proportionally, so nothing has to be rounded and nothing can fail to add up.
 *
 * The item rows are snapshots and stay that way. A seller renaming a product,
 * repricing a SKU or archiving an offer afterwards changes nothing about what
 * somebody already bought, because what they bought is written here rather
 * than read back through the catalogue.
 */
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cartStatus, commerceOrderStatus, commerceSubOrderStatus } from './enums.ts';
import { accounts, storedFiles } from './core.ts';
import { commerceSellers, sellerSubscriptions } from './commerce.ts';
import { commerceProducts, offerSkus, stockReservations } from './catalog.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/**
 * A basket that survives the browser being closed.
 *
 * One is open per account at a time. Checking out closes it rather than
 * emptying it, so the lines that became an order stay where they were and a
 * new basket starts clean.
 */
export const shoppingCarts = pgTable(
  'shopping_cart',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: cartStatus('status').notNull().default('ACTIVE'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One open basket per person, decided by the database rather than by a
    // check that two tabs could both pass.
    uniqueIndex('shopping_cart_open_key').on(t.accountId).where(sql`${t.status} = 'ACTIVE'`),
    index('shopping_cart_account_idx').on(t.accountId, t.status),
  ],
);

/**
 * One line of a basket.
 *
 * It stores a quantity and nothing else about money: a basket shows today's
 * price, read from the SKU each time it is opened, because a price somebody
 * saw last week is not a price they are owed. The figures become fixed only
 * when an order is placed.
 */
export const cartItems = pgTable(
  'cart_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => shoppingCarts.id, { onDelete: 'cascade' }),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('cart_item_line_key').on(t.cartId, t.offerSkuId),
    index('cart_item_cart_idx').on(t.cartId),
    check('cart_item_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/**
 * The order the buyer placed, and the one payment that covers it.
 *
 * The delivery address is copied onto the row instead of referenced, for the
 * same reason the item lines are: where a parcel was sent is a fact about that
 * order, and editing a profile afterwards must not rewrite it.
 */
export const commerceOrders = pgTable(
  'commerce_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerAccountId: uuid('buyer_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Short, human-quotable, and unique — what support asks for on the phone. */
    reference: text('reference').notNull(),
    status: commerceOrderStatus('status').notNull().default('PENDING_PAYMENT'),
    /** The single batch that pays for every sub-order at once. */
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),

    /** The sum of the sub-orders, which is the sum of their own figures. */
    itemsTotalToman: bigint('items_total_toman', { mode: 'bigint' }).notNull(),
    discountTotalToman: bigint('discount_total_toman', { mode: 'bigint' }).notNull(),
    shippingTotalToman: bigint('shipping_total_toman', { mode: 'bigint' }).notNull(),
    grandTotalToman: bigint('grand_total_toman', { mode: 'bigint' }).notNull(),

    recipientNameFa: text('recipient_name_fa').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    provinceFa: text('province_fa'),
    cityFa: text('city_fa'),
    addressFa: text('address_fa').notNull(),
    postalCode: text('postal_code'),
    noteFa: text('note_fa'),

    /** Until this moment the holds behind the lines are alive and payment can be retried. */
    holdsExpireAt: timestamp('holds_expire_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReasonFa: text('cancel_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('commerce_order_reference_key').on(t.reference),
    // One order per payment batch: a batch cannot be made to pay for two.
    uniqueIndex('commerce_order_batch_key').on(t.paymentBatchId),
    index('commerce_order_buyer_idx').on(t.buyerAccountId, t.createdAt),
    index('commerce_order_status_idx').on(t.status, t.holdsExpireAt),
    check(
      'commerce_order_totals_non_negative',
      sql`${t.itemsTotalToman} >= 0 and ${t.discountTotalToman} >= 0 and ${t.shippingTotalToman} >= 0 and ${t.grandTotalToman} > 0`,
    ),
    // The arithmetic itself, written where nothing can route around it.
    check(
      'commerce_order_total_adds_up',
      sql`${t.grandTotalToman} = ${t.itemsTotalToman} - ${t.discountTotalToman} + ${t.shippingTotalToman}`,
    ),
  ],
);

/**
 * One seller's part of one order.
 *
 * This is where everything after the payment happens, and where the commission
 * is frozen. The percentage comes from the subscription the store was actually
 * on when the order was placed — the terms they agreed to — so a plan
 * published next month does not reach backwards into money already taken.
 */
export const commerceSubOrders = pgTable(
  'commerce_suborder',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => commerceOrders.id, { onDelete: 'cascade' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    reference: text('reference').notNull(),
    status: commerceSubOrderStatus('status').notNull().default('PENDING_PAYMENT'),

    itemsTotalToman: bigint('items_total_toman', { mode: 'bigint' }).notNull(),
    discountToman: bigint('discount_toman', { mode: 'bigint' }).notNull(),
    shippingToman: bigint('shipping_toman', { mode: 'bigint' }).notNull(),
    /** What the buyer pays for this shop's part: items − discount + delivery. */
    buyerTotalToman: bigint('buyer_total_toman', { mode: 'bigint' }).notNull(),

    /** Frozen from the store's live subscription at checkout, with the row it came from. */
    subscriptionId: uuid('subscription_id').references(() => sellerSubscriptions.id, { onDelete: 'set null' }),
    commissionPercentBp: integer('commission_percent_bp').notNull(),
    commissionToman: bigint('commission_toman', { mode: 'bigint' }).notNull(),
    /** What the shop is owed once the money is settled: buyer total − commission. */
    payoutToman: bigint('payout_toman', { mode: 'bigint' }).notNull(),

    /** Shipping was free on this one because the basket passed the shop's threshold. */
    shippingWaived: boolean('shipping_waived').notNull().default(false),

    /**
     * The delivery the buyer chose, frozen — PROMPT-011.
     *
     * The method is referenced so it can be looked up, and its name, kind and
     * promise are copied, because a shop renaming or retiring a method must
     * not rewrite what somebody was told when they paid.
     */
    shippingMethodId: uuid('shipping_method_id'),
    shippingMethodLabelFa: text('shipping_method_label_fa'),
    shippingMethodKindCode: text('shipping_method_kind_code'),
    preparationDays: integer('preparation_days'),
    /** The moment the shop promised to have it ready by, from that promise. */
    preparationDueAt: timestamp('preparation_due_at', { withTimezone: true }),
    /** How the delivery came to be known: the buyer, the shop, or an operator. */
    deliveryConfirmedBy: text('delivery_confirmed_by'),
    deliveryEvidenceNoteFa: text('delivery_evidence_note_fa'),
    /** After this, the return window has closed and the money may settle. */
    returnWindowEndsAt: timestamp('return_window_ends_at', { withTimezone: true }),

    /** After this moment an unanswered sub-order cancels itself and refunds. */
    acceptanceDueAt: timestamp('acceptance_due_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    trackingCode: text('tracking_code'),
    statusReasonFa: text('status_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('commerce_suborder_reference_key').on(t.reference),
    // One shop appears once in one order; a second line from the same shop
    // joins that sub-order instead of opening another.
    uniqueIndex('commerce_suborder_seller_key').on(t.orderId, t.sellerId),
    index('commerce_suborder_seller_idx').on(t.sellerId, t.status),
    index('commerce_suborder_due_idx').on(t.status, t.acceptanceDueAt),
    check(
      'commerce_suborder_money_non_negative',
      sql`${t.itemsTotalToman} >= 0 and ${t.discountToman} >= 0 and ${t.shippingToman} >= 0 and ${t.buyerTotalToman} > 0 and ${t.commissionToman} >= 0 and ${t.payoutToman} >= 0`,
    ),
    check(
      'commerce_suborder_total_adds_up',
      sql`${t.buyerTotalToman} = ${t.itemsTotalToman} - ${t.discountToman} + ${t.shippingToman}`,
    ),
    // The platform's share and the shop's share are the whole of it, always.
    check('commerce_suborder_shares_add_up', sql`${t.commissionToman} + ${t.payoutToman} = ${t.buyerTotalToman}`),
    check(
      'commerce_suborder_percent_range',
      sql`${t.commissionPercentBp} >= 0 and ${t.commissionPercentBp} <= 10000`,
    ),
  ],
);

/**
 * One line of one sub-order, as it was at the moment of buying.
 *
 * Everything the buyer needs to recognise what they bought is copied here.
 * The SKU is still referenced, because stock and returns have to find their
 * way back to it, but nothing on this row is read through that reference.
 */
export const commerceOrderItems = pgTable(
  'commerce_order_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subOrderId: uuid('suborder_id')
      .notNull()
      .references(() => commerceSubOrders.id, { onDelete: 'cascade' }),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => commerceProducts.id, { onDelete: 'restrict' }),
    /** The hold this line was bought out of, kept so the ledger can be read back. */
    reservationId: uuid('reservation_id').references(() => stockReservations.id, { onDelete: 'set null' }),

    quantity: integer('quantity').notNull(),
    unitPriceToman: bigint('unit_price_toman', { mode: 'bigint' }).notNull(),
    discountToman: bigint('discount_toman', { mode: 'bigint' }).notNull(),
    lineTotalToman: bigint('line_total_toman', { mode: 'bigint' }).notNull(),

    productNameFa: text('product_name_fa').notNull(),
    brandFa: text('brand_fa'),
    variantLabelFa: text('variant_label_fa'),
    skuCode: text('sku_code').notNull(),
    conditionCode: text('condition_code').notNull(),
    sellerNameFa: text('seller_name_fa').notNull(),
    imageFileId: uuid('image_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),

    /** How many of this line came back, so a partial return is a real quantity. */
    returnedQuantity: integer('returned_quantity').notNull().default(0),
    /**
     * The return terms this line was bought under, frozen — PROMPT-011.
     *
     * A policy published next month does not reach backwards, and a category
     * exception is copied with its reason so the buyer reads the sentence that
     * actually applied to them.
     */
    returnPolicyVersionId: uuid('return_policy_version_id'),
    returnRuleCode: text('return_rule_code'),
    returnRuleReasonFa: text('return_rule_reason_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('commerce_order_item_suborder_idx').on(t.subOrderId),
    index('commerce_order_item_sku_idx').on(t.offerSkuId),
    check('commerce_order_item_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'commerce_order_item_returned_within_quantity',
      sql`${t.returnedQuantity} >= 0 and ${t.returnedQuantity} <= ${t.quantity}`,
    ),
    check(
      'commerce_order_item_line_adds_up',
      sql`${t.lineTotalToman} = ${t.unitPriceToman} * ${t.quantity} - ${t.discountToman}`,
    ),
  ],
);

/**
 * Every move a sub-order made, kept.
 *
 * A status column says where something is; this says how it got there and who
 * moved it, which is what a disagreement about an order is actually about.
 */
export const subOrderEvents = pgTable(
  'commerce_suborder_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subOrderId: uuid('suborder_id')
      .notNull()
      .references(() => commerceSubOrders.id, { onDelete: 'cascade' }),
    fromStatus: commerceSubOrderStatus('from_status'),
    toStatus: commerceSubOrderStatus('to_status').notNull(),
    /** Null when the system moved it: a verified payment, or a deadline passing. */
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reasonFa: text('reason_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('commerce_suborder_event_idx').on(t.subOrderId, t.createdAt)],
);
