/**
 * Points, which are not money — PROMPT-012.
 *
 * A ledger of its own, deliberately not the money ledger: points can only
 * ever become a discount on a basket, and there is no operation anywhere that
 * turns them into a payout. That is what "no cash-out" has to mean to be true
 * rather than merely stated — not a rule somebody could relax, but an absence
 * of any code that could do it.
 *
 * Earning is tied to the order that caused it and the unique index means one
 * order earns once, however many times a callback or a sweep replays.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { loyaltyEntries } from '../db/schema/promotions.ts';
import { commerceOrders } from '../db/schema/orders.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt, readMoney } from '../settings/service.ts';
import { conflict, forbidden, validation } from '../domain/errors.ts';
import { assertMarketplaceCapability } from '../marketplace/model.ts';
import type { Actor } from '../authz/actor.ts';
import { loyaltyBalance, pointsEarned, pointsExpireAt, redemptionValue } from './trust-model.ts';

export type LoyaltyRow = typeof loyaltyEntries.$inferSelect;

export const POINTS_PER_1000_KEY = 'market.shop.loyalty_points_per_1000_toman';
export const POINT_VALUE_KEY = 'market.shop.loyalty_point_value_toman';
export const EXPIRY_DAYS_KEY = 'market.shop.loyalty_expiry_days';

/** The balance, summed from the entries and nowhere else. */
export async function balanceOf(database: DbClient, accountId: string): Promise<number> {
  const rows = await database
    .select({ points: loyaltyEntries.points })
    .from(loyaltyEntries)
    .where(eq(loyaltyEntries.accountId, accountId));
  return loyaltyBalance(rows);
}

/**
 * What a paid order earns.
 *
 * Called inside the transaction that verified the payment, so points and the
 * money that produced them arrive together. An unconfigured rate earns
 * nothing — it is not a reason to invent a generosity nobody approved — and
 * the unique index makes a second call write nothing rather than paying
 * twice.
 */
export async function earnFromOrder(
  tx: DbClient,
  input: { accountId: string; orderId: string; paidToman: bigint; referenceFa: string },
): Promise<number> {
  const rate = await readInt(tx, POINTS_PER_1000_KEY).catch(() => null);
  const points = pointsEarned({ paidToman: input.paidToman, pointsPer1000: rate });
  if (points <= 0) return 0;

  const already = await tx
    .select({ id: loyaltyEntries.id })
    .from(loyaltyEntries)
    .where(and(eq(loyaltyEntries.orderId, input.orderId), eq(loyaltyEntries.kind, 'EARN')))
    .limit(1);
  if (already.length > 0) return 0;

  const expiryDays = await readInt(tx, EXPIRY_DAYS_KEY).catch(() => null);
  await tx.insert(loyaltyEntries).values({
    accountId: input.accountId,
    kind: 'EARN',
    points,
    descriptionFa: 'امتیاز خرید ' + input.referenceFa,
    orderId: input.orderId,
    expiresAt: pointsExpireAt(new Date(), expiryDays),
  });
  return points;
}

export interface RedemptionQuote {
  readonly availablePoints: number;
  readonly pointsToSpend: number;
  readonly toman: bigint;
  readonly configured: boolean;
}

/**
 * What these points are worth against this basket.
 *
 * Never more than the basket, because points do not become change, and
 * nothing at all until somebody has configured what a point is worth.
 */
export async function quoteRedemption(
  database: DbClient,
  input: { accountId: string; wantedPoints: number; basketToman: bigint },
): Promise<RedemptionQuote> {
  const value = await readMoney(database, POINT_VALUE_KEY);
  const available = await balanceOf(database, input.accountId);
  if (!value.configured || available <= 0 || input.wantedPoints <= 0) {
    return { availablePoints: available, pointsToSpend: 0, toman: 0n, configured: value.configured };
  }
  const wanted = Math.min(input.wantedPoints, available);
  const outcome = redemptionValue({
    points: wanted,
    pointValueToman: value.toman,
    basketToman: input.basketToman,
  });
  return {
    availablePoints: available,
    pointsToSpend: outcome.points,
    toman: outcome.toman,
    configured: true,
  };
}

/**
 * Spend points on one order.
 *
 * Written inside the transaction that places it, and the balance is re-read
 * there: points spent on another basket a moment ago are gone, and this order
 * is refused rather than placed at a price the points did not cover.
 */
export async function redeemForOrder(
  tx: DbClient,
  input: { accountId: string; orderId: string; points: number; toman: bigint; referenceFa: string },
): Promise<void> {
  if (input.points <= 0) return;
  const balance = await balanceOf(tx, input.accountId);
  if (balance < input.points) {
    throw conflict('امتیاز کافی ندارید؛ سبد را دوباره ببینید.');
  }
  await tx.insert(loyaltyEntries).values({
    accountId: input.accountId,
    kind: 'REDEEM',
    points: -input.points,
    descriptionFa:
      'استفاده از ' + input.points.toLocaleString('fa-IR') + ' امتیاز در سفارش ' + input.referenceFa,
    orderId: input.orderId,
  });
}

/** An order that never happened gives its points back and takes its earning away. */
export async function reverseForOrder(tx: DbClient, orderId: string): Promise<void> {
  const rows = await tx
    .select()
    .from(loyaltyEntries)
    .where(eq(loyaltyEntries.orderId, orderId));
  for (const row of rows) {
    if (row.kind !== 'EARN' && row.kind !== 'REDEEM') continue;
    await tx.insert(loyaltyEntries).values({
      accountId: row.accountId,
      kind: 'ADJUST',
      points: -row.points,
      descriptionFa: 'برگشت امتیاز سفارش لغوشده',
      actorAccountId: null,
    });
  }
}

/**
 * Expire the lots whose day has passed.
 *
 * Each expiry names the earning it consumed, and the unique index on that
 * reference means one lot expires once however often the sweep runs. Only
 * what is still unspent expires: points already spent cannot expire too, or
 * the same points would be taken twice.
 */
export async function expireDuePoints(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select({
      id: loyaltyEntries.id,
      accountId: loyaltyEntries.accountId,
      points: loyaltyEntries.points,
    })
    .from(loyaltyEntries)
    .where(
      and(
        eq(loyaltyEntries.kind, 'EARN'),
        sql`${loyaltyEntries.expiresAt} is not null and ${loyaltyEntries.expiresAt} <= ${now}`,
      ),
    )
    .limit(200);

  let expired = 0;
  for (const lot of due) {
    const done = await database.transaction(async (tx) => {
      const already = await tx
        .select({ id: loyaltyEntries.id })
        .from(loyaltyEntries)
        .where(eq(loyaltyEntries.expiredEntryId, lot.id))
        .limit(1);
      if (already.length > 0) return false;

      // Never take more than the person still has: points already spent must
      // not be taken a second time by expiry.
      const balance = await balanceOf(tx, lot.accountId);
      const take = Math.min(lot.points, balance);
      if (take <= 0) {
        // Nothing left to expire, but the lot is closed so the sweep stops
        // finding it.
        await tx.insert(loyaltyEntries).values({
          accountId: lot.accountId,
          kind: 'ADJUST',
          points: -1,
          descriptionFa: 'بستن دفترچه امتیاز منقضی بدون مانده',
          expiredEntryId: lot.id,
        });
        return false;
      }
      await tx.insert(loyaltyEntries).values({
        accountId: lot.accountId,
        kind: 'EXPIRE',
        points: -take,
        descriptionFa: 'انقضای ' + take.toLocaleString('fa-IR') + ' امتیاز',
        expiredEntryId: lot.id,
      });
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}

/** An operator's correction, which always says why. */
export async function adjustPoints(
  database: Database,
  actor: Actor,
  input: { accountId: string; points: number; reasonFa: string },
): Promise<void> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل این اصلاح را بنویسید.');
  if (!Number.isInteger(input.points) || input.points === 0) throw validation('مقدار اصلاح معتبر نیست.');

  await database.transaction(async (tx) => {
    await tx.insert(loyaltyEntries).values({
      accountId: input.accountId,
      kind: 'ADJUST',
      points: input.points,
      descriptionFa: reasonFa,
      actorAccountId: actor.accountId,
    });
    await recordAudit(tx, actor, {
      action: 'COMMERCE_LOYALTY_ADJUSTED',
      targetType: 'ACCOUNT',
      targetId: input.accountId,
      after: { points: input.points, reasonFa },
    });
  });

  await createNotification(database, {
    recipientAccountId: input.accountId,
    kind: 'COMMERCE_LOYALTY_ADJUSTED',
    titleFa: 'امتیاز خرید شما تغییر کرد',
    bodyFa: reasonFa,
    resume: {
      entity: { type: 'ACCOUNT', id: input.accountId },
      step: 'LOYALTY',
      originRoute: '/account/rewards',
    },
  });
}

export interface LoyaltyView {
  readonly balance: number;
  readonly entries: readonly LoyaltyRow[];
  readonly pointValueToman: bigint | null;
  readonly expiringSoon: readonly { points: number; expiresAt: Date }[];
  /** Points are a discount on a basket and never a payment out. Said, and true. */
  readonly cashOut: false;
}

export async function loyaltyFor(database: Database, actor: Actor): Promise<LoyaltyView> {
  if (!actor.accountId) throw forbidden('برای دیدن امتیازها باید وارد حساب شوید.');
  const [entries, value] = await Promise.all([
    database
      .select()
      .from(loyaltyEntries)
      .where(eq(loyaltyEntries.accountId, actor.accountId))
      .orderBy(desc(loyaltyEntries.createdAt))
      .limit(100),
    readMoney(database, POINT_VALUE_KEY),
  ]);

  const soon = new Date(Date.now() + 30 * 86_400_000);
  return {
    balance: loyaltyBalance(entries),
    entries,
    pointValueToman: value.configured ? value.toman : null,
    expiringSoon: entries
      .filter((row) => row.kind === 'EARN' && row.expiresAt !== null && row.expiresAt <= soon)
      .map((row) => ({ points: row.points, expiresAt: row.expiresAt! })),
    cashOut: false,
  };
}
