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
import { accounts } from './core.ts';
import { contentItems } from './content.ts';
import { communities } from './communities.ts';
import { moderationDecision, reportReason, reportStatus, reportTargetKind } from './enums.ts';

const now = sql`now()`;

export const moderationReports = pgTable(
  'moderation_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetKind: reportTargetKind('target_kind').notNull().default('CONTENT'),
    contentId: uuid('content_id').references(() => contentItems.id, { onDelete: 'restrict' }),
    /** A report about a club names the club itself, the way a content report names its item. */
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'restrict' }),
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
