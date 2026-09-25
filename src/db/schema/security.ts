/**
 * Limits and what they caught — PROMPT-013.
 *
 * One row per actor per action per window, counted upwards. It is durable on
 * purpose: a limit held in memory is a limit that resets when a process does,
 * which is the same as no limit at all for anybody patient.
 *
 * The subject is an account where there is one and a coarse fingerprint
 * otherwise, because the things worth limiting for a signed-out visitor —
 * searching, guessing a document code — are exactly the things where an
 * account cannot be required.
 */
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rateLimitAction } from './enums.ts';
import { accounts } from './core.ts';

const now = sql`now()`;

export const rateLimitHits = pgTable(
  'rate_limit_hit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: rateLimitAction('action').notNull(),
    /** The account doing it, where somebody is signed in. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    /** A coarse, non-reversible stand-in where nobody is: never a raw address. */
    subjectHash: text('subject_hash'),
    /** The start of the window this count belongs to. */
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    // One counter per subject per action per window. The upsert against this
    // index is what makes two simultaneous attempts count as two.
    uniqueIndex('rate_limit_account_key')
      .on(t.action, t.accountId, t.windowStartedAt)
      .where(sql`${t.accountId} is not null`),
    uniqueIndex('rate_limit_subject_key')
      .on(t.action, t.subjectHash, t.windowStartedAt)
      .where(sql`${t.subjectHash} is not null`),
    index('rate_limit_sweep_idx').on(t.windowStartedAt),
    check('rate_limit_count_positive', sql`${t.count} > 0`),
    // A hit belongs to somebody, one way or the other.
    check(
      'rate_limit_one_subject',
      sql`(${t.accountId} is not null)::int + (${t.subjectHash} is not null)::int = 1`,
    ),
  ],
);
