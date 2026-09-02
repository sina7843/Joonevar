import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, storedFiles } from './core.ts';
import { animals } from './animals.ts';
import { samples } from './clinical.ts';

const now = sql`now()`;

/**
 * Receipt states — §14.1, §14.4.
 *
 * A receipt that needs correction is the same receipt being fixed, not a new
 * one: the history and the sample codes it maps to stay attached to it.
 */
export const receiptStatus = pgEnum('receipt_status', [
  'DRAFT',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'APPROVED',
  'REJECTED',
]);

/**
 * Parentage result states — §14.3.
 *
 * The product's genetic output is the Parentage Result and nothing else: there
 * is no DNA Profile here and no second result identifier. A G1+ result that is
 * missing a parent's result waits; it is never recorded as final.
 */
export const parentageResultStatus = pgEnum('parentage_result_status', [
  'WAITING_PARENT_RESULTS',
  'TECHNICAL_REVIEW',
  'FINAL',
]);

/**
 * One direct payment to the fixed genetics centre, evidenced by a receipt.
 *
 * The money never passes through Hamzist (D07, §22), so what is stored is the
 * uploaded evidence and the centre's decision about it — never an amount this
 * product claims to have collected.
 */
export const geneticsReceipts = pgTable(
  'genetics_receipt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    status: receiptStatus('status').notNull().default('DRAFT'),
    payerNoteFa: text('payer_note_fa'),
    reasonFa: text('reason_fa'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('genetics_receipt_owner_idx').on(t.ownerAccountId, t.status)],
);

/**
 * The exact samples one receipt pays for — §14.1 step 3.
 *
 * The row points at the sample itself, so the code the centre reads on the tube
 * is the same identifier the receipt was mapped to. Nothing here mints a new
 * code for the transfer.
 */
export const geneticsReceiptItems = pgTable(
  'genetics_receipt_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => geneticsReceipts.id, { onDelete: 'cascade' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    sampleId: uuid('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('genetics_receipt_item_sample_key').on(t.receiptId, t.sampleId),
    index('genetics_receipt_item_animal_idx').on(t.animalId),
  ],
);

/**
 * The Parentage Result — §14.3, §14.5.
 *
 * A corrected result is a new version of the same thing, so the row keeps a
 * version number and a link to what it replaced, and the earlier version stays
 * exactly where it was.
 */
export const parentageResults = pgTable(
  'parentage_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    sampleId: uuid('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'restrict' }),
    status: parentageResultStatus('status').notNull().default('TECHNICAL_REVIEW'),
    resultVersion: integer('result_version').notNull().default(1),
    supersedesResultId: uuid('supersedes_result_id'),
    /** For G1+, the parents' final results this one was confirmed against. */
    sireResultId: uuid('sire_result_id'),
    damResultId: uuid('dam_result_id'),
    technicalNoteFa: text('technical_note_fa'),
    recordedByAccountId: uuid('recorded_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    finalisedAt: timestamp('finalised_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One live result row per animal per version; the newest is the current one.
    uniqueIndex('parentage_result_animal_version_key').on(t.animalId, t.resultVersion),
    index('parentage_result_animal_idx').on(t.animalId, t.status),
  ],
);
