/**
 * Kept for later, followed, and lately looked at — PROMPT-012.
 *
 * The first two are things somebody chose. The third is not: a browsing
 * history is the most personal thing a shop holds, so it is recorded only
 * while a retention period has been configured, only for somebody who has not
 * turned it off, and only as one row per thing rather than a log of when
 * somebody was awake.
 */
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountPreferences, follows, recentViews, savedItems } from '../db/schema/trust.ts';
import { commerceProducts, offerSkus, productCategories, sellerOffers } from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import { animals } from '../db/schema/animals.ts';
import { readInt } from '../settings/service.ts';
import { forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { comparisonRefusal, COMPARISON_REFUSAL_FA, type ComparisonRefusal } from './trust-model.ts';

export const RETENTION_KEY = 'market.shop.recent_view_retention_days';

export type SavedRow = typeof savedItems.$inferSelect;
export type PreferenceRow = typeof accountPreferences.$inferSelect;

/**
 * What this person has turned off.
 *
 * Absence means the ordinary defaults, so nobody has to be given a row to be
 * treated properly.
 */
export async function preferencesOf(database: DbClient, accountId: string): Promise<PreferenceRow> {
  const [row] = await database
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.accountId, accountId))
    .limit(1);
  return (
    row ?? {
      accountId,
      recommendationsOff: false,
      historyOff: false,
      priceAlertsOff: false,
      updatedAt: new Date(),
    }
  );
}

/**
 * Change what is turned off.
 *
 * Turning the history off also clears what was already kept: leaving it would
 * make the switch a promise about the future and nothing about the past.
 */
export async function setPreferences(
  database: Database,
  actor: Actor,
  input: { recommendationsOff?: boolean; historyOff?: boolean; priceAlertsOff?: boolean },
): Promise<void> {
  if (!actor.accountId) throw forbidden('برای تغییر تنظیمات باید وارد حساب شوید.');
  const current = await preferencesOf(database, actor.accountId);
  const next = {
    recommendationsOff: input.recommendationsOff ?? current.recommendationsOff,
    historyOff: input.historyOff ?? current.historyOff,
    priceAlertsOff: input.priceAlertsOff ?? current.priceAlertsOff,
  };

  await database
    .insert(accountPreferences)
    .values({ accountId: actor.accountId, ...next })
    .onConflictDoUpdate({
      target: accountPreferences.accountId,
      set: { ...next, updatedAt: new Date() },
    });

  if (next.historyOff) await database.delete(recentViews).where(eq(recentViews.accountId, actor.accountId));
}

// ── keeping things ─────────────────────────────────────────────────────────

/**
 * Keep something for later, with what it cost at that moment.
 *
 * The price is stored because a drop is measured against what this person
 * actually saw, not against the highest the thing has ever been — the second
 * makes a sale out of a price that merely went back to normal.
 */
export async function saveItem(
  database: Database,
  actor: Actor,
  input: { productId?: string | null; listingId?: string | null },
): Promise<void> {
  if (!actor.accountId) throw forbidden('برای نگه‌داشتن باید وارد حساب شوید.');
  const productId = input.productId ?? null;
  const listingId = input.listingId ?? null;
  if ((productId === null) === (listingId === null)) {
    throw validation('یا یک کالا را نگه دارید یا یک آگهی.');
  }

  const savedPriceToman = productId === null ? null : await lowestPriceOf(database, productId);
  await database
    .insert(savedItems)
    .values({
      accountId: actor.accountId,
      subject: productId ? 'COMMERCE_PRODUCT' : 'ANIMAL_LISTING',
      productId,
      listingId,
      savedPriceToman,
    })
    // Keeping something twice is keeping it once; the price is refreshed so a
    // drop is measured from the most recent time they looked. The index is
    // partial, so its own condition has to travel with the conflict target —
    // without it Postgres cannot tell which index is meant.
    .onConflictDoUpdate({
      target: productId ? [savedItems.accountId, savedItems.productId] : [savedItems.accountId, savedItems.listingId],
      targetWhere: productId
        ? sql`${savedItems.productId} is not null`
        : sql`${savedItems.listingId} is not null`,
      set: { savedPriceToman },
    });
}

export async function unsaveItem(
  database: Database,
  actor: Actor,
  input: { productId?: string | null; listingId?: string | null },
): Promise<void> {
  if (!actor.accountId) throw forbidden('برای این کار باید وارد حساب شوید.');
  const where = input.productId
    ? and(eq(savedItems.accountId, actor.accountId), eq(savedItems.productId, input.productId))
    : and(eq(savedItems.accountId, actor.accountId), eq(savedItems.listingId, input.listingId!));
  await database.delete(savedItems).where(where);
}

/** The cheapest live price of one product, across every shop selling it. */
export async function lowestPriceOf(database: DbClient, productId: string): Promise<bigint | null> {
  const [row] = await database
    .select({ lowest: sql<string | null>`min(${offerSkus.priceToman})`.as('lowest') })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .where(
      and(
        eq(sellerOffers.productId, productId),
        eq(sellerOffers.status, 'ACTIVE'),
        eq(offerSkus.isActive, true),
      ),
    );
  return row?.lowest === null || row?.lowest === undefined ? null : BigInt(row.lowest);
}

export interface SavedView {
  readonly id: string;
  readonly productId: string | null;
  readonly listingId: string | null;
  readonly labelFa: string;
  readonly path: string;
  readonly savedPriceToman: bigint | null;
  readonly currentPriceToman: bigint | null;
}

/** Everything this person kept, with what it costs now beside what it cost then. */
export async function savedFor(database: Database, actor: Actor): Promise<readonly SavedView[]> {
  if (!actor.accountId) throw forbidden('برای دیدن فهرست باید وارد حساب شوید.');
  const rows = await database
    .select({
      saved: savedItems,
      productNameFa: commerceProducts.nameFa,
      productSlug: commerceProducts.slug,
      // An advert has no title of its own; what a person recognises is the
      // animal's name, so that is what the saved list shows.
      listingAnimalName: animals.name,
    })
    .from(savedItems)
    .leftJoin(commerceProducts, eq(commerceProducts.id, savedItems.productId))
    .leftJoin(animalListings, eq(animalListings.id, savedItems.listingId))
    .leftJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(savedItems.accountId, actor.accountId))
    .orderBy(desc(savedItems.createdAt))
    .limit(100);

  const views: SavedView[] = [];
  for (const row of rows) {
    const currentPriceToman =
      row.saved.productId === null ? null : await lowestPriceOf(database, row.saved.productId);
    views.push({
      id: row.saved.id,
      productId: row.saved.productId,
      listingId: row.saved.listingId,
      labelFa: row.productNameFa ?? row.listingAnimalName ?? 'آگهی حیوان',
      path: row.saved.productId
        ? '/shop/' + (row.productSlug ?? '')
        : '/animals-market/' + row.saved.listingId,
      savedPriceToman: row.saved.savedPriceToman,
      currentPriceToman,
    });
  }
  return views;
}

export const isSaved = async (database: DbClient, accountId: string, productId: string): Promise<boolean> => {
  const rows = await database
    .select({ id: savedItems.id })
    .from(savedItems)
    .where(and(eq(savedItems.accountId, accountId), eq(savedItems.productId, productId)))
    .limit(1);
  return rows.length > 0;
};

// ── following ──────────────────────────────────────────────────────────────

export async function follow(
  database: Database,
  actor: Actor,
  input: { sellerId?: string | null; kennelId?: string | null },
): Promise<void> {
  if (!actor.accountId) throw forbidden('برای دنبال کردن باید وارد حساب شوید.');
  const sellerId = input.sellerId ?? null;
  const kennelId = input.kennelId ?? null;
  if ((sellerId === null) === (kennelId === null)) throw validation('یا یک فروشگاه را دنبال کنید یا یک کنل.');

  await database
    .insert(follows)
    .values({
      accountId: actor.accountId,
      subject: sellerId ? 'COMMERCE_SELLER' : 'KENNEL',
      sellerId,
      kennelId,
    })
    .onConflictDoNothing();
}

export async function unfollow(
  database: Database,
  actor: Actor,
  input: { sellerId?: string | null; kennelId?: string | null },
): Promise<void> {
  if (!actor.accountId) throw forbidden('برای این کار باید وارد حساب شوید.');
  const where = input.sellerId
    ? and(eq(follows.accountId, actor.accountId), eq(follows.sellerId, input.sellerId))
    : and(eq(follows.accountId, actor.accountId), eq(follows.kennelId, input.kennelId!));
  await database.delete(follows).where(where);
}

export async function followingFor(database: Database, actor: Actor) {
  if (!actor.accountId) throw forbidden('برای دیدن فهرست باید وارد حساب شوید.');
  return database
    .select({
      id: follows.id,
      subject: follows.subject,
      sellerId: follows.sellerId,
      kennelId: follows.kennelId,
      sellerNameFa: commerceSellers.displayNameFa,
      sellerSlug: commerceSellers.slug,
    })
    .from(follows)
    .leftJoin(commerceSellers, eq(commerceSellers.id, follows.sellerId))
    .where(eq(follows.accountId, actor.accountId))
    .orderBy(desc(follows.createdAt))
    .limit(100);
}

/** Who to tell when a shop lists something new. */
export async function followersOf(database: DbClient, sellerId: string): Promise<readonly string[]> {
  const rows = await database
    .select({ accountId: follows.accountId })
    .from(follows)
    .where(eq(follows.sellerId, sellerId));
  return rows.map((row) => row.accountId);
}

// ── what was looked at ─────────────────────────────────────────────────────

/**
 * Record a view, if anybody asked for it to be recorded.
 *
 * Three things have to be true: somebody is signed in, they have not turned
 * the history off, and a retention period has been configured. The third is
 * the one that matters most — keeping a browsing history with no deletion
 * date is not a default anybody should fall into, so without a number
 * nothing is written at all.
 */
export async function recordView(
  database: Database,
  actor: Actor,
  input: { productId?: string | null; listingId?: string | null },
): Promise<void> {
  if (!actor.accountId) return;
  const retention = await readInt(database, RETENTION_KEY).catch(() => null);
  if (retention === null) return;
  const preferences = await preferencesOf(database, actor.accountId);
  if (preferences.historyOff) return;

  const productId = input.productId ?? null;
  const listingId = input.listingId ?? null;
  if ((productId === null) === (listingId === null)) return;

  await database
    .insert(recentViews)
    .values({
      accountId: actor.accountId,
      subject: productId ? 'COMMERCE_PRODUCT' : 'ANIMAL_LISTING',
      productId,
      listingId,
      viewedAt: new Date(),
    })
    // One row per thing, moved forward: a history of what, not of when.
    .onConflictDoUpdate({
      target: productId
        ? [recentViews.accountId, recentViews.productId]
        : [recentViews.accountId, recentViews.listingId],
      targetWhere: productId
        ? sql`${recentViews.productId} is not null`
        : sql`${recentViews.listingId} is not null`,
      set: { viewedAt: new Date() },
    });
}

/**
 * Forget what is older than the retention period.
 *
 * Read-time like every other expiry here. An unconfigured retention deletes
 * nothing because nothing was ever written under one.
 */
export async function purgeOldViews(database: Database, now: Date = new Date()): Promise<number> {
  const retention = await readInt(database, RETENTION_KEY).catch(() => null);
  if (retention === null) return 0;
  const cutoff = new Date(now.getTime() - retention * 86_400_000);
  const removed = await database
    .delete(recentViews)
    .where(lt(recentViews.viewedAt, cutoff))
    .returning({ id: recentViews.id });
  return removed.length;
}

export async function recentlyViewed(database: Database, actor: Actor, limit = 12) {
  if (!actor.accountId) return [];
  await purgeOldViews(database);
  return database
    .select({
      productId: recentViews.productId,
      listingId: recentViews.listingId,
      viewedAt: recentViews.viewedAt,
      productNameFa: commerceProducts.nameFa,
      productSlug: commerceProducts.slug,
      categoryId: commerceProducts.categoryId,
    })
    .from(recentViews)
    .leftJoin(commerceProducts, eq(commerceProducts.id, recentViews.productId))
    .where(eq(recentViews.accountId, actor.accountId))
    .orderBy(desc(recentViews.viewedAt))
    .limit(limit);
}

// ── comparison ─────────────────────────────────────────────────────────────

export interface ComparisonRow {
  readonly productId: string;
  readonly nameFa: string;
  readonly brandFa: string | null;
  readonly lowestPriceToman: bigint | null;
  readonly specifications: Record<string, unknown>;
}

export interface Comparison {
  readonly categoryNameFa: string;
  readonly attributes: readonly string[];
  readonly products: readonly ComparisonRow[];
}

/**
 * Put products side by side, within one category.
 *
 * Only within one, because the specifications are what a comparison shows and
 * two categories share none: a table of food against collars would be rows of
 * blanks pretending to be a comparison. The rows are the category's own
 * declared attributes, so the table has the same shape whatever is in it.
 */
export async function compare(
  database: Database,
  productIds: readonly string[],
): Promise<Comparison | { refusalFa: string }> {
  const unique = [...new Set(productIds)];
  const rows = await (unique.length === 0
    ? []
    : database
        .select({
          product: commerceProducts,
          categoryNameFa: productCategories.nameFa,
          attributes: productCategories.attributes,
        })
        .from(commerceProducts)
        .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
        .where(and(inArray(commerceProducts.id, unique), eq(commerceProducts.status, 'PUBLISHED'))));

  const refusal: ComparisonRefusal | null = comparisonRefusal(rows.map((row) => row.product.categoryId));
  if (refusal !== null) return { refusalFa: COMPARISON_REFUSAL_FA[refusal] };

  const declared = (rows[0]!.attributes ?? {}) as Record<string, { kind?: string }>;
  const attributes = Object.entries(declared)
    .filter(([, definition]) => definition.kind !== 'VARIANT')
    .map(([name]) => name);

  const products: ComparisonRow[] = [];
  for (const row of rows) {
    products.push({
      productId: row.product.id,
      nameFa: row.product.nameFa,
      brandFa: row.product.brandFa,
      lowestPriceToman: await lowestPriceOf(database, row.product.id),
      specifications: (row.product.specifications ?? {}) as Record<string, unknown>,
    });
  }
  return { categoryNameFa: rows[0]!.categoryNameFa, attributes, products };
}
