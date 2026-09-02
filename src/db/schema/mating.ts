import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/**
 * Official permit states — §16.
 *
 * The order the source sets is: choose the animals, resolve and confirm the
 * counterparty, record the allocation rule, review, pay, submit, and only then
 * the association reviews and the permit is issued.
 */
export const permitStatus = pgEnum('permit_status', [
  'DRAFT',
  'AWAITING_COUNTERPARTY',
  'AWAITING_PAYMENT',
  'READY_TO_SUBMIT',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'ISSUED',
  'REJECTED',
]);

/** §16 step 5: a fixed share, a percentage, or both together. */
export const allocationRuleType = pgEnum('allocation_rule_type', ['FIXED', 'PERCENTAGE', 'MIXED']);

/**
 * One official mating permit — §16, D12.
 *
 * It is deliberately its own entity with its own identifier, status and route:
 * the personal declaration of §20 is a different record and can never be
 * reached from here (§16, last paragraph).
 */
export const matingPermits = pgTable(
  'mating_permit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    initiatorAccountId: uuid('initiator_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Resolved from the counterparty's pedigree code, never posted by a form. */
    counterpartyAccountId: uuid('counterparty_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    sireAnimalId: uuid('sire_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    damAnimalId: uuid('dam_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    status: permitStatus('status').notNull().default('DRAFT'),
    ruleType: allocationRuleType('rule_type'),
    ruleNoteFa: text('rule_note_fa'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    counterpartyConfirmedAt: timestamp('counterparty_confirmed_at', { withTimezone: true }),
    batchId: uuid('batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reasonFa: text('reason_fa'),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Issued once, on approval, and never reissued for the same permit. */
    permitNo: text('permit_no'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('mating_permit_no_key').on(t.permitNo),
    index('mating_permit_initiator_idx').on(t.initiatorAccountId, t.status),
    index('mating_permit_counterparty_idx').on(t.counterpartyAccountId, t.status),
    index('mating_permit_animals_idx').on(t.sireAnimalId, t.damAnimalId),
  ],
);

/**
 * One side of the allocation rule — §16 step 5, §19.
 *
 * This is the agreement recorded before birth. It is not ownership of a
 * particular unborn puppy: the real allocation happens after the litter is
 * registered and both sides confirm it, and no newborn count is assumed here.
 */
export const permitAllocationShares = pgTable(
  'permit_allocation_share',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    /** SIRE_SIDE or DAM_SIDE; the account is resolved from the animal's owner. */
    side: text('side').notNull(),
    partyAccountId: uuid('party_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    fixedCount: integer('fixed_count'),
    percent: integer('percent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('permit_allocation_side_key').on(t.permitId, t.side)],
);
