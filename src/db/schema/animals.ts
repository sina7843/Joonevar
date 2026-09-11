import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, referenceBreeds, pedigreeIssuers, species as speciesTable, storedFiles } from './core.ts';

const now = sql`now()`;

/** How the animal entered Hamzist — the choice on the approved PET-003 screen. */
export const animalOrigin = pgEnum('animal_origin', ['G0', 'INTERNAL_G1PLUS', 'FOREIGN_PEDIGREE']);

/**
 * A draft is a real row, so leaving the form and coming back — including going
 * away to register a missing parent — never loses what was entered (§9.3).
 */
export const animalStatus = pgEnum('animal_status', ['DRAFT', 'REGISTERED', 'ARCHIVED']);

export const animalSex = pgEnum('animal_sex', ['MALE', 'FEMALE']);

export const foreignPedigreeStatus = pgEnum('foreign_pedigree_status', [
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'NEEDS_CORRECTION',
  'REJECTED',
]);

/**
 * Animal record — §9, §10, §23.1.
 *
 * `generation` is computed by the server from resolvable parents and is never
 * accepted from a request; there is no generation selector anywhere (§9.3).
 *
 * `petId` and `pedigreeCode` stay null until the corresponding document is
 * actually issued, because an initial animal record is not a registration
 * sheet, a Pet ID or a pedigree (§9.2, §23.2).
 */
export const animals = pgTable(
  'animal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: animalStatus('status').notNull().default('DRAFT'),

    // ── Step 1: species and breed ──────────────────────────────────────────
    name: text('name'),
    /**
     * Only dogs are supported for now, as the approved form states. The stored
     * code is a key of the species taxonomy, not free text (DEC-0154).
     */
    species: text('species')
      .notNull()
      .default('DOG')
      .references(() => speciesTable.code, { onDelete: 'restrict' }),
    breedId: uuid('breed_id').references(() => referenceBreeds.id, { onDelete: 'restrict' }),

    // ── Step 2: sex and birth ──────────────────────────────────────────────
    sex: animalSex('sex'),
    birthDate: date('birth_date'),
    birthDateApproximate: boolean('birth_date_approximate').notNull().default(false),

    // ── Step 3: appearance — declared by the owner until a vet certifies it ─
    color: text('color'),
    markings: text('markings'),

    // ── Step 4: photo ──────────────────────────────────────────────────────
    photoFileId: uuid('photo_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),

    /**
     * Step 5: a microchip number the owner says the animal already has.
     *
     * Deliberately not the Microchip record of §12: a number only becomes
     * official after a trusted veterinarian scans and confirms it, so this
     * value never binds a chip to an animal.
     */
    declaredMicrochipNumber: text('declared_microchip_number'),

    // ── Identity source and lineage ────────────────────────────────────────
    origin: animalOrigin('origin').notNull().default('G0'),
    generation: integer('generation').notNull().default(0),
    // Self references, so a parent link can never point at a row that is not
    // an animal. Cycles and self-links are prevented in the service layer.
    sireAnimalId: uuid('sire_animal_id').references((): AnyPgColumn => animals.id, { onDelete: 'restrict' }),
    damAnimalId: uuid('dam_animal_id').references((): AnyPgColumn => animals.id, { onDelete: 'restrict' }),

    /** Issued later; resolving a parent by code depends on this column. */
    pedigreeCode: text('pedigree_code'),
    /** Issued with the registration sheet; never equal to the internal id (§23.2). */
    petId: text('pet_id'),

    /**
     * In-progress form state: the current step, the values entered so far and
     * the codes typed for the parents, so a return from registering a missing
     * parent restores exactly what was there (§9.3).
     */
    draftStep: integer('draft_step').notNull().default(1),
    draftData: jsonb('draft_data'),

    /**
     * The official identity, certified in person — §13 («دامپزشک برای تأیید
     * هویت»), §10 and §12.5.
     *
     * Everything the owner enters before the visit is a declaration. At the
     * visit the trusted veterinarian sees the animal and records what is
     * actually true, and from that moment the identity fields are the certified
     * ones: the owner cannot rewrite them from the profile form, because §10
     * says verified data is corrected through the process that produced it and
     * by the actor responsible for it. The previous values stay in the audit
     * trail rather than being lost.
     */
    identityVerifiedAt: timestamp('identity_verified_at', { withTimezone: true }),
    identityVerifiedByAccountId: uuid('identity_verified_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    identityVerifiedRequestId: uuid('identity_verified_request_id'),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
  },
  (t) => [
    index('animal_owner_idx').on(t.ownerAccountId, t.status),
    uniqueIndex('animal_pedigree_code_key').on(t.pedigreeCode),
    uniqueIndex('animal_pet_id_key').on(t.petId),
    index('animal_sire_idx').on(t.sireAnimalId),
    index('animal_dam_idx').on(t.damAnimalId),
  ],
);

/**
 * Foreign pedigree review — §9.4, D14.
 *
 * Front and back are two independent uploads. The association reviews against
 * its own registry of approved issuers; there is no promised turnaround, no
 * extra superadmin approval and no invented translation requirement.
 */
export const foreignPedigreeCases = pgTable(
  'foreign_pedigree_case',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    status: foreignPedigreeStatus('status').notNull().default('DRAFT'),
    /** Chosen from the association-managed registry; free text is not accepted. */
    issuerId: uuid('issuer_id').references(() => pedigreeIssuers.id, { onDelete: 'restrict' }),
    /** The code printed on the foreign document, as declared by the owner. */
    documentCode: text('document_code'),
    frontFileId: uuid('front_file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    backFileId: uuid('back_file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    /** Read from the reviewed document by the association; read-only afterwards. */
    extractedGeneration: integer('extracted_generation'),
    reasonFa: text('reason_fa'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('foreign_pedigree_animal_key').on(t.animalId),
    index('foreign_pedigree_status_idx').on(t.status, t.submittedAt),
  ],
);
