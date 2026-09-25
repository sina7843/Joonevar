/**
 * Sellers of goods — PROMPT-008.
 *
 * A store is a tenant. Everything the shop builds later — offers, stock,
 * sub-orders, settlement — hangs off this row, so what is here is deliberately
 * the identity of a business and nothing about what it sells.
 *
 * Two shapes are worth reading twice.
 *
 * The **licence** fields record what an applicant provides without asserting
 * which licence the law requires. The source does not say, and inventing a
 * mandatory document would be inventing a legal fact: the fields exist, the
 * kind is the applicant's own label, and whether anything is required at all is
 * a managed value that starts unset.
 *
 * The **settlement account** is recorded and verified by a person, not by a
 * bank API nobody has connected. `iban_verified_at` means a reviewer looked at
 * the proof and said so, and the row says who and when.
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
  commerceMemberStatus,
  commerceSellerKind,
  commerceSellerRole,
  commerceSellerStatus,
  sellerDocumentKind,
  sellerPlanStatus,
  sellerSubscriptionStatus,
} from './enums.ts';
import { accounts, storedFiles } from './core.ts';
import { cities, provinces } from './geography.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/**
 * One store.
 *
 * The platform's own store is a row here like any other, with the same
 * lifecycle and the same permissions: PRODUCT_DECISIONS §8 says Hamzist is an
 * ordinary seller tenant, and the way to keep that true is to give it no
 * separate table and no branch of its own.
 */
export const commerceSellers = pgTable(
  'commerce_seller',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: commerceSellerKind('kind').notNull(),
    status: commerceSellerStatus('status').notNull().default('DRAFT'),

    /** The public name of the store and the legal name of the business behind it. */
    displayNameFa: text('display_name_fa'),
    legalNameFa: text('legal_name_fa'),
    /** Stable public address of the storefront; never reused after termination. */
    slug: text('slug'),
    /** The applicant's own description of what kind of business this is. */
    businessTypeFa: text('business_type_fa'),
    /*
     * The national identifier of the business or of the person trading as one.
     * Which of the two it is depends on the business, so the field is one and
     * the applicant says which in `business_type_fa` — inventing two fields
     * would be asserting a legal distinction the source does not make.
     */
    nationalIdentifier: text('national_identifier'),
    representativeNameFa: text('representative_name_fa'),
    representativePhone: text('representative_phone'),
    contactEmail: text('contact_email'),

    // ── the licence, as provided rather than as prescribed ─────────────────
    /** The applicant's own label for the licence they hold, if any. */
    licenceKindFa: text('licence_kind_fa'),
    licenceNumber: text('licence_number'),
    licenceIssuedOn: text('licence_issued_on'),
    licenceExpiresOn: text('licence_expires_on'),

    // ── where it is ────────────────────────────────────────────────────────
    provinceCode: text('province_code').references(() => provinces.code, { onDelete: 'restrict' }),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),
    addressFa: text('address_fa'),
    postalCode: text('postal_code'),

    // ── where the money goes ───────────────────────────────────────────────
    settlementIban: text('settlement_iban'),
    settlementHolderNameFa: text('settlement_holder_name_fa'),
    /** Set by a reviewer who saw the proof. No bank API is connected. */
    ibanVerifiedAt: timestamp('iban_verified_at', { withTimezone: true }),
    ibanVerifiedByAccountId: uuid('iban_verified_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    ibanVerificationNoteFa: text('iban_verification_note_fa'),

    // ── what the store promises buyers ─────────────────────────────────────
    shippingPolicyFa: text('shipping_policy_fa'),
    returnPolicyFa: text('return_policy_fa'),
    /**
     * What this shop charges to deliver one order, and the basket size above
     * which it charges nothing (PROMPT-010).
     *
     * Null is not free delivery. It means the shop has not said, and a shop
     * that has not said cannot be checked out from: the refusal names the
     * missing figure rather than quietly billing zero. Zero, entered on
     * purpose, is free delivery and reads that way.
     */
    shippingFeeToman: bigint('shipping_fee_toman', { mode: 'bigint' }),
    freeShippingThresholdToman: bigint('free_shipping_threshold_toman', { mode: 'bigint' }),
    logoFileId: uuid('logo_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),

    /** The versioned seller agreement this store accepted, and when. */
    agreementVersion: text('agreement_version'),
    agreementAcceptedAt: timestamp('agreement_accepted_at', { withTimezone: true }),
    agreementAcceptedByAccountId: uuid('agreement_accepted_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Why the store is where it is: a correction note, a rejection, a suspension. */
    statusReasonFa: text('status_reason_fa'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('commerce_seller_slug_key').on(t.slug),
    index('commerce_seller_owner_idx').on(t.ownerAccountId, t.status),
    index('commerce_seller_queue_idx').on(t.status, t.submittedAt),
    /*
     * One business identity and one settlement account per live store. A second
     * application carrying the same national identifier or the same IBAN is the
     * same business applying twice, or somebody else's bank account — and both
     * are refused by the database rather than by a lookup that can race.
     * Rejected and terminated stores are excluded, so a business that was turned
     * down can apply again with a corrected file.
     */
    uniqueIndex('commerce_seller_identifier_key')
      .on(t.nationalIdentifier)
      .where(sql`${t.status} not in ('REJECTED','TERMINATED') and ${t.nationalIdentifier} is not null`),
    uniqueIndex('commerce_seller_iban_key')
      .on(t.settlementIban)
      .where(sql`${t.status} not in ('REJECTED','TERMINATED') and ${t.settlementIban} is not null`),
    check(
      'commerce_seller_active_needs_agreement',
      sql`${t.status} <> 'ACTIVE' or (${t.agreementVersion} is not null and ${t.activatedAt} is not null)`,
    ),
  ],
);

/**
 * A licence, an identity document or a bank proof.
 *
 * Private storage. A reviewer may read one while the application is in front of
 * them, and every such read is audited, because these are somebody's business
 * papers rather than a picture of a product.
 */
export const sellerDocuments = pgTable(
  'seller_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    kind: sellerDocumentKind('kind').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    noteFa: text('note_fa'),
    addedByAccountId: uuid('added_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** A replaced document is superseded, never deleted: the trail stays. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('seller_document_seller_idx').on(t.sellerId, t.kind),
    uniqueIndex('seller_document_live_key')
      .on(t.sellerId, t.kind)
      .where(sql`${t.supersededAt} is null and ${t.kind} <> 'OTHER'`),
  ],
);

/**
 * Who works in this store.
 *
 * The role is scoped to one seller and says nothing anywhere else, which is the
 * whole of tenant isolation: there is no global "shop staff" role to leak.
 */
export const sellerMembers = pgTable(
  'seller_member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    role: commerceSellerRole('role').notNull().default('STAFF'),
    status: commerceMemberStatus('status').notNull().default('INVITED'),
    invitedByAccountId: uuid('invited_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('seller_member_key').on(t.sellerId, t.accountId),
    index('seller_member_account_idx').on(t.accountId, t.status),
  ],
);

/**
 * A published plan version.
 *
 * Immutable once published, like the commission rule of PROMPT-006: a store's
 * subscription points at the version it bought, so a plan changed next month
 * does not silently change what a seller is paying for. The price lives in a
 * managed setting and starts unset, so publishing a plan never invents a tariff.
 */
export const sellerPlans = pgTable(
  'seller_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    labelFa: text('label_fa').notNull(),
    version: integer('version').notNull().default(1),
    status: sellerPlanStatus('status').notNull().default('DRAFT'),
    durationDays: integer('duration_days').notNull(),
    /** Null means this plan sets no ceiling of its own. */
    productLimit: integer('product_limit'),
    commissionPercentBp: integer('commission_percent_bp').notNull(),
    commissionMinToman: bigint('commission_min_toman', { mode: 'bigint' }),
    /** What this plan lets a seller do with promotion, as flags rather than prose. */
    capabilities: jsonb('capabilities').notNull().default(sql`'{}'::jsonb`),
    /** The settings key holding this plan's price; unset means the plan cannot be bought. */
    priceSettingKey: text('price_setting_key').notNull(),
    noteFa: text('note_fa'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('seller_plan_version_key').on(t.code, t.version),
    uniqueIndex('seller_plan_live_key').on(t.code).where(sql`${t.status} = 'PUBLISHED'`),
    check('seller_plan_percent_range', sql`${t.commissionPercentBp} >= 0 and ${t.commissionPercentBp} <= 10000`),
    check('seller_plan_duration_positive', sql`${t.durationDays} > 0`),
    check('seller_plan_limit_positive', sql`${t.productLimit} is null or ${t.productLimit} > 0`),
  ],
);

/**
 * One store's period on one plan.
 *
 * Becoming active is the effect of a verified payment, never of an operator
 * marking it so; a renewal starts where the live period ends rather than
 * overlapping it, and expiry is decided when the row is read.
 */
export const sellerSubscriptions = pgTable(
  'seller_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => sellerPlans.id, { onDelete: 'restrict' }),
    status: sellerSubscriptionStatus('status').notNull().default('PENDING_PAYMENT'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Frozen from the plan at purchase, so a later plan version changes nothing here. */
    durationDays: integer('duration_days').notNull(),
    productLimit: integer('product_limit'),
    commissionPercentBp: integer('commission_percent_bp').notNull(),
    capabilities: jsonb('capabilities').notNull().default(sql`'{}'::jsonb`),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),
    /** True when the plan was free at purchase, so nothing was owed. */
    freeOfCharge: boolean('free_of_charge').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('seller_subscription_seller_idx').on(t.sellerId, t.status),
    index('seller_subscription_window_idx').on(t.status, t.endsAt),
    uniqueIndex('seller_subscription_batch_key').on(t.paymentBatchId),
    // One period being bought or running at a time per store.
    uniqueIndex('seller_subscription_live_key')
      .on(t.sellerId)
      .where(sql`${t.status} in ('PENDING_PAYMENT','ACTIVE')`),
    check(
      'seller_subscription_active_needs_window',
      sql`${t.status} <> 'ACTIVE' or (${t.startsAt} is not null and ${t.endsAt} is not null)`,
    ),
  ],
);
