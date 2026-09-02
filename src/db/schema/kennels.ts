import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, referenceBreeds } from './core.ts';
import { paymentBatches } from './billing.ts';

const now = sql`now()`;

/**
 * Kennel states — §15.2, F11.
 *
 * The order the source sets is form → breeds → review → payment → submit →
 * under review. `READY_TO_SUBMIT` is the gap between a verified payment and the
 * person actually sending it, so a paid kennel is never in the queue by
 * accident.
 */
export const kennelStatus = pgEnum('kennel_status', [
  'DRAFT',
  'READY_TO_SUBMIT',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'APPROVED',
  'REJECTED',
]);

/**
 * One kennel — §15.2, §15.3.
 *
 * The kennel's own address is required before it can be sent for review, and it
 * is a different thing from the residence on the account, which stays optional
 * (§6.2). Nothing here asks for a breeder document: KYC is the national card
 * and that is all (§15.1).
 */
export const kennels = pgTable(
  'kennel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: kennelStatus('status').notNull().default('DRAFT'),
    nameFa: text('name_fa'),
    nameEn: text('name_en'),
    phone: text('phone'),
    provinceFa: text('province_fa'),
    cityFa: text('city_fa'),
    addressFa: text('address_fa'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    noteFa: text('note_fa'),
    /** The one checkout that paid for this registration (§22). */
    batchId: uuid('batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    reasonFa: text('reason_fa'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('kennel_owner_idx').on(t.ownerAccountId, t.status)],
);

/**
 * The breeds a kennel works with — §15.2, §15.3.
 *
 * They come from the same reference registry the animal form uses, at least one
 * is required, and editing them later is a recorded change rather than a new
 * payment or a new review.
 */
export const kennelBreeds = pgTable(
  'kennel_breed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kennelId: uuid('kennel_id')
      .notNull()
      .references(() => kennels.id, { onDelete: 'cascade' }),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => referenceBreeds.id, { onDelete: 'restrict' }),
    addedByAccountId: uuid('added_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('kennel_breed_key').on(t.kennelId, t.breedId)],
);
