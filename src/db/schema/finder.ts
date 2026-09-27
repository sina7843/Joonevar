/**
 * Phase 4 mating finder foundations — PROMPT-002 (DEC-0218).
 *
 * Three tables, each immutable in the part that history depends on:
 *  - a plan version is written once; publishing a new one archives the old, so
 *    what a person paid for can always be read back;
 *  - a subscription period copies the whole plan version onto itself when the
 *    checkout opens, so a later price or capacity edit rewrites nobody;
 *  - a breed rule version is written once; every later evaluation records which
 *    version it read.
 *
 * Bounds that are not per-breed (request expiry, OTP, media, the free-owner
 * capacity and the kill switches) are managed product settings in the
 * MATING_FINDER group, because `product_setting` already gives them versioning,
 * audit and a panel.
 */
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  finderCancelKind,
  finderContractStatus,
  finderTemplateStatus,
  matingFinancialCategory,
  matingPlaceCategory,
  matingRequestStatus,
  matingRoute,
  animalLifeEventKind,
  fertilityStatus,
  lastMatingSource,
  matingMediaKind,
  matingMediaRole,
  matingMediaStatus,
  matingProfileDeactivation,
  matingProfileState,
  finderPeriodKind,
  finderPlanAudience,
  finderPlanStatus,
  finderRuleMode,
  finderRuleStatus,
  finderSubscriptionStatus,
  finderSuspensionPolicy,
} from './enums.ts';
import { accounts, referenceBreeds, species, storedFiles } from './core.ts';
import { paymentBatches } from './billing.ts';
import { animals, animalSex } from './animals.ts';

const now = sql`now()`;

/**
 * One published version per (audience, duration). Durations are the four the
 * product names (PRODUCT_DECISIONS §2); a price left null means the plan exists
 * but cannot be bought yet, which the checkout says in so many words.
 */
export const finderPlanVersions = pgTable(
  'finder_plan_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audience: finderPlanAudience('audience').notNull(),
    durationMonths: integer('duration_months').notNull(),
    version: integer('version').notNull(),
    status: finderPlanStatus('status').notNull().default('PUBLISHED'),
    titleFa: text('title_fa').notNull(),
    /** Null = NOT_CONFIGURED: the plan is shown but checkout refuses it. Never 0. */
    priceToman: bigint('price_toman', { mode: 'bigint' }),
    activeAnimalCapacity: integer('active_animal_capacity').notNull(),
    /** Optional sale window; outside it the plan is not sold. */
    purchasableFrom: timestamp('purchasable_from', { withTimezone: true }),
    purchasableUntil: timestamp('purchasable_until', { withTimezone: true }),
    suspensionPolicy: finderSuspensionPolicy('suspension_policy').notNull(),
    noteFa: text('note_fa'),
    reasonFa: text('reason_fa').notNull(),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    archivedByAccountId: uuid('archived_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archiveReasonFa: text('archive_reason_fa'),
  },
  (t) => [
    check('finder_plan_duration_check', sql`${t.durationMonths} in (1, 3, 6, 12)`),
    check('finder_plan_capacity_check', sql`${t.activeAnimalCapacity} >= 1`),
    check('finder_plan_price_check', sql`${t.priceToman} is null or ${t.priceToman} > 0`),
    check(
      'finder_plan_window_check',
      sql`${t.purchasableFrom} is null or ${t.purchasableUntil} is null or ${t.purchasableFrom} < ${t.purchasableUntil}`,
    ),
    uniqueIndex('finder_plan_version_key').on(t.audience, t.durationMonths, t.version),
    // Two admins publishing the same slot at once cannot leave two live versions.
    uniqueIndex('finder_plan_one_published_key')
      .on(t.audience, t.durationMonths)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

/**
 * One paid period. Everything the checkout priced is copied here, so the period
 * is readable without its plan and a later edit to the plan changes nothing.
 * Periods of one account never overlap: a renewal starts where the live chain
 * ends, and activation holds the account row lock while it decides that.
 */
export const finderSubscriptionPeriods = pgTable(
  'finder_subscription_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => finderPlanVersions.id, { onDelete: 'restrict' }),
    // ── snapshot of the plan version at checkout ──
    audience: finderPlanAudience('audience').notNull(),
    planVersion: integer('plan_version').notNull(),
    durationMonths: integer('duration_months').notNull(),
    activeAnimalCapacity: integer('active_animal_capacity').notNull(),
    priceToman: bigint('price_toman', { mode: 'bigint' }).notNull(),
    suspensionPolicy: finderSuspensionPolicy('suspension_policy').notNull(),
    // ──
    kind: finderPeriodKind('kind').notNull(),
    status: finderSubscriptionStatus('status').notNull().default('PENDING_PAYMENT'),
    paymentBatchId: uuid('payment_batch_id').references(() => paymentBatches.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    check(
      'finder_subscription_active_window_check',
      sql`${t.status} <> 'ACTIVE' or (${t.startsAt} is not null and ${t.endsAt} is not null and ${t.startsAt} < ${t.endsAt})`,
    ),
    check('finder_subscription_price_check', sql`${t.priceToman} > 0`),
    // One open checkout per account: two tabs cannot open two payments.
    uniqueIndex('finder_subscription_one_pending_key')
      .on(t.accountId)
      .where(sql`${t.status} = 'PENDING_PAYMENT'`),
    uniqueIndex('finder_subscription_batch_key').on(t.paymentBatchId),
    index('finder_subscription_account_idx').on(t.accountId, t.status, t.endsAt),
  ],
);

/**
 * A versioned breed-and-sex rule. A null breed is the species default, used for
 * any breed without its own published rule. Cooldown is either days or months,
 * never both, because the product states the male in days and the female in
 * months (PRODUCT_DECISIONS §4).
 *
 * Kinship degree: 1 = parent/child and full siblings, 2 = half siblings,
 * grandparent/grandchild, uncle/aunt, 3 = first cousins and the like. A pair at
 * or closer than `kinship_max_degree` triggers the kinship mode; null means any
 * detected kinship triggers it.
 */
export const finderBreedRules = pgTable(
  'finder_breed_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
    breedId: uuid('breed_id').references(() => referenceBreeds.id, { onDelete: 'restrict' }),
    sex: animalSex('sex').notNull(),
    version: integer('version').notNull(),
    status: finderRuleStatus('status').notNull().default('PUBLISHED'),
    /** Null = NOT_CONFIGURED; requests stay closed for the breed until it is set (DEC-0217 §13). */
    minAgeMonths: integer('min_age_months'),
    maxAgeMonths: integer('max_age_months'),
    cooldownDays: integer('cooldown_days'),
    cooldownMonths: integer('cooldown_months'),
    cooldownMode: finderRuleMode('cooldown_mode').notNull().default('WARN'),
    kinshipMaxDegree: integer('kinship_max_degree'),
    kinshipMode: finderRuleMode('kinship_mode').notNull().default('WARN'),
    warningFa: text('warning_fa'),
    reasonFa: text('reason_fa').notNull(),
    /** Null only for the seeded baseline, which no person published. */
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'finder_rule_cooldown_check',
      sql`(${t.cooldownDays} is null) <> (${t.cooldownMonths} is null)`,
    ),
    check('finder_rule_cooldown_positive_check', sql`coalesce(${t.cooldownDays}, ${t.cooldownMonths}) >= 0`),
    check(
      'finder_rule_age_check',
      sql`(${t.minAgeMonths} is null or ${t.minAgeMonths} >= 0) and (${t.maxAgeMonths} is null or ${t.maxAgeMonths} >= 1) and (${t.minAgeMonths} is null or ${t.maxAgeMonths} is null or ${t.minAgeMonths} <= ${t.maxAgeMonths})`,
    ),
    check('finder_rule_kinship_check', sql`${t.kinshipMaxDegree} is null or ${t.kinshipMaxDegree} between 1 and 6`),
    uniqueIndex('finder_rule_version_key').on(
      t.speciesCode,
      sql`coalesce(${t.breedId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.sex,
      t.version,
    ),
    uniqueIndex('finder_rule_one_published_key')
      .on(t.speciesCode, sql`coalesce(${t.breedId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.sex)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

// ── PROMPT-003: animal lifecycle facts the finder needs ──────────────────────

/**
 * The owner's statement about fertility, append-only. The newest row is the
 * current statement; every earlier one stays. It is shown and audited as the
 * owner's declaration and never as a veterinary finding (PRODUCT_DECISIONS §3).
 */
export const animalFertilityDeclarations = pgTable(
  'animal_fertility_declaration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    status: fertilityStatus('status').notNull(),
    declaredByAccountId: uuid('declared_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    noteFa: text('note_fa'),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('animal_fertility_animal_idx').on(t.animalId, t.declaredAt)],
);

/**
 * Death, going missing, being found, archiving and restoring, recorded by the
 * owner and never deleted. The animal record itself is not rewritten; its
 * current life status is read from the newest event.
 */
export const animalLifeEvents = pgTable(
  'animal_life_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    kind: animalLifeEventKind('kind').notNull(),
    occurredOn: date('occurred_on').notNull(),
    reasonFa: text('reason_fa').notNull(),
    recordedByAccountId: uuid('recorded_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('animal_life_event_animal_idx').on(t.animalId, t.createdAt)],
);

// ── PROMPT-003: the mating profile ───────────────────────────────────────────

/**
 * One profile per animal, created on the owner's first activation and never
 * deleted. `owner_account_id` is the owner who activated it: when it no longer
 * equals the animal's owner the profile is off the finder whatever its state
 * says, and a transfer also sets it INACTIVE in the same transaction.
 *
 * There is deliberately no last-mating column here: that is the derived
 * `animal_last_mating` projection, and nothing but a confirmation writes it.
 */
export const matingProfiles = pgTable(
  'mating_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    state: matingProfileState('state').notNull().default('INACTIVE'),
    deactivationReason: matingProfileDeactivation('deactivation_reason'),
    deactivationNoteFa: text('deactivation_note_fa'),
    preferencesFa: text('preferences_fa'),
    primaryMediaId: uuid('primary_media_id'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('mating_profile_animal_key').on(t.animalId),
    index('mating_profile_owner_idx').on(t.ownerAccountId, t.state),
    index('mating_profile_state_idx').on(t.state),
  ],
);

/**
 * Pictures and the one short clip of a profile. The original file is private;
 * a picture is public only through its rendition, which is the same image with
 * its metadata removed. The clip is not publicly served yet (its container
 * metadata is not stripped), so only the owner sees it.
 */
export const matingProfileMedia = pgTable(
  'mating_profile_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => matingProfiles.id, { onDelete: 'restrict' }),
    kind: matingMediaKind('kind').notNull(),
    role: matingMediaRole('role').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    renditionFileId: uuid('rendition_file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    altFa: text('alt_fa').notNull(),
    status: matingMediaStatus('status').notNull().default('ACTIVE'),
    statusReasonFa: text('status_reason_fa'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('mating_profile_media_profile_idx').on(t.profileId, t.status),
    uniqueIndex('mating_profile_media_rendition_key').on(t.renditionFileId),
    // One short clip per profile (PRODUCT_DECISIONS §6).
    uniqueIndex('mating_profile_one_video_key')
      .on(t.profileId)
      .where(sql`${t.kind} = 'VIDEO' and ${t.status} = 'ACTIVE'`),
    check('mating_profile_media_rendition_check', sql`${t.kind} = 'VIDEO' or ${t.renditionFileId} is not null`),
  ],
);

/**
 * The derived last mating of one animal (R5). Written only by the transaction
 * that confirms a date on either path, or by `rebuildLastMating`; there is no
 * endpoint that sets it. `confirmed_count` counts mutually confirmed dates. An
 * animal with no confirmed date has no row.
 */
export const animalLastMatings = pgTable('animal_last_mating', {
  animalId: uuid('animal_id')
    .primaryKey()
    .references(() => animals.id, { onDelete: 'restrict' }),
  lastMatedOn: date('last_mated_on').notNull(),
  source: lastMatingSource('source').notNull(),
  sourceId: uuid('source_id').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmedCount: integer('confirmed_count').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
});

// ── PROMPT-004: favourites, saved searches, match notices ─────────────────────

/** A profile the viewer keeps. Seeing it later still passes the visibility check. */
export const finderFavorites = pgTable(
  'finder_favorite',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => matingProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_favorite_key').on(t.accountId, t.profileId)],
);

/**
 * A stored search. `filters` is the validated filter object the search page
 * uses, never raw query text; `for_animal_id` makes it a match search for one
 * of the owner's animals.
 */
export const finderSavedSearches = pgTable(
  'finder_saved_search',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    nameFa: text('name_fa').notNull(),
    filters: jsonb('filters').notNull(),
    forAnimalId: uuid('for_animal_id').references(() => animals.id, { onDelete: 'restrict' }),
    notify: boolean('notify').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('finder_saved_search_account_idx').on(t.accountId), index('finder_saved_search_notify_idx').on(t.notify)],
);

/**
 * One notice per (saved search, profile), whatever makes the profile visible
 * again: the unique key is the deduplication (PROMPT-004).
 */
export const finderMatchNotices = pgTable(
  'finder_match_notice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    savedSearchId: uuid('saved_search_id')
      .notNull()
      .references(() => finderSavedSearches.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => matingProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_match_notice_key').on(t.savedSearchId, t.profileId)],
);

// ── PROMPT-005: requests ─────────────────────────────────────────────────────

/**
 * One request from one owner's animal to another owner's profile. Everything
 * decided at sending time is snapshotted in `snapshot` (both animals and owners,
 * the resolved breed, the rule versions and the compatibility outcome), so a
 * later edit to either animal or rule rewrites nothing already agreed on. The
 * negotiable terms live in columns and move with `terms_version`.
 */
export const matingRequests = pgTable(
  'mating_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderAccountId: uuid('sender_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    receiverAccountId: uuid('receiver_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    senderAnimalId: uuid('sender_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    receiverAnimalId: uuid('receiver_animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    receiverProfileId: uuid('receiver_profile_id')
      .notNull()
      .references(() => matingProfiles.id, { onDelete: 'restrict' }),
    status: matingRequestStatus('status').notNull().default('WAITING_REVIEW'),
    route: matingRoute('route').notNull(),
    windowFrom: date('window_from').notNull(),
    windowTo: date('window_to').notNull(),
    cityFa: text('city_fa').notNull(),
    placeCategory: matingPlaceCategory('place_category').notNull(),
    messageFa: text('message_fa'),
    financialCategory: matingFinancialCategory('financial_category').notNull(),
    specialConditionsFa: text('special_conditions_fa'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    termsVersion: integer('terms_version').notNull().default(1),
    /** Set while one side's changed terms wait for the other side (NEGOTIATING). */
    termsProposedByAccountId: uuid('terms_proposed_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    /** A competitor holds coordination for one of the two animals; this request waits. */
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    senderContactConsent: boolean('sender_contact_consent').notNull().default(false),
    receiverContactConsent: boolean('receiver_contact_consent').notNull().default(false),
    closedReasonFa: text('closed_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    check('mating_request_window_check', sql`${t.windowFrom} <= ${t.windowTo}`),
    check('mating_request_two_animals_check', sql`${t.senderAnimalId} <> ${t.receiverAnimalId}`),
    // Asking twice about the same pair while one request is alive is the same asking.
    uniqueIndex('mating_request_one_live_pair_key')
      .on(t.senderAnimalId, t.receiverAnimalId)
      .where(
        sql`${t.status} in ('WAITING_REVIEW','PRELIMINARILY_ACCEPTED','NEGOTIATING','CONTRACT_DRAFTING','CONTRACT_CONFIRMED')`,
      ),
    index('mating_request_receiver_idx').on(t.receiverAccountId, t.status),
    index('mating_request_sender_idx').on(t.senderAccountId, t.status),
    index('mating_request_expiry_idx').on(t.status, t.expiresAt),
  ],
);

/** Every status change with its actor and reason; nothing here is rewritten. */
export const matingRequestEvents = pgTable(
  'mating_request_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    fromStatus: matingRequestStatus('from_status'),
    toStatus: matingRequestStatus('to_status').notNull(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reasonFa: text('reason_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('mating_request_event_request_idx').on(t.requestId, t.createdAt)],
);

/**
 * The single-winner lock (R7). Entering contract coordination writes one active
 * row per animal; the partial unique index lets only one request hold an animal
 * at a time, whatever the timing. Releasing sets `active` false and keeps the row.
 */
export const matingCoordinations = pgTable(
  'mating_coordination',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('mating_coordination_one_active_key').on(t.animalId).where(sql`${t.active}`),
    uniqueIndex('mating_coordination_request_animal_key').on(t.requestId, t.animalId),
  ],
);

// ── PROMPT-005: conversation ─────────────────────────────────────────────────

/** Opened at preliminary acceptance, one per request; only its two parties read it. */
export const finderConversations = pgTable(
  'finder_conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_conversation_request_key').on(t.requestId)],
);

export const finderMessages = pgTable(
  'finder_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => finderConversations.id, { onDelete: 'restrict' }),
    senderAccountId: uuid('sender_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** Stored as shown: contact details masked until both sides agreed to reveal them. */
    bodyFa: text('body_fa'),
    redacted: boolean('redacted').notNull().default(false),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    check('finder_message_content_check', sql`${t.bodyFa} is not null or ${t.fileId} is not null`),
    index('finder_message_conversation_idx').on(t.conversationId, t.createdAt),
  ],
);

/** One side stopped hearing from the other in this conversation. */
export const finderConversationBlocks = pgTable(
  'finder_conversation_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => finderConversations.id, { onDelete: 'restrict' }),
    blockerAccountId: uuid('blocker_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_conversation_block_key').on(t.conversationId, t.blockerAccountId)],
);

// ── PROMPT-005: contract ─────────────────────────────────────────────────────

/**
 * A contract template version. `clauses` is the ordered list of
 * { key, required, titleFa, bodyFa }. Required clauses cannot be removed from a
 * contract; the text is the superadmin's, and none is seeded (DEC-0217 §13).
 */
export const finderContractTemplates = pgTable(
  'finder_contract_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull(),
    status: finderTemplateStatus('status').notNull().default('PUBLISHED'),
    titleFa: text('title_fa').notNull(),
    clauses: jsonb('clauses').notNull(),
    reasonFa: text('reason_fa').notNull(),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(now),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('finder_template_version_key').on(t.version),
    uniqueIndex('finder_template_one_published_key').on(t.status).where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

export const finderContracts = pgTable(
  'finder_contract',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => finderContractTemplates.id, { onDelete: 'restrict' }),
    status: finderContractStatus('status').notNull().default('DRAFTING'),
    currentNumber: integer('current_number').notNull().default(1),
    confirmedNumber: integer('confirmed_number'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    pdfFileId: uuid('pdf_file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    cancelRequestedByAccountId: uuid('cancel_requested_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    cancelKind: finderCancelKind('cancel_kind'),
    cancelledByAccountId: uuid('cancelled_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReasonFa: text('cancel_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_contract_request_key').on(t.requestId)],
);

/** Every edit is a new numbered version with its own content hash; nothing is edited in place. */
export const finderContractVersions = pgTable(
  'finder_contract_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => finderContracts.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_contract_version_key').on(t.contractId, t.number)],
);

/**
 * A one-time code bound to one account, one contract version and its hash. The
 * code is stored only as a salted hash; consuming it is a conditional update,
 * so it works once.
 */
export const finderContractOtps = pgTable(
  'finder_contract_otp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractVersionId: uuid('contract_version_id')
      .notNull()
      .references(() => finderContractVersions.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    contentHash: text('content_hash').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('finder_contract_otp_version_idx').on(t.contractVersionId, t.accountId)],
);

/** One approval per account per version, tied to the hash that was shown and the code that proved it. */
export const finderContractApprovals = pgTable(
  'finder_contract_approval',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractVersionId: uuid('contract_version_id')
      .notNull()
      .references(() => finderContractVersions.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    contentHash: text('content_hash').notNull(),
    otpId: uuid('otp_id')
      .notNull()
      .references(() => finderContractOtps.id, { onDelete: 'restrict' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('finder_contract_approval_key').on(t.contractVersionId, t.accountId),
    uniqueIndex('finder_contract_approval_otp_key').on(t.otpId),
  ],
);

// ── PROMPT-007: blocks, confidential feedback, reminders ─────────────────────

/**
 * One person blocking another across the whole finder. Lifting keeps the row;
 * a new block after that is a new row.
 */
export const finderUserBlocks = pgTable(
  'finder_user_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerAccountId: uuid('blocker_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    blockedAccountId: uuid('blocked_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('finder_user_block_active_key').on(t.blockerAccountId, t.blockedAccountId).where(sql`${t.liftedAt} is null`),
    index('finder_user_block_blocked_idx').on(t.blockedAccountId),
    check('finder_user_block_self_check', sql`${t.blockerAccountId} <> ${t.blockedAccountId}`),
  ],
);

/**
 * Confidential feedback after a mating event. Read only by authorised
 * operations; never shown to the other party and never a public rating.
 */
export const finderFeedback = pgTable(
  'finder_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    authorAccountId: uuid('author_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    score: integer('score').notNull(),
    bodyFa: text('body_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('finder_feedback_author_key').on(t.requestId, t.authorAccountId),
    check('finder_feedback_score_check', sql`${t.score} between 1 and 5`),
  ],
);

/** One reminder of one kind per request, ever: the sweep may run as often as it likes. */
export const finderReminders = pgTable(
  'finder_reminder',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => matingRequests.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('finder_reminder_key').on(t.requestId, t.kind)],
);
