import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { vetLocations, vetVisitRequests } from './vets.ts';

const now = sql`now()`;

/**
 * The approved ways of getting a number — §12.1.
 *
 * All four end in one canonical Microchip Number; the method is recorded for
 * the trail, not because the value means something different depending on it.
 * Manual entry is an equal path, which is what keeps a device failure from
 * blocking the visit.
 */
export const chipReadMethod = pgEnum('chip_read_method', [
  'BLUETOOTH_READER',
  'MOBILE_READER',
  'PACKAGE_BARCODE',
  'MANUAL',
]);

/** The only two ways a number is ever bound to an animal (§12.2, §12.3). */
export const chipBoundVia = pgEnum('chip_bound_via', ['IMPLANT', 'EXISTING_UNREGISTERED']);

export const chipConflictKind = pgEnum('chip_conflict_kind', [
  'BELONGS_TO_OTHER_ANIMAL',
  'ANIMAL_HAS_OTHER_CHIP',
  'SERIAL_MISMATCH',
  'DUPLICATE_NUMBER',
]);

/**
 * Sample states — §12.4.
 *
 * There is no expiry state: a sample does not go stale on a timer, and whether
 * it can still be used is the genetics centre's decision.
 */
export const sampleStatus = pgEnum('sample_status', [
  'IN_CUSTODY',
  'SEND_INSTRUCTED',
  'SHIPPED',
  'RECEIVED',
  'PROCESSING',
  'INVALID',
  'INSUFFICIENT',
  'DAMAGED',
  'LOST',
]);

export const sampleEventKind = pgEnum('sample_event_kind', [
  'COLLECTED',
  'CUSTODY_RECORDED',
  'SEND_INSTRUCTED',
  'SHIPPED',
  'RECEIVED',
  'PROCESSING_STARTED',
  'MARKED_UNUSABLE',
  'RESAMPLED',
]);

/**
 * The permanent bond between one animal and one number — §12.2, §12.3, D08.
 *
 * Both uniqueness rules the source insists on are database constraints, not
 * application checks: one row per animal for life, and one row per number
 * globally. There is deliberately no update path here — no replacement, no
 * transfer and no way to clear a row to resolve a conflict.
 */
export const microchips = pgTable(
  'microchip',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    boundVia: chipBoundVia('bound_via').notNull(),
    readMethod: chipReadMethod('read_method').notNull(),
    boundByAccountId: uuid('bound_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => vetLocations.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id').references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    boundAt: timestamp('bound_at', { withTimezone: true }).notNull().default(now),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One microchip per animal for its whole life (§12.3, D08).
    uniqueIndex('microchip_animal_key').on(t.animalId),
    // And one animal per number, globally (§12.2).
    uniqueIndex('microchip_number_key').on(t.number),
  ],
);

/**
 * A stop, recorded — §12.3, §26.
 *
 * A conflict is written down and the operation halts. Nothing here resolves it:
 * there is no status to flip and no action that overwrites a binding, because
 * the source refuses a shortcut around the one-chip rule.
 */
export const microchipConflicts = pgTable(
  'microchip_conflict',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id').references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    reportedByAccountId: uuid('reported_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: chipConflictKind('kind').notNull(),
    observedNumber: text('observed_number'),
    detailFa: text('detail_fa').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('microchip_conflict_animal_idx').on(t.animalId)],
);

/**
 * The steps of one visit's chip work — §12.2.
 *
 * Reading before implantation, confirming the implant and reading again are
 * three separate recorded moments, so "the serial matched" is a fact about two
 * readings rather than one claim typed once.
 */
export const chipProcedures = pgTable(
  'chip_procedure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    vetAccountId: uuid('vet_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    preReadNumber: text('pre_read_number'),
    preReadMethod: chipReadMethod('pre_read_method'),
    preReadAt: timestamp('pre_read_at', { withTimezone: true }),
    implantConfirmedAt: timestamp('implant_confirmed_at', { withTimezone: true }),
    postReadNumber: text('post_read_number'),
    postReadMethod: chipReadMethod('post_read_method'),
    postReadAt: timestamp('post_read_at', { withTimezone: true }),
    microchipId: uuid('microchip_id').references(() => microchips.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('chip_procedure_request_key').on(t.requestId)],
);

/**
 * A blood sample — §12.4, D07.
 *
 * The tracking code is issued only once a sample has actually been taken, and
 * it is a different identifier from the referral code: one is permission to be
 * seen, the other is a thing in a tube.
 */
export const samples = pgTable(
  'sample',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackingCode: text('tracking_code').notNull(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    /** Custody stays with the veterinarian who took it (§12.4, D07). */
    custodyAccountId: uuid('custody_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => vetLocations.id, { onDelete: 'restrict' }),
    status: sampleStatus('status').notNull().default('IN_CUSTODY'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull(),
    unusableReasonFa: text('unusable_reason_fa'),
    supersededBySampleId: uuid('superseded_by_sample_id'),
    sendInstructedAt: timestamp('send_instructed_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    shipmentRefFa: text('shipment_ref_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('sample_tracking_code_key').on(t.trackingCode),
    index('sample_request_idx').on(t.requestId, t.status),
    index('sample_custody_idx').on(t.custodyAccountId, t.status),
  ],
);

/** Shipment and the rest are events on the same code, not new identifiers. */
export const sampleEvents = pgTable(
  'sample_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sampleId: uuid('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'restrict' }),
    kind: sampleEventKind('kind').notNull(),
    byAccountId: uuid('by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    noteFa: text('note_fa'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('sample_event_sample_idx').on(t.sampleId)],
);
