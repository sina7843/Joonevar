import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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

/** Reference breeds, searchable in Persian and English (§15.2). Managed data, not code. */
export const referenceBreeds = pgTable(
  'reference_breed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameFa: text('name_fa').notNull(),
    nameEn: text('name_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('reference_breed_name_en_key').on(t.nameEn)],
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
