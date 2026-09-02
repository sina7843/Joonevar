import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { matingPermits } from './mating.ts';
import { vetLocations, vetVisitRequests } from './vets.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/**
 * The owner's pregnancy declaration — §18.1, §18.3.
 *
 * It is always UNVERIFIED: recording a declaration and a veterinarian
 * confirming one are different things, and the absence of a confirmation is not
 * a defect. Corrections append a version; nothing is overwritten, and none of
 * this touches the issued permit.
 */
export const pregnancyDeclarations = pgTable(
  'pregnancy_declaration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    pregnant: boolean('pregnant').notNull(),
    expectedCount: integer('expected_count'),
    noteFa: text('note_fa'),
    reasonFa: text('reason_fa'),
    declaredByAccountId: uuid('declared_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().default(now),
    replacesVersion: integer('replaces_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('pregnancy_declaration_version_key').on(t.permitId, t.version)],
);

/**
 * An optional verification request — §18.2.
 *
 * It reuses the ordinary visit request of §11, so the veterinarian is chosen in
 * the Finder and the work lands in that one veterinarian's own queue. There is
 * no general pool anyone may pick from, and the referral code's expiry only
 * affects that visit code, never the declaration or the permit.
 */
export const pregnancyChecks = pgTable(
  'pregnancy_check',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    requestedByAccountId: uuid('requested_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('pregnancy_check_request_key').on(t.requestId), index('pregnancy_check_permit_idx').on(t.permitId)],
);

/**
 * The veterinarian's own examination result — §18.2, §18.3.
 *
 * It is a separate record with its own identity: the vet's name, council code,
 * time and examination location. It never rewrites the owner's declaration, the
 * puppy profiles or any ownership; a difference is shown and notified, nothing
 * more. Corrections append a version here too.
 */
export const vetPregnancyResults = pgTable(
  'vet_pregnancy_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkId: uuid('check_id')
      .notNull()
      .references(() => pregnancyChecks.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    pregnant: boolean('pregnant').notNull(),
    expectedCount: integer('expected_count'),
    noteFa: text('note_fa'),
    reasonFa: text('reason_fa'),
    vetAccountId: uuid('vet_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Copied at recording time, so the result stays readable as issued. */
    vetNameFa: text('vet_name_fa').notNull(),
    councilCode: text('council_code').notNull(),
    /** The examination location, never a place of mating (§18.2). */
    locationId: uuid('location_id')
      .notNull()
      .references(() => vetLocations.id, { onDelete: 'restrict' }),
    examinedAt: timestamp('examined_at', { withTimezone: true }).notNull().default(now),
    replacesVersion: integer('replaces_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('vet_pregnancy_result_version_key').on(t.checkId, t.version)],
);

/** How a birth record came to be — an original report or a later correction. */
export const birthEventKind = pgEnum('birth_event_kind', ['INITIAL', 'CORRECTION']);

/**
 * The birth report and its corrections — §19.1, §19.2.
 *
 * Live and dead counts are two independent non-negative integers. Every version
 * keeps its own counts, actor, time and reason, and the first report stays in
 * history for good: a later correction never erases what was reported, and no
 * association review is added as a new precondition.
 */
export const birthEvents = pgTable(
  'birth_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    kind: birthEventKind('kind').notNull().default('INITIAL'),
    bornOn: text('born_on').notNull(),
    liveCount: integer('live_count').notNull(),
    deadCount: integer('dead_count').notNull(),
    reasonFa: text('reason_fa'),
    noteFa: text('note_fa'),
    declaredByAccountId: uuid('declared_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().default(now),
    replacesVersion: integer('replaces_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('birth_event_version_key').on(t.permitId, t.version)],
);

/**
 * The litter of one permit — §19.1.
 *
 * It exists as soon as a birth is reported, including a birth with no live
 * puppy at all, so a "no puppies" outcome is a recorded result rather than a
 * missing record.
 */
export const litters = pgTable(
  'litter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    bornOn: text('born_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('litter_permit_key').on(t.permitId)],
);

/**
 * A puppy's state — §19.2.
 *
 * ALIVE and DECEASED are the real-world states of a puppy that was born alive.
 * WITHDRAWN is different in kind: it marks a profile created by a report that
 * was later corrected as mistaken, and it exists precisely so that a reduced
 * count never becomes a silent deletion.
 */
export const puppyStatus = pgEnum('puppy_status', ['ALIVE', 'DECEASED', 'WITHDRAWN']);

/**
 * One provisional puppy profile — §19.1, §19.2.
 *
 * Exactly one is created per puppy reported born alive, and a puppy reported
 * dead at birth gets none: no profile, no temporary code, no card. The name
 * stays optional until the microchip stage.
 */
export const puppies = pgTable(
  'puppy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    litterId: uuid('litter_id')
      .notNull()
      .references(() => litters.id, { onDelete: 'cascade' }),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    /** The provisional identifier, distinct from every official document. */
    tempCode: text('temp_code').notNull(),
    nameFa: text('name_fa'),
    status: puppyStatus('status').notNull().default('ALIVE'),
    /** The birth-event version that created this profile. */
    createdByVersion: integer('created_by_version').notNull(),
    diedOn: text('died_on'),
    deathReasonFa: text('death_reason_fa'),
    deathRecordedByAccountId: uuid('death_recorded_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    deathRecordedAt: timestamp('death_recorded_at', { withTimezone: true }),
    /** Set when a correction withdrew this profile, with its reason. */
    withdrawnByVersion: integer('withdrawn_by_version'),
    withdrawnReasonFa: text('withdrawn_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('puppy_temp_code_key').on(t.tempCode),
    index('puppy_litter_idx').on(t.litterId, t.status),
  ],
);

/**
 * The state of one allocation version — §19.3.
 *
 * FINAL is reached only when both actual counterparties have confirmed that
 * exact version. A change or a rejection produces a new version that has to be
 * confirmed again by both, and nothing in between is treated as agreement.
 */
export const allocationStatus = pgEnum('allocation_status', [
  'PENDING_BOTH_OWNERS',
  'FINAL',
  'SUPERSEDED',
  'REJECTED',
]);

/**
 * One proposed allocation of a litter's puppies — §19.3.
 *
 * The pre-birth rule of the permit is proposal context only: it is shown while
 * proposing and never assigns a puppy by itself. Hamzist does not arbitrate, so
 * there is no automatic winner: a disagreement is settled outside the system
 * and comes back as a new proposed version.
 */
export const puppyAllocations = pgTable(
  'puppy_allocation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'cascade' }),
    litterId: uuid('litter_id')
      .notNull()
      .references(() => litters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: allocationStatus('status').notNull().default('PENDING_BOTH_OWNERS'),
    proposedByAccountId: uuid('proposed_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().default(now),
    noteFa: text('note_fa'),
    replacesVersion: integer('replaces_version'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('puppy_allocation_version_key').on(t.permitId, t.version),
    index('puppy_allocation_litter_idx').on(t.litterId, t.status),
  ],
);

/** One puppy's proposed owner inside one allocation version — §19.3. */
export const allocationItems = pgTable(
  'allocation_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => puppyAllocations.id, { onDelete: 'cascade' }),
    puppyId: uuid('puppy_id')
      .notNull()
      .references(() => puppies.id, { onDelete: 'cascade' }),
    proposedOwnerAccountId: uuid('proposed_owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('allocation_item_puppy_key').on(t.allocationId, t.puppyId)],
);

/**
 * One party's answer to one exact allocation version — §19.3.
 *
 * The row is bound to the version it answered, which is what makes an approval
 * of an earlier version unusable for new data.
 */
export const allocationApprovals = pgTable(
  'allocation_approval',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => puppyAllocations.id, { onDelete: 'cascade' }),
    partyAccountId: uuid('party_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    approved: boolean('approved').notNull(),
    reasonFa: text('reason_fa'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('allocation_approval_party_key').on(t.allocationId, t.partyAccountId)],
);

/**
 * A Puppy Card — §19.4, D16.
 *
 * It is its own document: not a registration sheet, not a pedigree and not a
 * genetic result, even where older Persian copy calls it «برگه ثبتی توله». It
 * can be issued before that puppy has a registration sheet of its own.
 */
export const puppyCards = pgTable(
  'puppy_card',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puppyId: uuid('puppy_id')
      .notNull()
      .references(() => puppies.id, { onDelete: 'restrict' }),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => matingPermits.id, { onDelete: 'restrict' }),
    cardNo: text('card_no').notNull(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** The allocation version this card was issued against. */
    allocationVersion: integer('allocation_version').notNull(),
    batchId: uuid('batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(now),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('puppy_card_puppy_key').on(t.puppyId),
    uniqueIndex('puppy_card_no_key').on(t.cardNo),
  ],
);
