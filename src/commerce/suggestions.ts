/**
 * Suggestions somebody can argue with — PROMPT-012.
 *
 * Every one carries the rule that produced it, because a recommendation
 * nobody can explain is one nobody can challenge. The inputs are three facts
 * about what this person looked at and bought: a category, a species, and
 * their own orders. Nothing here infers anything about who they are, and
 * there is no model that could learn to.
 *
 * Somebody who has turned recommendations off gets the fallback, which is a
 * fact about the catalogue rather than about them.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { commerceOrderItems, commerceOrders, commerceSubOrders } from '../db/schema/orders.ts';
import { commerceProducts, offerSkus, productSpecies, sellerOffers } from '../db/schema/catalog.ts';
import type { Actor } from '../authz/actor.ts';
import { preferencesOf, recentlyViewed } from './saved.ts';
import { recommend, type Recommendation } from './trust-model.ts';

export interface SuggestionView extends Recommendation {
  readonly nameFa: string;
  readonly slug: string;
  readonly brandFa: string | null;
  readonly fromPriceToman: bigint | null;
  /** Never true here. Paid placement is a separate, labelled list. */
  readonly sponsored: false;
}

/**
 * What to suggest to this person, and why.
 *
 * The personal half is skipped entirely when they have opted out — not
 * computed and then hidden, because a history that is not supposed to be used
 * should not be read either.
 */
export async function suggestionsFor(
  database: Database,
  actor: Actor,
  limit = 8,
): Promise<readonly SuggestionView[]> {
  const optedOut =
    actor.accountId === null ? true : (await preferencesOf(database, actor.accountId)).recommendationsOff;

  let recentCategoryIds: string[] = [];
  let recentSpeciesCodes: string[] = [];
  let boughtProductIds: string[] = [];

  if (!optedOut && actor.accountId !== null) {
    const seen = await recentlyViewed(database, actor, 20);
    recentCategoryIds = [...new Set(seen.map((row) => row.categoryId).filter((id): id is string => id !== null))];

    const productIds = seen.map((row) => row.productId).filter((id): id is string => id !== null);
    if (productIds.length > 0) {
      const species = await database
        .select({ code: productSpecies.speciesCode })
        .from(productSpecies)
        .where(inArray(productSpecies.productId, productIds));
      recentSpeciesCodes = [...new Set(species.map((row) => row.code))];
    }

    const bought = await database
      .select({ productId: commerceOrderItems.productId })
      .from(commerceOrderItems)
      .innerJoin(commerceSubOrders, eq(commerceSubOrders.id, commerceOrderItems.subOrderId))
      .innerJoin(commerceOrders, eq(commerceOrders.id, commerceSubOrders.orderId))
      .where(eq(commerceOrders.buyerAccountId, actor.accountId))
      .limit(100);
    boughtProductIds = [...new Set(bought.map((row) => row.productId))];
  }

  // Everything the shop could suggest: published, sellable, actually on sale.
  const candidates = await database
    .select({
      productId: commerceProducts.id,
      nameFa: commerceProducts.nameFa,
      slug: commerceProducts.slug,
      brandFa: commerceProducts.brandFa,
      categoryId: commerceProducts.categoryId,
      fromPrice: sql<string | null>`min(${offerSkus.priceToman})`.as('from_price'),
      sold: sql<number>`count(${offerSkus.id})`.as('sold'),
    })
    .from(commerceProducts)
    .innerJoin(sellerOffers, eq(sellerOffers.productId, commerceProducts.id))
    .innerJoin(offerSkus, eq(offerSkus.offerId, sellerOffers.id))
    .where(
      and(
        eq(commerceProducts.status, 'PUBLISHED'),
        eq(sellerOffers.status, 'ACTIVE'),
        eq(offerSkus.isActive, true),
      ),
    )
    .groupBy(commerceProducts.id)
    .orderBy(desc(sql`count(${offerSkus.id})`))
    .limit(60);

  const speciesByProduct = new Map<string, string[]>();
  if (candidates.length > 0) {
    const rows = await database
      .select({ productId: productSpecies.productId, code: productSpecies.speciesCode })
      .from(productSpecies)
      .where(inArray(productSpecies.productId, candidates.map((row) => row.productId)));
    for (const row of rows) {
      speciesByProduct.set(row.productId, [...(speciesByProduct.get(row.productId) ?? []), row.code]);
    }
  }

  const picked = recommend({
    recentCategoryIds,
    recentSpeciesCodes,
    boughtProductIds,
    candidates: candidates.map((row) => ({
      productId: row.productId,
      categoryId: row.categoryId,
      speciesCodes: speciesByProduct.get(row.productId) ?? [],
      sold: Number(row.sold),
    })),
    limit,
  });

  const byId = new Map(candidates.map((row) => [row.productId, row]));
  return picked.map((recommendation) => {
    const row = byId.get(recommendation.productId)!;
    return {
      ...recommendation,
      nameFa: row.nameFa,
      slug: row.slug,
      brandFa: row.brandFa,
      fromPriceToman: row.fromPrice === null ? null : BigInt(row.fromPrice),
      sponsored: false as const,
    };
  });
}
