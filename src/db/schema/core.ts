import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  accountRole,
  accountRoleStatus,
  accountStatus,
  auditActorType,
  breedClaimKind,
  breedCoat,
  breedLevel,
  breedProfileStatus,
  breedSize,
  deliveryStatus,
  filePurpose,
  notificationChannel,
  settingGroup,
  settingKind,
  settingScopeType,
  settingSource,
} from './enums.ts';

const now = sql`now()`;

/**
 * Account is deliberately minimal here. Identity, OTP, KYC and profile belong to
 * PROMPT-004 and arrive in their own migration; the foundation only needs a
 * stable actor to own files, receive notifications and appear in audit rows.
 */
export const accounts = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mobile: text('mobile').notNull(),
    status: accountStatus('status').notNull().default('PROFILE_INCOMPLETE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('account_mobile_key').on(t.mobile)],
);

/**
 * Roles are additive and independent of membership. Losing membership suspends
 * accepting new work; it does not remove the role (D05).
 */
export const accountRoles = pgTable(
  'account_role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    role: accountRole('role').notNull(),
    status: accountRoleStatus('status').notNull().default('PENDING'),
    grantedAt: timestamp('granted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('account_role_unique').on(t.accountId, t.role)],
);

/**
 * Versioned product settings (D15, D16, §21.4).
 *
 * `value` NULL means NOT_CONFIGURED. That is a real, reportable state: a missing
 * tariff must surface as «تعیین‌نشده» and block that payment path, never as 0.
 * `version` increments on every write and is what other records snapshot.
 */
export const productSettings = pgTable(
  'product_setting',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    scopeType: settingScopeType('scope_type').notNull().default('GLOBAL'),
    scopeId: text('scope_id').notNull().default(''),
    group: settingGroup('group').notNull(),
    kind: settingKind('kind').notNull(),
    source: settingSource('source').notNull(),
    /** NULL = NOT_CONFIGURED. */
    value: jsonb('value'),
    /** Persian label and help text shown in the admin panel. */
    labelFa: text('label_fa').notNull(),
    noteFa: text('note_fa'),
    version: integer('version').notNull().default(1),
    updatedByAccountId: uuid('updated_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('product_setting_scope_key').on(t.key, t.scopeType, t.scopeId),
    index('product_setting_group_idx').on(t.group),
  ],
);

/**
 * One audit table for the whole product (§23.3). Every sensitive change records
 * actor, time, target, and either before/after or the record version.
 * Values written here are already redacted by the caller: no OTP, no national
 * id, no file bytes, no receipt image, no secret.
 */
export const auditEvents = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().default(now),
    actorType: auditActorType('actor_type').notNull(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** Context the actor was acting in, so a vet action is never confused with a user action. */
    actorContext: text('actor_context'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetVersion: integer('target_version'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    metadata: jsonb('metadata'),
  },
  (t) => [
    index('audit_event_target_idx').on(t.targetType, t.targetId),
    index('audit_event_actor_idx').on(t.actorAccountId),
    index('audit_event_occurred_idx').on(t.occurredAt),
  ],
);

/**
 * A notification always carries the exact entity, step and origin route, so
 * opening it reopens the same case at the same step rather than a generic list
 * (§8). Authorization is re-checked server-side when it is opened.
 */
export const notifications = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientAccountId: uuid('recipient_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    step: text('step').notNull(),
    originRoute: text('origin_route').notNull(),
    selection: jsonb('selection'),
    titleFa: text('title_fa').notNull(),
    bodyFa: text('body_fa').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    index('notification_recipient_idx').on(t.recipientAccountId, t.createdAt),
    index('notification_entity_idx').on(t.entityType, t.entityId),
  ],
);

/**
 * Delivery is separate from the notification itself and keyed by an idempotency
 * key, so a retried job or a duplicated event cannot send twice (§22, §23.4).
 */
export const notificationDeliveries = pgTable(
  'notification_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: deliveryStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('notification_delivery_idem_key').on(t.idempotencyKey)],
);

/**
 * Private files. Only the storage key is persisted; there is no public URL and
 * no path derived from user input. Downloads go through an authorized route.
 */
export const storedFiles = pgTable(
  'stored_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    purpose: filePurpose('purpose').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('stored_file_storage_key').on(t.storageKey),
    index('stored_file_owner_idx').on(t.ownerAccountId),
  ],
);

/**
 * Species — the shared filter for content, vets and centres (Requirements-Phase-2
 * §6, P2-D01). A taxonomy rather than managed data: rows arrive with versioned
 * migrations and are keyed by the stable code `animal.species` already stored,
 * so that column stops being free text without rewriting a single animal
 * (DEC-0154).
 */
export const species = pgTable('species', {
  code: text('code').primaryKey(),
  nameFa: text('name_fa').notNull(),
  nameEn: text('name_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
});

/** FCI breed groups — the published FCI nomenclature, seeded by migration (DEC-0154). */
export const breedGroups = pgTable(
  'breed_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
    fciGroup: integer('fci_group').notNull(),
    nameFa: text('name_fa').notNull(),
    nameEn: text('name_en').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('breed_group_fci_key').on(t.speciesCode, t.fciGroup)],
);

/**
 * Reference breeds, searchable in Persian and English (§15.2). Managed data, not code.
 *
 * Phase 2 grows the breed bank on this same row (P2-D15): animals and kennels
 * keep pointing at the id they always did. Two independent axes live here —
 * `isActive` decides whether Phase 1 forms offer the breed, `profileStatus`
 * whether its public page exists — and a merged duplicate keeps its row so no
 * recorded animal is rewritten (DEC-0155).
 */
export const referenceBreeds = pgTable(
  'reference_breed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameFa: text('name_fa').notNull(),
    nameEn: text('name_en').notNull(),
    /**
     * Public image of the record, stored privately and served through
     * `/media/[id]` only while the record itself is published, exactly as a
     * content image is (DEC-0160). The alternative text is mandatory at the
     * service, because an image nobody can see is worse than no image.
     */
    imageFileId: uuid('image_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),
    imageAltFa: text('image_alt_fa'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    speciesCode: text('species_code')
      .notNull()
      .default('DOG')
      .references(() => species.code, { onDelete: 'restrict' }),
    /** Stable public address. A change leaves the old one in `breed_slug_redirect`. */
    slug: text('slug').notNull(),
    altNames: text('alt_names').array().notNull().default(sql`'{}'::text[]`),
    groupId: uuid('group_id').references(() => breedGroups.id, { onDelete: 'restrict' }),
    /** ISO 3166-1 alpha-2; the Persian name comes from the platform, not a stored string. */
    originCountry: text('origin_country'),
    size: breedSize('size'),
    coat: breedCoat('coat'),
    energy: breedLevel('energy'),
    trainability: breedLevel('trainability'),
    careNeed: breedLevel('care_need'),
    withChildren: breedLevel('with_children'),
    withOtherAnimals: breedLevel('with_other_animals'),
    historyFa: text('history_fa'),
    standardFa: text('standard_fa'),
    standardUrl: text('standard_url'),

    profileStatus: breedProfileStatus('profile_status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    mergedIntoBreedId: uuid('merged_into_breed_id').references((): AnyPgColumn => referenceBreeds.id, {
      onDelete: 'restrict',
    }),
    /** Optimistic concurrency for profile edits: two editors cannot silently overwrite each other. */
    version: integer('version').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('reference_breed_name_en_key').on(t.nameEn),
    uniqueIndex('reference_breed_slug_key').on(t.slug),
    index('reference_breed_profile_status_idx').on(t.profileStatus),
    check('reference_breed_origin_country_check', sql`${t.originCountry} ~ '^[A-Z]{2}$'`),
    check('reference_breed_slug_check', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('reference_breed_not_merged_into_itself', sql`${t.mergedIntoBreedId} <> ${t.id}`),
  ],
);

/** An old slug keeps resolving after a rename (Requirements-Phase-2 §23). */
export const breedSlugRedirects = pgTable('breed_slug_redirect', {
  slug: text('slug').primaryKey(),
  breedId: uuid('breed_id')
    .notNull()
    .references(() => referenceBreeds.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
});

/**
 * Medical content of a breed: health notes, predisposed conditions and suggested
 * genetic tests. §6 requires a source and a review date for every medical
 * claim, so both are columns that cannot be empty. A removed claim is archived,
 * never deleted (P2-D13). A suggested test is information only — it orders
 * nothing and names no centre (DEC-0156).
 */
export const breedMedicalClaims = pgTable(
  'breed_medical_claim',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => referenceBreeds.id, { onDelete: 'restrict' }),
    kind: breedClaimKind('kind').notNull(),
    titleFa: text('title_fa').notNull(),
    noteFa: text('note_fa'),
    sourceTitle: text('source_title').notNull(),
    sourceUrl: text('source_url'),
    reviewedOn: date('reviewed_on').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('breed_medical_claim_breed_idx').on(t.breedId)],
);

/**
 * Registry of pedigree issuers the association approves (D14). It starts empty
 * on purpose: no issuer name is invented here, and an empty registry does not
 * remove the review path — it only means no document can be approved yet.
 */
export const pedigreeIssuers = pgTable(
  'pedigree_issuer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    country: text('country'),
    isActive: boolean('is_active').notNull().default(true),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    noteFa: text('note_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('pedigree_issuer_name_key').on(t.name)],
);
