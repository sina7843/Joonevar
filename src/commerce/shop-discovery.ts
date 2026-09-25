/**
 * What the public may be shown of the shop — PROMPT-009.
 *
 * One condition decides visibility, written once and read by the list, the
 * product page and anything that follows: the product is published, its
 * category is sellable, and at least one active offer from a trading store
 * exists for it. A product whose only seller was suspended disappears the same
 * way an unpublished one does, and a visitor cannot tell which of the reasons
 * applied.
 *
 * The query string is the one input a stranger fully controls, so every field
 * of it becomes a member of a closed list, a UUID or a bounded integer before
 * it reaches a query, and the free-text term is bound as a parameter with its
 * wildcards escaped.
 */
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { commerceProducts, offerSkus, productCategories, productMedia, productSpecies, productVariants, sellerOffers } from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { compareOffers, isProductSort, type OfferComparison, type ProductSort } from './catalog-model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShopFilter {
  readonly categoryId: string | null;
  readonly speciesCode: string | null;
  readonly term: string | null;
  readonly inStockOnly: boolean;
  readonly sort: ProductSort;
  readonly page: number;
}

/** Everything unrecognised becomes null rather than an error. */
export function parseShopFilter(raw: Record<string, string | string[] | undefined>): ShopFilter {
  const one = (key: string): string | null => {
    const value = raw[key];
    const text = Array.isArray(value) ? value[0] : value;
    return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
  };
  const uuid = (key: string): string | null => {
    const value = one(key);
    return value !== null && UUID.test(value) ? value : null;
  };

  const speciesRaw = one('species');
  const term = one('q');
  const pageRaw = Number(one('page') ?? '1');
  const sortRaw = one('sort');

  return {
    categoryId: uuid('category'),
    // A species code is short and from a closed alphabet; anything else is not
    // a species and becomes nothing.
    speciesCode: speciesRaw !== null && /^[A-Z_]{2,24}$/.test(speciesRaw) ? speciesRaw : null,
    term: term === null ? null : term.slice(0, 80),
    inStockOnly: one('stock') === '1',
    sort: isProductSort(sortRaw) ? sortRaw : 'NEWEST',
    page: Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 200 ? pageRaw : 1,
  };
}

/** The canonical address of a filtered view, so two spellings are one page. */
export function shopQueryString(filter: ShopFilter): string {
  const parts: string[] = [];
  if (filter.categoryId) parts.push('category=' + filter.categoryId);
  if (filter.speciesCode) parts.push('species=' + filter.speciesCode);
  if (filter.term) parts.push('q=' + encodeURIComponent(filter.term));
  if (filter.inStockOnly) parts.push('stock=1');
  if (filter.sort !== 'NEWEST') parts.push('sort=' + filter.sort);
  if (filter.page > 1) parts.push('page=' + filter.page);
  return parts.length === 0 ? '' : '?' + parts.join('&');
}

export const isCanonicalShopIndex = (filter: ShopFilter): boolean =>
  filter.categoryId === null &&
  filter.speciesCode === null &&
  filter.term === null &&
  !filter.inStockOnly &&
  filter.sort === 'NEWEST' &&
  filter.page === 1;

/**
 * The single visibility rule.
 *
 * Written as a condition rather than as a filter applied afterwards, so a
 * caller who forgets it gets no rows instead of too many.
 */
export function publicProductCondition(): SQL {
  return and(
    eq(commerceProducts.status, 'PUBLISHED'),
    sql`exists (
      select 1 from product_category pc
       where pc.id = ${commerceProducts.categoryId}
         and pc.sale_policy = 'ALLOWED'
         and pc.enabled
    )`,
    sql`exists (
      select 1
        from seller_offer so
        join commerce_seller cs on cs.id = so.seller_id
        join offer_sku sk on sk.offer_id = so.id
       where so.product_id = ${commerceProducts.id}
         and so.status = 'ACTIVE'
         and cs.status = 'ACTIVE'
         and sk.is_active
    )`,
  )!;
}

export interface ShopCard {
  readonly id: string;
  readonly slug: string;
  readonly nameFa: string;
  readonly brandFa: string | null;
  readonly categoryNameFa: string;
  readonly fromPriceToman: bigint | null;
  readonly available: number;
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
}

export const SHOP_PAGE_SIZE = 12;

/** One page of the public shop. */
export async function shopPage(
  database: DbClient,
  filter: ShopFilter,
): Promise<{ items: readonly ShopCard[]; total: number }> {
  const conditions: SQL[] = [publicProductCondition()];
  if (filter.categoryId) conditions.push(eq(commerceProducts.categoryId, filter.categoryId));
  if (filter.speciesCode) {
    conditions.push(
      sql`exists (select 1 from product_species ps where ps.product_id = ${commerceProducts.id} and ps.species_code = ${filter.speciesCode})`,
    );
  }
  if (filter.term) {
    // Bound as a parameter with its wildcards escaped, so a search for a
    // per-cent sign searches for a per-cent sign.
    const needle = '%' + filter.term.replace(/[%_\\]/g, (match) => '\\' + match) + '%';
    conditions.push(
      sql`(${commerceProducts.nameFa} ilike ${needle} escape '\\' or coalesce(${commerceProducts.brandFa}, '') ilike ${needle} escape '\\')`,
    );
  }
  if (filter.inStockOnly) {
    conditions.push(sql`exists (
      select 1
        from seller_offer so
        join commerce_seller cs on cs.id = so.seller_id
        join offer_sku sk on sk.offer_id = so.id
       where so.product_id = ${commerceProducts.id}
         and so.status = 'ACTIVE'
         and cs.status = 'ACTIVE'
         and sk.is_active
         and sk.stock_on_hand - sk.stock_reserved > 0
    )`);
  }

  const where = and(...conditions)!;
  const [counted] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(commerceProducts)
    .where(where);

  const priceExpression = sql<string | null>`(
    select min(sk.price_toman)
      from seller_offer so
      join commerce_seller cs on cs.id = so.seller_id
      join offer_sku sk on sk.offer_id = so.id
     where so.product_id = ${commerceProducts.id}
       and so.status = 'ACTIVE'
       and cs.status = 'ACTIVE'
       and sk.is_active
  )`;

  const rows = await database
    .select({
      id: commerceProducts.id,
      slug: commerceProducts.slug,
      nameFa: commerceProducts.nameFa,
      brandFa: commerceProducts.brandFa,
      categoryNameFa: productCategories.nameFa,
      publishedAt: commerceProducts.publishedAt,
      fromPrice: priceExpression,
      available: sql<number>`(
        select coalesce(sum(greatest(sk.stock_on_hand - sk.stock_reserved, 0)), 0)::int
          from seller_offer so
          join commerce_seller cs on cs.id = so.seller_id
          join offer_sku sk on sk.offer_id = so.id
         where so.product_id = ${commerceProducts.id}
           and so.status = 'ACTIVE'
           and cs.status = 'ACTIVE'
           and sk.is_active
      )`,
      imageFileId: sql<string | null>`(
        select pm.file_id from product_media pm
         where pm.product_id = ${commerceProducts.id}
         order by pm.sort_order asc limit 1
      )`,
      imageAltFa: sql<string | null>`(
        select pm.alt_fa from product_media pm
         where pm.product_id = ${commerceProducts.id}
         order by pm.sort_order asc limit 1
      )`,
    })
    .from(commerceProducts)
    .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
    .where(where)
    // Every order ends with the id, so paging is stable when two rows tie.
    .orderBy(
      ...(filter.sort === 'PRICE_ASC'
        ? [asc(priceExpression), asc(commerceProducts.id)]
        : filter.sort === 'PRICE_DESC'
          ? [desc(priceExpression), asc(commerceProducts.id)]
          : [desc(commerceProducts.publishedAt), asc(commerceProducts.id)]),
    )
    .limit(SHOP_PAGE_SIZE)
    .offset((filter.page - 1) * SHOP_PAGE_SIZE);

  return {
    total: counted?.total ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      nameFa: row.nameFa,
      brandFa: row.brandFa,
      categoryNameFa: row.categoryNameFa,
      fromPriceToman: row.fromPrice === null ? null : BigInt(row.fromPrice),
      available: row.available,
      imageFileId: row.imageFileId,
      imageAltFa: row.imageAltFa,
    })),
  };
}

export interface PublicProductPage {
  readonly id: string;
  readonly slug: string;
  readonly path: string;
  readonly nameFa: string;
  readonly brandFa: string | null;
  readonly categoryNameFa: string;
  readonly descriptionFa: string | null;
  readonly specifications: Record<string, unknown>;
  readonly speciesCodes: readonly string[];
  readonly media: readonly { fileId: string; altFa: string }[];
  readonly offers: readonly OfferComparison[];
  readonly variantLabels: Record<string, string>;
}

/**
 * One public product, by its address.
 *
 * A merged product resolves to the base it became part of, so an address
 * somebody saved keeps working after a reviewer folded a duplicate away.
 */
export async function publicProduct(
  database: DbClient,
  slug: string,
): Promise<PublicProductPage | null> {
  const [found] = await database
    .select({ id: commerceProducts.id, mergedInto: commerceProducts.mergedIntoProductId })
    .from(commerceProducts)
    .where(eq(commerceProducts.slug, slug))
    .limit(1);
  if (!found) return null;

  const targetId = found.mergedInto ?? found.id;
  const [row] = await database
    .select({
      id: commerceProducts.id,
      slug: commerceProducts.slug,
      nameFa: commerceProducts.nameFa,
      brandFa: commerceProducts.brandFa,
      descriptionFa: commerceProducts.descriptionFa,
      specifications: commerceProducts.specifications,
      categoryNameFa: productCategories.nameFa,
    })
    .from(commerceProducts)
    .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
    .where(and(eq(commerceProducts.id, targetId), publicProductCondition()))
    .limit(1);
  if (!row) return null;

  const speciesRows = await database
    .select({ code: productSpecies.speciesCode })
    .from(productSpecies)
    .where(eq(productSpecies.productId, row.id));

  const media = await database
    .select({ fileId: productMedia.fileId, altFa: productMedia.altFa })
    .from(productMedia)
    .where(eq(productMedia.productId, row.id))
    .orderBy(asc(productMedia.sortOrder));

  const offerRows = await database
    .select({
      offerId: sellerOffers.id,
      skuId: offerSkus.id,
      sellerId: commerceSellers.id,
      sellerNameFa: commerceSellers.displayNameFa,
      priceToman: offerSkus.priceToman,
      stockOnHand: offerSkus.stockOnHand,
      stockReserved: offerSkus.stockReserved,
      condition: sellerOffers.condition,
      variantId: offerSkus.variantId,
      variantLabelFa: productVariants.labelFa,
    })
    .from(offerSkus)
    .innerJoin(sellerOffers, eq(sellerOffers.id, offerSkus.offerId))
    .innerJoin(commerceSellers, eq(commerceSellers.id, sellerOffers.sellerId))
    .leftJoin(productVariants, eq(productVariants.id, offerSkus.variantId))
    .where(
      and(
        eq(sellerOffers.productId, row.id),
        eq(sellerOffers.status, 'ACTIVE'),
        eq(commerceSellers.status, 'ACTIVE'),
        eq(offerSkus.isActive, true),
      ),
    );

  const variantLabels: Record<string, string> = {};
  const offers: OfferComparison[] = offerRows.map((offer) => {
    if (offer.variantId && offer.variantLabelFa) variantLabels[offer.offerId] = offer.variantLabelFa;
    return {
      offerId: offer.offerId,
      skuId: offer.skuId,
      sellerId: offer.sellerId,
      sellerNameFa: offer.sellerNameFa ?? 'فروشگاه',
      priceToman: offer.priceToman,
      available: Math.max(offer.stockOnHand - offer.stockReserved, 0),
      condition: offer.condition as OfferComparison['condition'],
    };
  });

  return {
    id: row.id,
    slug: row.slug,
    path: '/shop/' + row.slug,
    nameFa: row.nameFa,
    brandFa: row.brandFa,
    categoryNameFa: row.categoryNameFa,
    descriptionFa: row.descriptionFa,
    specifications: (row.specifications ?? {}) as Record<string, unknown>,
    speciesCodes: speciesRows.map((species) => species.code),
    media,
    offers: compareOffers(offers),
    variantLabels,
  };
}

/** The categories with something to show, for the filter rail. */
export async function shopCategories(database: DbClient) {
  return database
    .select({ id: productCategories.id, nameFa: productCategories.nameFa })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.salePolicy, 'ALLOWED'),
        eq(productCategories.enabled, true),
        sql`exists (
          select 1 from commerce_product p
           where p.category_id = ${productCategories.id} and p.status = 'PUBLISHED'
        )`,
      ),
    )
    .orderBy(asc(productCategories.sortOrder));
}
