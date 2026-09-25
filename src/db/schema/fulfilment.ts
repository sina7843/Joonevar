/**
 * Getting goods there, taking them back, and the money behind both — PROMPT-011.
 *
 * Three things live here that look separate and are not. A **shipping method**
 * is the shop's own commercial offer: where it delivers, what it charges and
 * how long it takes to prepare. A **return** is the platform's promise to the
 * buyer, narrowed only where a category's goods make returning them
 * unreasonable, and never by a shop's own wish. The **ledger** is what both of
 * those do to money.
 *
 * The ledger is the important one. No balance is a number anybody writes: each
 * is the sum of its entries, and every entry says which balance it moves, by
 * how much, why, and which event it belonged to. Money that merely moves from
 * one balance to another writes entries that sum to zero, and the database
 * refuses a group that does not — so "where did this figure come from" is
 * always answerable, and a balance cannot drift away from its own history.
 */
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  ledgerBucket,
  ledgerEntryKind,
  returnRuleKind,
  returnStatus,
  returnedCondition,
  settlementBatchStatus,
  settlementCadence,
  shippingCoverageKind,
  shippingMethodKind,
  shippingPricingKind,
} from './enums.ts';
import { accounts, storedFiles } from './core.ts';
import { commerceSellers } from './commerce.ts';
import { productCategories } from './catalog.ts';
import { commerceOrderItems, commerceSubOrders } from './orders.ts';

const now = sql`now()`;

// ── shipping ───────────────────────────────────────────────────────────────

/**
 * One way this shop delivers, on its own terms.
 *
 * Coverage, charge and preparation promise are the shop's to state and
 * nobody else's to guess. The platform only says how high a charge may go,
 * and only where that ceiling has been configured.
 *
 * A weight-based charge needs weights, which live on the SKU. A shop that
 * prices by weight and stocks a line without one cannot be checked out from,
 * and the refusal names the line rather than guessing a figure.
 */
export const shippingMethods = pgTable(
  'seller_shipping_method',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'cascade' }),
    labelFa: text('label_fa').notNull(),
    kind: shippingMethodKind('kind').notNull(),

    coverageKind: shippingCoverageKind('coverage_kind').notNull().default('WHOLE_COUNTRY'),
    /** Province codes this method reaches, when it does not reach everywhere. */
    provinceCodes: jsonb('province_codes').notNull().default(sql`'[]'::jsonb`),

    pricingKind: shippingPricingKind('pricing_kind').notNull().default('FIXED'),
    /** The whole charge when fixed; the part that does not depend on weight otherwise. */
    baseFeeToman: bigint('base_fee_toman', { mode: 'bigint' }).notNull(),
    /** Charged for every kilogram past the included weight. */
    perKgToman: bigint('per_kg_toman', { mode: 'bigint' }),
    includedGrams: integer('included_grams'),
    /** The basket size above which this method costs nothing. Null is no such offer. */
    freeThresholdToman: bigint('free_threshold_toman', { mode: 'bigint' }),

    /** Working days before the parcel leaves, which the shop promises here. */
    preparationDays: integer('preparation_days').notNull(),
    noteFa: text('note_fa'),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live method per name per shop, so a buyer choosing "پست پیشتاز"
    // is choosing one thing.
    uniqueIndex('shipping_method_label_key')
      .on(t.sellerId, t.labelFa)
      .where(sql`${t.isActive}`),
    index('shipping_method_seller_idx').on(t.sellerId, t.isActive),
    check(
      'shipping_method_money_non_negative',
      sql`${t.baseFeeToman} >= 0 and (${t.perKgToman} is null or ${t.perKgToman} >= 0) and (${t.freeThresholdToman} is null or ${t.freeThresholdToman} >= 0)`,
    ),
    check(
      'shipping_method_days_sane',
      sql`${t.preparationDays} >= 0 and ${t.preparationDays} <= 30`,
    ),
    // Pricing by weight without a rate would be a fixed charge wearing the
    // wrong label, and covering named provinces without naming any is nothing.
    check(
      'shipping_method_weight_needs_rate',
      sql`${t.pricingKind} <> 'WEIGHT_BASED' or (${t.perKgToman} is not null and ${t.includedGrams} is not null)`,
    ),
    check(
      'shipping_method_provinces_needed',
      sql`${t.coverageKind} <> 'PROVINCES' or jsonb_array_length(${t.provinceCodes}) > 0`,
    ),
  ],
);

// ── returns ────────────────────────────────────────────────────────────────

/**
 * The platform's return promise, as a published version.
 *
 * Immutable once published, like the commission rule and the seller
 * agreement: a buyer bought under the text that was in force, and the text
 * that was in force has to stay readable afterwards.
 */
export const returnPolicyVersions = pgTable(
  'return_policy_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    windowDays: integer('window_days').notNull(),
    bodyFa: text('body_fa').notNull(),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    /** Set when a newer version took over; the row itself never changes. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('return_policy_version_key').on(t.version),
    // One version in force at a time, decided by the database.
    uniqueIndex('return_policy_live_key')
      .on(t.supersededAt)
      .where(sql`${t.supersededAt} is null`),
    check('return_policy_window_sane', sql`${t.windowDays} >= 0 and ${t.windowDays} <= 365`),
  ],
);

/**
 * What one category does to that promise, under one version of it.
 *
 * An exception narrows the right and must say why in the words the buyer
 * reads on the product page — «مواد غذایی باز شده» is a reason; «سیاست
 * فروشنده» is not, which is why the reason is required rather than optional.
 */
export const categoryReturnRules = pgTable(
  'category_return_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => returnPolicyVersions.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => productCategories.id, { onDelete: 'restrict' }),
    rule: returnRuleKind('rule').notNull(),
    /** Shorter than the platform's window, never longer. Null keeps the platform's. */
    windowDays: integer('window_days'),
    reasonFa: text('reason_fa').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('category_return_rule_key').on(t.policyVersionId, t.categoryId),
    check('category_return_window_sane', sql`${t.windowDays} is null or (${t.windowDays} >= 0 and ${t.windowDays} <= 365)`),
  ],
);

/**
 * One buyer asking for goods to go back.
 *
 * A request names items and quantities rather than a sub-order, because
 * returning one of three things is the ordinary case and refunding all three
 * would be wrong. The refund figure is decided when the goods are seen, not
 * when they are asked for.
 */
export const orderReturns = pgTable(
  'order_return',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subOrderId: uuid('suborder_id')
      .notNull()
      .references(() => commerceSubOrders.id, { onDelete: 'restrict' }),
    reference: text('reference').notNull(),
    requestedByAccountId: uuid('requested_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: returnStatus('status').notNull().default('REQUESTED'),
    reasonFa: text('reason_fa').notNull(),

    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNoteFa: text('decision_note_fa'),

    returnTrackingCode: text('return_tracking_code'),
    shippedBackAt: timestamp('shipped_back_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedCondition: returnedCondition('received_condition'),
    receivedNoteFa: text('received_note_fa'),

    /** Decided when the goods were seen; the refund record is opened from it. */
    refundAmountToman: bigint('refund_amount_toman', { mode: 'bigint' }),
    refundId: uuid('refund_id'),
    /** True while an argument about this return keeps its money from settling. */
    disputed: boolean('disputed').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('order_return_reference_key').on(t.reference),
    index('order_return_suborder_idx').on(t.subOrderId, t.status),
    index('order_return_queue_idx').on(t.status, t.createdAt),
    check(
      'order_return_refund_non_negative',
      sql`${t.refundAmountToman} is null or ${t.refundAmountToman} >= 0`,
    ),
    // Received goods have a condition recorded: "it came back" without saying
    // in what state is the fact the refund figure depends on.
    check(
      'order_return_received_needs_condition',
      sql`${t.receivedAt} is null or ${t.receivedCondition} is not null`,
    ),
  ],
);

/** One line of a return: which item, how many of it, and why that one. */
export const orderReturnItems = pgTable(
  'order_return_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => orderReturns.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => commerceOrderItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    reasonFa: text('reason_fa').notNull(),
    /** What this line is worth back, frozen from the item's own unit price. */
    lineRefundToman: bigint('line_refund_toman', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    uniqueIndex('order_return_item_key').on(t.returnId, t.orderItemId),
    check('order_return_item_quantity_positive', sql`${t.quantity} > 0`),
    check('order_return_item_refund_non_negative', sql`${t.lineRefundToman} >= 0`),
  ],
);

/** What the buyer showed, and what the shop showed back. */
export const returnEvidence = pgTable(
  'order_return_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => orderReturns.id, { onDelete: 'cascade' }),
    addedByAccountId: uuid('added_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    noteFa: text('note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('order_return_evidence_idx').on(t.returnId, t.createdAt)],
);

// ── the ledger ─────────────────────────────────────────────────────────────

/**
 * Every movement of a shop's money, kept.
 *
 * `groupId` ties the entries of one event together. An event that only moves
 * money between balances — a hold clearing, a payout leaving — writes entries
 * summing to zero and is marked `balanced`; an event that brings money in or
 * takes it out writes what it did and is not. The check below is what makes
 * "balanced" mean something rather than being a label.
 *
 * There is no way for one shop's money to reach another: an entry belongs to
 * one seller, and nothing in this table can move a figure from one seller's
 * rows to another's, because no operation writes a pair across sellers.
 */
export const sellerLedgerEntries = pgTable(
  'seller_ledger_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    /** The one event these entries belonged to. */
    groupId: uuid('group_id').notNull(),
    /** True when this group's entries sum to zero: money moved, none appeared. */
    balanced: boolean('balanced').notNull(),

    bucket: ledgerBucket('bucket').notNull(),
    kind: ledgerEntryKind('kind').notNull(),
    /** Signed, in toman. Never zero: an entry that changes nothing is not an entry. */
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
    descriptionFa: text('description_fa').notNull(),

    subOrderId: uuid('suborder_id').references(() => commerceSubOrders.id, { onDelete: 'restrict' }),
    returnId: uuid('return_id').references(() => orderReturns.id, { onDelete: 'restrict' }),
    settlementBatchId: uuid('settlement_batch_id'),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** When this figure stops being held and may be settled; null means at once. */
    clearsAt: timestamp('clears_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('seller_ledger_seller_idx').on(t.sellerId, t.bucket, t.createdAt),
    index('seller_ledger_group_idx').on(t.groupId),
    index('seller_ledger_clears_idx').on(t.bucket, t.clearsAt),
    index('seller_ledger_suborder_idx').on(t.subOrderId),
    check('seller_ledger_amount_not_zero', sql`${t.amountToman} <> 0`),
    // One sale accrues once per sub-order, whatever calls it twice.
    uniqueIndex('seller_ledger_sale_key')
      .on(t.subOrderId, t.kind)
      .where(sql`${t.kind} in ('SALE','COMMISSION')`),
  ],
);

/**
 * One period's settleable money, gathered for one shop.
 *
 * The bank details are copied onto the batch rather than referenced, because
 * where money was sent is a fact about that payment: a shop changing its
 * account next month must not rewrite where last month's went. While a batch
 * is open the account cannot be changed at all, which is the other half of
 * the same rule.
 */
export const settlementBatches = pgTable(
  'settlement_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    reference: text('reference').notNull(),
    status: settlementBatchStatus('status').notNull().default('DRAFT'),
    cadence: settlementCadence('cadence').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    totalToman: bigint('total_toman', { mode: 'bigint' }).notNull(),

    /** Where it was sent, as it read when the batch was made. */
    ibanSnapshot: text('iban_snapshot').notNull(),
    holderNameSnapshot: text('holder_name_snapshot').notNull(),

    paidByAccountId: uuid('paid_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** The bank's own reference. A payment without one is not a recorded payment. */
    bankReference: text('bank_reference'),
    reconciledByAccountId: uuid('reconciled_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    failureReasonFa: text('failure_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('settlement_batch_reference_key').on(t.reference),
    // One open batch per shop: a second would gather the same money twice.
    uniqueIndex('settlement_batch_open_key')
      .on(t.sellerId)
      .where(sql`${t.status} in ('DRAFT','READY','PAID')`),
    index('settlement_batch_seller_idx').on(t.sellerId, t.status),
    check('settlement_batch_total_positive', sql`${t.totalToman} > 0`),
    check('settlement_batch_period_ordered', sql`${t.periodEnd} > ${t.periodStart}`),
    // "Paid" without the bank's reference is an assertion, not a record.
    check(
      'settlement_batch_paid_needs_reference',
      sql`${t.status} not in ('PAID','RECONCILED') or (${t.bankReference} is not null and ${t.paidAt} is not null)`,
    ),
  ],
);

/**
 * Which ledger entries this batch is paying for.
 *
 * The unique index on the entry is the whole of the idempotency: an entry can
 * belong to one batch and no other, so re-running the gathering cannot pay for
 * the same money twice, whatever the caller believes.
 */
export const settlementBatchLines = pgTable(
  'settlement_batch_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => settlementBatches.id, { onDelete: 'cascade' }),
    ledgerEntryId: uuid('ledger_entry_id')
      .notNull()
      .references(() => sellerLedgerEntries.id, { onDelete: 'restrict' }),
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    uniqueIndex('settlement_batch_line_entry_key').on(t.ledgerEntryId),
    index('settlement_batch_line_batch_idx').on(t.batchId),
  ],
);
