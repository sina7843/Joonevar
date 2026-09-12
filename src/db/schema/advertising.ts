/**
 * Advertising packages — Requirements-Phase-2 §14, P2-D03, P2-D05 (PROMPT-011).
 *
 * The base profile is free and is not a row here: a record with no active
 * subscription simply has none. A plan is what the panel configures (features,
 * capacity, active) and its price lives in `product_setting`, so the existing
 * payment machinery freezes it into the batch exactly as every other tariff
 * (§22). No amount is ever invented here.
 *
 * There is no scheduler: a subscription's expiry is its `ends_at` read at
 * request time, like every other Phase 2 deadline.
 */
import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/** Base is the free profile; the two paid tiers are what §14 names. */
export const adPlanTier = pgEnum('ad_plan_tier', ['FEATURED', 'PRO']);

/** The three periods of §14, kept as an enum so a batch can never charge an invented length. */
export const adPlanPeriod = pgEnum('ad_plan_period', ['D30', 'D90', 'D365']);

/** Which kind of record a subscription belongs to. Each stays its own directory (P2-D06). */
export const adTargetType = pgEnum('ad_target_type', ['VET', 'CENTRE', 'COMMUNITY']);

/**
 * `PENDING_PAYMENT` is a subscription that exists only as an intent; it becomes
 * `ACTIVE` inside the transaction that verifies its payment. `EXPIRED` is not
 * written by a job — it is what a read computes past `ends_at`.
 */
export const adSubscriptionStatus = pgEnum('ad_subscription_status', [
  'PENDING_PAYMENT',
  'ACTIVE',
  'CANCELLED',
  'PAYMENT_FAILED',
]);

/**
 * One purchasable plan: a tier in a period.
 *
 * `priceSettingKey` points at the managed tariff; the value itself is never
 * stored here, so a price change is one audited settings edit and past
 * purchases keep the amount they froze.
 */
export const adPlans = pgTable(
  'ad_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tier: adPlanTier('tier').notNull(),
    period: adPlanPeriod('period').notNull(),
    /** The published length of this plan, in days, as §14 names it. */
    durationDays: integer('duration_days').notNull(),
    priceSettingKey: text('price_setting_key').notNull(),
    /** What the buyer is told they get. Operational text, editable in the panel. */
    featuresFa: text('features_fa'),
    /**
     * How many subscriptions of this plan may be active at once (§14 capacity).
     * NULL means the panel has set no ceiling, not "unlimited by decision".
     */
    slotCapacity: integer('slot_capacity'),
    isActive: integer('is_active').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('ad_plan_tier_period_key').on(t.tier, t.period)],
);

/**
 * One purchase of one plan for one record.
 *
 * The history is kept: a renewal is a new row that starts where the previous
 * one ended, and a cancellation keeps its reason and its dates rather than
 * deleting the period that was paid for.
 */
export const adSubscriptions = pgTable(
  'ad_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: adTargetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    /** The account that bought it — always the record's manager at purchase time. */
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => adPlans.id, { onDelete: 'restrict' }),
    status: adSubscriptionStatus('status').notNull().default('PENDING_PAYMENT'),
    /** Written only when the payment is verified; a pending intent has neither. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReasonFa: text('cancel_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('ad_subscription_target_idx').on(t.targetType, t.targetId, t.status),
    index('ad_subscription_account_idx').on(t.accountId),
    uniqueIndex('ad_subscription_batch_key').on(t.paymentBatchId),
    index('ad_subscription_window_idx').on(t.status, t.endsAt),
  ],
);
