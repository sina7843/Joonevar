/**
 * The catalogue, the offers on it, and the stock behind them — PROMPT-009.
 *
 * The model is the hybrid one PRODUCT_DECISIONS §8 describes. A **product** is
 * the thing itself — its brand, name, barcode, category, which animals it suits
 * and its specifications — and it is shared between sellers. An **offer** is
 * one seller's terms on that product: condition, whether they ship it, and
 * whether they are selling it at all. A **SKU** is one variant of one offer,
 * and that is where a price and a quantity live, because a 2kg bag and a 10kg
 * bag are not the same thing to sell or to count.
 *
 * Stock is never a number somebody sets. It is the sum of an append-only
 * ledger, and the two counters on the SKU are a cached reading of it that the
 * database itself refuses to let go wrong: `stock_reserved` can never exceed
 * `stock_on_hand`, and neither can go below zero. That check is what makes two
 * simultaneous checkouts unable to oversell, rather than a comparison in code
 * that two transactions can both pass.
 */
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  categorySalePolicy,
  inventoryMoveKind,
  offerCondition,
  offerStatus2,
  productKind,
  productStatus,
  reservationStatus,
} from './enums.ts';
import { accounts, species, storedFiles } from './core.ts';
import { commerceSellers } from './commerce.ts';

const now = sql`now()`;

/**
 * What kinds of thing the shop sells.
 *
 * `attributes` describes what a product in this category must or may state —
 * the axes a variant can vary along and the specifications buyers compare on —
 * so a category is a small schema rather than a label.
 *
 * `sale_policy` carries the one prohibition this phase has. A blocked category
 * is never offered to a seller, never listed publicly and never selectable:
 * it exists so the refusal can name itself and its reason instead of the
 * product silently lacking a category somebody expected.
 */
export const productCategories = pgTable(
  'product_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    nameFa: text('name_fa').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => productCategories.id, { onDelete: 'restrict' }),
    /** Attribute definitions: what may be specified, and what may vary. */
    attributes: jsonb('attributes').notNull().default(sql`'[]'::jsonb`),
    salePolicy: categorySalePolicy('sale_policy').notNull().default('ALLOWED'),
    /** Why a blocked category is blocked, in the words the refusal will use. */
    policyNoteFa: text('policy_note_fa'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('product_category_code_key').on(t.code),
    index('product_category_parent_idx').on(t.parentId, t.sortOrder),
  ],
);

/**
 * One product.
 *
 * A shared base product belongs to the catalogue; a seller-exclusive one
 * belongs to the seller who proposed it and is reviewed before it is published.
 * Merging a seller's product into a shared base sets `merged_into_product_id`
 * and leaves this row where it is, so the address a buyer has and the orders
 * that reference it keep resolving.
 */
export const commerceProducts = pgTable(
  'commerce_product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: productKind('kind').notNull().default('SELLER_EXCLUSIVE'),
    /** Null for a shared base product: nobody owns the catalogue. */
    ownerSellerId: uuid('owner_seller_id').references(() => commerceSellers.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => productCategories.id, { onDelete: 'restrict' }),
    brandFa: text('brand_fa'),
    nameFa: text('name_fa').notNull(),
    slug: text('slug').notNull(),
    /** The barcode of the article itself; two rows may not claim the same one. */
    barcode: text('barcode'),
    descriptionFa: text('description_fa'),
    /** Values for the attributes this category defines. */
    specifications: jsonb('specifications').notNull().default(sql`'{}'::jsonb`),
    status: productStatus('status').notNull().default('DRAFT'),
    statusReasonFa: text('status_reason_fa'),
    mergedIntoProductId: uuid('merged_into_product_id').references((): AnyPgColumn => commerceProducts.id, {
      onDelete: 'restrict',
    }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('commerce_product_slug_key').on(t.slug),
    index('commerce_product_category_idx').on(t.categoryId, t.status),
    index('commerce_product_owner_idx').on(t.ownerSellerId, t.status),
    /*
     * One barcode names one article. Merged and rejected rows are excluded, so
     * folding a duplicate into a shared base frees its barcode rather than
     * leaving the catalogue permanently unable to record it.
     */
    uniqueIndex('commerce_product_barcode_key')
      .on(t.barcode)
      .where(sql`${t.barcode} is not null and ${t.status} not in ('MERGED','REJECTED')`),
    check(
      'commerce_product_owner_rule',
      sql`(${t.kind} = 'SHARED') = (${t.ownerSellerId} is null)`,
    ),
    check(
      'commerce_product_merged_rule',
      sql`(${t.status} = 'MERGED') = (${t.mergedIntoProductId} is not null)`,
    ),
  ],
);

/** Which animals a product suits, from the same taxonomy the rest uses. */
export const productSpecies = pgTable(
  'product_species',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => commerceProducts.id, { onDelete: 'cascade' }),
    speciesCode: text('species_code')
      .notNull()
      .references(() => species.code, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('product_species_key').on(t.productId, t.speciesCode)],
);

/**
 * A picture of a product.
 *
 * Private storage served through the public media route only while the product
 * is published, exactly as a content image and a listing photo are (DEC-0160).
 */
export const productMedia = pgTable(
  'product_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => commerceProducts.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => storedFiles.id, { onDelete: 'restrict' }),
    altFa: text('alt_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    addedByAccountId: uuid('added_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('product_media_product_idx').on(t.productId, t.sortOrder)],
);

/**
 * One way a product varies: a weight, a flavour, a colour, a size, a model.
 *
 * `variant_key` is the canonical spelling of the attribute values, so the same
 * combination cannot be added twice under two different orderings of the same
 * pairs.
 */
export const productVariants = pgTable(
  'product_variant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => commerceProducts.id, { onDelete: 'cascade' }),
    attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`),
    variantKey: text('variant_key').notNull(),
    labelFa: text('label_fa').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('product_variant_key').on(t.productId, t.variantKey),
    index('product_variant_product_idx').on(t.productId, t.sortOrder),
  ],
);

/**
 * One seller's terms on one product.
 *
 * The product says what the thing is; this says who is selling it and how.
 * A seller offers a product once — a second offer on the same product would be
 * two prices from one shop with nothing to choose between them.
 */
export const sellerOffers = pgTable(
  'seller_offer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => commerceSellers.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => commerceProducts.id, { onDelete: 'restrict' }),
    condition: offerCondition('condition').notNull().default('NEW'),
    shipsToWholeCountry: boolean('ships_to_whole_country').notNull().default(false),
    shippingNoteFa: text('shipping_note_fa'),
    status: offerStatus2('status').notNull().default('DRAFT'),
    statusReasonFa: text('status_reason_fa'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('seller_offer_key').on(t.sellerId, t.productId),
    index('seller_offer_product_idx').on(t.productId, t.status),
    index('seller_offer_seller_idx').on(t.sellerId, t.status),
  ],
);

/**
 * A price and a quantity, for one variant of one offer.
 *
 * The two stock columns are a reading of the ledger, and the checks are what
 * make them trustworthy: nothing can reserve more than is on hand, and nothing
 * can go negative. Two checkouts racing for the last bag both try the same
 * conditional update, and exactly one of them wins.
 */
export const offerSkus = pgTable(
  'offer_sku',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => sellerOffers.id, { onDelete: 'cascade' }),
    /** Null when the product has no variants at all. */
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'restrict' }),
    /** The seller's own code for this line; unique within their shop. */
    sku: text('sku').notNull(),
    priceToman: bigint('price_toman', { mode: 'bigint' }).notNull(),
    stockOnHand: integer('stock_on_hand').notNull().default(0),
    stockReserved: integer('stock_reserved').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('offer_sku_variant_key').on(t.offerId, t.variantId),
    index('offer_sku_offer_idx').on(t.offerId),
    check('offer_sku_price_positive', sql`${t.priceToman} > 0`),
    check('offer_sku_stock_non_negative', sql`${t.stockOnHand} >= 0 and ${t.stockReserved} >= 0`),
    // The oversell guard, in the database rather than in a comparison in code.
    check('offer_sku_reserved_within_stock', sql`${t.stockReserved} <= ${t.stockOnHand}`),
  ],
);

/**
 * Every movement of stock, kept.
 *
 * Append-only: a correction is another row with its own reason, never an edit
 * of what was written before. "Where did the count go" is answered by reading
 * these in order.
 */
export const inventoryMoves = pgTable(
  'inventory_move',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'restrict' }),
    kind: inventoryMoveKind('kind').notNull(),
    /** Signed: what this movement did to the quantity on hand or reserved. */
    quantity: integer('quantity').notNull(),
    reasonFa: text('reason_fa'),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** What this movement was about: a reservation, an order, a correction. */
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('inventory_move_sku_idx').on(t.offerSkuId, t.createdAt),
    check('inventory_move_quantity_not_zero', sql`${t.quantity} <> 0`),
  ],
);

/**
 * Stock held for somebody who is checking out.
 *
 * It expires by its own date, read when it is used rather than swept by a job,
 * so an abandoned basket cannot hold the last bag of food for ever.
 */
export const stockReservations = pgTable(
  'stock_reservation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerSkuId: uuid('offer_sku_id')
      .notNull()
      .references(() => offerSkus.id, { onDelete: 'restrict' }),
    holderAccountId: uuid('holder_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /** The basket or order this hold belongs to, as the caller names it. */
    holdRef: text('hold_ref').notNull(),
    quantity: integer('quantity').notNull(),
    status: reservationStatus('status').notNull().default('ACTIVE'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('stock_reservation_sku_idx').on(t.offerSkuId, t.status),
    index('stock_reservation_expiry_idx').on(t.status, t.expiresAt),
    // One live hold per basket line, so a repeated click holds one lot, not two.
    uniqueIndex('stock_reservation_hold_key')
      .on(t.offerSkuId, t.holdRef)
      .where(sql`${t.status} = 'ACTIVE'`),
    check('stock_reservation_quantity_positive', sql`${t.quantity} > 0`),
  ],
);
