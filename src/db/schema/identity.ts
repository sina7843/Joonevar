import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, storedFiles } from './core.ts';
import { actorContext } from './enums.ts';

const now = sql`now()`;

/** KYC workflow of §6.3. NEEDS_CORRECTION and REJECTED both carry a reason. */
export const kycStatus = pgEnum('kyc_status', [
  'DRAFT',
  'READY',
  'UNDER_REVIEW',
  'APPROVED',
  'NEEDS_CORRECTION',
  'REJECTED',
]);

/**
 * A one-time code is issued for exactly one purpose. A login code can never be
 * replayed to confirm a mobile change, and §20 forbids minting a new OTP just
 * to sign an agreement.
 */
export const otpPurpose = pgEnum('otp_purpose', ['LOGIN', 'MOBILE_CHANGE']);

/**
 * Identity details (§6.2). Separate from `account` because the account exists
 * from the first verified OTP, while the profile is filled in afterwards.
 */
export const profiles = pgTable(
  'profile',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** Ten digits, globally unique, read-only once KYC is approved (§6.4). */
    nationalId: text('national_id').notNull(),
    birthDate: date('birth_date').notNull(),
    displayName: text('display_name'),
    displayNameVisible: boolean('display_name_visible').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('profile_national_id_key').on(t.nationalId)],
);

/**
 * Residence is an optional group. An empty residence must never block account
 * completion, KYC or animal registration (§6.2); only entered values are
 * validated.
 */
export const residences = pgTable('residence', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  province: text('province'),
  city: text('city'),
  address: text('address'),
  postalCode: text('postal_code'),
  geoLat: text('geo_lat'),
  geoLng: text('geo_lng'),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
});

/**
 * KYC case (§6.3). One open case per account; the reviewed history stays in the
 * audit trail. The attached file is a private stored file, never a public link.
 */
export const kycCases = pgTable(
  'kyc_case',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: kycStatus('status').notNull().default('DRAFT'),
    /** Required for NEEDS_CORRECTION and REJECTED (§6.3, §21.5). */
    reasonFa: text('reason_fa'),
    documentFileId: uuid('document_file_id').references(() => storedFiles.id, { onDelete: 'restrict' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('kyc_case_account_key').on(t.accountId),
    index('kyc_case_status_idx').on(t.status, t.submittedAt),
  ],
);

/**
 * One-time codes.
 *
 * Only a hash of the code is stored. Attempts, resends and the lock window live
 * on the row so the limits are enforced by data rather than by memory that a
 * restart would clear.
 */
export const otpChallenges = pgTable(
  'otp_challenge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: otpPurpose('purpose').notNull(),
    /** The number the code was sent to. For MOBILE_CHANGE this is the new number. */
    mobile: text('mobile').notNull(),
    /** Set for MOBILE_CHANGE; null while signing in, where no account is known yet. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    resendCount: integer('resend_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().default(now),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('otp_challenge_lookup_idx').on(t.mobile, t.purpose, t.createdAt),
    index('otp_challenge_account_idx').on(t.accountId),
  ],
);

/**
 * Server session.
 *
 * The cookie carries a random token; only its hash is stored, so a database
 * read cannot be replayed as a session. `context` lives here rather than in the
 * cookie, which is what makes the role switch a server decision (D10).
 */
export const sessions = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    context: actorContext('context').notNull().default('USER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().default(now),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('session_token_key').on(t.tokenHash),
    index('session_account_idx').on(t.accountId),
  ],
);

/**
 * Development SMS outbox.
 *
 * The local-test sender writes here so a developer — and the browser review —
 * can complete a sign-in without a real provider. It is written only outside
 * production with local integrations, the real provider never touches it, and
 * the only way to read it back is `/dev/sms`, which does not exist outside that
 * same development configuration.
 */
export const devOutboundSms = pgTable(
  'dev_outbound_sms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toMobile: text('to_mobile').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('dev_outbound_sms_to_idx').on(t.toMobile, t.createdAt)],
);
