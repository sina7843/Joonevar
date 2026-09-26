/**
 * Phase 4 mating finder foundations — PROMPT-002 (DEC-0218).
 *
 * Three tables, each immutable in the part that history depends on:
 *  - a plan version is written once; publishing a new one archives the old, so
 *    what a person paid for can always be read back;
 *  - a subscription period copies the whole plan version onto itself when the
 *    checkout opens, so a later price or capacity edit rewrites nobody;
 *  - a breed rule version is written once; every later evaluation records which
 *    version it read.
 *
 * Bounds that are not per-breed (request expiry, OTP, media, the free-owner
 * capacity and the kill switches) are managed product settings in the
 * MATING_FINDER group, because `product_setting` already gives them versioning,
 * audit and a panel.
 */
import { bigint, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  finderPeriodKind,
  finderPlanAudience,
  finderPlanStatus,
  finderRuleMode,
  finderRuleStatus,
  finderSubscriptionStatus,
  finderSuspensionPolicy,
} from './enums.ts';
import { accounts, referenceBreeds, species } from './core.ts';
import { paymentBatches } from './billing.ts';
import { animalSex } from './animals.ts';

const now = sql`now()`;

/**
 * One published version per (audience, duration). Durations are the four the
 * product names (PRODUCT_DECISIONS §2); a price left null means the plan exists
 * but cannot be bought yet, which the checkout says in so many words.
 */
export const finderPlanVersions = pgTable(
  'finder_plan_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audience: finderPlanAudience('audience').notNull(),
    durationMonths: integer('duration_months').notNull(),
    version: integer('version').notNull(),
    status: finderPlanStatus('status').notNull().default('PUBLISHED'),
    titleFa: text('title_fa').notNull(),
    /** Null = NOT_CONFIGURED: the plan is shown but checkout refuses it. Never 0. */
    priceToman: bigint('price_toman', { mode: 'bigint' }),
    activeAnimalCapacity: integer('active_animal_capacity').notNull(),
    /** Optional sale window; outside it the plan is not sold. */
    purchasableFrom: timestamp('purchasable_from', { withTimezone: true }),
    purchasableUntil: timestamp('purchasable_until', { withTimezone: true }),
    suspensionPolicy: finderSuspensionPolicy('suspension_policy').notNull(),
    noteFa: text('note_fa'),
    reasonFa: text('reason_fa').notNull(),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    archivedByAccountId: uuid('archived_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archiveReasonFa: text('archive_reason_fa'),
  },
  (t) => [
    check('finder_plan_duration_check', sql`${t.durationMonths} in (1, 3, 6, 12)`),
    check('finder_plan_capacity_check', sql`${t.activeAnimalCapacity} >= 1`),
    check('finder_plan_price_check', sql`${t.priceToman} is null or ${t.priceToman} > 0`),
    check(
      'finder_plan_window_check',
      sql`${t.purchasableFrom} is null or ${t.purchasableUntil} is null or ${t.purchasableFrom} < ${t.purchasableUntil}`,
    ),
    uniqueIndex('finder_plan_version_key').on(t.audience, t.durationMonths, t.version),
    // Two admins publishing the same slot at once cannot leave two live versions.
    uniqueIndex('finder_plan_one_published_key')
      .on(t.audience, t.durationMonths)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

/**
 * One paid period. Everything the checkout priced is copied here, so the period
 * is readable without its plan and a later edit to the plan changes nothing.
 * Periods of one account never overlap: a renewal starts where the live chain
 * ends, and activation holds the account row lock while it decides that.
 */
export const finderSubscriptionPeriods = pgTable(
  'finder_subscription_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => finderPlanVersions.id, { onDelete: 'restrict' }),
    // ── snapshot of the plan version at checkout ──
    audience: finderPlanAudience('audience').notNull(),
    planVersion: integer('plan_version').notNull(),
    durationMonths: integer('duration_months').notNull(),
    activeAnimalCapacity: integer('active_animal_capacity').notNull(),
    priceToman: bigint('price_toman', { mode: 'bigint' }).notNull(),
    suspensionPolicy: finderSuspensionPolicy('suspension_policy').notNull(),
    // ──
    kind: finderPeriodKind('kind').notNull(),
    status: finderSubscriptionStatus('status').notNull().default('PENDING_PAYMENT'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    check(
      'finder_subscription_active_window_check',
      sql`${t.status} <> 'ACTIVE' or (${t.startsAt} is not null and ${t.endsAt} is not null and ${t.startsAt} < ${t.endsAt})`,
    ),
    check('finder_subscription_price_check', sql`${t.priceToman} > 0`),
    // One open checkout per account: two tabs cannot open two payments.
    uniqueIndex('finder_subscription_one_pending_key')
      .on(t.accountId)
      .where(sql`${t.status} = 'PENDING_PAYMENT'`),
    uniqueIndex('finder_subscription_batch_key').on(t.paymentBatchId),
    index('finder_subscription_account_idx').on(t.accountId, t.status, t.endsAt),
  ],
);

/**
 * A versioned breed-and-sex rule. A null breed is the species default, used for
 * any breed without its own published rule. Cooldown is either days or months,
 * never both, because the product states the male in days and the female in
 * months (PRODUCT_DECISIONS §4).
 *
 * Kinship degree: 1 = parent/child and full siblings, 2 = half siblings,
 * grandparent/grandchild, uncle/aunt, 3 = first cousins and the like. A pair at
 * or closer than `kinship_max_degree` triggers the kinship mode; null means any
 * detected kinship triggers it.
 */
export const finderBreedRules = pgTable(
  'finder_breed_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
    breedId: uuid('breed_id').references(() => referenceBreeds.id, { onDelete: 'restrict' }),
    sex: animalSex('sex').notNull(),
    version: integer('version').notNull(),
    status: finderRuleStatus('status').notNull().default('PUBLISHED'),
    /** Null = NOT_CONFIGURED; requests stay closed for the breed until it is set (DEC-0217 §13). */
    minAgeMonths: integer('min_age_months'),
    maxAgeMonths: integer('max_age_months'),
    cooldownDays: integer('cooldown_days'),
    cooldownMonths: integer('cooldown_months'),
    cooldownMode: finderRuleMode('cooldown_mode').notNull().default('WARN'),
    kinshipMaxDegree: integer('kinship_max_degree'),
    kinshipMode: finderRuleMode('kinship_mode').notNull().default('WARN'),
    warningFa: text('warning_fa'),
    reasonFa: text('reason_fa').notNull(),
    /** Null only for the seeded baseline, which no person published. */
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'finder_rule_cooldown_check',
      sql`(${t.cooldownDays} is null) <> (${t.cooldownMonths} is null)`,
    ),
    check('finder_rule_cooldown_positive_check', sql`coalesce(${t.cooldownDays}, ${t.cooldownMonths}) >= 0`),
    check(
      'finder_rule_age_check',
      sql`(${t.minAgeMonths} is null or ${t.minAgeMonths} >= 0) and (${t.maxAgeMonths} is null or ${t.maxAgeMonths} >= 1) and (${t.minAgeMonths} is null or ${t.maxAgeMonths} is null or ${t.minAgeMonths} <= ${t.maxAgeMonths})`,
    ),
    check('finder_rule_kinship_check', sql`${t.kinshipMaxDegree} is null or ${t.kinshipMaxDegree} between 1 and 6`),
    uniqueIndex('finder_rule_version_key').on(
      t.speciesCode,
      sql`coalesce(${t.breedId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.sex,
      t.version,
    ),
    uniqueIndex('finder_rule_one_published_key')
      .on(t.speciesCode, sql`coalesce(${t.breedId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.sex)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);
