import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { paymentBatches, paymentItems } from './billing.ts';
import { parentageResults } from './genetics.ts';
import { issuanceState } from './documents.ts';

const now = sql`now()`;

/** Appeal states — §14.5. The centre answers; the user never edits the result. */
export const appealStatus = pgEnum('appeal_status', ['SUBMITTED', 'UNDER_REVIEW', 'ANSWERED']);

/** What kind of document a postal request is about (§14.6). */
export const postalDocumentType = pgEnum('postal_document_type', ['REGISTRATION_SHEET', 'PEDIGREE']);

/**
 * One animal inside one pedigree checkout.
 *
 * It mirrors the registration-sheet item on purpose: the money is attributed
 * per animal and each animal is issued or blocked on its own, so a group status
 * can never hide a partial success (§13, §14.1 step 8).
 */
export const pedigreeIssuanceItems = pgTable(
  'pedigree_issuance_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => paymentBatches.id, { onDelete: 'cascade' }),
    paymentItemId: uuid('payment_item_id')
      .notNull()
      .references(() => paymentItems.id, { onDelete: 'cascade' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    state: issuanceState('state').notNull().default('AWAITING_PAYMENT'),
    blockedReasonFa: text('blocked_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('pedigree_item_batch_animal_key').on(t.batchId, t.animalId),
    index('pedigree_item_owner_idx').on(t.ownerAccountId, t.state),
  ],
);

/**
 * The issued pedigree — §14.1 step 8, §23.2.
 *
 * It records which Parentage Result version it was issued from and who the
 * parents were at that moment. The row is never rewritten: a later corrected
 * result adds a notice beside it rather than changing what was issued.
 */
export const pedigrees = pgTable(
  'pedigree',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => pedigreeIssuanceItems.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => paymentBatches.id, { onDelete: 'restrict' }),
    pedigreeCode: text('pedigree_code').notNull(),
    /** Provenance: the exact result and version this document was issued from. */
    issuedFromResultId: uuid('issued_from_result_id')
      .notNull()
      .references(() => parentageResults.id, { onDelete: 'restrict' }),
    issuedFromResultVersion: integer('issued_from_result_version').notNull(),
    sireAnimalId: uuid('sire_animal_id'),
    damAnimalId: uuid('dam_animal_id'),
    generationAtIssue: integer('generation_at_issue').notNull(),
    /** Set when a later corrected result exists; the document itself stays. */
    correctionNoticeFa: text('correction_notice_fa'),
    noticedAt: timestamp('noticed_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(now),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('pedigree_animal_key').on(t.animalId),
    uniqueIndex('pedigree_code_key').on(t.pedigreeCode),
    index('pedigree_owner_idx').on(t.ownerAccountId),
  ],
);

/**
 * An appeal against a Parentage Result — §14.5, D19.
 *
 * It points at the exact result being disputed and keeps it. An appeal is not
 * permission to edit the official result: the centre answers, and a correction
 * is a new result version linked back to the appeal.
 */
export const parentageAppeals = pgTable(
  'parentage_appeal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resultId: uuid('result_id')
      .notNull()
      .references(() => parentageResults.id, { onDelete: 'restrict' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: appealStatus('status').notNull().default('SUBMITTED'),
    messageFa: text('message_fa').notNull(),
    responseFa: text('response_fa'),
    correctedResultId: uuid('corrected_result_id').references(() => parentageResults.id, {
      onDelete: 'restrict',
    }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('parentage_appeal_result_idx').on(t.resultId),
    index('parentage_appeal_owner_idx').on(t.ownerAccountId, t.status),
  ],
);

/**
 * A request to post an issued document — §14.6, D17.
 *
 * Phase one captures the request and confirms it was recorded. There is no
 * carrier integration, no tariff, no label, no tracking and no delivery state,
 * so nothing here can be mistaken for an actual dispatch.
 */
export const postalRequests = pgTable(
  'postal_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    documentType: postalDocumentType('document_type').notNull(),
    /** The issued document this request is about; it must exist first. */
    documentId: uuid('document_id').notNull(),
    recipientNameFa: text('recipient_name_fa').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    provinceFa: text('province_fa'),
    cityFa: text('city_fa'),
    addressFa: text('address_fa').notNull(),
    postalCode: text('postal_code'),
    noteFa: text('note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('postal_request_owner_idx').on(t.ownerAccountId, t.createdAt),
    index('postal_request_document_idx').on(t.documentType, t.documentId),
  ],
);
