import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';
import { paymentBatches, paymentItems } from './billing.ts';

const now = sql`now()`;

/**
 * Per-animal issuance state — §13.
 *
 * It is deliberately separate from the batch's payment status: one animal being
 * blocked must never hide the others or stop an eligible, paid animal from
 * getting its document.
 */
export const issuanceState = pgEnum('issuance_state', [
  'AWAITING_PAYMENT',
  'AWAITING_ISSUANCE',
  'ISSUED',
  'BLOCKED',
]);

/**
 * One animal inside one registration-sheet checkout.
 *
 * The row exists from the moment the batch is created, so the selection, the
 * money attributed to it and its own outcome all survive a failed payment, a
 * retry and a return from the gateway (§13, §26).
 */
export const registrationSheetItems = pgTable(
  'registration_sheet_item',
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
    uniqueIndex('registration_sheet_item_batch_animal_key').on(t.batchId, t.animalId),
    index('registration_sheet_item_owner_idx').on(t.ownerAccountId, t.state),
  ],
);

/**
 * The issued registration sheet — §13, §23.2.
 *
 * One per animal for as long as it exists, enforced by a unique index rather
 * than by a check, so a repeated callback or a retried issuance can only ever
 * produce one document. It is not a genetic result and not a pedigree.
 */
export const registrationSheets = pgTable(
  'registration_sheet',
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
      .references(() => registrationSheetItems.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => paymentBatches.id, { onDelete: 'restrict' }),
    sheetNo: text('sheet_no').notNull(),
    petId: text('pet_id').notNull(),
    /** The values the sheet states, frozen at issuance. */
    microchipNumber: text('microchip_number').notNull(),
    sampleTrackingCode: text('sample_tracking_code').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(now),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('registration_sheet_animal_key').on(t.animalId),
    uniqueIndex('registration_sheet_no_key').on(t.sheetNo),
    uniqueIndex('registration_sheet_pet_id_key').on(t.petId),
    index('registration_sheet_owner_idx').on(t.ownerAccountId),
  ],
);
