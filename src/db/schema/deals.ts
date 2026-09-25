/**
 * What happens to a deal after the deposit — PROMPT-006.
 *
 * Four things live here, and each exists because the alternative would be a
 * claim nobody can check afterwards.
 *
 * The **commission rule** is the formula a deal was priced by, as a published
 * immutable version per species and seller kind. Freezing its id on the deal is
 * what makes "this is the formula you agreed to" answerable a year later.
 *
 * A **cancellation** records who ended the deal, why, which policy version
 * decided it and what that produced. It never moves money by itself.
 *
 * A **refund** is a record with a life of its own: requested, attempted,
 * possibly failed, retried. It is never inferred from a button, and a provider
 * with no automated refund here leaves it honestly owed rather than paid.
 *
 * A **dispute** covers the three things Hamzist will arbitrate — the deposit,
 * the truth of the recorded listing facts, and whether the handover happened.
 * The remaining price is settled outside and is out of scope by construction.
 */
import {
  bigint,
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
import {
  commissionRuleStatus,
  dealCancellationOutcome,
  dealCancellationReason,
  depositRefundStatus,
  disputeDecision,
  disputeScope,
  disputeStatus,
  listingSellerKind,
  refundAttemptOutcome,
  sellerDebtStatus,
} from './enums.ts';
import { accounts, species, storedFiles } from './core.ts';
import { listingInquiries } from './inquiry.ts';
import { animalListings } from './marketplace.ts';
import { commerceSubOrders } from './orders.ts';

const now = sql`now()`;

/**
 * One published commission formula.
 *
 * Immutable once published, the way a club's rule version is: publishing a new
 * one archives the old, and a deal keeps pointing at the row it was priced by.
 * `seller_kind` null means "any seller of this species", so an operator writes
 * the general case once and narrows it only where it differs.
 *
 * Every figure starts as the operator entered it and nothing is seeded, because
 * a commission nobody chose is not a commission.
 */
export const animalCommissionRules = pgTable(
  'animal_commission_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
    /** Null applies to every seller kind of this species. */
    sellerKind: listingSellerKind('seller_kind'),
    fixedToman: bigint('fixed_toman', { mode: 'bigint' }).notNull(),
    percentBp: integer('percent_bp').notNull(),
    minToman: bigint('min_toman', { mode: 'bigint' }),
    maxToman: bigint('max_toman', { mode: 'bigint' }),
    status: commissionRuleStatus('status').notNull().default('DRAFT'),
    /** Rises with each published rule for the same scope, so a deal can say "version 3". */
    version: integer('version').notNull().default(1),
    noteFa: text('note_fa'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    /*
     * One live rule per scope. Two published rules for the same species and
     * seller kind would make "which formula applies" a question the database
     * cannot answer, so it refuses the second one.
     */
    uniqueIndex('animal_commission_rule_live_key')
      .on(t.speciesCode, t.sellerKind)
      .where(sql`${t.status} = 'PUBLISHED' and ${t.sellerKind} is not null`),
    uniqueIndex('animal_commission_rule_live_any_key')
      .on(t.speciesCode)
      .where(sql`${t.status} = 'PUBLISHED' and ${t.sellerKind} is null`),
    index('animal_commission_rule_scope_idx').on(t.speciesCode, t.status),
    check('animal_commission_rule_percent_range', sql`${t.percentBp} >= 0 and ${t.percentBp} <= 10000`),
    check('animal_commission_rule_fixed_positive', sql`${t.fixedToman} >= 0`),
    check(
      'animal_commission_rule_bounds',
      sql`${t.minToman} is null or ${t.maxToman} is null or ${t.maxToman} >= ${t.minToman}`,
    ),
  ],
);

/**
 * One ended deal.
 *
 * The outcome is computed from the policy frozen on the deal, never from the
 * settings as they read today. `AWAITING_REVIEW` is a real outcome: a claim
 * about the animal or a handover nobody attended is not something either party
 * may decide alone, so the record exists and waits for the dispute it opened.
 */
export const dealCancellations = pgTable(
  'deal_cancellation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'restrict' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'restrict' }),
    requestedByAccountId: uuid('requested_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** BUYER or SELLER: which side of this deal asked. */
    requestedByParty: text('requested_by_party').notNull(),
    reason: dealCancellationReason('reason').notNull(),
    statementFa: text('statement_fa'),
    outcome: dealCancellationOutcome('outcome').notNull(),
    /** The policy version frozen on the deal at acceptance, copied here. */
    policyVersion: text('policy_version'),
    /** The frozen penalty inputs this outcome was computed from. */
    depositAmountToman: bigint('deposit_amount_toman', { mode: 'bigint' }).notNull(),
    buyerPenaltyBp: integer('buyer_penalty_bp'),
    penaltyAmountToman: bigint('penalty_amount_toman', { mode: 'bigint' }).notNull().default(sql`0`),
    refundAmountToman: bigint('refund_amount_toman', { mode: 'bigint' }).notNull().default(sql`0`),
    /** Set when a reviewer, rather than the policy alone, settled it. */
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    decisionReasonFa: text('decision_reason_fa'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live cancellation per deal: asking twice is the same asking.
    uniqueIndex('deal_cancellation_one_key').on(t.inquiryId),
    index('deal_cancellation_listing_idx').on(t.listingId),
    check('deal_cancellation_party', sql`${t.requestedByParty} in ('BUYER','SELLER')`),
    check(
      'deal_cancellation_amounts',
      sql`${t.penaltyAmountToman} >= 0 and ${t.refundAmountToman} >= 0
          and ${t.penaltyAmountToman} + ${t.refundAmountToman} <= ${t.depositAmountToman}`,
    ),
  ],
);

/**
 * The money going back.
 *
 * Separate from the cancellation that decided it, because deciding and paying
 * fail independently: a decision stands whatever the provider does, and a
 * refund that failed at the bank has to be visible as owed and retryable.
 *
 * It started as the animal deposit's refund and now carries the shop's too
 * (PROMPT-010). The retrying, the attempt rows, the ceiling on automatic tries
 * and the manual record with a bank reference are the same problem in both
 * places, so they are the same machinery; only what the money was for differs,
 * and exactly one of the two references below says which.
 */
export const depositRefunds = pgTable(
  'deposit_refund',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id').references(() => listingInquiries.id, { onDelete: 'restrict' }),
    /** The shop sub-order this refund belongs to, when that is what it is. */
    subOrderId: uuid('suborder_id').references(() => commerceSubOrders.id, { onDelete: 'restrict' }),
    cancellationId: uuid('cancellation_id').references(() => dealCancellations.id, { onDelete: 'restrict' }),
    /** The verified payment this money is coming back out of. */
    paymentBatchId: uuid('payment_batch_id').notNull(),
    recipientAccountId: uuid('recipient_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
    status: depositRefundStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    /** Why the last attempt did not pay, in the words the operator will read. */
    lastErrorFa: text('last_error_fa'),
    providerRefundRef: text('provider_refund_ref'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One refund per deal. A partial refund is one record for the part owed.
    uniqueIndex('deposit_refund_one_key').on(t.inquiryId).where(sql`${t.inquiryId} is not null`),
    // And one per shop sub-order, for the same reason.
    uniqueIndex('deposit_refund_suborder_key').on(t.subOrderId).where(sql`${t.subOrderId} is not null`),
    index('deposit_refund_queue_idx').on(t.status, t.createdAt),
    check('deposit_refund_amount_positive', sql`${t.amountToman} > 0`),
    // A refund is for one thing. Neither both nor neither.
    check(
      'deposit_refund_one_subject',
      sql`(${t.inquiryId} is not null)::int + (${t.subOrderId} is not null)::int = 1`,
    ),
    check(
      'deposit_refund_paid_needs_ref',
      sql`${t.status} <> 'PAID' or (${t.providerRefundRef} is not null and ${t.completedAt} is not null)`,
    ),
  ],
);

/**
 * Every try at the bank, kept whether it worked or not.
 *
 * A refund that says PAID has a row here naming the provider and its reference;
 * one that says FAILED has the error it failed with. Without these rows
 * "we refunded you" is an assertion rather than a record.
 */
export const depositRefundAttempts = pgTable(
  'deposit_refund_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => depositRefunds.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** Idempotency key sent to the provider, unique per try. */
    requestRef: text('request_ref').notNull(),
    outcome: refundAttemptOutcome('outcome').notNull(),
    providerRefundRef: text('provider_refund_ref'),
    errorFa: text('error_fa'),
    startedByAccountId: uuid('started_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('deposit_refund_attempt_ref_key').on(t.requestRef),
    index('deposit_refund_attempt_refund_idx').on(t.refundId, t.createdAt),
  ],
);

/**
 * Money a seller owes Hamzist — a cancellation penalty, for now.
 *
 * The multi-vendor ledger arrives with the shop; this is the animal market's
 * own small book, and it deliberately cannot move money between people. It
 * records what is owed, who decided that, and whether it was settled or waived.
 */
export const sellerDebts = pgTable(
  'seller_debt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    inquiryId: uuid('inquiry_id').references(() => listingInquiries.id, { onDelete: 'restrict' }),
    cancellationId: uuid('cancellation_id').references(() => dealCancellations.id, { onDelete: 'restrict' }),
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
    status: sellerDebtStatus('status').notNull().default('OUTSTANDING'),
    reasonFa: text('reason_fa').notNull(),
    settledByAccountId: uuid('settled_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    settlementNoteFa: text('settlement_note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One debt per cancellation: a second row would be the same penalty twice.
    uniqueIndex('seller_debt_cancellation_key').on(t.cancellationId),
    index('seller_debt_account_idx').on(t.accountId, t.status),
    check('seller_debt_amount_positive', sql`${t.amountToman} > 0`),
  ],
);

/**
 * An argument Hamzist will actually answer.
 *
 * The scope is a column, not a convention: `DEPOSIT`, `LISTING_FACTS` and
 * `HANDOVER`. Anything about the money settled outside is refused before a row
 * is written, so nobody is left waiting for an arbitration that was never going
 * to happen.
 */
export const dealDisputes = pgTable(
  'deal_dispute',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'restrict' }),
    cancellationId: uuid('cancellation_id').references(() => dealCancellations.id, { onDelete: 'restrict' }),
    openedByAccountId: uuid('opened_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    openedByParty: text('opened_by_party').notNull(),
    scope: disputeScope('scope').notNull(),
    claimFa: text('claim_fa').notNull(),
    status: disputeStatus('status').notNull().default('OPEN'),
    decision: disputeDecision('decision'),
    decisionReasonFa: text('decision_reason_fa'),
    /** What the decision did with the deposit, in the same units as the deal. */
    refundAmountToman: bigint('refund_amount_toman', { mode: 'bigint' }),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live dispute per deal, so two reviewers cannot decide different things.
    uniqueIndex('deal_dispute_one_live_key')
      .on(t.inquiryId)
      .where(sql`${t.status} in ('OPEN','UNDER_REVIEW')`),
    index('deal_dispute_queue_idx').on(t.status, t.createdAt),
    check('deal_dispute_party', sql`${t.openedByParty} in ('BUYER','SELLER')`),
    check(
      'deal_dispute_decided',
      sql`${t.status} <> 'RESOLVED' or (${t.decision} is not null and ${t.decisionReasonFa} is not null)`,
    ),
  ],
);

/**
 * What somebody brought to prove their side.
 *
 * The file is private storage; who may read it is a question about this dispute
 * — its two parties and the reviewer deciding it — and is asked there rather
 * than granted to a whole role through the purpose table.
 */
export const disputeEvidence = pgTable(
  'dispute_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => dealDisputes.id, { onDelete: 'cascade' }),
    addedByAccountId: uuid('added_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    noteFa: text('note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('dispute_evidence_dispute_idx').on(t.disputeId, t.createdAt),
    check('dispute_evidence_has_content', sql`${t.fileId} is not null or ${t.noteFa} is not null`),
  ],
);
