/**
 * The negotiation half of an animal deal — PROMPT-005.
 *
 * One advert can carry several open requests at once, and the seller accepts
 * one of them. Everything that follows hangs off that request: the offers, the
 * thread, the proposed handover, and finally the deposit that turns it into a
 * reservation.
 *
 * Two shapes here exist because of what a dispute later needs to be answerable
 * from. Offers are never edited — a new one supersedes the old and both stay
 * readable. Messages are never edited or deleted — what was said is what was
 * said, and a redaction is recorded beside the text rather than instead of it.
 */
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  handoverProposalStatus,
  inquiryMessageKind,
  inquiryStatus,
  listingDeliveryMethod,
  offerParty,
  offerStatus,
} from './enums.ts';
import { accounts, storedFiles } from './core.ts';
import { paymentBatches } from './billing.ts';
import { animalListings } from './marketplace.ts';

const now = sql`now()`;

/**
 * One buyer asking for one animal.
 *
 * The commission inputs are frozen on this row at the moment the final price
 * is locked, together with the version of each setting they came from. The
 * deposit is read from `deposit_amount_toman` by the payment batch, exactly the
 * way a club's joining fee is read from its published rule version: the figure
 * is never passed in by a caller, and a later tariff change cannot rewrite a
 * deal somebody already agreed to (§22).
 */
export const listingInquiries = pgTable(
  'listing_inquiry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'restrict' }),
    buyerAccountId: uuid('buyer_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Copied at creation so a transfer of the advert cannot move the thread. */
    sellerAccountId: uuid('seller_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: inquiryStatus('status').notNull().default('OPEN'),
    messageFa: text('message_fa'),

    /** Null until a price is locked. An exact-price advert locks it at creation. */
    finalPriceToman: bigint('final_price_toman', { mode: 'bigint' }),
    finalPriceLockedAt: timestamp('final_price_locked_at', { withTimezone: true }),

    /** The commission inputs, frozen with the price they were applied to. */
    depositAmountToman: bigint('deposit_amount_toman', { mode: 'bigint' }),
    commissionFixedToman: bigint('commission_fixed_toman', { mode: 'bigint' }),
    commissionPercentBp: integer('commission_percent_bp'),
    commissionMinToman: bigint('commission_min_toman', { mode: 'bigint' }),
    commissionMaxToman: bigint('commission_max_toman', { mode: 'bigint' }),
    /** Which setting versions produced the figures above. */
    commissionSettingVersions: text('commission_setting_versions'),
    /** The cancellation policy version this deal is bound to (PRODUCT_DECISIONS §6). */
    cancellationPolicyVersion: text('cancellation_policy_version'),

    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** Computed from the managed window at acceptance and frozen here. */
    paymentDeadlineAt: timestamp('payment_deadline_at', { withTimezone: true }),
    paymentWindowHours: integer('payment_window_hours'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'set null' }),

    /** Set only by a verified deposit; a reservation never exists without one. */
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    /** Contact details are readable to both sides only from this moment. */
    contactRevealedAt: timestamp('contact_revealed_at', { withTimezone: true }),

    closedReasonFa: text('closed_reason_fa'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    /*
     * One live request per buyer per advert: asking twice is the same asking.
     * Several different buyers may each have one, which is the point.
     */
    uniqueIndex('listing_inquiry_one_live_key')
      .on(t.listingId, t.buyerAccountId)
      .where(sql`${t.status} in ('OPEN','ACCEPTED')`),
    /*
     * One accepted request per advert. This is the race the prompt names: two
     * sellers' tabs, or a seller and a scheduler, cannot both accept. The index
     * decides it, not a check-then-write.
     */
    uniqueIndex('listing_inquiry_one_accepted_key')
      .on(t.listingId)
      .where(sql`${t.status} in ('ACCEPTED','CONVERTED')`),
    index('listing_inquiry_listing_idx').on(t.listingId, t.status),
    index('listing_inquiry_buyer_idx').on(t.buyerAccountId, t.status),
    index('listing_inquiry_deadline_idx').on(t.status, t.paymentDeadlineAt),
    uniqueIndex('listing_inquiry_batch_key').on(t.paymentBatchId),
    check(
      'listing_inquiry_deposit_needs_price',
      sql`${t.depositAmountToman} is null or (${t.finalPriceToman} is not null and ${t.depositAmountToman} > 0)`,
    ),
    // A reservation is only ever the result of a deposit that was verified.
    check(
      'listing_inquiry_reserved_needs_batch',
      sql`${t.reservedAt} is null or ${t.paymentBatchId} is not null`,
    ),
  ],
);

/**
 * One price proposal.
 *
 * Immutable. Accepting one locks the final price on the request; proposing a
 * new one supersedes the previous, and the whole ladder stays readable because
 * a later argument about «قیمت توافق‌شده» is answered from exactly these rows.
 */
export const listingOffers = pgTable(
  'listing_offer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'cascade' }),
    party: offerParty('party').notNull(),
    amountToman: bigint('amount_toman', { mode: 'bigint' }).notNull(),
    status: offerStatus('status').notNull().default('PROPOSED'),
    supersedesOfferId: uuid('supersedes_offer_id'),
    createdByAccountId: uuid('created_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live proposal per thread: a counteroffer supersedes rather than adds.
    uniqueIndex('listing_offer_one_live_key').on(t.inquiryId).where(sql`${t.status} = 'PROPOSED'`),
    index('listing_offer_inquiry_idx').on(t.inquiryId, t.createdAt),
    check('listing_offer_amount_positive', sql`${t.amountToman} > 0`),
  ],
);

/**
 * One message in one thread.
 *
 * Append-only. `redacted_note_fa` records that the server removed something and
 * why; the original text is never stored, because storing what the policy
 * exists to withhold would defeat it. After a deal forms the thread is frozen
 * to reads only, so what both sides agreed to stays exactly as it was.
 */
export const inquiryMessages = pgTable(
  'inquiry_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'cascade' }),
    senderAccountId: uuid('sender_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    kind: inquiryMessageKind('kind').notNull().default('TEXT'),
    bodyFa: text('body_fa'),
    /** Present when the server removed contact details before the deposit. */
    redactedNoteFa: text('redacted_note_fa'),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    offerId: uuid('offer_id').references(() => listingOffers.id, { onDelete: 'restrict' }),
    /*
     * A moderator's decision about a reported message. The row is never edited
     * or deleted — a dispute is argued from the transcript, and evidence that
     * disappears when somebody objects to it is not evidence. Hidden means the
     * thread renders a placeholder instead of the text; the text itself stays
     * here for the review and the audit trail (PROMPT-005).
     */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenByAccountId: uuid('hidden_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    hiddenReasonFa: text('hidden_reason_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('inquiry_message_thread_idx').on(t.inquiryId, t.createdAt),
    check(
      'inquiry_message_has_content',
      sql`${t.bodyFa} is not null or ${t.fileId} is not null or ${t.offerId} is not null`,
    ),
  ],
);

/** A proposed time and place for the handover; the other side accepts one. */
export const inquiryHandoverProposals = pgTable(
  'inquiry_handover_proposal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'cascade' }),
    proposedByAccountId: uuid('proposed_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    method: listingDeliveryMethod('method').notNull(),
    placeFa: text('place_fa'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull(),
    status: handoverProposalStatus('status').notNull().default('PROPOSED'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('inquiry_handover_one_live_key').on(t.inquiryId).where(sql`${t.status} = 'PROPOSED'`),
    index('inquiry_handover_inquiry_idx').on(t.inquiryId, t.createdAt),
  ],
);

/**
 * One side has stopped this conversation.
 *
 * Blocking closes the thread to new messages from both directions and is
 * recorded with its reason. It never deletes what was said: a moderator
 * reviewing a report needs the transcript that led to it.
 */
export const inquiryBlocks = pgTable(
  'inquiry_block',
  {
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'cascade' }),
    byAccountId: uuid('by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    reasonFa: text('reason_fa').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.inquiryId, t.byAccountId] })],
);
