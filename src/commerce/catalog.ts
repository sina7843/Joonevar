/**
 * Products, their variants, and the review that publishes them — PROMPT-009.
 *
 * A product is the thing; an offer is a seller's terms on it. This module owns
 * the first half: the shared catalogue, the seller-exclusive products that go
 * through a review before anybody sees them, and the merge that folds a
 * duplicate into a shared base without breaking the address somebody has or the
 * orders that named it.
 *
 * Two refusals here are worth naming. A blocked category is refused with the
 * reason attached, because public pharmaceutical sale being outside this phase
 * is a legal and product decision rather than an operational switch. And a
 * category's own attribute list decides what a product may state, so an unknown
 * specification is refused instead of stored where nothing can compare it.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { species as speciesTable, storedFiles } from '../db/schema/core.ts';
import {
  commerceProducts,
  productCategories,
  productMedia,
  productSpecies,
  productVariants,
} from '../db/schema/catalog.ts';
import { commerceSellers } from '../db/schema/commerce.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { violates } from '../db/constraint.ts';
import fs from 'node:fs/promises';
import { findFile, putPrivateFile, resolveWithinRoot, safeOriginalName } from '../files/storage.ts';
import { slugify } from '../breeds/model.ts';
import { resumeContext } from '../domain/resume-context.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from '../marketplace/model.ts';
import { assertSellerCapability, loadSeller } from './sellers.ts';
import {
  canMoveProduct,
  isBarcodeShape,
  isCategorySellable,
  isProductEditable,
  normaliseBarcode,
  specificationProblems,
  variantKey,
  variantLabel,
  variantProblems,
  variantAxes,
  PHARMACEUTICAL_BLOCK_FA,
  type AttributeDefinition,
  type ProductStatus,
} from './catalog-model.ts';

export type ProductRow = typeof commerceProducts.$inferSelect;
export type CategoryRow = typeof productCategories.$inferSelect;
export type VariantRow = typeof productVariants.$inferSelect;

// ── the taxonomy ───────────────────────────────────────────────────────────

/**
 * The categories of the launch.
 *
 * Every one of them is a kind of thing a pet shop sells, and the last is the
 * prohibition itself: medicine exists in the taxonomy so the refusal can name
 * it and say why, rather than the category quietly not being there.
 */
export const LAUNCH_CATEGORIES: ReadonlyArray<{
  code: string;
  nameFa: string;
  salePolicy: 'ALLOWED' | 'BLOCKED_PHARMACEUTICAL';
  policyNoteFa?: string;
  attributes: readonly AttributeDefinition[];
  sortOrder: number;
}> = [
  {
    code: 'DRY_FOOD',
    nameFa: 'غذای خشک',
    salePolicy: 'ALLOWED',
    sortOrder: 0,
    attributes: [
      { key: 'weight', labelFa: 'وزن', kind: 'VARIANT', required: true },
      { key: 'flavour', labelFa: 'طعم', kind: 'VARIANT' },
      { key: 'lifeStage', labelFa: 'رده سنی', kind: 'SPECIFICATION' },
    ],
  },
  {
    code: 'WET_FOOD',
    nameFa: 'غذای مرطوب',
    salePolicy: 'ALLOWED',
    sortOrder: 1,
    attributes: [
      { key: 'weight', labelFa: 'وزن', kind: 'VARIANT', required: true },
      { key: 'flavour', labelFa: 'طعم', kind: 'VARIANT' },
    ],
  },
  {
    code: 'ACCESSORY',
    nameFa: 'لوازم جانبی',
    salePolicy: 'ALLOWED',
    sortOrder: 2,
    attributes: [
      { key: 'size', labelFa: 'اندازه', kind: 'VARIANT' },
      { key: 'colour', labelFa: 'رنگ', kind: 'VARIANT' },
      { key: 'material', labelFa: 'جنس', kind: 'SPECIFICATION' },
    ],
  },
  {
    code: 'TOY',
    nameFa: 'اسباب‌بازی',
    salePolicy: 'ALLOWED',
    sortOrder: 3,
    attributes: [
      { key: 'size', labelFa: 'اندازه', kind: 'VARIANT' },
      { key: 'colour', labelFa: 'رنگ', kind: 'VARIANT' },
    ],
  },
  {
    code: 'GROOMING',
    nameFa: 'بهداشت و آرایش',
    salePolicy: 'ALLOWED',
    sortOrder: 4,
    attributes: [
      { key: 'volume', labelFa: 'حجم', kind: 'VARIANT' },
      { key: 'model', labelFa: 'مدل', kind: 'VARIANT' },
    ],
  },
  {
    code: 'MEDICINE',
    nameFa: 'دارو',
    salePolicy: 'BLOCKED_PHARMACEUTICAL',
    policyNoteFa: PHARMACEUTICAL_BLOCK_FA,
    sortOrder: 99,
    attributes: [],
  },
];

/** Additive: a category an operator edited is never overwritten here. */
export async function ensureCategories(database: DbClient): Promise<number> {
  let created = 0;
  for (const category of LAUNCH_CATEGORIES) {
    const rows = await database
      .insert(productCategories)
      .values({
        code: category.code,
        nameFa: category.nameFa,
        salePolicy: category.salePolicy,
        policyNoteFa: category.policyNoteFa ?? null,
        attributes: category.attributes,
        sortOrder: category.sortOrder,
      })
      .onConflictDoNothing({ target: productCategories.code })
      .returning({ id: productCategories.id });
    created += rows.length;
  }
  return created;
}

export async function loadCategory(database: DbClient, categoryId: string): Promise<CategoryRow> {
  const [row] = await database
    .select()
    .from(productCategories)
    .where(eq(productCategories.id, categoryId))
    .limit(1);
  if (!row) throw notFound('این دسته پیدا نشد.');
  return row;
}

/** The categories a seller may actually put something in. */
export async function sellableCategories(database: DbClient): Promise<readonly CategoryRow[]> {
  return database
    .select()
    .from(productCategories)
    .where(and(eq(productCategories.salePolicy, 'ALLOWED'), eq(productCategories.enabled, true)))
    .orderBy(asc(productCategories.sortOrder));
}

/** Everything, including the blocked one, for the screen that explains itself. */
export async function allCategories(database: DbClient): Promise<readonly CategoryRow[]> {
  return database.select().from(productCategories).orderBy(asc(productCategories.sortOrder));
}

const attributesOf = (category: CategoryRow): readonly AttributeDefinition[] =>
  (category.attributes ?? []) as readonly AttributeDefinition[];

/**
 * The gate every write through this module passes.
 *
 * The refusal carries the category's own note, so somebody trying to list a
 * medicine is told why it is not possible and that it is not a setting anybody
 * can change for them.
 */
function assertSellable(category: CategoryRow): void {
  if (!isCategorySellable(category.salePolicy as 'ALLOWED' | 'BLOCKED_PHARMACEUTICAL', category.enabled)) {
    throw conflict(category.policyNoteFa ?? 'ثبت کالا در این دسته ممکن نیست.');
  }
}

// ── products ───────────────────────────────────────────────────────────────

export interface ProductInput {
  readonly sellerId: string;
  readonly categoryId: string;
  readonly nameFa: string;
  readonly brandFa?: string | null;
  readonly barcode?: string | null;
  readonly descriptionFa?: string | null;
  readonly specifications?: Record<string, unknown>;
  readonly speciesCodes: readonly string[];
}

/**
 * Propose a product.
 *
 * A seller's own product starts as a draft and is reviewed before anybody sees
 * it. The slug is derived from the name and made unique, so the address is
 * stable from the moment it exists.
 */
export async function createProduct(
  database: Database,
  actor: Actor,
  input: ProductInput,
): Promise<ProductRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const seller = await loadSeller(database, input.sellerId);
  if (seller.status !== 'ACTIVE') throw conflict('تا فعال‌شدن فروشگاه، ثبت کالا باز نمی‌شود.');

  const category = await loadCategory(database, input.categoryId);
  assertSellable(category);

  const nameFa = input.nameFa.trim();
  if (nameFa.length < 3) throw validation('نام کالا را کامل‌تر بنویسید.');

  const specifications = input.specifications ?? {};
  const problems = specificationProblems(attributesOf(category), specifications);
  if (problems.length > 0) throw validation(problems[0]!);

  const barcode = input.barcode?.trim() ? normaliseBarcode(input.barcode) : null;
  if (barcode !== null && !isBarcodeShape(barcode)) {
    throw validation('بارکد باید بین ۸ تا ۱۴ رقم باشد.');
  }

  if (input.speciesCodes.length === 0) throw validation('دست‌کم یک گونه حیوان را انتخاب کنید.');
  const known = await database
    .select({ code: speciesTable.code })
    .from(speciesTable)
    .where(inArray(speciesTable.code, [...input.speciesCodes]));
  if (known.length !== input.speciesCodes.length) throw validation('گونه انتخاب‌شده معتبر نیست.');

  const slug = await uniqueSlug(database, nameFa);

  return database.transaction(async (tx) => {
    let product: ProductRow;
    try {
      const [row] = await tx
        .insert(commerceProducts)
        .values({
          kind: 'SELLER_EXCLUSIVE',
          ownerSellerId: seller.id,
          categoryId: category.id,
          nameFa,
          brandFa: input.brandFa?.trim() || null,
          slug,
          barcode,
          descriptionFa: input.descriptionFa?.trim() || null,
          specifications,
          status: 'DRAFT',
          createdByAccountId: actor.accountId,
        })
        .returning();
      product = row!;
    } catch (error) {
      if (violates(error, 'commerce_product_barcode_key')) {
        throw conflict('کالایی با همین بارکد از قبل در کاتالوگ هست؛ به‌جای ثبت دوباره، روی همان کالا آگهی فروش بگذارید.');
      }
      throw error;
    }

    for (const code of input.speciesCodes) {
      await tx.insert(productSpecies).values({ productId: product.id, speciesCode: code });
    }

    await recordAudit(tx, actor, {
      action: 'COMMERCE_PRODUCT_CREATED',
      targetType: 'COMMERCE_PRODUCT',
      targetId: product.id,
      after: { sellerId: seller.id, categoryCode: category.code, nameFa, barcode },
    });
    return product;
  });
}

async function uniqueSlug(database: DbClient, nameFa: string): Promise<string> {
  const base = slugify(nameFa) || 'product';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : base + '-' + (attempt + 1);
    const [taken] = await database
      .select({ id: commerceProducts.id })
      .from(commerceProducts)
      .where(eq(commerceProducts.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return base + '-' + Date.now().toString(36);
}

export async function loadProduct(database: DbClient, productId: string): Promise<ProductRow> {
  const [row] = await database
    .select()
    .from(commerceProducts)
    .where(eq(commerceProducts.id, productId))
    .limit(1);
  if (!row) throw notFound('این کالا پیدا نشد.');
  return row;
}

/** Edit a draft. A published product is corrected through the review path. */
export async function saveProduct(
  database: Database,
  actor: Actor,
  input: ProductInput & { productId: string; expectedVersion: number },
): Promise<ProductRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const product = await loadProduct(database, input.productId);
  if (product.ownerSellerId !== input.sellerId) throw notFound('این کالا پیدا نشد.');
  if (!isProductEditable(product.status as ProductStatus)) {
    throw conflict('این کالا در وضعیت فعلی قابل ویرایش نیست.');
  }

  const category = await loadCategory(database, input.categoryId);
  assertSellable(category);
  const specifications = input.specifications ?? {};
  const problems = specificationProblems(attributesOf(category), specifications);
  if (problems.length > 0) throw validation(problems[0]!);

  const barcode = input.barcode?.trim() ? normaliseBarcode(input.barcode) : null;
  if (barcode !== null && !isBarcodeShape(barcode)) throw validation('بارکد باید بین ۸ تا ۱۴ رقم باشد.');

  const now = new Date();
  try {
    const [updated] = await database
      .update(commerceProducts)
      .set({
        categoryId: category.id,
        nameFa: input.nameFa.trim(),
        brandFa: input.brandFa?.trim() || null,
        barcode,
        descriptionFa: input.descriptionFa?.trim() || null,
        specifications,
        version: product.version + 1,
        updatedAt: now,
      })
      .where(and(eq(commerceProducts.id, product.id), eq(commerceProducts.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این کالا در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(database, actor, {
      action: 'COMMERCE_PRODUCT_SAVED',
      targetType: 'COMMERCE_PRODUCT',
      targetId: product.id,
      targetVersion: updated.version,
      after: { nameFa: updated.nameFa, barcode: updated.barcode, categoryId: category.id },
    });
    return updated;
  } catch (error) {
    if (violates(error, 'commerce_product_barcode_key')) {
      throw conflict('کالایی با همین بارکد از قبل در کاتالوگ هست.');
    }
    throw error;
  }
}

/** Attach a picture. Private until the product is published, like every other. */
export async function addProductImage(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: { sellerId: string; productId: string; altFa: string; bytes: Uint8Array; originalName: string | null },
): Promise<void> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const product = await loadProduct(database, input.productId);
  if (product.ownerSellerId !== input.sellerId) throw notFound('این کالا پیدا نشد.');
  const altFa = input.altFa.trim();
  if (altFa === '') throw validation('متن جایگزین تصویر را بنویسید؛ برای کسی که تصویر را نمی‌بیند لازم است.');

  await database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'PRODUCT_IMAGE',
      bytes: input.bytes,
      originalName: safeOriginalName(input.originalName),
    });
    const [last] = await tx
      .select({ sortOrder: productMedia.sortOrder })
      .from(productMedia)
      .where(eq(productMedia.productId, product.id))
      .orderBy(desc(productMedia.sortOrder))
      .limit(1);

    await tx.insert(productMedia).values({
      productId: product.id,
      fileId: stored.id,
      altFa,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      addedByAccountId: actor.accountId,
    });
    await recordAudit(tx, actor, {
      action: 'COMMERCE_PRODUCT_IMAGE_ADDED',
      targetType: 'COMMERCE_PRODUCT',
      targetId: product.id,
      after: { mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
  });
}

/** Add one variant of a product: a weight, a colour, a model. */
export async function addVariant(
  database: Database,
  actor: Actor,
  input: { sellerId: string; productId: string; attributes: Record<string, string> },
): Promise<VariantRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const product = await loadProduct(database, input.productId);
  if (product.ownerSellerId !== input.sellerId) throw notFound('این کالا پیدا نشد.');

  const category = await loadCategory(database, product.categoryId);
  const axes = variantAxes(attributesOf(category));
  const problems = variantProblems(axes, input.attributes);
  if (problems.length > 0) throw validation(problems[0]!);

  const key = variantKey(input.attributes);
  try {
    const [variant] = await database
      .insert(productVariants)
      .values({
        productId: product.id,
        attributes: input.attributes,
        variantKey: key,
        labelFa: variantLabel(axes, input.attributes),
      })
      .returning();
    await recordAudit(database, actor, {
      action: 'COMMERCE_PRODUCT_VARIANT_ADDED',
      targetType: 'COMMERCE_PRODUCT',
      targetId: product.id,
      after: { variantId: variant!.id, attributes: input.attributes },
    });
    return variant!;
  } catch (error) {
    if (violates(error, 'product_variant_key')) {
      throw conflict('این ترکیب ویژگی‌ها از قبل برای همین کالا ثبت شده است.');
    }
    throw error;
  }
}

export async function variantsOf(database: DbClient, productId: string): Promise<readonly VariantRow[]> {
  return database
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.labelFa));
}

/** Send a seller's product for review. */
export async function submitProduct(
  database: Database,
  actor: Actor,
  input: { sellerId: string; productId: string; expectedVersion: number },
): Promise<ProductRow> {
  await assertSellerCapability(database, actor, input.sellerId, 'STORE_OPERATE');
  const product = await loadProduct(database, input.productId);
  if (product.ownerSellerId !== input.sellerId) throw notFound('این کالا پیدا نشد.');
  if (!canMoveProduct(product.status as ProductStatus, 'PENDING_REVIEW', 'SELLER')) {
    throw conflict('این کالا در وضعیتی نیست که برای بررسی ارسال شود.');
  }

  const images = await database
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(eq(productMedia.productId, product.id))
    .limit(1);
  if (images.length === 0) throw validation('دست‌کم یک تصویر کالا لازم است.');

  const now = new Date();
  const [updated] = await database
    .update(commerceProducts)
    .set({ status: 'PENDING_REVIEW', statusReasonFa: null, version: product.version + 1, updatedAt: now })
    .where(and(eq(commerceProducts.id, product.id), eq(commerceProducts.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این کالا در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_PRODUCT_SUBMITTED',
    targetType: 'COMMERCE_PRODUCT',
    targetId: product.id,
    before: { status: product.status },
    after: { status: 'PENDING_REVIEW' },
  });
  return updated;
}

// ── review and merge ───────────────────────────────────────────────────────

export interface ProductDecisionInput {
  readonly productId: string;
  readonly to: 'PUBLISHED' | 'REJECTED' | 'DRAFT';
  readonly reasonFa?: string | null;
  readonly expectedVersion: number;
}

export async function decideProduct(
  database: Database,
  actor: Actor,
  input: ProductDecisionInput,
): Promise<ProductRow> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  const product = await loadProduct(database, input.productId);
  if (!canMoveProduct(product.status as ProductStatus, input.to, 'REVIEWER')) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }
  const reasonFa = input.reasonFa?.trim() || null;
  if ((input.to === 'REJECTED' || input.to === 'DRAFT') && reasonFa === null) {
    throw validation('دلیل این تصمیم را بنویسید؛ فروشنده باید بداند چه چیزی را اصلاح کند.');
  }

  const now = new Date();
  const [updated] = await database
    .update(commerceProducts)
    .set({
      status: input.to,
      statusReasonFa: reasonFa,
      reviewedByAccountId: actor.accountId,
      reviewedAt: now,
      publishedAt: input.to === 'PUBLISHED' ? now : product.publishedAt,
      version: product.version + 1,
      updatedAt: now,
    })
    .where(and(eq(commerceProducts.id, product.id), eq(commerceProducts.version, input.expectedVersion)))
    .returning();
  if (!updated) throw conflict('این کالا در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

  await recordAudit(database, actor, {
    action: 'COMMERCE_PRODUCT_REVIEWED',
    targetType: 'COMMERCE_PRODUCT',
    targetId: product.id,
    targetVersion: updated.version,
    before: { status: product.status },
    after: { status: input.to },
    reason: reasonFa,
  });
  if (product.ownerSellerId) {
    const [seller] = await database
      .select({ ownerAccountId: commerceSellers.ownerAccountId })
      .from(commerceSellers)
      .where(eq(commerceSellers.id, product.ownerSellerId))
      .limit(1);
    if (seller) {
      await createNotification(database, {
        recipientAccountId: seller.ownerAccountId,
        kind: 'COMMERCE_PRODUCT_REVIEWED',
        titleFa: 'نتیجه بررسی کالای شما',
        bodyFa: reasonFa ?? 'کالای شما منتشر شد.',
        resume: resumeContext({
          entity: { type: 'COMMERCE_PRODUCT', id: product.id },
          step: 'PRODUCT_REVIEW',
          originRoute: '/account/seller/catalog',
        }),
      });
    }
  }
  return updated;
}

/**
 * Fold a duplicate into a shared base.
 *
 * The duplicate keeps its row, its address and everything that referenced it;
 * it simply points at the product it became part of, and reads follow that
 * pointer. Offers on the duplicate move to the base in the same transaction, so
 * a seller's stock and price are not stranded on a row nobody shows.
 */
export async function mergeProduct(
  database: Database,
  actor: Actor,
  input: { productId: string; intoProductId: string; reasonFa: string; expectedVersion: number },
): Promise<ProductRow> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل ادغام را بنویسید؛ در تاریخچه هر دو کالا می‌ماند.');
  if (input.productId === input.intoProductId) throw validation('یک کالا در خودش ادغام نمی‌شود.');

  const product = await loadProduct(database, input.productId);
  const base = await loadProduct(database, input.intoProductId);
  if (base.status !== 'PUBLISHED') throw conflict('کالای مقصد باید منتشرشده باشد.');
  if (base.mergedIntoProductId !== null) throw conflict('کالای مقصد خودش ادغام شده است.');
  if (!canMoveProduct(product.status as ProductStatus, 'MERGED', 'REVIEWER')) {
    throw conflict('این کالا در وضعیتی نیست که ادغام شود.');
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(commerceProducts)
      .set({
        status: 'MERGED',
        mergedIntoProductId: base.id,
        statusReasonFa: reasonFa,
        reviewedByAccountId: actor.accountId,
        reviewedAt: now,
        version: product.version + 1,
        updatedAt: now,
      })
      .where(and(eq(commerceProducts.id, product.id), eq(commerceProducts.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این کالا در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    // The offers follow the product, so nobody's stock is left on a row that is
    // no longer shown. A seller who already offered the base keeps that one.
    const moved = await tx.execute(sql`
      update seller_offer o
         set product_id = ${base.id}, updated_at = ${now}
       where o.product_id = ${product.id}
         and not exists (
           select 1 from seller_offer other
            where other.seller_id = o.seller_id and other.product_id = ${base.id}
         )
    `);

    await recordAudit(tx, actor, {
      action: 'COMMERCE_PRODUCT_MERGED',
      targetType: 'COMMERCE_PRODUCT',
      targetId: product.id,
      targetVersion: updated.version,
      before: { status: product.status },
      after: { mergedIntoProductId: base.id, movedOffers: moved.rowCount ?? 0 },
      reason: reasonFa,
    });
    return updated;
  });
}

/**
 * Where a product address really points.
 *
 * A merged product resolves to the base it became part of, following the chain
 * a bounded number of times so a cycle somebody managed to create cannot spin.
 */
export async function resolveProduct(database: DbClient, productId: string): Promise<ProductRow> {
  let current = await loadProduct(database, productId);
  for (let depth = 0; depth < 5 && current.mergedIntoProductId !== null; depth += 1) {
    current = await loadProduct(database, current.mergedIntoProductId);
  }
  return current;
}

// ── reads ──────────────────────────────────────────────────────────────────

export interface ProductQueueEntry {
  readonly id: string;
  readonly nameFa: string;
  readonly brandFa: string | null;
  readonly sellerNameFa: string | null;
  readonly categoryNameFa: string;
  readonly status: string;
  readonly barcode: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

/** Products waiting on a reviewer, oldest first. */
export async function productReviewQueue(
  database: DbClient,
  actor: Actor,
): Promise<readonly ProductQueueEntry[]> {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  return database
    .select({
      id: commerceProducts.id,
      nameFa: commerceProducts.nameFa,
      brandFa: commerceProducts.brandFa,
      sellerNameFa: commerceSellers.displayNameFa,
      categoryNameFa: productCategories.nameFa,
      status: commerceProducts.status,
      barcode: commerceProducts.barcode,
      version: commerceProducts.version,
      createdAt: commerceProducts.createdAt,
    })
    .from(commerceProducts)
    .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
    .leftJoin(commerceSellers, eq(commerceSellers.id, commerceProducts.ownerSellerId))
    .where(eq(commerceProducts.status, 'PENDING_REVIEW'))
    .orderBy(asc(commerceProducts.createdAt));
}

/** Published shared products, for the merge target picker. */
export async function mergeTargets(database: DbClient, actor: Actor) {
  assertMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW');
  return database
    .select({ id: commerceProducts.id, nameFa: commerceProducts.nameFa, barcode: commerceProducts.barcode })
    .from(commerceProducts)
    .where(and(eq(commerceProducts.status, 'PUBLISHED'), isNull(commerceProducts.mergedIntoProductId)))
    .orderBy(asc(commerceProducts.nameFa))
    .limit(200);
}

export interface ProductDetail {
  readonly product: ProductRow;
  readonly category: CategoryRow;
  readonly variants: readonly VariantRow[];
  readonly speciesCodes: readonly string[];
  readonly media: readonly { id: string; fileId: string; altFa: string }[];
}

export async function productDetail(database: DbClient, productId: string): Promise<ProductDetail> {
  const product = await loadProduct(database, productId);
  const category = await loadCategory(database, product.categoryId);
  const variants = await variantsOf(database, product.id);
  const speciesRows = await database
    .select({ code: productSpecies.speciesCode })
    .from(productSpecies)
    .where(eq(productSpecies.productId, product.id));
  const media = await database
    .select({ id: productMedia.id, fileId: productMedia.fileId, altFa: productMedia.altFa })
    .from(productMedia)
    .where(eq(productMedia.productId, product.id))
    .orderBy(asc(productMedia.sortOrder));

  return { product, category, variants, speciesCodes: speciesRows.map((row) => row.code), media };
}

/** This store's own products. */
export async function sellerProducts(database: DbClient, actor: Actor, sellerId: string) {
  await assertSellerCapability(database, actor, sellerId, 'STORE_VIEW');
  return database
    .select({
      id: commerceProducts.id,
      nameFa: commerceProducts.nameFa,
      status: commerceProducts.status,
      categoryNameFa: productCategories.nameFa,
      version: commerceProducts.version,
      createdAt: commerceProducts.createdAt,
    })
    .from(commerceProducts)
    .innerJoin(productCategories, eq(productCategories.id, commerceProducts.categoryId))
    .where(eq(commerceProducts.ownerSellerId, sellerId))
    .orderBy(desc(commerceProducts.createdAt));
}

/**
 * Serve a product picture to the public.
 *
 * Only while its product is published — or while it is a merged row whose base
 * is, so an address somebody saved keeps showing the same picture. Every other
 * id answers the same nothing, so a visitor cannot tell an unpublished product
 * from one that never existed (DEC-0160).
 */
export async function publicProductImage(
  database: DbClient,
  storageRoot: string,
  fileId: string,
): Promise<{ mime: string; bytes: Buffer; sha256: string } | null> {
  if (!UUID_SHAPE.test(fileId)) return null;
  const [file] = await database
    .select({ purpose: storedFiles.purpose })
    .from(storedFiles)
    .where(eq(storedFiles.id, fileId))
    .limit(1);
  if (!file || file.purpose !== 'PRODUCT_IMAGE') return null;
  if (!(await productImageIsPublic(database, fileId))) return null;

  const record = await findFile(database, fileId);
  const bytes = await fs.readFile(resolveWithinRoot(storageRoot, record.storageKey));
  return { mime: record.mime, bytes, sha256: record.sha256 };
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a product picture may be served to the public right now. */
export async function productImageIsPublic(database: DbClient, fileId: string): Promise<boolean> {
  const rows = await database
    .select({ status: commerceProducts.status, mergedInto: commerceProducts.mergedIntoProductId })
    .from(productMedia)
    .innerJoin(commerceProducts, eq(commerceProducts.id, productMedia.productId))
    .where(eq(productMedia.fileId, fileId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  return row.status === 'PUBLISHED' || row.mergedInto !== null;
}

/** Whether this actor may read a product picture through the private route. */
export async function mayReadProductImage(
  database: DbClient,
  actor: Actor,
  fileId: string,
): Promise<boolean> {
  if (hasMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW')) return true;
  const rows = await database
    .select({ ownerSellerId: commerceProducts.ownerSellerId })
    .from(productMedia)
    .innerJoin(commerceProducts, eq(commerceProducts.id, productMedia.productId))
    .where(eq(productMedia.fileId, fileId))
    .limit(1);
  const owner = rows[0]?.ownerSellerId;
  if (!owner) return false;
  try {
    await assertSellerCapability(database, actor, owner, 'STORE_VIEW');
    return true;
  } catch {
    return false;
  }
}
