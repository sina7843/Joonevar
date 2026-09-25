/**
 * Price history, and telling somebody it fell — PROMPT-012.
 *
 * A drop is a fact about a recorded history, not a sentence in an email.
 * Every price a line has had is written down when it changes, and an alert
 * compares what somebody saw when they kept the thing against what it costs
 * now. Each person is told once that one line reached one price, because the
 * unique index says so — a price that wobbles around a figure does not become
 * a stream of notifications.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { priceAlerts, priceHistory } from '../db/schema/promotions.ts';
import { accountPreferences, savedItems } from '../db/schema/trust.ts';
import { commerceProducts, offerSkus, sellerOffers } from '../db/schema/catalog.ts';
import { createNotification } from '../notifications/service.ts';
import { readInt } from '../settings/service.ts';
import { violates } from '../db/constraint.ts';
import { priceDropped } from './trust-model.ts';
import { lowestPriceOf } from './saved.ts';

export const MIN_DROP_KEY = 'market.shop.price_alert_min_drop_bp';

/**
 * Record what a line now costs, if it is different from last time.
 *
 * Called wherever a price is set. Writing an unchanged price would turn the
 * history into a log of saves rather than of prices.
 */
export async function recordPrice(tx: DbClient, skuId: string, priceToman: bigint): Promise<void> {
  const [latest] = await tx
    .select({ priceToman: priceHistory.priceToman })
    .from(priceHistory)
    .where(eq(priceHistory.offerSkuId, skuId))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(1);
  if (latest && latest.priceToman === priceToman) return;
  await tx.insert(priceHistory).values({ offerSkuId: skuId, priceToman });
}

export async function historyOf(database: DbClient, skuId: string, limit = 30) {
  return database
    .select({ priceToman: priceHistory.priceToman, recordedAt: priceHistory.recordedAt })
    .from(priceHistory)
    .where(eq(priceHistory.offerSkuId, skuId))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(limit);
}

/**
 * Tell people whose kept things got cheaper.
 *
 * Read-time like every other sweep here, and quiet in three cases: the person
 * turned alerts off, the fall is smaller than the configured minimum, or they
 * have already been told about this price. The third is the unique index's
 * job, so the de-duplication cannot be forgotten by a caller.
 */
export async function sweepPriceDrops(database: Database): Promise<number> {
  const minimumBp = await readInt(database, MIN_DROP_KEY).catch(() => null);

  const saved = await database
    .select({
      id: savedItems.id,
      accountId: savedItems.accountId,
      productId: savedItems.productId,
      savedPriceToman: savedItems.savedPriceToman,
      productNameFa: commerceProducts.nameFa,
      productSlug: commerceProducts.slug,
      alertsOff: accountPreferences.priceAlertsOff,
    })
    .from(savedItems)
    .innerJoin(commerceProducts, eq(commerceProducts.id, savedItems.productId))
    .leftJoin(accountPreferences, eq(accountPreferences.accountId, savedItems.accountId))
    .limit(500);

  let sent = 0;
  for (const row of saved) {
    if (row.alertsOff === true) continue;
    if (row.savedPriceToman === null) continue;
    const current = await lowestPriceOf(database, row.productId!);
    if (current === null) continue;
    if (
      !priceDropped({
        savedPriceToman: row.savedPriceToman,
        currentPriceToman: current,
        minimumDropBp: minimumBp ?? 0,
      })
    ) {
      continue;
    }

    // Which line is at that price, so the alert names something real.
    const [cheapest] = await database
      .select({ id: offerSkus.id })
      .from(offerSkus)
      .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
      .where(
        and(
          eq(sellerOffers.productId, row.productId!),
          eq(sellerOffers.status, 'ACTIVE'),
          eq(offerSkus.isActive, true),
          eq(offerSkus.priceToman, current),
        ),
      )
      .limit(1);
    if (!cheapest) continue;

    try {
      // The insert is the de-duplication: a second attempt at the same
      // (person, line, price) fails here rather than being checked for.
      await database.insert(priceAlerts).values({
        accountId: row.accountId,
        offerSkuId: cheapest.id,
        priceToman: current,
      });
    } catch (error) {
      if (violates(error, 'price_alert_once_key')) continue;
      throw error;
    }

    await createNotification(database, {
      recipientAccountId: row.accountId,
      kind: 'COMMERCE_PRICE_DROP',
      titleFa: 'قیمت کالایی که نگه داشته‌اید پایین آمد',
      bodyFa:
        row.productNameFa +
        ' از ' +
        row.savedPriceToman.toLocaleString('fa-IR') +
        ' به ' +
        current.toLocaleString('fa-IR') +
        ' تومان رسید.',
      resume: {
        entity: { type: 'COMMERCE_PRODUCT', id: row.productId! },
        step: 'PRICE_DROP',
        originRoute: '/shop/' + (row.productSlug ?? ''),
      },
    });
    sent += 1;
  }
  return sent;
}
