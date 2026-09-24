import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';

const now = sql`now()`;

/** Paid services of §22. Veterinary service fees are outside the Hamzist checkout. */
export const paymentService = pgEnum('payment_service', [
  'MEMBERSHIP',
  'REGISTRATION_SHEET',
  'PEDIGREE',
  'MATING_PERMIT',
  'KENNEL_REGISTRATION',
  'PUPPY_CARD',
  /** A directory advertising package (Phase 2, §14). */
  'ADVERTISING_PACKAGE',
  /** The first paid period of a veterinarian's practice licence (Phase 2.5, §5). */
  'VET_LICENSE_ACTIVATION',
  /** Every later period of the same licence. */
  'VET_LICENSE_RENEWAL',
  /** The first paid period of trusted-veterinarian standing (Phase 2.5, §7). */
  'TRUSTED_VET_ACTIVATION',
  /** Every later period of the same trusted standing. */
  'TRUSTED_VET_RENEWAL',
  // A club's own joining fee, priced by that club's published rule version (PROMPT-013).
  'CLUB_MEMBERSHIP',
  // A paid promotion of one animal advert (Phase 3, PROMPT-004).
  'ANIMAL_LISTING_PROMOTION',
  // The deposit on one animal deal, which equals the commission (PROMPT-005).
  'ANIMAL_DEPOSIT',
]);

/**
 * A batch is the money side of one checkout. `PAID` means the server verified
 * the payment with the gateway — never that a browser came back from it.
 */
export const paymentBatchStatus = pgEnum('payment_batch_status', [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAID',
  'FAILED',
  'CANCELLED',
]);

/**
 * Item state is independent of the batch (§13). A rejected or delayed item must
 * never hide the others or stop an eligible, paid item from being issued.
 */
export const paymentItemStatus = pgEnum('payment_item_status', ['PENDING', 'PAID', 'CANCELLED']);

export const paymentAttemptStatus = pgEnum('payment_attempt_status', [
  'PENDING',
  'VERIFIED',
  'FAILED',
  'CANCELLED',
]);

/** Lifetime membership (D04). There is no expiry and no renewal state. */
/**
 * Membership standing — Phase 2.5 §6 (PROMPT-009).
 *
 * Phase 1 knew only a lifetime membership and stored it in the `membership_status`
 * enum (`NONE`, `PAYMENT_PENDING`, `ACTIVE`, `INACTIVE`). Phase 2.5 makes
 * membership reviewed and timed, which needs seven more states. Postgres refuses
 * to use a value added to an existing enum inside the transaction that adds it,
 * and this repository refuses to drop or rename a type, so the column becomes
 * text guarded by a CHECK instead: `0035` maps the old values onto the new
 * vocabulary in place, and the Phase 1 enum type is simply left unused.
 */
/**
 * The Phase 1 membership type. No column uses it since `0035`; it stays declared
 * so the database keeps a type it may still hold in old dumps, and so nothing
 * reads a rename into its disappearance.
 */
export const membershipStatusLegacy = pgEnum('membership_status', ['NONE', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE']);

export const MEMBERSHIP_STATUS_VALUES = [
  'NONE',
  'PENDING_REVIEW',
  'NEEDS_CORRECTION',
  'REJECTED',
  'APPROVED_AWAITING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
  // Kept so a Phase 1 row that somehow escaped the migration is still readable.
  'PAYMENT_PENDING',
  'INACTIVE',
] as const;

export const membershipApplicationStatus = pgEnum('membership_application_status', [
  'SUBMITTED',
  'NEEDS_CORRECTION',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

export const membershipPeriodStatus = pgEnum('membership_period_status', ['PENDING_PAYMENT', 'ACTIVE', 'CANCELLED']);
export const membershipPeriodKind = pgEnum('membership_period_kind', ['INITIAL', 'RENEWAL']);

/**
 * Issuing the number and activating the membership are separate (§7): a number
 * may stay PENDING without blocking any active service.
 */
export const membershipNumberStatus = pgEnum('membership_number_status', ['PENDING', 'ISSUED']);

export const paymentBatches = pgTable(
  'payment_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    service: paymentService('service').notNull(),
    status: paymentBatchStatus('status').notNull().default('DRAFT'),
    /** Where the payer returns to when the flow resumes (§8, §26). */
    resumeContext: jsonb('resume_context').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('payment_batch_account_idx').on(t.accountId, t.createdAt)],
);

/**
 * One line per animal, puppy or service item.
 *
 * The amount is a snapshot taken when the item was created, together with the
 * settings version it came from, so a later tariff edit never rewrites what was
 * charged (§22).
 */
export const paymentItems = pgTable(
  'payment_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => paymentBatches.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    /** Exact integer Toman, stored as a numeric string so no driver rounds it. */
    amountToman: numeric('amount_toman', { precision: 20, scale: 0 }).notNull(),
    /**
     * Where the frozen price came from. A product tariff comes from a managed
     * setting; a club's joining fee comes from that club's published, audited
     * rule version, which is the only place that number exists (PROMPT-013).
     * Either way the amount is read on the server and never passed in.
     */
    priceSource: text('price_source').notNull().default('SETTING'),
    settingKey: text('setting_key'),
    settingVersion: integer('setting_version'),
    priceSourceId: uuid('price_source_id'),
    status: paymentItemStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('payment_item_batch_idx').on(t.batchId),
    uniqueIndex('payment_item_target_key').on(t.batchId, t.targetType, t.targetId),
    // Each source names its own origin, and never the other one's.
    check(
      'payment_item_price_source_check',
      sql`(${t.priceSource} = 'SETTING') = (${t.settingKey} is not null and ${t.settingVersion} is not null)`,
    ),
    check('payment_item_price_source_id_check', sql`(${t.priceSource} = 'SETTING') = (${t.priceSourceId} is null)`),
  ],
);

/**
 * One trip to the gateway.
 *
 * `amountRial` is what was actually sent, derived from the item snapshots by the
 * documented ×10 conversion. Verification compares the gateway's amount against
 * this value, so a tampered amount is a mismatch rather than a silent success.
 */
export const paymentAttempts = pgTable(
  'payment_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => paymentBatches.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** Our own reference, unique per attempt; the gateway echoes it back. */
    reference: text('reference').notNull(),
    amountRial: numeric('amount_rial', { precision: 20, scale: 0 }).notNull(),
    status: paymentAttemptStatus('status').notNull().default('PENDING'),
    providerRef: text('provider_ref'),
    failureReason: text('failure_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().default(now),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('payment_attempt_reference_key').on(t.reference),
    index('payment_attempt_batch_idx').on(t.batchId),
  ],
);

/**
 * Every callback or return the gateway produces, recorded once.
 *
 * The unique key is what makes a duplicated or replayed callback a no-op: the
 * second insert loses and no second effect is applied (§22, §23.4).
 */
export const paymentCallbacks = pgTable(
  'payment_callback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    externalRef: text('external_ref').notNull(),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id, { onDelete: 'set null' }),
    outcome: text('outcome').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('payment_callback_key').on(t.provider, t.externalRef)],
);

/**
 * Membership — §7 and Phase 2.5 §6.
 *
 * One row per account carrying the current standing. Phase 1 memberships were
 * lifetime (D04); Phase 2.5 makes new ones timed, and a membership that was
 * already active keeps `lifetime`, so it is never given an expiry nobody sold it
 * (DEC-0195). The windows themselves live in `membership_period`.
 */
export const memberships = pgTable(
  'membership',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('NONE'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    membershipNo: text('membership_no'),
    numberStatus: membershipNumberStatus('number_status').notNull().default('PENDING'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),
    /** A Phase 1 membership that was already active when membership became timed: it never expires. */
    lifetime: boolean('lifetime').notNull().default(false),
    /**
     * When this membership stops being valid: the live period's end plus whatever
     * grace was bought with it. Kept on the row so every rule and every query can
     * ask one question without joining the periods (PROMPT-009).
     */
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
    /** Why the association suspended or revoked it; shown to the member. */
    statusReasonFa: text('status_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('membership_no_key').on(t.membershipNo),
    index('membership_status_idx').on(t.status, t.currentPeriodEndsAt),
    // A lifetime membership is a Phase 1 record and never carries a period end.
    check('membership_lifetime_has_no_end', sql`${t.lifetime} = false or ${t.currentPeriodEndsAt} is null`),
    check('membership_status_known', sql`${t.status} in ('NONE', 'PENDING_REVIEW', 'NEEDS_CORRECTION', 'REJECTED', 'APPROVED_AWAITING_PAYMENT', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'PAYMENT_PENDING', 'INACTIVE')`),
  ],
);

/**
 * The membership application the association reviews — Phase 2.5 §6.
 *
 * Phase 1 had no review at all: paying was joining. A timed membership is
 * applied for, reviewed with a written reason, and only then opens payment. One
 * open application per account at a time; decided ones stay as history.
 */
export const membershipApplications = pgTable(
  'membership_application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: membershipApplicationStatus('status').notNull().default('SUBMITTED'),
    /** What the applicant said about themselves; never a fact the association verified. */
    statementFa: text('statement_fa'),
    reviewNoteFa: text('review_note_fa'),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('membership_application_open_key')
      .on(t.accountId)
      .where(sql`${t.status} in ('SUBMITTED', 'NEEDS_CORRECTION')`),
    index('membership_application_queue_idx').on(t.status, t.updatedAt),
  ],
);

/**
 * One paid period of membership — Phase 2.5 §6.
 *
 * Created as `PENDING_PAYMENT` with its payment batch and becomes `ACTIVE` only
 * inside the transaction that verifies that payment. The tariff, its settings
 * version, the period length, the grace days and the reminder window are frozen
 * here when the payment starts, so a later settings edit never rewrites what was
 * bought. As with a licence period there is no scheduler: expiry is read from
 * `ends_at` and the frozen grace.
 */
export const membershipPeriods = pgTable(
  'membership_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: membershipPeriodKind('kind').notNull(),
    status: membershipPeriodStatus('status').notNull().default('PENDING_PAYMENT'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    tariffSettingKey: text('tariff_setting_key').notNull(),
    tariffSettingVersion: integer('tariff_setting_version').notNull(),
    amountToman: numeric('amount_toman', { precision: 14, scale: 0 }).notNull(),
    periodDays: integer('period_days').notNull(),
    graceDays: integer('grace_days'),
    reminderDaysBefore: integer('reminder_days_before'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    expiredNoticeAt: timestamp('expired_notice_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('membership_period_batch_key').on(t.paymentBatchId),
    index('membership_period_account_idx').on(t.accountId, t.status, t.endsAt),
    // One unpaid period per account at a time: a second attempt reuses the first.
    uniqueIndex('membership_period_pending_key').on(t.accountId).where(sql`${t.status} = 'PENDING_PAYMENT'`),
    check('membership_period_days_positive', sql`${t.periodDays} >= 1`),
    check('membership_period_grace_not_negative', sql`${t.graceDays} is null or ${t.graceDays} >= 0`),
    check('membership_period_window_matches_status', sql`(${t.status} = 'ACTIVE') = (${t.startsAt} is not null and ${t.endsAt} is not null)`),
  ],
);

/**
 * Development gateway outcomes.
 *
 * The local gateway needs to remember what happened on its own page between two
 * requests. Like the SMS outbox this exists only outside production with local
 * integrations, is never exposed as a way to mark a payment paid from the
 * browser, and is read only by the server-side verify step.
 */
export const devPaymentOutcomes = pgTable(
  'dev_payment_outcome',
  {
    reference: text('reference').primaryKey(),
    paid: text('paid').notNull(),
    amountRial: numeric('amount_rial', { precision: 20, scale: 0 }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().default(now),
  },
);
