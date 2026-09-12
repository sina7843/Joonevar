/**
 * One rule for "how often" — Requirements-Phase-2 §20 (PROMPT-017).
 *
 * Four places already limited something before this prompt: the sign-in code,
 * content reports, directory suggestions and document verification. Each had
 * re-derived the same arithmetic — count what this actor did inside a window,
 * compare it with a ceiling read from managed settings — and a fifth caller
 * would have become a fifth variant of it.
 *
 * So the arithmetic lives here once. What stays with each feature is the part
 * that is genuinely its own: which rows count, and what the visitor is told.
 * The sign-in flow keeps its own state machine (resend interval, attempt lock,
 * single use), because that is a protocol, not a ceiling.
 */

import { MAX_PAGE_SIZE } from '../domain/pagination.ts';

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The moment a window of this length started, counted back from now. */
export const windowStart = (now: Date, windowMs: number): Date => new Date(now.getTime() - windowMs);

export interface LimitCheck {
  /** How many countable actions already happened inside the window. */
  readonly used: number;
  /** The managed ceiling. A ceiling of zero closes the action entirely. */
  readonly ceiling: number;
}

/**
 * Whether this action is still allowed.
 *
 * The comparison is `used >= ceiling` on purpose: the ceiling counts actions,
 * so the ceiling-th action is the last allowed one and the next is refused.
 */
export const withinLimit = (check: LimitCheck): boolean => check.used < check.ceiling;

export const remainingInWindow = (check: LimitCheck): number => Math.max(0, check.ceiling - check.used);

/**
 * What a person is told when they hit a ceiling.
 *
 * It never says how many attempts are left or what the ceiling is: a guesser
 * would read both as a hint about how to keep guessing (§20). It says only that
 * the ceiling was reached and that waiting helps.
 */
export function limitMessageFa(windowMs: number): string {
  const window = windowMs >= DAY_MS ? 'در ۲۴ ساعت گذشته' : windowMs >= HOUR_MS ? 'در یک ساعت گذشته' : 'در چند دقیقه گذشته';
  return window + ' بیش از حد مجاز درخواست ثبت کرده‌اید؛ کمی بعد دوباره تلاش کنید.';
}

/**
 * How many rows one read may return — §20 «محدودیت Export».
 *
 * No new number is invented here: this is the page ceiling the shared list
 * contract already enforces through `parsePageRequest`. The operator queues
 * build their page object by hand and so never passed through it; they call
 * `boundedRows` instead, and answer exactly as every other list does.
 *
 * It is a ceiling on one answer, not a quota on a person: an operator may page,
 * and every page stays authorised and audited as before. A read with its own
 * documented ceiling — the operational history at 200 rows — passes that
 * ceiling in rather than silently adopting this one.
 */
export { MAX_PAGE_SIZE as MAX_BULK_ROWS } from '../domain/pagination.ts';

export function boundedRows(requested: number | undefined, fallback: number, ceiling: number = MAX_PAGE_SIZE): number {
  const asked = requested === undefined || !Number.isFinite(requested) ? fallback : Math.floor(requested);
  return Math.min(Math.max(asked, 1), ceiling);
}
