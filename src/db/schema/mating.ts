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

/**
 * The state of one declared mating date — §17.1.
 *
 * A correction never overwrites: the earlier row stays in history as
 * SUPERSEDED, and a counterparty who answers with a different date leaves both
 * values visible as a CONFLICTED pair.
 */
export const matingDateStatus = pgEnum('mating_date_status', [
  'PROPOSED',
  'CONFIRMED',
  'SUPERSEDED',
  'CONFLICTED',
]);

/**
 * One declared mating date, one version — §17.1, §17.2.
 *
 * Either participant may declare a date, as often as they like, so this is an
 * append-only history rather than a single mutable field. The most recent
 * mutually CONFIRMED row is what drives both animals' timeline and cooldown; a
 * personal, unconfirmed record can never take its place (§17.3).
 */
export const matingDateDeclarations = pgTable(
  'mating_date_declaration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    /** Sequential per permit, so a stale approval can never confirm a new one. */
    version: integer('version').notNull(),
    matedOn: text('mated_on').notNull(),
    status: matingDateStatus('status').notNull().default('PROPOSED'),
    declaredByAccountId: uuid('declared_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().default(now),
    confirmedByAccountId: uuid('confirmed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** The version this one corrects or contradicts; both stay readable. */
    replacesVersion: integer('replaces_version'),
    conflictsWithId: uuid('conflicts_with_id'),
    noteFa: text('note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('mating_date_version_key').on(t.permitId, t.version),
    index('mating_date_permit_idx').on(t.permitId, t.status),
  ],
);
