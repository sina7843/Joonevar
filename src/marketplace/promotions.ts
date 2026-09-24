/**
 * Paid promotion of one advert — PROMPT-004.
 *
 * Four rules, each of which is a way this could otherwise become dishonest:
 *
 *  - a promotion is **placement, not reputation**: nothing outside this module
 *    reads it, and no other ranking signal is touched by it;
 *  - it only moves an advert among adverts that already matched the search, so
 *    it can never put an irrelevant animal in front of a buyer;
 *  - it is always labelled «تبلیغ» wherever it is shown;
 *  - it ends on its own date, read at request time rather than swept by a job,
 *    so an expired promotion stops working even if nothing ran.
 *
 * The money follows the same path every other payment does: a batch priced from
 * a managed setting, and an effect that runs only inside the verifying
 * transaction. A promotion is never active because somebody pressed buy.
 */
import { and, asc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animalListings, listingPromotionPackages, listingPromotions } from '../db/schema/marketplace.ts';
import { createBatch, type BatchRecord } from '../billing/payments.ts';
import { resumeContext } from '../domain/resume-context.ts';
import { readMoney } from '../settings/service.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notConfigured, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFlagEnabled } from './flags.ts';

export type PromotionRow = typeof listingPromotions.$inferSelect;
export type PromotionPackageRow = typeof listingPromotionPackages.$inferSelect;

/**
 * The two packages of the animal market.
 *
 * Rows, not prices: each points at the managed setting that holds its tariff,
 * which starts unset. Seeding a package therefore never seeds a price, and the
 * purchase path stays shut until somebody with the authority enters one.
 */
export const PROMOTION_PACKAGES: ReadonlyArray<{
  code: string;
  labelFa: string;
  durationDays: number;
  priceSettingKey: string;
  sortOrder: number;
}> = [
  {
    code: 'LISTING_7',
    labelFa: 'نمایش ویژه ۷ روزه',
    durationDays: 7,
    priceSettingKey: 'market.animal.promotion_7_toman',
    sortOrder: 0,
  },
  {
    code: 'LISTING_30',
    labelFa: 'نمایش ویژه ۳۰ روزه',
    durationDays: 30,
    priceSettingKey: 'market.animal.promotion_30_toman',
    sortOrder: 1,
  },
];

/** Additive: a package an operator switched off is never switched back on here. */
export async function ensurePromotionPackages(database: DbClient): Promise<number> {
  let inserted = 0;
  for (const entry of PROMOTION_PACKAGES) {
    const rows = await database
      .insert(listingPromotionPackages)
      .values(entry)
      .onConflictDoNothing({ target: listingPromotionPackages.code })
      .returning({ id: listingPromotionPackages.id });
    inserted += rows.length;
  }
  return inserted;
}

export interface PromotionPackageView {
  readonly id: string;
  readonly code: string;
  readonly labelFa: string;
  readonly durationDays: number;
  readonly priceSettingKey: string;
  /** Null when the tariff is unset, which is a real state and not free. */
  readonly priceToman: bigint | null;
}

export async function promotionPackages(database: DbClient): Promise<readonly PromotionPackageView[]> {
  const rows = await database
    .select()
    .from(listingPromotionPackages)
    .where(eq(listingPromotionPackages.isActive, true))
    .orderBy(asc(listingPromotionPackages.sortOrder));

  const out: PromotionPackageView[] = [];
  for (const row of rows) {
    const price = await readMoney(database, row.priceSettingKey);
    out.push({
      id: row.id,
      code: row.code,
      labelFa: row.labelFa,
      durationDays: row.durationDays,
      priceSettingKey: row.priceSettingKey,
      priceToman: price.configured ? price.toman : null,
    });
  }
  return out;
}

/**
 * Which of these adverts are promoted right now.
 *
 * Asked for a known set of ids rather than for everything, so the answer is one
 * small query on the page that needs it, and the dates are compared in SQL so
 * an expired promotion is simply not returned.
 */
export async function livePromotedListingIds(
  database: DbClient,
  listingIds: readonly string[],
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await database
    .select({ listingId: listingPromotions.listingId })
    .from(listingPromotions)
    .where(
      and(
        inArray(listingPromotions.listingId, [...listingIds]),
        eq(listingPromotions.status, 'ACTIVE'),
        lte(listingPromotions.startsAt, now),
        gt(listingPromotions.endsAt, now),
      ),
    );
  return new Set(rows.map((row) => row.listingId));
}

export interface PromotionView {
  readonly id: string;
  readonly listingId: string;
  readonly packageLabelFa: string;
  readonly status: string;
  readonly stateFa: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

const stateFa = (row: PromotionRow, now: Date): string => {
  if (row.status === 'ACTIVE' && row.endsAt !== null && row.endsAt.getTime() <= now.getTime()) return 'منقضی';
  switch (row.status) {
    case 'ACTIVE':
      return 'فعال';
    case 'PENDING_PAYMENT':
      return 'در انتظار پرداخت';
    case 'CANCELLED':
      return 'لغوشده';
    default:
      return 'پرداخت ناموفق';
  }
};

export async function promotionsOfListing(
  database: DbClient,
  listingId: string,
  now: Date = new Date(),
): Promise<readonly PromotionView[]> {
  const rows = await database
    .select({
      id: listingPromotions.id,
      listingId: listingPromotions.listingId,
      status: listingPromotions.status,
      startsAt: listingPromotions.startsAt,
      endsAt: listingPromotions.endsAt,
      labelFa: listingPromotionPackages.labelFa,
      row: listingPromotions,
    })
    .from(listingPromotions)
    .innerJoin(listingPromotionPackages, eq(listingPromotionPackages.id, listingPromotions.packageId))
    .where(eq(listingPromotions.listingId, listingId))
    .orderBy(sql`${listingPromotions.createdAt} desc`);

  return rows.map((row) => ({
    id: row.id,
    listingId: row.listingId,
    packageLabelFa: row.labelFa,
    status: row.status,
    stateFa: stateFa(row.row, now),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  }));
}

export interface StartedPromotion {
  readonly promotion: PromotionRow;
  readonly batch: BatchRecord;
}

/**
 * Buy a promotion for one advert.
 *
 * The advert has to be the buyer's own and actually published — promoting a
 * draft or a suspended advert would be selling nothing. The price comes from
 * the managed setting through `createBatch`, so an unset tariff stops here with
 * a named reason rather than opening a payment for an amount nobody chose.
 */
export async function startPromotionPurchase(
  database: Database,
  actor: Actor,
  input: { listingId: string; packageId: string },
): Promise<StartedPromotion> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');

  const [listing] = await database
    .select({
      id: animalListings.id,
      sellerAccountId: animalListings.sellerAccountId,
      status: animalListings.status,
    })
    .from(animalListings)
    .where(eq(animalListings.id, input.listingId))
    .limit(1);
  if (!listing || listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (listing.status !== 'PUBLISHED' && listing.status !== 'RESERVED') {
    throw conflict('فقط آگهی منتشرشده قابل تبلیغ است.');
  }

  const [pack] = await database
    .select()
    .from(listingPromotionPackages)
    .where(and(eq(listingPromotionPackages.id, input.packageId), eq(listingPromotionPackages.isActive, true)))
    .limit(1);
  if (!pack) throw notFound('این بسته تبلیغ پیدا نشد.');

  const price = await readMoney(database, pack.priceSettingKey);
  if (!price.configured) throw notConfigured(pack.priceSettingKey);

  return database.transaction(async (tx) => {
    let promotion: PromotionRow;
    try {
      const [row] = await tx
        .insert(listingPromotions)
        .values({
          listingId: listing.id,
          packageId: pack.id,
          accountId: actor.accountId,
          status: 'PENDING_PAYMENT',
          durationDays: pack.durationDays,
        })
        .returning();
      promotion = row!;
    } catch (error) {
      if (String(error).includes('listing_promotion_live_key') || String((error as { cause?: unknown }).cause ?? '').includes('listing_promotion_live_key')) {
        throw conflict('این آگهی همین حالا یک تبلیغ فعال یا در انتظار پرداخت دارد.');
      }
      throw error;
    }

    const batch = await createBatch(tx as Database, actor, {
      service: 'ANIMAL_LISTING_PROMOTION',
      items: [{ targetType: 'LISTING_PROMOTION', targetId: promotion.id, settingKey: pack.priceSettingKey }],
      resume: resumeContext({
        entity: { type: 'LISTING_PROMOTION', id: promotion.id },
        step: 'PROMOTION_PAYMENT',
        originRoute: '/account/listings/' + listing.id,
      }),
    });

    const [linked] = await tx
      .update(listingPromotions)
      .set({ paymentBatchId: batch.id, updatedAt: new Date() })
      .where(eq(listingPromotions.id, promotion.id))
      .returning();

    await recordAudit(tx, actor, {
      action: 'LISTING_PROMOTION_STARTED',
      targetType: 'LISTING_PROMOTION',
      targetId: promotion.id,
      after: { listingId: listing.id, packageCode: pack.code, durationDays: pack.durationDays },
    });

    return { promotion: linked!, batch };
  });
}

/**
 * Turn a verified payment into a live promotion.
 *
 * Runs inside the transaction that marks the batch paid, so a promotion exists
 * exactly when the money did. A renewal of an advert that still has a live
 * promotion starts where that one ends rather than overlapping it.
 */
export async function activatePromotionFromPayment(
  tx: DbClient,
  batch: { id: string },
  now: Date = new Date(),
): Promise<void> {
  const [promotion] = await tx
    .select()
    .from(listingPromotions)
    .where(eq(listingPromotions.paymentBatchId, batch.id))
    .limit(1);
  if (!promotion || promotion.status !== 'PENDING_PAYMENT') return;

  const days = promotion.durationDays ?? 0;
  if (days <= 0) return;

  const [live] = await tx
    .select({ endsAt: listingPromotions.endsAt })
    .from(listingPromotions)
    .where(
      and(
        eq(listingPromotions.listingId, promotion.listingId),
        eq(listingPromotions.status, 'ACTIVE'),
        gt(listingPromotions.endsAt, now),
      ),
    )
    .orderBy(sql`${listingPromotions.endsAt} desc`)
    .limit(1);

  const startsAt = live?.endsAt ?? now;
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);

  await tx
    .update(listingPromotions)
    .set({
      status: 'ACTIVE',
      startsAt,
      endsAt,
      version: promotion.version + 1,
      updatedAt: now,
    })
    .where(eq(listingPromotions.id, promotion.id));

  await recordAudit(tx, null, {
    action: 'LISTING_PROMOTION_ACTIVATED',
    targetType: 'LISTING_PROMOTION',
    targetId: promotion.id,
    after: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
  });
}

/** A payment that failed leaves a record of the attempt, not a silent gap. */
export async function markPromotionPaymentFailed(tx: DbClient, batchId: string): Promise<void> {
  await tx
    .update(listingPromotions)
    .set({ status: 'PAYMENT_FAILED', updatedAt: new Date() })
    .where(and(eq(listingPromotions.paymentBatchId, batchId), eq(listingPromotions.status, 'PENDING_PAYMENT')));
}

/** Cancel a promotion the seller no longer wants. The period that was paid for keeps its dates. */
export async function cancelPromotion(
  database: Database,
  actor: Actor,
  input: { promotionId: string; reasonFa: string },
): Promise<PromotionRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل لغو را بنویسید.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(listingPromotions)
      .where(eq(listingPromotions.id, input.promotionId))
      .limit(1);
    if (!row || row.accountId !== actor.accountId) throw notFound('این تبلیغ پیدا نشد.');
    if (row.status === 'CANCELLED') throw conflict('این تبلیغ قبلاً لغو شده است.');

    const [updated] = await tx
      .update(listingPromotions)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReasonFa: reasonFa,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(listingPromotions.id, row.id), eq(listingPromotions.version, row.version)))
      .returning();
    if (!updated) throw conflict('این تبلیغ هم‌زمان تغییر کرد؛ دوباره تلاش کنید.');

    await recordAudit(tx, actor, {
      action: 'LISTING_PROMOTION_CANCELLED',
      targetType: 'LISTING_PROMOTION',
      targetId: row.id,
      before: { status: row.status },
      after: { status: 'CANCELLED' },
      reason: reasonFa,
    });
    return updated;
  });
}
