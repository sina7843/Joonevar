/**
 * Handing the animal over, and the ownership moving with it — PROMPT-007.
 *
 * Two tables, and the second one is the point of the first. A handover is the
 * meeting: a method the seller offered and the buyer chose, a time, a one-time
 * code the buyer holds and the seller enters in front of them, and the buyer's
 * own confirmation. A transfer is what that meeting produced, recorded as its
 * own row so an animal's history of owners exists as rows rather than as the
 * single mutable column on the animal.
 *
 * The code is stored only as a hash, salted by the row's id, exactly as the
 * one-time codes of §6.1 are. It is never logged, never audited and never
 * returned by any read except the buyer's own screen at the moment it is
 * issued.
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
import { handoverStatus, listingDeliveryMethod, ownershipTransferReason } from './enums.ts';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { vetLocations } from './vets.ts';
import { listingInquiries } from './inquiry.ts';
import { animalListings } from './marketplace.ts';

const now = sql`now()`;

/**
 * One meeting, for one deal.
 *
 * The attempt ceiling, the lock and the code's lifetime are copied onto the row
 * from the managed settings when the code is issued, so a later change of those
 * settings never shortens a code somebody is already holding — the same rule
 * the referral code of §11.2 keeps.
 */
export const dealHandovers = pgTable(
  'deal_handover',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => listingInquiries.id, { onDelete: 'restrict' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => animalListings.id, { onDelete: 'restrict' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),

    /** One of the methods this seller declared on the advert; the buyer chose it. */
    method: listingDeliveryMethod('method').notNull(),
    /*
     * Set only for a handover at a veterinary place. It is a reference to the
     * directory record and nothing more: choosing a clinic as a meeting point
     * is not that clinic examining, certifying or endorsing the animal, and no
     * screen says otherwise.
     */
    vetLocationId: uuid('vet_location_id').references(() => vetLocations.id, { onDelete: 'restrict' }),
    placeFa: text('place_fa'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),

    status: handoverStatus('status').notNull().default('SCHEDULED'),

    // ── the one-time code ──────────────────────────────────────────────────
    /** sha256(id + ':' + code). The code itself is never stored. */
    codeHash: text('code_hash'),
    codeIssuedAt: timestamp('code_issued_at', { withTimezone: true }),
    codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
    codeAttempts: integer('code_attempts').notNull().default(0),
    codeLockedUntil: timestamp('code_locked_until', { withTimezone: true }),
    /** How many codes have been issued for this handover, so abuse is bounded. */
    codeIssues: integer('code_issues').notNull().default(0),
    /** The limits frozen at issuance, so a settings change is not retroactive. */
    codeValidityMinutes: integer('code_validity_minutes'),
    codeMaxAttempts: integer('code_max_attempts'),
    codeSettingVersion: integer('code_setting_version'),

    sellerEnteredAt: timestamp('seller_entered_at', { withTimezone: true }),
    buyerConfirmedAt: timestamp('buyer_confirmed_at', { withTimezone: true }),

    /** The statement both sides agreed to, frozen with the version it came from. */
    statementVersion: text('statement_version'),
    statementFa: text('statement_fa'),
    /** The price this sale was recorded at, copied from the deal at completion. */
    finalPriceToman: bigint('final_price_toman', { mode: 'bigint' }),

    completedAt: timestamp('completed_at', { withTimezone: true }),
    endedReasonFa: text('ended_reason_fa'),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live handover per deal: rescheduling edits this row rather than
    // opening a second meeting nobody knows which of is real.
    uniqueIndex('deal_handover_one_key').on(t.inquiryId),
    index('deal_handover_status_idx').on(t.status, t.scheduledAt),
    index('deal_handover_animal_idx').on(t.animalId),
    check(
      'deal_handover_completed_needs_both',
      sql`${t.status} <> 'COMPLETED'
          or (${t.sellerEnteredAt} is not null and ${t.buyerConfirmedAt} is not null
              and ${t.completedAt} is not null and ${t.statementVersion} is not null)`,
    ),
    check(
      'deal_handover_vet_location',
      sql`${t.vetLocationId} is null or ${t.method} = 'VET_CLINIC'`,
    ),
  ],
);

/**
 * An animal changing hands, as a row.
 *
 * The animal keeps one current owner, and this is the history behind it. The
 * previous owner is never erased and neither are the documents issued while
 * they held the animal: a registration sheet, a pedigree or a card records who
 * owned it then, and that stays true afterwards (§10).
 */
export const animalOwnershipTransfers = pgTable(
  'animal_ownership_transfer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    fromAccountId: uuid('from_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    toAccountId: uuid('to_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    reason: ownershipTransferReason('reason').notNull(),
    /** The deal and the meeting this came from, when it came from a sale. */
    inquiryId: uuid('inquiry_id').references(() => listingInquiries.id, { onDelete: 'restrict' }),
    handoverId: uuid('handover_id').references(() => dealHandovers.id, { onDelete: 'restrict' }),
    priceToman: bigint('price_toman', { mode: 'bigint' }),
    noteFa: text('note_fa'),
    /** Null when the transfer was the result of the two parties' own confirmations. */
    recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    transferredAt: timestamp('transferred_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One deal transfers one animal once. This index is what makes two
    // simultaneous completions leave exactly one transfer.
    uniqueIndex('animal_ownership_transfer_deal_key').on(t.inquiryId),
    index('animal_ownership_transfer_animal_idx').on(t.animalId, t.transferredAt),
    index('animal_ownership_transfer_to_idx').on(t.toAccountId),
    check('animal_ownership_transfer_parties', sql`${t.fromAccountId} <> ${t.toAccountId}`),
  ],
);
