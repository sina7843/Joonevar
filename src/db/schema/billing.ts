import { sql } from 'drizzle-orm';
import {
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
export const membershipStatus = pgEnum('membership_status', ['NONE', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE']);

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
    settingKey: text('setting_key').notNull(),
    settingVersion: integer('setting_version').notNull(),
    status: paymentItemStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('payment_item_batch_idx').on(t.batchId),
    uniqueIndex('payment_item_target_key').on(t.batchId, t.targetType, t.targetId),
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
 * Membership — D04, §7.
 *
 * Lifetime: there is no `expiresAt`, no renewal job and no reminder. `INACTIVE`
 * exists only for the case §7.1 describes and carries no invented policy for
 * how it is reached.
 */
export const memberships = pgTable(
  'membership',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: membershipStatus('status').notNull().default('NONE'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    membershipNo: text('membership_no'),
    numberStatus: membershipNumberStatus('number_status').notNull().default('PENDING'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('membership_no_key').on(t.membershipNo)],
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
