/**
 * Doing something too often — PROMPT-013.
 *
 * A durable counter per subject per action per window. Durable on purpose: a
 * limit held in memory resets when a process does, which is the same as no
 * limit at all for anybody patient enough to wait for a deploy.
 *
 * Every ceiling is a managed setting, and an unconfigured one is not enforced
 * rather than being treated as zero or as infinity. That is the same
 * discipline every other number in this product follows, and it matters more
 * here: a limit invented in code is a limit nobody reviewed.
 */
import { createHash } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { rateLimitHits } from '../db/schema/security.ts';
import { readInt } from '../settings/service.ts';
import { AppError } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';

export const RATE_LIMIT_ACTIONS = [
  'LISTING_INQUIRY_CREATE',
  'QUESTION_ASK',
  'REPORT_SUBMIT',
  'DISCOUNT_CODE_TRY',
  'REVIEW_SUBMIT',
  'SEARCH_QUERY',
  // Phase 4 (PROMPT-005).
  'FINDER_REQUEST_CREATE',
  'FINDER_MESSAGE_POST',
] as const;
export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[number];

/** The managed ceiling and window for each action. */
export const RATE_LIMIT_KEYS: Record<RateLimitAction, { ceiling: string; window: string }> = {
  LISTING_INQUIRY_CREATE: {
    ceiling: 'market.limit.inquiry_per_hour',
    window: 'market.limit.window_minutes',
  },
  QUESTION_ASK: { ceiling: 'market.limit.question_per_hour', window: 'market.limit.window_minutes' },
  REPORT_SUBMIT: { ceiling: 'market.limit.report_per_hour', window: 'market.limit.window_minutes' },
  DISCOUNT_CODE_TRY: { ceiling: 'market.limit.code_try_per_hour', window: 'market.limit.window_minutes' },
  REVIEW_SUBMIT: { ceiling: 'market.limit.review_per_hour', window: 'market.limit.window_minutes' },
  SEARCH_QUERY: { ceiling: 'market.limit.search_per_hour', window: 'market.limit.window_minutes' },
  FINDER_REQUEST_CREATE: { ceiling: 'finder.limit.request_per_window', window: 'finder.limit.window_minutes' },
  FINDER_MESSAGE_POST: { ceiling: 'finder.limit.message_per_window', window: 'finder.limit.window_minutes' },
};

export const RATE_LIMIT_FA: Record<RateLimitAction, string> = {
  LISTING_INQUIRY_CREATE: 'درخواست خرید',
  QUESTION_ASK: 'ثبت پرسش',
  REPORT_SUBMIT: 'ثبت گزارش',
  DISCOUNT_CODE_TRY: 'امتحان کد تخفیف',
  REVIEW_SUBMIT: 'ثبت نظر',
  SEARCH_QUERY: 'جست‌وجو',
  FINDER_REQUEST_CREATE: 'درخواست جفت‌گیری',
  FINDER_MESSAGE_POST: 'پیام جفت‌یابی',
};

/** The default window when nobody has configured one: an hour. */
const DEFAULT_WINDOW_MINUTES = 60;

/**
 * A coarse, non-reversible stand-in for somebody nobody is signed in as.
 *
 * Hashed with a per-action salt so the same visitor cannot be followed across
 * actions, and truncated so the result is a bucket rather than an identifier.
 * What is stored is never a raw address, because a table of addresses is a
 * table somebody eventually asks for.
 */
export const subjectHash = (action: RateLimitAction, fingerprint: string): string =>
  createHash('sha256').update(action + '|' + fingerprint).digest('hex').slice(0, 32);

/** The start of the window this moment falls in, so a window is a bucket not a sliding clock. */
export const windowStart = (at: Date, minutes: number): Date =>
  new Date(Math.floor(at.getTime() / (minutes * 60_000)) * minutes * 60_000);

export interface LimitOutcome {
  readonly allowed: boolean;
  readonly count: number;
  readonly ceiling: number | null;
  readonly retryAfter: Date | null;
}

/**
 * Count one attempt and say whether it may proceed.
 *
 * The counting happens whether or not the attempt is allowed, because an
 * attempt that was refused is still an attempt and a limiter that forgets
 * refusals can be walked around by making them.
 *
 * An unconfigured ceiling allows everything and counts nothing: without a
 * number there is no limit to enforce, and writing rows for a limit that does
 * not exist is keeping a log of what people do for no reason.
 */
export async function consume(
  database: Database,
  input: {
    action: RateLimitAction;
    actor?: Actor | null;
    /** Used only where nobody is signed in; never stored as given. */
    fingerprint?: string | null;
    now?: Date;
  },
): Promise<LimitOutcome> {
  const keys = RATE_LIMIT_KEYS[input.action];
  const ceiling = await readInt(database, keys.ceiling).catch(() => null);
  if (ceiling === null) return { allowed: true, count: 0, ceiling: null, retryAfter: null };

  const minutes = (await readInt(database, keys.window).catch(() => null)) ?? DEFAULT_WINDOW_MINUTES;
  const at = input.now ?? new Date();
  const started = windowStart(at, minutes);

  const accountId = input.actor?.accountId ?? null;
  const hash = accountId === null ? subjectHash(input.action, (input.fingerprint ?? '').trim() || 'anonymous') : null;

  // The upsert is the counting: two simultaneous attempts both reach it and
  // the second increments what the first wrote.
  const [row] = await database
    .insert(rateLimitHits)
    .values({
      action: input.action,
      accountId,
      subjectHash: hash,
      windowStartedAt: started,
      count: 1,
    })
    .onConflictDoUpdate({
      target:
        accountId === null
          ? [rateLimitHits.action, rateLimitHits.subjectHash, rateLimitHits.windowStartedAt]
          : [rateLimitHits.action, rateLimitHits.accountId, rateLimitHits.windowStartedAt],
      targetWhere:
        accountId === null
          ? sql`${rateLimitHits.subjectHash} is not null`
          : sql`${rateLimitHits.accountId} is not null`,
      set: { count: sql`${rateLimitHits.count} + 1`, updatedAt: at },
    })
    .returning({ count: rateLimitHits.count });

  const count = row?.count ?? 1;
  return {
    allowed: count <= ceiling,
    count,
    ceiling,
    retryAfter: count <= ceiling ? null : new Date(started.getTime() + minutes * 60_000),
  };
}

/**
 * Count an attempt and refuse it if it is past the ceiling.
 *
 * The refusal says what was too frequent and when it may be tried again,
 * because "too many requests" without either is a wall a person cannot plan
 * around.
 */
export async function assertWithinLimit(
  database: Database,
  input: {
    action: RateLimitAction;
    actor?: Actor | null;
    fingerprint?: string | null;
    now?: Date;
  },
): Promise<void> {
  const outcome = await consume(database, input);
  if (outcome.allowed) return;
  throw new AppError(
    'RATE_LIMITED',
    RATE_LIMIT_FA[input.action] +
      ' بیش از حد مجاز تکرار شده است؛ پس از ' +
      (outcome.retryAfter?.toLocaleTimeString('fa-IR') ?? 'مدتی') +
      ' دوباره تلاش کنید.',
    { detail: { action: input.action, ceiling: outcome.ceiling, count: outcome.count } },
  );
}

/**
 * Forget the windows that have passed.
 *
 * Counters are only useful while their window is open, and keeping them
 * afterwards turns a limiter into a record of what everybody did and when.
 */
export async function purgeOldWindows(database: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000);
  const removed = await database
    .delete(rateLimitHits)
    .where(lt(rateLimitHits.windowStartedAt, cutoff))
    .returning({ id: rateLimitHits.id });
  return removed.length;
}

/** What one subject has done lately, for the risk workbench to read. */
export async function recentHits(
  database: DbClient,
  input: { action: RateLimitAction; accountId: string; since: Date },
): Promise<number> {
  const rows = await database
    .select({ count: rateLimitHits.count })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.action, input.action),
        eq(rateLimitHits.accountId, input.accountId),
        sql`${rateLimitHits.windowStartedAt} >= ${input.since}`,
      ),
    );
  return rows.reduce((sum, row) => sum + row.count, 0);
}
