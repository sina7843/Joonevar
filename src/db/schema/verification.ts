/**
 * Document verification attempts — Requirements-Phase-2 §17 (PROMPT-014).
 *
 * §17 requires repeated attempts to be limited. A visitor asking this question
 * has no account, so the only thing available to count by is the request's
 * forwarded address, and it is stored hashed: the log answers "how many tries
 * came from one place in the last hour" and nothing else.
 *
 * This table records attempts. It does not record documents: the answer is read
 * from the Phase 1 documents themselves, so nothing public is parallelled with
 * them (DEC-0174).
 */
import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const now = sql`now()`;

/** What the visitor was told. No document identity is kept beyond the code asked for. */
export const verificationOutcome = pgEnum('verification_outcome', [
  'VALID',
  'REPLACED',
  'NOT_FOUND',
  'RATE_LIMITED',
]);

export const verificationAttempts = pgTable(
  'verification_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 of the forwarded address; never the address itself. */
    clientKey: text('client_key').notNull(),
    /** The code as it was normalised, so a repeated guess is visible as one. */
    code: text('code').notNull(),
    outcome: verificationOutcome('outcome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('verification_attempt_client_idx').on(t.clientKey, t.createdAt)],
);
