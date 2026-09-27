/**
 * Reports and moderation — Requirements-Phase-2 §13 (PROMPT-005).
 *
 * A report names what it is about through `target_kind` and one typed foreign
 * key per kind, so a report keeps a real reference to the content (and later the
 * profile) it concerns instead of a loose id. The decision is written onto the
 * report itself — who, when, which decision and why — and the change it caused
 * is audited where it happens.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, storedFiles } from './core.ts';
import { contentItems } from './content.ts';
import { communities } from './communities.ts';
import { animalListingMedia, animalListings } from './marketplace.ts';
import { inquiryMessages } from './inquiry.ts';
import { questions, reviews } from './trust.ts';
import { finderMessages, matingProfileMedia, matingProfiles, matingRequests } from './finder.ts';
import {
  finderReportCategory,
  sanctionScope,
  moderationAppealStatus,
  moderationDecision,
  reportReason,
  reportStatus,
  reportTargetKind,
} from './enums.ts';

const now = sql`now()`;

export const moderationReports = pgTable(
  'moderation_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetKind: reportTargetKind('target_kind').notNull().default('CONTENT'),
    contentId: uuid('content_id').references(() => contentItems.id, { onDelete: 'restrict' }),
    /** A report about a club names the club itself, the way a content report names its item. */
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'restrict' }),
    /*
     * Phase 3 (PROMPT-004). Three more things a marketplace gets reported for,
     * each with its own typed reference for the same reason the first two have
     * one: a report has to keep pointing at something real after the page it
     * was made from has changed.
     */
    /** Set for an ANIMAL_LISTING report only; a media report names the picture. */
    listingId: uuid('listing_id').references(() => animalListings.id, { onDelete: 'restrict' }),
    listingMediaId: uuid('listing_media_id').references(() => animalListingMedia.id, { onDelete: 'restrict' }),
    sellerAccountId: uuid('seller_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    /** Chat evidence: one message of one transaction thread (PROMPT-005). */
    inquiryMessageId: uuid('inquiry_message_id').references(() => inquiryMessages.id, { onDelete: 'restrict' }),
    /*
     * Phase 3 (PROMPT-012). What buyers write in public gets reported for the
     * same reasons everything else does, and keeps a real reference for the
     * same reason: the page it was reported from will have changed by the
     * time anybody reads the report.
     */
    reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'restrict' }),
    /** Phase 4 (PROMPT-003): a mating profile, or one of its pictures. */
    matingProfileId: uuid('mating_profile_id').references(() => matingProfiles.id, { onDelete: 'restrict' }),
    matingProfileMediaId: uuid('mating_profile_media_id').references(() => matingProfileMedia.id, {
      onDelete: 'restrict',
    }),
    /** Phase 4 (PROMPT-005): one message of a finder conversation, reported by a party to it. */
    finderMessageId: uuid('finder_message_id').references(() => finderMessages.id, { onDelete: 'restrict' }),
    /** Phase 4 (PROMPT-007): a mating request, or a person met through the finder. */
    finderRequestId: uuid('finder_request_id').references(() => matingRequests.id, { onDelete: 'restrict' }),
    reportedAccountId: uuid('reported_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    /** The finder category; the generic `reason` keeps its nearest value for older readers. */
    finderCategory: finderReportCategory('finder_category'),
    /** Who took the report from the queue; one moderator works a report at a time. */
    assignedToAccountId: uuid('assigned_to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    questionId: uuid('question_id').references(() => questions.id, { onDelete: 'restrict' }),
    /** The listing revision the reporter was reading, so a later edit is visible against it. */
    listingRevision: integer('listing_revision'),
    reporterAccountId: uuid('reporter_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    reason: reportReason('reason').notNull(),
    details: text('details'),
    /** The revision the reporter was looking at, so a later correction is visible against it. */
    contentRevision: integer('content_revision'),
    status: reportStatus('status').notNull().default('OPEN'),
    decision: moderationDecision('decision'),
    decisionReason: text('decision_reason'),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One open report per person per item: a second one is a duplicate, not a louder report.
    uniqueIndex('moderation_report_one_open_key')
      .on(t.reporterAccountId, t.contentId)
      .where(sql`${t.status} = 'OPEN'`),
    index('moderation_report_queue_idx').on(t.status, t.contentId),
    index('moderation_report_reporter_idx').on(t.reporterAccountId, t.createdAt),
    check('moderation_report_target_check', sql`(${t.targetKind} = 'CONTENT') = (${t.contentId} is not null)`),
    // One open report per person per club, the same rule content already has.
    uniqueIndex('moderation_report_one_open_club_key')
      .on(t.reporterAccountId, t.communityId)
      .where(sql`${t.status} = 'OPEN'`),
    index('moderation_report_club_idx').on(t.communityId, t.status),
    // The club key belongs to a club report and to nothing else. Compared as text so
    // the migration that adds the value does not have to use it as an enum literal.
    check('moderation_report_club_check', sql`(${t.targetKind}::text = 'CLUB') = (${t.communityId} is not null)`),

    /*
     * Phase 3 (PROMPT-004). One open report per person per thing, the same rule
     * content and clubs already have: a second report from the same account is
     * a duplicate, not a louder report.
     *
     * A media report does **not** set `listing_id`: it names the picture, and
     * its advert is reached through that. Setting both would make reporting a
     * photo look like a duplicate of an earlier report about the advert, and
     * those are two different complaints with two different answers. Scoping
     * the index by target kind instead is not possible — an enum-to-text cast
     * is not immutable, so it cannot appear in an index predicate.
     */
    uniqueIndex('moderation_report_one_open_listing_key')
      .on(t.reporterAccountId, t.listingId)
      .where(sql`${t.status} = 'OPEN'`),
    uniqueIndex('moderation_report_one_open_media_key')
      .on(t.reporterAccountId, t.listingMediaId)
      .where(sql`${t.status} = 'OPEN'`),
    uniqueIndex('moderation_report_one_open_seller_key')
      .on(t.reporterAccountId, t.sellerAccountId)
      .where(sql`${t.status} = 'OPEN'`),
    uniqueIndex('moderation_report_one_open_message_key')
      .on(t.reporterAccountId, t.inquiryMessageId)
      .where(sql`${t.status} = 'OPEN'`),
    index('moderation_report_listing_idx').on(t.listingId, t.status),
    index('moderation_report_seller_idx').on(t.sellerAccountId, t.status),
    check(
      'moderation_report_listing_check',
      sql`(${t.targetKind}::text = 'ANIMAL_LISTING') = (${t.listingId} is not null)`,
    ),
    check(
      'moderation_report_media_check',
      sql`(${t.targetKind}::text = 'LISTING_MEDIA') = (${t.listingMediaId} is not null)`,
    ),
    check(
      'moderation_report_seller_check',
      sql`(${t.targetKind}::text = 'SELLER') = (${t.sellerAccountId} is not null)`,
    ),
    check(
      'moderation_report_message_check',
      sql`(${t.targetKind}::text = 'INQUIRY_MESSAGE') = (${t.inquiryMessageId} is not null)`,
    ),
    uniqueIndex('moderation_report_one_open_mating_profile_key')
      .on(t.reporterAccountId, t.matingProfileId)
      .where(sql`${t.status} = 'OPEN'`),
    uniqueIndex('moderation_report_one_open_mating_media_key')
      .on(t.reporterAccountId, t.matingProfileMediaId)
      .where(sql`${t.status} = 'OPEN'`),
    check(
      'moderation_report_mating_profile_check',
      sql`(${t.targetKind}::text = 'MATING_PROFILE') = (${t.matingProfileId} is not null)`,
    ),
    check(
      'moderation_report_mating_media_check',
      sql`(${t.targetKind}::text = 'MATING_PROFILE_MEDIA') = (${t.matingProfileMediaId} is not null)`,
    ),
    uniqueIndex('moderation_report_one_open_finder_message_key')
      .on(t.reporterAccountId, t.finderMessageId)
      .where(sql`${t.status} = 'OPEN'`),
    check(
      'moderation_report_finder_message_check',
      sql`(${t.targetKind}::text = 'FINDER_MESSAGE') = (${t.finderMessageId} is not null)`,
    ),
    uniqueIndex('moderation_report_one_open_finder_request_key')
      .on(t.reporterAccountId, t.finderRequestId)
      .where(sql`${t.status} = 'OPEN'`),
    uniqueIndex('moderation_report_one_open_finder_account_key')
      .on(t.reporterAccountId, t.reportedAccountId)
      .where(sql`${t.status} = 'OPEN'`),
    check(
      'moderation_report_finder_request_check',
      sql`(${t.targetKind}::text = 'FINDER_REQUEST') = (${t.finderRequestId} is not null)`,
    ),
    check(
      'moderation_report_finder_account_check',
      sql`(${t.targetKind}::text = 'FINDER_ACCOUNT') = (${t.reportedAccountId} is not null)`,
    ),
    index('moderation_report_finder_queue_idx').on(t.finderCategory, t.status),
  ],
);

/**
 * An objection to a moderation decision — PROMPT-004.
 *
 * The decision it argues with is never rewritten and no transactional evidence
 * is deleted: the appeal is its own row, with its own outcome and its own
 * reason, so afterwards the original decision, the objection and the answer are
 * all still readable. `UPHELD` means the decision stands; `OVERTURNED` means the
 * reviewer reversed it, and the reversal itself is audited where it happens.
 */
export const moderationAppeals = pgTable(
  'moderation_appeal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => moderationReports.id, { onDelete: 'restrict' }),
    appellantAccountId: uuid('appellant_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    statementFa: text('statement_fa').notNull(),
    status: moderationAppealStatus('status').notNull().default('OPEN'),
    decisionReasonFa: text('decision_reason_fa'),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One open appeal per person per decision; a second is the same objection.
    uniqueIndex('moderation_appeal_one_open_key')
      .on(t.reportId, t.appellantAccountId)
      .where(sql`${t.status} = 'OPEN'`),
    index('moderation_appeal_queue_idx').on(t.status, t.createdAt),
  ],
);

/**
 * A limit on what an author may publish (§13 «محدودیت ناشر»). It ends at
 * `ends_at` — decided when read, no scheduler — or when lifted with a reason.
 */
export const publisherRestrictions = pgTable(
  'publisher_restriction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().default(now),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    sourceContentId: uuid('source_content_id').references(() => contentItems.id, { onDelete: 'set null' }),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedByAccountId: uuid('lifted_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    liftReason: text('lift_reason'),
  },
  (t) => [index('publisher_restriction_account_idx').on(t.accountId)],
);

// ── Phase 4 PROMPT-007 ────────────────────────────────────────────────────────

/**
 * A private file a reporter attached to a report. Served only through the
 * finder evidence route, to the moderators of that queue, and every view is audited.
 */
export const moderationReportEvidence = pgTable(
  'moderation_report_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => moderationReports.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    uploadedByAccountId: uuid('uploaded_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('moderation_report_evidence_report_idx').on(t.reportId)],
);

/**
 * A sanction on an account: its finder access, or the account itself. Lifting
 * stamps `lifted_at` with a reason; nothing is deleted, and a sanction never
 * refunds or pauses a subscription beyond the policy that period snapshotted.
 */
export const accountSanctions = pgTable(
  'account_sanction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    scope: sanctionScope('scope').notNull(),
    reasonFa: text('reason_fa').notNull(),
    reportId: uuid('report_id').references(() => moderationReports.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().default(sql`now()`),
    /** Null = until lifted. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdByAccountId: uuid('created_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedByAccountId: uuid('lifted_by_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    liftReasonFa: text('lift_reason_fa'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('account_sanction_one_open_key').on(t.accountId, t.scope).where(sql`${t.liftedAt} is null`),
    check('account_sanction_window_check', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);
