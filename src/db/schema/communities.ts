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
import { bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { accounts, storedFiles, referenceBreeds, species } from './core.ts';
import { cities, provinces } from './geography.ts';
import { licenceStatus, vetPublicStatus } from './vets.ts';

const now = sql`now()`;

export const communityKind = pgEnum('community_kind', ['ASSOCIATION', 'CLUB']);

/** What the community covers (§11): the country, a province, a city, a breed, a sport, or something else it states. */
export const communityScope = pgEnum('community_scope', ['NATIONAL', 'PROVINCIAL', 'CITY', 'BREED', 'SPORT', 'OTHER']);

export const communityManagerStatus = pgEnum('community_manager_status', ['INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED']);

/**
 * Where a club stands — Phase 2.5 §8 (PROMPT-012).
 *
 * A club is created as a draft, asks to be verified, and is only public once the
 * association made it ACTIVE. Suspension, rejection and archiving are recorded
 * states of the same record: nothing is deleted. Associations keep the Phase 2
 * behaviour and are migrated straight to ACTIVE.
 */
export const communityLifecycle = pgEnum('community_lifecycle', [
  'DRAFT',
  'PENDING_VERIFICATION',
  'NEEDS_CORRECTION',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'ARCHIVED',
]);

/**
 * What somebody may do inside one club. The assignment lives on
 * `community_manager`, so a person is never listed twice for the same club, and
 * it means nothing anywhere else: a role in one club grants no access to another.
 */
export const communityRole = pgEnum('community_role', ['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER']);

/**
 * Where a club's own rule set stands — Phase 2.5 §9 (PROMPT-013). A club edits a
 * draft, publishes it, and the published one is what new applications are judged
 * by; a superseded version stays readable because members were admitted under it.
 */
export const clubRuleStatus = pgEnum('club_rule_status', ['DRAFT', 'PUBLISHED', 'SUPERSEDED']);

/**
 * Somebody's standing in one club. INELIGIBLE is a real recorded answer, not an
 * error: it says the rules were evaluated and which of them did not hold.
 */
export const clubMembershipStatus = pgEnum('club_membership_status', [
  'INELIGIBLE',
  'PENDING_REVIEW',
  'AWAITING_PAYMENT',
  'ACTIVE',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
  'LEFT',
]);

/** How somebody asks to own a club: taking an unowned one, or receiving a handover. */
export const communityOwnershipKind = pgEnum('community_ownership_kind', ['CLAIM', 'TRANSFER']);
export const communityOwnershipStatus = pgEnum('community_ownership_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

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

    /**
     * The club lifecycle (PROMPT-012). Publication is a separate question: a club
     * is public only while it is ACTIVE *and* published, so verification cannot be
     * bypassed by publishing and publishing is not implied by verification.
     */
    lifecycle: communityLifecycle('lifecycle').notNull().default('DRAFT'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedByAccountId: uuid('verified_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    /** Why the association decided what it decided; shown to the club's owner. */
    lifecycleReasonFa: text('lifecycle_reason_fa'),

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
    index('community_lifecycle_idx').on(t.kind, t.lifecycle),
    // A verified club knows who verified it and when; an unverified one claims neither.
    check('community_verified_together', sql`(${t.verifiedAt} is null) = (${t.verifiedByAccountId} is null)`),
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
    /** What this person may do inside this one club, and nowhere else (PROMPT-012). */
    role: communityRole('role').notNull().default('MEMBER'),
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
 * Somebody asking to own a club — Phase 2.5 §8 (PROMPT-012).
 *
 * A CLAIM asks for a club nobody owns; a TRANSFER is the owner handing it to a
 * named account, which that account and the association still have to accept.
 * Only one request is open per club at a time, so two people cannot be given the
 * same club by two decisions that never saw each other.
 */
export const communityOwnershipRequests = pgTable(
  'community_ownership_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    kind: communityOwnershipKind('kind').notNull(),
    /** Who asked: the claimant, or the owner who is handing the club over. */
    requestedByAccountId: uuid('requested_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Who would end up owning it. For a claim this is the requester. */
    targetAccountId: uuid('target_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: communityOwnershipStatus('status').notNull().default('PENDING'),
    reasonFa: text('reason_fa'),
    decisionReasonFa: text('decision_reason_fa'),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('community_ownership_open_key').on(t.communityId).where(sql`${t.status} = 'PENDING'`),
    index('community_ownership_target_idx').on(t.targetAccountId, t.status),
  ],
);

/**
 * One published (or drafted) version of a club's joining rules — Phase 2.5 §9.
 *
 * The rules are data, never code: `tree` holds an allowlisted condition tree that
 * `src/clubs/rules-model.ts` validates and evaluates, and nothing in it is ever
 * executed as an expression. A version is immutable once published, because
 * members are admitted under a named version and have to stay judged by it.
 */
export const clubRuleVersions = pgTable(
  'club_rule_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    status: clubRuleStatus('status').notNull().default('DRAFT'),
    /** The allowlisted ALL/ANY condition tree, as validated data. */
    tree: jsonb('tree').notNull(),
    /** The club's own joining terms, and the version an applicant accepts. */
    termsFa: text('terms_fa'),
    termsVersion: text('terms_version'),
    /** An optional joining fee in Toman; null means the club asks for no money. */
    feeToman: bigint('fee_toman', { mode: 'bigint' }),
    /** Null means a membership that does not expire by itself. */
    membershipDays: integer('membership_days'),
    noteFa: text('note_fa'),
    createdByAccountId: uuid('created_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('club_rule_version_key').on(t.communityId, t.versionNumber),
    // One draft being written and one set of rules in force, per club.
    uniqueIndex('club_rule_draft_key').on(t.communityId).where(sql`${t.status} = 'DRAFT'`),
    uniqueIndex('club_rule_published_key').on(t.communityId).where(sql`${t.status} = 'PUBLISHED'`),
    check('club_rule_fee_positive', sql`${t.feeToman} is null or ${t.feeToman} > 0`),
    check('club_rule_days_positive', sql`${t.membershipDays} is null or ${t.membershipDays} > 0`),
    // Published rules carry who published them and when, or neither.
    check('club_rule_published_together', sql`(${t.publishedAt} is null) = (${t.publishedByAccountId} is null)`),
  ],
);

/**
 * Somebody's membership of one club — Phase 2.5 §9 (PROMPT-013).
 *
 * `admittedRuleVersionId` is the version this member was admitted under and goes
 * on being judged by; `evaluatedRuleVersionId` is the version the last
 * evaluation used. They differ exactly when the club published new rules and has
 * not run an audited re-evaluation campaign.
 */
export const clubMemberships = pgTable(
  'club_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: clubMembershipStatus('status').notNull().default('INELIGIBLE'),
    admittedRuleVersionId: uuid('admitted_rule_version_id').references(() => clubRuleVersions.id, { onDelete: 'restrict' }),
    evaluatedRuleVersionId: uuid('evaluated_rule_version_id').references(() => clubRuleVersions.id, { onDelete: 'restrict' }),
    /** What the last evaluation said, kept so the applicant sees why, without re-deriving it. */
    unmetFa: jsonb('unmet_fa'),
    acceptedTermsVersion: text('accepted_terms_version'),
    acceptedTermsAt: timestamp('accepted_terms_at', { withTimezone: true }),
    /** The joining fee this membership was asked for, frozen when the payment started. */
    feeToman: bigint('fee_toman', { mode: 'bigint' }),
    paymentBatchId: uuid('payment_batch_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReasonFa: text('decision_reason_fa'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('club_membership_key').on(t.communityId, t.accountId),
    index('club_membership_status_idx').on(t.communityId, t.status),
    index('club_membership_account_idx').on(t.accountId, t.status),
  ],
);

/**
 * An explicit, audited re-evaluation of a club's existing members against a
 * newer rule version. Nothing re-judges a member without one of these: that is
 * what keeps a rule change from quietly removing people.
 */
export const clubReevaluations = pgTable(
  'club_reevaluation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    ruleVersionId: uuid('rule_version_id')
      .notNull()
      .references(() => clubRuleVersions.id, { onDelete: 'restrict' }),
    launchedByAccountId: uuid('launched_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    reasonFa: text('reason_fa').notNull(),
    /** What the campaign did, counted when it ran; no scheduler re-runs it later. */
    examined: integer('examined').notNull().default(0),
    stillEligible: integer('still_eligible').notNull().default(0),
    nowIneligible: integer('now_ineligible').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('club_reevaluation_idx').on(t.communityId, t.createdAt)],
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
