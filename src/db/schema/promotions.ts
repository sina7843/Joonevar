/**
 * Ways a price comes down, and points that are not money — PROMPT-012.
 *
 * Five kinds of discount, and the kind is stored rather than inferred because
 * it decides who pays: a shop's own reduction and its own code come out of
 * that shop's money, a platform code and a category campaign out of Hamzist's,
 * and free delivery out of whoever declared it. An order records which rule
 * gave it what, so the answer to "who paid for this" is a row rather than an
 * argument.
 *
 * How they combine is a published version, not a constant. Until one is
 * published nothing stacks — two discounts that quietly add up are how a
 * marketplace sells below cost without anybody deciding to.
 *
 * Loyalty is a ledger of its own, deliberately not the money ledger. Points
 * are earned, spent, expire and are corrected; they never leave as cash,
 * because there is no operation here that converts them to a payout.
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
import { discountKind, discountStatus, loyaltyKind } from './enums.ts';
import { accounts } from './core.ts';
import { commerceSellers } from './commerce.ts';
import { commerceProducts, offerSkus, productCategories } from './catalog.ts';
import { commerceOrders, commerceSubOrders } from './orders.ts';

const now = sql`now()`;

/**
 * One way a price comes down.
 *
 * A code is a rule somebody has to type; a discount, a campaign or free
 * delivery is one that applies by itself. Both are the same shape, because
 * the difference is whether `code` is set — and making them two tables would
 * mean writing the limits, the window and the caps twice.
 */
export const discountRules = pgTable(
  'discount_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: discountKind('kind').notNull(),
    labelFa: text('label_fa').notNull(),
    /** Set only for the two kinds somebody types; unique among live rules. */
    code: text('code'),

    /** The shop whose money pays for it. Null means Hamzist's. */
    sellerId: uuid('seller_id').references(() => commerceSellers.id, { onDelete: 'cascade' }),
    /** A campaign narrowed to one category, or to one product. */
    categoryId: uuid('category_id').references(() => productCategories.id, { onDelete: 'restrict' }),
    productId: uuid('product_id').references(() => commerceProducts.id, { onDelete: 'restrict' }),

    percentBp: integer('percent_bp'),
    amountToman: bigint('amount_toman', { mode: 'bigint' }),
    /** However generous the percentage, never more than this off one order. */
    maxDiscountToman: bigint('max_discount_toman', { mode: 'bigint' }),
    minBasketToman: bigint('min_basket_toman', { mode: 'bigint' }),

    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Null is no ceiling; a number is a ceiling the redemptions enforce. */
    totalUses: integer('total_uses'),
    usesPerAccount: integer('uses_per_account'),

    /** Lower goes first when several apply and the policy allows stacking. */
    priority: integer('priority').notNull().default(100),
    status: discountStatus('status').notNull().default('DRAFT'),
    noteFa: text('note_fa'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live rule per code, so typing a code means one thing.
    uniqueIndex('discount_rule_code_key')
      .on(t.code)
      .where(sql`${t.code} is not null and ${t.status} in ('DRAFT','ACTIVE','PAUSED')`),
    index('discount_rule_kind_idx').on(t.kind, t.status),
    index('discount_rule_seller_idx').on(t.sellerId, t.status),
    check(
      'discount_rule_amount_sane',
      sql`(${t.percentBp} is null or (${t.percentBp} > 0 and ${t.percentBp} <= 10000)) and (${t.amountToman} is null or ${t.amountToman} > 0)`,
    ),
    // A rule takes something off. One that says neither how much nor what
    // proportion is a label with no effect.
    check(
      'discount_rule_has_an_effect',
      sql`${t.kind} = 'FREE_SHIPPING' or ${t.percentBp} is not null or ${t.amountToman} is not null`,
    ),
    // Only the two kinds somebody types carry a code.
    check(
      'discount_rule_code_matches_kind',
      sql`(${t.code} is not null) = (${t.kind} in ('SELLER_CODE','PLATFORM_CODE'))`,
    ),
    // A shop's own discount belongs to a shop; a platform one does not.
    check(
      'discount_rule_owner_matches_kind',
      sql`(${t.sellerId} is not null) = (${t.kind} in ('SELLER_DISCOUNT','SELLER_CODE'))
          or ${t.kind} = 'FREE_SHIPPING'`,
    ),
    check('discount_rule_window_ordered', sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      'discount_rule_limits_positive',
      sql`(${t.totalUses} is null or ${t.totalUses} > 0) and (${t.usesPerAccount} is null or ${t.usesPerAccount} > 0)`,
    ),
  ],
);

/**
 * One use of one rule, on one order.
 *
 * This table is the limit, not a counter somebody increments: the unique
 * index means one order uses a rule once, and counting the rows is what
 * enforces a ceiling. Two people racing for the last use of a code both try
 * to insert, and one of them loses to the database rather than to a check
 * that both of them passed.
 */
export const discountRedemptions = pgTable(
  'discount_redemption',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => discountRules.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => commerceOrders.id, { onDelete: 'cascade' }),
    /** The shop's part it came off, so who paid for it stays readable. */
    subOrderId: uuid('suborder_id').references(() => commerceSubOrders.id, { onDelete: 'cascade' }),
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
    /** True where the platform, not the shop, bore it. */
    borneByPlatform: boolean('borne_by_platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('discount_redemption_once_key').on(t.ruleId, t.orderId),
    index('discount_redemption_rule_idx').on(t.ruleId),
    index('discount_redemption_account_idx').on(t.ruleId, t.accountId),
    check('discount_redemption_amount_positive', sql`${t.amountToman} > 0`),
  ],
);

/**
 * How discounts combine, as a published version.
 *
 * Immutable once published, like the return policy and the seller agreement:
 * an order was priced under the rules in force, and those rules have to stay
 * readable afterwards. Until a version exists nothing stacks at all.
 */
export const stackingPolicies = pgTable(
  'discount_stacking_policy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    /** Which kinds may be combined with which, and in what order they apply. */
    rules: jsonb('rules').notNull(),
    bodyFa: text('body_fa').notNull(),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('stacking_policy_version_key').on(t.version),
    uniqueIndex('stacking_policy_live_key')
      .on(t.supersededAt)
      .where(sql`${t.supersededAt} is null`),
  ],
);

/**
 * Every price one line has had.
 *
 * Append-only, written when a price actually changes. A drop is measured
 * against this rather than against a number somebody remembers, which is what
 * makes "the price fell" a fact rather than a marketing sentence.
 */
export const priceHistory = pgTable(
  'sku_price_point',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'cascade' }),
    priceToman: bigint('price_toman', { mode: 'bigint' }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('sku_price_point_idx').on(t.offerSkuId, t.recordedAt),
    check('sku_price_point_positive', sql`${t.priceToman} > 0`),
  ],
);

/**
 * A price-drop alert already sent.
 *
 * The unique index is the whole of the de-duplication: one person is told
 * once that one line reached one price, however many times the sweep runs or
 * the price wobbles back and forth around it.
 */
export const priceAlerts = pgTable(
  'price_alert',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'cascade' }),
    priceToman: bigint('price_toman', { mode: 'bigint' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('price_alert_once_key').on(t.accountId, t.offerSkuId, t.priceToman)],
);

/**
 * Points, as a ledger of their own.
 *
 * Deliberately not the money ledger: points are not money and must never be
 * settled into a bank account, so they do not share a table with figures that
 * can be. A balance is the sum of these entries, earning is tied to the order
 * that caused it, and the unique index means one order earns once however
 * many times anything replays.
 */
export const loyaltyEntries = pgTable(
  'loyalty_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: loyaltyKind('kind').notNull(),
    /** Signed. Never zero: an entry that changes nothing is not an entry. */
    points: integer('points').notNull(),
    descriptionFa: text('description_fa').notNull(),
    orderId: uuid('order_id').references(() => commerceOrders.id, { onDelete: 'set null' }),
    /** When earned points stop counting. Null for spending and corrections. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** The earning this expiry consumed, so expiry cannot run twice on one lot. */
    expiredEntryId: uuid('expired_entry_id'),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('loyalty_earn_once_key')
      .on(t.orderId, t.kind)
      .where(sql`${t.orderId} is not null and ${t.kind} in ('EARN','REDEEM')`),
    uniqueIndex('loyalty_expiry_once_key')
      .on(t.expiredEntryId)
      .where(sql`${t.expiredEntryId} is not null`),
    index('loyalty_account_idx').on(t.accountId, t.createdAt),
    index('loyalty_expiry_idx').on(t.kind, t.expiresAt),
    check('loyalty_points_not_zero', sql`${t.points} <> 0`),
    // Earning adds, spending and expiry take away. A correction may do either.
    check(
      'loyalty_sign_matches_kind',
      sql`(${t.kind} = 'EARN' and ${t.points} > 0)
          or (${t.kind} in ('REDEEM','EXPIRE') and ${t.points} < 0)
          or ${t.kind} = 'ADJUST'`,
    ),
  ],
);
