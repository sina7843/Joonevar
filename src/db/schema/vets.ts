import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { accounts, species, storedFiles } from './core.ts';
import { cities, provinces } from './geography.ts';
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

/** Whether a veterinarian has a public directory page — independent of the Finder and of trust (DEC-0164). */
export const vetPublicStatus = pgEnum('vet_public_status', ['DRAFT', 'PUBLISHED', 'HIDDEN']);

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
    /**
     * The owning account. Null only for an unowned profile published by a
     * reviewer until someone claims it (P2-D06, DEC-0166); the Finder joins on
     * this column, so it never sees an unowned profile.
     */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    /** Unknown for an unowned profile until its claim is approved. */
    councilCode: text('council_code'),
    councilVerifiedAt: timestamp('council_verified_at', { withTimezone: true }),
    phone: text('phone'),
    bioFa: text('bio_fa'),

    // ── Public directory profile (Phase 2, PROMPT-006) ─────────────────────
    // The same row the Finder uses; nothing here changes who the Finder shows.
    /** Assigned on first publication and never changed afterwards, so the address stays stable. */
    publicSlug: text('public_slug'),
    publicStatus: vetPublicStatus('public_status').notNull().default('DRAFT'),
    publicPublishedAt: timestamp('public_published_at', { withTimezone: true }),
    headlineFa: text('headline_fa'),
    experienceFa: text('experience_fa'),
    /** Consent flags (§20): the council code and the phone are shown only when set. */
    showCouncilCode: boolean('show_council_code').notNull().default(false),
    showPhone: boolean('show_phone').notNull().default(false),

    // ── Ownership and claim (Phase 2, PROMPT-007) ──────────────────────────
    /** Where an unowned profile says the veterinarian works, until an owner records locations. */
    listedCityId: uuid('listed_city_id').references(() => cities.id, { onDelete: 'restrict' }),
    /** Public contact or address given for an unowned profile. */
    listedContactFa: text('listed_contact_fa'),
    /** Where an unowned profile's information came from. Internal, never shown publicly. */
    sourceFa: text('source_fa'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Hidden by a reviewer: the owner cannot publish it again on their own (DEC-0166). */
    hiddenByReview: boolean('hidden_by_review').notNull().default(false),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('vet_profile_account_key').on(t.accountId),
    uniqueIndex('vet_profile_council_code_key').on(t.councilCode),
    uniqueIndex('vet_profile_public_slug_key').on(t.publicSlug),
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
    /**
     * The veterinarian this place belongs to. Null for a centre branch that no
     * veterinarian owns (PROMPT-008): the Finder and every Phase 1 flow join on
     * this column, so such a row never reaches them.
     */
    vetAccountId: uuid('vet_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
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

    // ── Public directory (Phase 2, PROMPT-006) ─────────────────────────────
    /** Normalised place; the free-text province and city above stay as recorded (DEC-0163). */
    provinceCode: text('province_code').references(() => provinces.code, { onDelete: 'restrict' }),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),
    /** Shown on the public profile. Independent of licence, capabilities and the Finder. */
    isPublic: boolean('is_public').notNull().default(false),
    /** Announced hours, as information only — never an appointment slot (P2-D08). */
    hoursNoteFa: text('hours_note_fa'),

    // ── Centre branch (Phase 2, PROMPT-008) ────────────────────────────────
    /** The centre this place is a branch of; a place may belong to one centre. */
    centreId: uuid('centre_id').references((): AnyPgColumn => centres.id, { onDelete: 'restrict' }),
    /** Open around the clock, as the centre announces it (§9). */
    isOpen24h: boolean('is_open_24h').notNull().default(false),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('vet_location_vet_idx').on(t.vetAccountId, t.isActive),
    index('vet_location_city_idx').on(t.cityId),
    index('vet_location_centre_idx').on(t.centreId),
  ],
);

/**
 * Areas of practice a directory profile lists (§7). Reference data seeded by
 * migration; listing one is the profile's statement, not a board certification (DEC-0164).
 */
export const vetSpecialties = pgTable(
  'vet_specialty',
  {
    code: text('code').primaryKey(),
    nameFa: text('name_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('vet_specialty_name_fa_key').on(t.nameFa)],
);

export const vetProfileSpecialties = pgTable(
  'vet_profile_specialty',
  {
    vetProfileId: uuid('vet_profile_id')
      .notNull()
      .references(() => vetProfiles.id, { onDelete: 'restrict' }),
    specialtyCode: text('specialty_code')
      .notNull()
      .references(() => vetSpecialties.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.vetProfileId, t.specialtyCode] })],
);

/** Species a veterinarian accepts, from the species taxonomy of PROMPT-003. */
export const vetProfileSpecies = pgTable(
  'vet_profile_species',
  {
    vetProfileId: uuid('vet_profile_id')
      .notNull()
      .references(() => vetProfiles.id, { onDelete: 'restrict' }),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.vetProfileId, t.speciesCode] })],
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

// ── Veterinarian applications and claims (Phase 2, PROMPT-007) ─────────────

/** PROFILE asks for a new directory profile; CLAIM asks to take over an unowned one (§8, §10). */
export const vetApplicationKind = pgEnum('vet_application_kind', ['PROFILE', 'CLAIM']);
export const vetApplicationStatus = pgEnum('vet_application_status', [
  'SUBMITTED',
  'NEEDS_CORRECTION',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);
export const vetApplicationDocumentKind = pgEnum('vet_application_document_kind', [
  'COUNCIL_CARD',
  'PRACTICE_LICENCE',
  'IDENTITY',
  'OTHER',
]);

/**
 * A veterinarian's request for a directory profile or a claim, and its review.
 * Approval creates or transfers the profile and records Professional
 * Verification; it never grants the Phase 1 TRUSTED_VET role (DEC-0145).
 */
export const vetApplications = pgTable(
  'vet_application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: vetApplicationKind('kind').notNull(),
    /** CLAIM: the profile claimed. PROFILE: the profile created when approved. */
    vetProfileId: uuid('vet_profile_id').references(() => vetProfiles.id, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    councilCode: text('council_code').notNull(),
    phone: text('phone'),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),
    statementFa: text('statement_fa'),
    status: vetApplicationStatus('status').notNull().default('SUBMITTED'),
    /** The reviewer's reason for the last decision: correction, rejection or approval. */
    reviewNoteFa: text('review_note_fa'),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** One appeal per application, after a rejection. */
    appealFa: text('appeal_fa'),
    appealedAt: timestamp('appealed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(now),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('vet_application_status_idx').on(t.status, t.submittedAt),
    // One open application per account, and one open claim per profile.
    uniqueIndex('vet_application_open_account_key')
      .on(t.accountId)
      .where(sql`${t.status} in ('SUBMITTED', 'NEEDS_CORRECTION')`),
    uniqueIndex('vet_application_open_claim_key')
      .on(t.vetProfileId)
      .where(sql`${t.kind} = 'CLAIM' and ${t.status} in ('SUBMITTED', 'NEEDS_CORRECTION')`),
  ],
);

/** Private files attached to an application; read only by the applicant and reviewers. */
export const vetApplicationDocuments = pgTable(
  'vet_application_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => vetApplications.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    kind: vetApplicationDocumentKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('vet_application_document_file_key').on(t.fileId),
    index('vet_application_document_application_idx').on(t.applicationId),
  ],
);

// ── Veterinary centres (Phase 2, PROMPT-008) ───────────────────────────────
//
// Centres live here rather than in their own module because a branch is a
// `vet_location` row: the foreign key points from that table to `centre`, and
// keeping both definitions together avoids a circular import (DEC-0167).

/** Centre kinds of §9. Reference data: rows arrive by migration and the superadmin may add more. */
export const centreTypes = pgTable(
  'centre_type',
  {
    code: text('code').primaryKey(),
    nameFa: text('name_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('centre_type_name_fa_key').on(t.nameFa)],
);

/** Services a centre states it offers. A listing is the centre's statement, not a certification. */
export const centreServices = pgTable(
  'centre_service',
  {
    code: text('code').primaryKey(),
    nameFa: text('name_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('centre_service_name_fa_key').on(t.nameFa)],
);

/** Amenities of a place — parking, hospitalisation, step-free access. Never a medical claim. */
export const centreFacilities = pgTable(
  'centre_facility',
  {
    code: text('code').primaryKey(),
    nameFa: text('name_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('centre_facility_name_fa_key').on(t.nameFa)],
);

export const centres = pgTable(
  'centre',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The managing account, once a claim is approved (P2-D06, P2-D07; PROMPT-009). */
    ownerAccountId: uuid('owner_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    typeCode: text('type_code')
      .notNull()
      .references(() => centreTypes.code, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    aboutFa: text('about_fa'),
    phone: text('phone'),
    websiteUrl: text('website_url'),

    /** The centre's own licence, exactly as a reviewer recorded it (§9). */
    licenceNumber: text('licence_number'),
    licenceStatus: licenceStatus('licence_status').notNull().default('NONE'),
    licenceVerifiedAt: timestamp('licence_verified_at', { withTimezone: true }),

    /** Public page, with the same rules as a veterinarian's (DEC-0164). */
    publicSlug: text('public_slug'),
    publicStatus: vetPublicStatus('public_status').notNull().default('DRAFT'),
    publicPublishedAt: timestamp('public_published_at', { withTimezone: true }),
    hiddenByReview: boolean('hidden_by_review').notNull().default(false),

    /** An unowned, reviewed suggestion: a city and a public contact until it is claimed (§10). */
    listedCityId: uuid('listed_city_id').references(() => cities.id, { onDelete: 'restrict' }),
    listedContactFa: text('listed_contact_fa'),
    sourceFa: text('source_fa'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('centre_public_slug_key').on(t.publicSlug),
    index('centre_status_idx').on(t.publicStatus),
    index('centre_owner_idx').on(t.ownerAccountId),
  ],
);

export const centreServiceLinks = pgTable(
  'centre_service_link',
  {
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'restrict' }),
    serviceCode: text('service_code')
      .notNull()
      .references(() => centreServices.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.centreId, t.serviceCode] })],
);

export const centreSpeciesLinks = pgTable(
  'centre_species',
  {
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'restrict' }),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.centreId, t.speciesCode] })],
);

export const centreFacilityLinks = pgTable(
  'centre_facility_link',
  {
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'restrict' }),
    facilityCode: text('facility_code')
      .notNull()
      .references(() => centreFacilities.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.centreId, t.facilityCode] })],
);

/** A veterinarian listed on a centre's page shows there only after accepting (§9, §20). */
export const centreMemberStatus = pgEnum('centre_member_status', ['INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED']);

export const centreMembers = pgTable(
  'centre_member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'restrict' }),
    vetProfileId: uuid('vet_profile_id')
      .notNull()
      .references(() => vetProfiles.id, { onDelete: 'restrict' }),
    /** What the centre says this person does there; never a certification. */
    roleFa: text('role_fa'),
    status: centreMemberStatus('status').notNull().default('INVITED'),
    invitedByAccountId: uuid('invited_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().default(now),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('centre_member_unique_key').on(t.centreId, t.vetProfileId),
    index('centre_member_vet_idx').on(t.vetProfileId, t.status),
  ],
);

/**
 * Announced opening hours of one place, per weekday (Saturday = 0). Information
 * only: nothing in this product reserves a time (P2-D08).
 */
export const locationHours = pgTable(
  'location_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => vetLocations.id, { onDelete: 'restrict' }),
    weekday: integer('weekday').notNull(),
    opensAt: text('opens_at').notNull(),
    closesAt: text('closes_at').notNull(),
  },
  (t) => [uniqueIndex('location_hours_day_key').on(t.locationId, t.weekday)],
);

// ── Suggested records and centre claims (Phase 2, PROMPT-009) ──────────────

/** What an ordinary user suggested: a veterinarian or a centre (§10). */
export const suggestionKind = pgEnum('suggestion_kind', ['VET', 'CENTRE']);

/**
 * A record an ordinary user says exists. It is never published as written:
 * a reviewer decides, and approval creates the unowned record (DEC-0169).
 * The application statuses of PROMPT-007 are reused, so every queue in the
 * review environment reads with the same words.
 */
export const directorySuggestions = pgTable(
  'directory_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: suggestionKind('kind').notNull(),
    submittedByAccountId: uuid('submitted_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id, { onDelete: 'restrict' }),
    /** Public contact or address the suggester saw. */
    contactFa: text('contact_fa'),
    /** Where the information came from. Internal, never shown publicly. */
    sourceFa: text('source_fa').notNull(),
    noteFa: text('note_fa'),
    status: vetApplicationStatus('status').notNull().default('SUBMITTED'),
    reviewNoteFa: text('review_note_fa'),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** The record approval created, so a suggestion points at its result. */
    createdVetProfileId: uuid('created_vet_profile_id').references((): AnyPgColumn => vetProfiles.id, { onDelete: 'restrict' }),
    createdCentreId: uuid('created_centre_id').references((): AnyPgColumn => centres.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('directory_suggestion_status_idx').on(t.status, t.createdAt),
    index('directory_suggestion_account_idx').on(t.submittedByAccountId, t.createdAt),
  ],
);

export const centreClaimDocumentKind = pgEnum('centre_claim_document_kind', [
  'CENTRE_LICENCE',
  'AUTHORIZATION_LETTER',
  'IDENTITY',
  'OTHER',
]);

/**
 * A representative asking for the management of an unowned centre. Approval
 * transfers who may edit from now on; the centre's history stays as recorded
 * (§10, DEC-0166).
 */
export const centreClaims = pgTable(
  'centre_claim',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    centreId: uuid('centre_id')
      .notNull()
      .references((): AnyPgColumn => centres.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    claimantNameFa: text('claimant_name_fa').notNull(),
    /** What the claimant says they are at that centre; free text, never a title the product invents. */
    roleFa: text('role_fa').notNull(),
    phone: text('phone'),
    statementFa: text('statement_fa'),
    status: vetApplicationStatus('status').notNull().default('SUBMITTED'),
    reviewNoteFa: text('review_note_fa'),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    appealFa: text('appeal_fa'),
    appealedAt: timestamp('appealed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(now),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('centre_claim_status_idx').on(t.status, t.submittedAt),
    // One open claim per centre, and one open claim per account.
    uniqueIndex('centre_claim_open_centre_key')
      .on(t.centreId)
      .where(sql`${t.status} in ('SUBMITTED', 'NEEDS_CORRECTION')`),
    uniqueIndex('centre_claim_open_account_key')
      .on(t.accountId)
      .where(sql`${t.status} in ('SUBMITTED', 'NEEDS_CORRECTION')`),
  ],
);

export const centreClaimDocuments = pgTable(
  'centre_claim_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => centreClaims.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    kind: centreClaimDocumentKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('centre_claim_document_file_key').on(t.fileId), index('centre_claim_document_claim_idx').on(t.claimId)],
);
