import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { accounts } from './core.ts';
import { animals } from './animals.ts';

const now = sql`now()`;

/** Where the visit happens. Mobile or home visits are not part of this phase. */
export const vetLocationKind = pgEnum('vet_location_kind', ['CLINIC', 'HOSPITAL', 'CENTRE']);

/**
 * The location licence, which is a separate approval from the veterinary
 * council code of the person working there (§11.1).
 */
export const licenceStatus = pgEnum('licence_status', ['NONE', 'VALID', 'EXPIRED', 'REVOKED']);

/** The three Finder contexts the source names, and nothing else (§11.1). */
export const visitContext = pgEnum('visit_context', ['MICROCHIP', 'DNA', 'PREGNANCY']);

/**
 * The service actually observed and performed. Microchip splits into implant
 * and verification per animal, chosen independently inside one group (§11.2).
 */
export const visitServiceType = pgEnum('visit_service_type', [
  'MICROCHIP_IMPLANT',
  'MICROCHIP_VERIFICATION',
  'DNA_RESAMPLING',
  'PREGNANCY_CHECK',
]);

export const visitRequestStatus = pgEnum('visit_request_status', [
  'ACTIVE',
  'CHECKED_IN',
  'COMPLETED',
  'SUPERSEDED',
  'CANCELLED',
]);

export const referralStatus = pgEnum('referral_status', [
  'ACTIVE',
  'CONSUMED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
]);

/**
 * A trusted veterinarian's professional record — §11.1, §21.1, D01, D02.
 *
 * There is no public onboarding form in this phase. The row is entered from the
 * superadmin environment for a veterinarian the association has already
 * approved, and the council code is verified independently of any location
 * licence: a valid person at an unlicensed place is still not in Finder.
 */
export const vetProfiles = pgTable(
  'vet_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    councilCode: text('council_code').notNull(),
    councilVerifiedAt: timestamp('council_verified_at', { withTimezone: true }),
    phone: text('phone'),
    bioFa: text('bio_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('vet_profile_account_key').on(t.accountId),
    uniqueIndex('vet_profile_council_code_key').on(t.councilCode),
  ],
);

/**
 * A place the veterinarian works at.
 *
 * The capability flags are the mandatory facilities of §11.1. A location that
 * holds only some of them is not offered a reduced path: it is simply absent
 * from Finder for a context it cannot fully serve.
 */
export const vetLocations = pgTable(
  'vet_location',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vetAccountId: uuid('vet_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    nameFa: text('name_fa').notNull(),
    kind: vetLocationKind('kind').notNull().default('CLINIC'),
    provinceFa: text('province_fa'),
    cityFa: text('city_fa'),
    neighborhoodFa: text('neighborhood_fa'),
    addressFa: text('address_fa'),
    phone: text('phone'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    licenceNumber: text('licence_number'),
    licenceStatus: licenceStatus('licence_status').notNull().default('NONE'),
    canImplantMicrochip: boolean('can_implant_microchip').notNull().default(false),
    canDrawBloodSample: boolean('can_draw_blood_sample').notNull().default(false),
    canPregnancyCheck: boolean('can_pregnancy_check').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('vet_location_vet_idx').on(t.vetAccountId, t.isActive)],
);

/**
 * The group of animals a person sent to one visit.
 *
 * It exists only so the screens can show them together. It carries no state of
 * its own, precisely so it can never turn into a booked appointment (§11.2).
 */
export const vetVisitBatches = pgTable(
  'vet_visit_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    context: visitContext('context').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('vet_visit_batch_owner_idx').on(t.ownerAccountId)],
);

/** One request per animal, with its own state, even inside a group (§11.2). */
export const vetVisitRequests = pgTable(
  'vet_visit_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => vetVisitBatches.id, { onDelete: 'restrict' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    vetAccountId: uuid('vet_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => vetLocations.id, { onDelete: 'restrict' }),
    context: visitContext('context').notNull(),
    serviceType: visitServiceType('service_type').notNull(),
    status: visitRequestStatus('status').notNull().default('ACTIVE'),
    /** Set when an in-place service correction replaced this request (§11.4). */
    supersededByRequestId: uuid('superseded_by_request_id'),
    supersedeReasonFa: text('supersede_reason_fa'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedInByAccountId: uuid('checked_in_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('vet_visit_request_owner_idx').on(t.ownerAccountId, t.status),
    index('vet_visit_request_vet_idx').on(t.vetAccountId, t.status),
    index('vet_visit_request_animal_idx').on(t.animalId),
    index('vet_visit_request_batch_idx').on(t.batchId),
  ],
);

/**
 * The referral code — §11.2, §11.3, D15.
 *
 * QR and manual entry are two renderings of this one value, so there is exactly
 * one code column and one check-in path. The validity days and the settings
 * version are copied onto the row at issuance, which is what makes a later
 * change of the setting non-retroactive: the code keeps, shows and is judged by
 * the deadline it was issued with.
 */
export const referralCodes = pgTable(
  'referral_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => vetVisitRequests.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    status: referralStatus('status').notNull().default('ACTIVE'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(now),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    validityDays: integer('validity_days').notNull(),
    settingsVersion: integer('settings_version').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedByAccountId: uuid('consumed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    /** Why it stopped being usable, when that was not simple consumption. */
    endedReasonFa: text('ended_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('referral_code_key').on(t.code),
    index('referral_code_request_idx').on(t.requestId, t.status),
  ],
);
