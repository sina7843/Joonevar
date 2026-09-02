import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './core.ts';
import { animals } from './animals.ts';

const now = sql`now()`;

/**
 * The state of a personal declaration — §20.
 *
 * It stays PENDING_COUNTERPARTY_CONFIRMATION until the other person answers
 * for themselves. There is no payment state here at all, because this service
 * has no payment of its own.
 */
export const declarationStatus = pgEnum('declaration_status', [
  'PENDING_COUNTERPARTY_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
]);

/**
 * A declaration that an agreement exists outside Hamzist — §20.
 *
 * This records only the existence of an agreement between two real animal
 * records and two real people. It deliberately has no column for terms, text,
 * files, images, signatures, shares or ownership: Hamzist does not store the
 * agreement, does not validate it and does not arbitrate it. Nothing here can
 * produce a permit, official lineage, an official confirmed mating date or a
 * Puppy Card.
 */
export const personalDeclarations = pgTable(
  'personal_declaration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    initiatorAccountId: uuid('initiator_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    initiatorAnimalId: uuid('initiator_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    /** An existing record; a hand-typed animal is never accepted (§20). */
    counterpartyAnimalId: uuid('counterparty_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    counterpartyAccountId: uuid('counterparty_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** The invited number, which must be the owner of that animal (§20, §23.4). */
    invitedMobile: text('invited_mobile').notNull(),
    status: declarationStatus('status').notNull().default('PENDING_COUNTERPARTY_CONFIRMATION'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    reasonFa: text('reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('personal_declaration_initiator_idx').on(t.initiatorAccountId, t.status),
    index('personal_declaration_counterparty_idx').on(t.counterpartyAccountId, t.status),
  ],
);

/** What a personal note is about — §17.3, §20. */
export const personalNoteKind = pgEnum('personal_note_kind', ['MATING_DATE', 'PREGNANCY', 'BIRTH']);

/**
 * An optional personal note — §17.3, §20.
 *
 * These are the owner's own notes and they are UNVERIFIED by definition. They
 * are kept on the declaration and never reach the official cooldown basis, the
 * official timeline, allocation or any document.
 */
export const personalNotes = pgTable(
  'personal_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    declarationId: uuid('declaration_id')
      .notNull()
      .references(() => personalDeclarations.id, { onDelete: 'cascade' }),
    kind: personalNoteKind('kind').notNull(),
    /** A civil date when the note has one; never an official confirmed date. */
    noteDate: text('note_date'),
    noteFa: text('note_fa'),
    recordedByAccountId: uuid('recorded_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('personal_note_declaration_idx').on(t.declarationId, t.kind)],
);
