/**
 * What the marketplace did, in aggregate — PROMPT-013.
 *
 * Every figure here is a count or a sum over rows the product already keeps.
 * Nothing is recomputed into a new table, because a second copy of a number
 * is a number that eventually disagrees with the first, and nothing is
 * cached, because an operator reading a dashboard should be reading today.
 *
 * Two rules shape what comes out. Breakdowns pass through a minimum cohort
 * size, so a province with one sale reads as "below the display threshold"
 * rather than as a fact about somebody. And nothing here returns a name, a
 * telephone number or an address: an analytics screen is the wrong place to
 * learn who bought what, and the operational screens that may show it require
 * a capability this one does not.
 */
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { commerceOrders, commerceOrderItems, commerceSubOrders } from '../db/schema/orders.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { sellerLedgerEntries, orderReturns, settlementBatches } from '../db/schema/fulfilment.ts';
import { animalListings, listingPromotions } from '../db/schema/marketplace.ts';
import { listingInquiries } from '../db/schema/inquiry.ts';
import { depositRefunds } from '../db/schema/deals.ts';
import { moderationReports } from '../db/schema/moderation.ts';
import { provinces } from '../db/schema/geography.ts';
import { referenceBreeds, species } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { readInt } from '../settings/service.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import {
  averageToman,
  funnelSteps,
  redactSmallGroups,
  share,
  type Breakdown,
  type FunnelStep,
  type RedactedBreakdown,
} from './metrics.ts';

export const MIN_COHORT_KEY = 'market.analytics.min_cohort';

export interface Money {
  readonly totalToman: bigint;
  readonly count: number;
  readonly averageToman: bigint;
}

export interface AnalyticsView {
  readonly since: Date;
  readonly minimumCohort: number;
  readonly shop: {
    readonly gmv: Money;
    readonly commissionToman: bigint;
    readonly returns: { count: number; refundedToman: bigint; rate: number | null };
    readonly subOrders: readonly RedactedBreakdown[];
  };
  readonly animals: {
    readonly deals: Money;
    readonly depositsToman: bigint;
    readonly refundsToman: bigint;
    readonly funnel: readonly FunnelStep[];
    readonly bySpecies: readonly RedactedBreakdown[];
    readonly byBreed: readonly RedactedBreakdown[];
    readonly byProvince: readonly RedactedBreakdown[];
  };
  readonly moderation: readonly RedactedBreakdown[];
  readonly sellers: {
    readonly balances: { pendingToman: bigint; heldToman: bigint; availableToman: bigint; debtToman: bigint };
    readonly settlements: { count: number; paidToman: bigint };
  };
  readonly advertising: { promotions: number; activeNow: number };
}

const big = (value: string | null | undefined): bigint => (value === null || value === undefined ? 0n : BigInt(value));

/**
 * Everything the dashboard shows, for one window.
 *
 * Read in one place rather than by each panel, so the figures on the screen
 * are all about the same moment — a dashboard whose panels disagree by a few
 * seconds is a dashboard people learn to distrust.
 */
export async function analyticsFor(
  database: Database,
  actor: Actor,
  options: { sinceDays?: number } = {},
): Promise<AnalyticsView> {
  assertMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW');
  const sinceDays = options.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const minimumCohort = (await readInt(database, MIN_COHORT_KEY).catch(() => null)) ?? 5;

  // ── the shop ─────────────────────────────────────────────────────────────
  const [shopTotals] = await database
    .select({
      total: sql<string | null>`sum(${commerceOrders.grandTotalToman})`.as('total'),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(commerceOrders)
    .where(and(inArray(commerceOrders.status, ['PAID', 'REFUNDED']), gte(commerceOrders.createdAt, since)));

  const [commission] = await database
    .select({ total: sql<string | null>`sum(${commerceSubOrders.commissionToman})`.as('total') })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(and(isNotNull(commerceOrders.paidAt), gte(commerceOrders.createdAt, since)));

  const subOrderStatuses = await database
    .select({
      status: commerceSubOrders.status,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(gte(commerceOrders.createdAt, since))
    .groupBy(commerceSubOrders.status);

  const [returnTotals] = await database
    .select({
      count: sql<number>`count(*)`.as('count'),
      refunded: sql<string | null>`sum(${orderReturns.refundAmountToman})`.as('refunded'),
    })
    .from(orderReturns)
    .where(gte(orderReturns.createdAt, since));

  const deliveredCount = subOrderStatuses
    .filter((row) => ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.count), 0);

  // ── animals ──────────────────────────────────────────────────────────────
  const [dealTotals] = await database
    .select({
      total: sql<string | null>`sum(${listingInquiries.finalPriceToman})`.as('total'),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(listingInquiries)
    .where(and(eq(listingInquiries.status, 'COMPLETED'), gte(listingInquiries.createdAt, since)));

  const [deposits] = await database
    .select({ total: sql<string | null>`sum(${listingInquiries.depositAmountToman})`.as('total') })
    .from(listingInquiries)
    .where(
      and(
        // A deposit exists once the deal was struck; the advert is what turns
        // RESERVED, so the deal's own statuses are CONVERTED and COMPLETED.
        inArray(listingInquiries.status, ['CONVERTED', 'COMPLETED']),
        gte(listingInquiries.createdAt, since),
      ),
    );

  const [refunds] = await database
    .select({ total: sql<string | null>`sum(${depositRefunds.amountToman})`.as('total') })
    .from(depositRefunds)
    .where(and(eq(depositRefunds.status, 'PAID'), gte(depositRefunds.createdAt, since)));

  const [listedCount] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(animalListings)
    .where(gte(animalListings.createdAt, since));

  const inquiryStatuses = await database
    .select({ status: listingInquiries.status, count: sql<number>`count(*)`.as('count') })
    .from(listingInquiries)
    .where(gte(listingInquiries.createdAt, since))
    .groupBy(listingInquiries.status);

  const countOf = (statuses: readonly string[]): number =>
    inquiryStatuses
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + Number(row.count), 0);

  const bySpecies = await database
    .select({ labelFa: species.nameFa, count: sql<number>`count(*)`.as('count') })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .innerJoin(species, eq(species.code, animals.species))
    .where(gte(animalListings.createdAt, since))
    .groupBy(species.nameFa);

  const byBreed = await database
    .select({ labelFa: referenceBreeds.nameFa, count: sql<number>`count(*)`.as('count') })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .innerJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(gte(animalListings.createdAt, since))
    .groupBy(referenceBreeds.nameFa);

  const byProvince = await database
    .select({ labelFa: provinces.nameFa, count: sql<number>`count(*)`.as('count') })
    .from(animalListings)
    .innerJoin(provinces, eq(provinces.code, animalListings.provinceCode))
    .where(gte(animalListings.createdAt, since))
    .groupBy(provinces.nameFa);

  // ── moderation ───────────────────────────────────────────────────────────
  const reportOutcomes = await database
    .select({ status: moderationReports.status, count: sql<number>`count(*)`.as('count') })
    .from(moderationReports)
    .where(gte(moderationReports.createdAt, since))
    .groupBy(moderationReports.status);

  // ── sellers ──────────────────────────────────────────────────────────────
  const balances = await database
    .select({
      bucket: sellerLedgerEntries.bucket,
      total: sql<string | null>`sum(${sellerLedgerEntries.amountToman})`.as('total'),
    })
    .from(sellerLedgerEntries)
    .groupBy(sellerLedgerEntries.bucket);
  const bucketOf = (name: string): bigint =>
    big(balances.find((row) => row.bucket === name)?.total ?? null);

  const [settlements] = await database
    .select({
      count: sql<number>`count(*)`.as('count'),
      total: sql<string | null>`sum(${settlementBatches.totalToman})`.as('total'),
    })
    .from(settlementBatches)
    .where(inArray(settlementBatches.status, ['PAID', 'RECONCILED']));

  // ── advertising ──────────────────────────────────────────────────────────
  const [promotions] = await database
    .select({
      count: sql<number>`count(*)`.as('count'),
      active: sql<number>`count(*) filter (where ${listingPromotions.status} = 'ACTIVE')`.as('active'),
    })
    .from(listingPromotions)
    .where(gte(listingPromotions.createdAt, since));

  const asBreakdown = (rows: readonly { labelFa: string; count: number }[]): readonly Breakdown[] =>
    rows.map((row) => ({ labelFa: row.labelFa, count: Number(row.count) }));

  const gmvTotal = big(shopTotals?.total ?? null);
  const gmvCount = Number(shopTotals?.count ?? 0);
  const dealTotal = big(dealTotals?.total ?? null);
  const dealCount = Number(dealTotals?.count ?? 0);

  return {
    since,
    minimumCohort,
    shop: {
      gmv: { totalToman: gmvTotal, count: gmvCount, averageToman: averageToman(gmvTotal, gmvCount) },
      commissionToman: big(commission?.total ?? null),
      returns: {
        count: Number(returnTotals?.count ?? 0),
        refundedToman: big(returnTotals?.refunded ?? null),
        // Of what was actually delivered, because a return rate against
        // everything ordered flatters a shop whose orders are still in transit.
        rate: share(Number(returnTotals?.count ?? 0), deliveredCount),
      },
      subOrders: redactSmallGroups(
        asBreakdown(subOrderStatuses.map((row) => ({ labelFa: row.status, count: Number(row.count) }))),
        minimumCohort,
      ),
    },
    animals: {
      deals: { totalToman: dealTotal, count: dealCount, averageToman: averageToman(dealTotal, dealCount) },
      depositsToman: big(deposits?.total ?? null),
      refundsToman: big(refunds?.total ?? null),
      funnel: funnelSteps({
        listed: Number(listedCount?.count ?? 0),
        enquired: inquiryStatuses.reduce((sum, row) => sum + Number(row.count), 0),
        accepted: countOf(['ACCEPTED', 'CONVERTED', 'COMPLETED']),
        // Reserved means a verified deposit, which is what CONVERTED records.
        reserved: countOf(['CONVERTED', 'COMPLETED']),
        completed: countOf(['COMPLETED']),
      }),
      bySpecies: redactSmallGroups(asBreakdown(bySpecies), minimumCohort),
      byBreed: redactSmallGroups(asBreakdown(byBreed), minimumCohort),
      byProvince: redactSmallGroups(asBreakdown(byProvince), minimumCohort),
    },
    moderation: redactSmallGroups(
      asBreakdown(reportOutcomes.map((row) => ({ labelFa: row.status, count: Number(row.count) }))),
      minimumCohort,
    ),
    sellers: {
      balances: {
        pendingToman: bucketOf('PENDING'),
        heldToman: bucketOf('HELD'),
        availableToman: bucketOf('AVAILABLE'),
        debtToman: bucketOf('DEBT'),
      },
      settlements: { count: Number(settlements?.count ?? 0), paidToman: big(settlements?.total ?? null) },
    },
    advertising: {
      promotions: Number(promotions?.count ?? 0),
      activeNow: Number(promotions?.active ?? 0),
    },
  };
}

/**
 * One shop's own figures, for that shop.
 *
 * The same numbers the operator sees, narrowed to one seller and without the
 * marketplace-wide ones: a shop has no business reading the platform's GMV.
 */
export async function sellerAnalytics(
  database: Database,
  sellerId: string,
  sinceDays = 30,
): Promise<{ orders: Money; commissionToman: bigint; returns: number }> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const [totals] = await database
    .select({
      total: sql<string | null>`sum(${commerceSubOrders.buyerTotalToman})`.as('total'),
      count: sql<number>`count(*)`.as('count'),
      commission: sql<string | null>`sum(${commerceSubOrders.commissionToman})`.as('commission'),
    })
    .from(commerceSubOrders)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
    .where(
      and(
        eq(commerceSubOrders.sellerId, sellerId),
        isNotNull(commerceOrders.paidAt),
        gte(commerceOrders.createdAt, since),
      ),
    );

  const [returns] = await database
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orderReturns)
    .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, orderReturns.subOrderId))
    .where(and(eq(commerceSubOrders.sellerId, sellerId), gte(orderReturns.createdAt, since)));

  const total = big(totals?.total ?? null);
  const count = Number(totals?.count ?? 0);
  return {
    orders: { totalToman: total, count, averageToman: averageToman(total, count) },
    commissionToman: big(totals?.commission ?? null),
    returns: Number(returns?.count ?? 0),
  };
}

/** Which shops exist, for a picker that needs no more than a name. */
export async function activeSellers(database: Database) {
  return database
    .select({ id: commerceSellers.id, nameFa: commerceSellers.displayNameFa })
    .from(commerceSellers)
    .where(eq(commerceSellers.status, 'ACTIVE'))
    .limit(200);
}
