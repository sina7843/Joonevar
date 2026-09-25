/**
 * Signals worth an operator's attention — PROMPT-013.
 *
 * Every one of these is a count over rows the product already keeps. Nothing
 * here scores a person, marks an account or changes a standing: a signal is a
 * reason to look, and the operator who looks then uses the ordinary tools
 * with the ordinary reasons and the ordinary audit.
 *
 * That restraint is the design, not a limitation of it. A number that
 * quietly suspends somebody is a number nobody can argue with, and the
 * marketplace already has places where a decision is made by a person and
 * written down with a reason.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { paymentAttempts, paymentBatches } from '../db/schema/billing.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { dealCancellations, depositRefunds } from '../db/schema/deals.ts';
import { moderationReports } from '../db/schema/moderation.ts';
import { rateLimitHits } from '../db/schema/security.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { riskSignals, type RiskSignal } from '../analytics/metrics.ts';
import { maskTail } from './redaction.ts';
import { notFound } from '../domain/errors.ts';

/** Anything else is not an id, and is refused before it reaches a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RiskRow {
  readonly accountId: string;
  /** Enough to tell two accounts apart, and no more (PROMPT-013). */
  readonly maskedMobile: string;
  readonly signals: readonly RiskSignal[];
}

/**
 * Accounts with something worth reading, over one window.
 *
 * The list is deliberately narrow: an account appears because a count passed
 * a threshold, and the row says which count and what it might mean — never
 * what should be done about it.
 */
export async function riskQueue(
  database: Database,
  actor: Actor,
  options: { sinceDays?: number } = {},
): Promise<readonly RiskRow[]> {
  assertMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW');
  const since = new Date(Date.now() - (options.sinceDays ?? 30) * 86_400_000);

  const failed = await database
    .select({
      accountId: paymentBatches.accountId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(paymentAttempts)
    .innerJoin(paymentBatches, eq(paymentBatches.id, paymentAttempts.batchId))
    .where(and(eq(paymentAttempts.status, 'FAILED'), gte(paymentAttempts.startedAt, since)))
    .groupBy(paymentBatches.accountId);

  const cancelled = await database
    .select({
      accountId: dealCancellations.requestedByAccountId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(dealCancellations)
    .where(gte(dealCancellations.createdAt, since))
    .groupBy(dealCancellations.requestedByAccountId);

  const reported = await database
    .select({
      accountId: moderationReports.sellerAccountId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(moderationReports)
    .where(and(gte(moderationReports.createdAt, since), sql`${moderationReports.sellerAccountId} is not null`))
    .groupBy(moderationReports.sellerAccountId);

  const refunded = await database
    .select({
      accountId: depositRefunds.recipientAccountId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(depositRefunds)
    .where(gte(depositRefunds.createdAt, since))
    .groupBy(depositRefunds.recipientAccountId);

  const limited = await database
    .select({
      accountId: rateLimitHits.accountId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(rateLimitHits)
    .where(and(gte(rateLimitHits.windowStartedAt, since), sql`${rateLimitHits.accountId} is not null`))
    .groupBy(rateLimitHits.accountId);

  const counts = new Map<
    string,
    { failedPayments: number; cancelledDeals: number; reportsAgainst: number; refunds: number; rateLimitTrips: number }
  >();
  const bump = (
    accountId: string | null,
    field: keyof NonNullable<ReturnType<typeof counts.get>>,
    value: number,
  ) => {
    if (accountId === null) return;
    const entry = counts.get(accountId) ?? {
      failedPayments: 0,
      cancelledDeals: 0,
      reportsAgainst: 0,
      refunds: 0,
      rateLimitTrips: 0,
    };
    entry[field] += value;
    counts.set(accountId, entry);
  };

  for (const row of failed) bump(row.accountId, 'failedPayments', Number(row.count));
  for (const row of cancelled) bump(row.accountId, 'cancelledDeals', Number(row.count));
  for (const row of reported) bump(row.accountId, 'reportsAgainst', Number(row.count));
  for (const row of refunded) bump(row.accountId, 'refunds', Number(row.count));
  for (const row of limited) bump(row.accountId, 'rateLimitTrips', Number(row.count));

  const flagged: { accountId: string; signals: readonly RiskSignal[] }[] = [];
  for (const [accountId, entry] of counts) {
    const signals = riskSignals(entry);
    if (signals.length > 0) flagged.push({ accountId, signals });
  }
  if (flagged.length === 0) return [];

  const mobiles = await database
    .select({ id: accounts.id, mobile: accounts.mobile })
    .from(accounts)
    .where(inArray(accounts.id, flagged.map((row) => row.accountId)));
  const mobileOf = new Map(mobiles.map((row) => [row.id, row.mobile]));

  return flagged
    .map((row) => ({
      accountId: row.accountId,
      // Enough to recognise the account in another screen, not enough to be a
      // directory of telephone numbers.
      maskedMobile: maskTail(mobileOf.get(row.accountId) ?? ''),
      signals: row.signals,
    }))
    .sort((a, b) => b.signals.length - a.signals.length);
}

/**
 * One account's own signals, for the support workbench.
 *
 * Same counts, one account, so somebody answering a complaint can see what a
 * risk row was about without leaving the case they are on.
 */
export async function signalsForAccount(
  database: Database,
  actor: Actor,
  accountId: string,
  sinceDays = 30,
): Promise<readonly RiskSignal[]> {
  assertMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW');
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const [failed] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(paymentAttempts)
    .innerJoin(paymentBatches, eq(paymentBatches.id, paymentAttempts.batchId))
    .where(
      and(
        eq(paymentBatches.accountId, accountId),
        eq(paymentAttempts.status, 'FAILED'),
        gte(paymentAttempts.startedAt, since),
      ),
    );
  const [cancelled] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(dealCancellations)
    .where(
      and(eq(dealCancellations.requestedByAccountId, accountId), gte(dealCancellations.createdAt, since)),
    );
  const [reported] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(moderationReports)
    .where(and(eq(moderationReports.sellerAccountId, accountId), gte(moderationReports.createdAt, since)));
  const [refunded] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(depositRefunds)
    .where(and(eq(depositRefunds.recipientAccountId, accountId), gte(depositRefunds.createdAt, since)));
  const [limited] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.accountId, accountId), gte(rateLimitHits.windowStartedAt, since)));

  return riskSignals({
    failedPayments: Number(failed?.count ?? 0),
    cancelledDeals: Number(cancelled?.count ?? 0),
    reportsAgainst: Number(reported?.count ?? 0),
    refunds: Number(refunded?.count ?? 0),
    rateLimitTrips: Number(limited?.count ?? 0),
  });
}

/**
 * What one account has open across the marketplace, for support.
 *
 * Counts and references, not contents: somebody answering a telephone needs
 * to know there is an open dispute, and reading it is a separate screen with
 * a separate capability.
 */
export async function supportSummary(
  database: Database,
  actor: Actor,
  accountId: string,
): Promise<{
  readonly maskedMobile: string;
  readonly openInquiries: number;
  readonly openReports: number;
  readonly refundsOwed: number;
  readonly signals: readonly RiskSignal[];
}> {
  assertMarketplaceCapability(actor, 'ORDER_VIEW');
  // A malformed id is answered, not thrown at: an operator typing a wrong
  // value should read a sentence, and the database should never see the
  // string at all (PROMPT-013).
  if (!UUID.test(accountId)) throw notFound('این حساب پیدا نشد.');
  const [account] = await database
    .select({ mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  // An account nobody has is said to be missing, rather than answered with a
  // page of zeros that reads like a real and very quiet one.
  if (!account) throw notFound('این حساب پیدا نشد.');

  const [inquiries] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(listingInquiries)
    .where(
      and(
        eq(listingInquiries.buyerAccountId, accountId),
        inArray(listingInquiries.status, ['OPEN', 'ACCEPTED', 'CONVERTED']),
      ),
    );
  const [reports] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(moderationReports)
    .where(and(eq(moderationReports.reporterAccountId, accountId), eq(moderationReports.status, 'OPEN')));
  const [owed] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(depositRefunds)
    .where(
      and(
        eq(depositRefunds.recipientAccountId, accountId),
        inArray(depositRefunds.status, ['PENDING', 'PROCESSING', 'FAILED', 'MANUAL_REQUIRED']),
      ),
    );

  return {
    maskedMobile: maskTail(account.mobile),
    openInquiries: Number(inquiries?.count ?? 0),
    openReports: Number(reports?.count ?? 0),
    refundsOwed: Number(owed?.count ?? 0),
    signals: await signalsForAccount(database, actor, accountId),
  };
}
