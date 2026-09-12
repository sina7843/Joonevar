/**
 * Associations and clubs — Requirements-Phase-2 §11 (PROMPT-010).
 *
 * An association is an official or guild structure; a club is a community
 * around a breed, a city, a sport or a speciality. They are two kinds of the
 * same record because they carry the same profile, managers, scope, events and
 * contact — and they stay distinct in every rule that differs: only a club
 * publishes posts, and only with a permission the superadmin grants (§11,
 * DEC-0170).
 */
import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { accounts, storedFiles, referenceBreeds, species } from './core.ts';
import { cities, provinces } from './geography.ts';
import { licenceStatus, vetPublicStatus } from './vets.ts';

const now = sql`now()`;

export const communityKind = pgEnum('community_kind', ['ASSOCIATION', 'CLUB']);

/** What the community covers (§11): the country, a province, a city, a breed, a sport, or something else it states. */
export const communityScope = pgEnum('community_scope', ['NATIONAL', 'PROVINCIAL', 'CITY', 'BREED', 'SPORT', 'OTHER']);

export const communityManagerStatus = pgEnum('community_manager_status', ['INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED']);

export const communityEventStatus = pgEnum('community_event_status', ['DRAFT', 'PUBLISHED', 'CANCELLED']);

export const communities = pgTable(
  'community',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: communityKind('kind').notNull(),
    /** The managing account. Null until a record is claimed or handed over (P2-D06). */
    ownerAccountId: uuid('owner_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    displayNameFa: text('display_name_fa').notNull(),
    aboutFa: text('about_fa'),
    /**
     * Public image of the record, stored privately and served through
     * `/media/[id]` only while the record itself is published, exactly as a
     * content image is (DEC-0160). The alternative text is mandatory at the
     * service, because an image nobody can see is worse than no image.
     */
    imageFileId: uuid('image_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),
    imageAltFa: text('image_alt_fa'),
    scope: communityScope('scope').notNull().default('OTHER'),
    provinceCode: text('province_code').references(() => provinces.code, { onDelete: 'restrict' }),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),

    /** An association's registration, exactly as a reviewer recorded it. Never assumed (§11). */
    registrationNumber: text('registration_number'),
    licenceStatus: licenceStatus('licence_status').notNull().default('NONE'),
    licenceVerifiedAt: timestamp('licence_verified_at', { withTimezone: true }),

    /** How one joins. Membership itself lives outside Hamzist (§11, DEC-0170). */
    membershipInfoFa: text('membership_info_fa'),
    membershipUrl: text('membership_url'),
    contactPhone: text('contact_phone'),
    websiteUrl: text('website_url'),

    /** Only a club, and only with the superadmin's permission, publishes its own posts (§11). */
    canPublishPosts: boolean('can_publish_posts').notNull().default(false),

    publicSlug: text('public_slug'),
    publicStatus: vetPublicStatus('public_status').notNull().default('DRAFT'),
    publicPublishedAt: timestamp('public_published_at', { withTimezone: true }),
    hiddenByReview: boolean('hidden_by_review').notNull().default(false),
    /** Where the information of a record nobody owns came from. Internal, never public. */
    sourceFa: text('source_fa'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),

    /**
     * Set when this record turned out to be a duplicate of another (§21,
     * PROMPT-016). The row stays, with its history and its public address.
     */
    mergedIntoCommunityId: uuid('merged_into_community_id').references((): AnyPgColumn => communities.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    check(
      'community_not_merged_into_itself',
      sql`${t.mergedIntoCommunityId} is null or ${t.mergedIntoCommunityId} <> ${t.id}`,
    ),
    uniqueIndex('community_public_slug_key').on(t.publicSlug),
    index('community_kind_status_idx').on(t.kind, t.publicStatus),
    index('community_owner_idx').on(t.ownerAccountId),
  ],
);

export const communitySpecies = pgTable(
  'community_species',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.speciesCode] })],
);

export const communityBreeds = pgTable(
  'community_breed',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => referenceBreeds.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.breedId] })],
);

/** A person shown as a manager appears only after accepting the invitation (§20). */
export const communityManagers = pgTable(
  'community_manager',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    roleFa: text('role_fa'),
    status: communityManagerStatus('status').notNull().default('INVITED'),
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
    uniqueIndex('community_manager_unique_key').on(t.communityId, t.accountId),
    index('community_manager_account_idx').on(t.accountId, t.status),
  ],
);

/**
 * An announced event. Its dates are what the community recorded; nothing here
 * reserves a place or promises a time on the product's behalf (P2-D08).
 */
export const communityEvents = pgTable(
  'community_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    titleFa: text('title_fa').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'restrict' }),
    placeFa: text('place_fa'),
    descriptionFa: text('description_fa'),
    registrationUrl: text('registration_url'),
    status: communityEventStatus('status').notNull().default('DRAFT'),
    /** Why a published event was cancelled; shown next to it rather than deleting the record. */
    cancelReasonFa: text('cancel_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('community_event_idx').on(t.communityId, t.startsOn)],
);
