'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AppError, validation } from '../../../../src/domain/errors.ts';
import { addProductImage, addVariant, createProduct, submitProduct } from '../../../../src/commerce/catalog.ts';
import { addSku, createOffer, moveOffer, recordStockMove } from '../../../../src/commerce/inventory.ts';
import { addShippingMethod, setSkuWeight } from '../../../../src/commerce/shipping.ts';
import type { CommerceOfferStatus } from '../../../../src/commerce/catalog-model.ts';

export interface CatalogFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

function money(form: FormData, key: string): bigint {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('قیمت را با رقم انگلیسی و بدون جداکننده بنویسید.');
  return BigInt(raw);
}

function count(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^-?[0-9]+$/.test(raw)) throw validation('تعداد را با رقم انگلیسی بنویسید.');
  return Number(raw);
}

const failure = (error: unknown): CatalogFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

export async function createProductAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    await createProduct(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      categoryId: text(form, 'categoryId'),
      nameFa: text(form, 'name'),
      brandFa: text(form, 'brand') || null,
      barcode: text(form, 'barcode') || null,
      descriptionFa: text(form, 'description') || null,
      speciesCodes: form.getAll('species').map(String),
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'کالا به‌عنوان پیش‌نویس ثبت شد؛ تنوع، تصویر و قیمت را اضافه کنید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addVariantAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    // Every axis this category defines arrives as `attr:<key>`, so the form
    // cannot smuggle in an attribute the category never declared.
    const attributes: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (key.startsWith('attr:') && String(value).trim() !== '') {
        attributes[key.slice(5)] = String(value).trim();
      }
    }
    await addVariant(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      productId: text(form, 'productId'),
      attributes,
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'تنوع تازه ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addProductImageAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    const upload = form.get('image');
    if (!(upload instanceof File) || upload.size === 0) throw validation('تصویر کالا را انتخاب کنید.');
    await addProductImage(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      sellerId: text(form, 'sellerId'),
      productId: text(form, 'productId'),
      altFa: text(form, 'alt'),
      bytes: new Uint8Array(await upload.arrayBuffer()),
      originalName: upload.name,
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'تصویر کالا افزوده شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitProductAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    await submitProduct(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      productId: text(form, 'productId'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'کالا برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function createOfferAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    await createOffer(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      productId: text(form, 'productId'),
      condition: text(form, 'condition'),
      shipsToWholeCountry: text(form, 'shipsToWholeCountry') === 'YES',
      shippingNoteFa: text(form, 'shippingNote') || null,
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'عرضه ثبت شد؛ قیمت و موجودی را اضافه کنید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addSkuAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    const variantId = text(form, 'variantId');
    await addSku(db(), guard.actor, {
      offerId: text(form, 'offerId'),
      variantId: variantId === '' ? null : variantId,
      sku: text(form, 'sku'),
      priceToman: money(form, 'price'),
      initialStock: count(form, 'stock'),
      reasonFa: 'ثبت موجودی اولیه',
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'قیمت و موجودی ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function moveOfferAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    await moveOffer(db(), guard.actor, {
      offerId: text(form, 'offerId'),
      to: text(form, 'to') as CommerceOfferStatus,
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'وضعیت عرضه تغییر کرد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Receive stock or correct a count. Every movement carries its reason. */
export async function stockMoveAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    const kind = text(form, 'kind');
    if (kind !== 'RECEIVE' && kind !== 'ADJUST' && kind !== 'RETURN') throw validation('نوع تغییر معتبر نیست.');
    await recordStockMove(db(), guard.actor, {
      skuId: text(form, 'skuId'),
      kind,
      quantity: count(form, 'quantity'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'تغییر موجودی در دفتر ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * One way this shop delivers — PROMPT-011.
 *
 * Until a shop has stated at least one, nothing of its can be checked out,
 * and the basket says so by name rather than billing nothing.
 */
export async function addShippingMethodAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    const pricing = text(form, 'pricing') === 'WEIGHT_BASED' ? 'WEIGHT_BASED' : 'FIXED';
    const coverage = text(form, 'coverage') === 'PROVINCES' ? 'PROVINCES' : 'WHOLE_COUNTRY';
    const kind = text(form, 'kind');
    if (kind !== 'COURIER' && kind !== 'POST' && kind !== 'PICKUP') throw validation('نوع روش ارسال معتبر نیست.');
    const threshold = text(form, 'freeThreshold');
    await addShippingMethod(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      labelFa: text(form, 'label'),
      kind,
      coverageKind: coverage,
      provinceCodes: form.getAll('provinces').map(String),
      pricingKind: pricing,
      baseFeeToman: money(form, 'baseFee'),
      perKgToman: pricing === 'WEIGHT_BASED' ? money(form, 'perKg') : null,
      includedGrams: pricing === 'WEIGHT_BASED' ? count(form, 'includedGrams') : null,
      freeThresholdToman: threshold === '' ? null : money(form, 'freeThreshold'),
      preparationDays: count(form, 'preparationDays'),
      noteFa: text(form, 'note') || null,
    });
    revalidatePath('/account/seller/catalog');
    revalidatePath('/shop/cart');
    return { ok: true, message: 'روش ارسال ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** The weight of one line, which only weight-based delivery needs. */
export async function setSkuWeightAction(
  _previous: CatalogFormState,
  form: FormData,
): Promise<CatalogFormState> {
  try {
    const guard = await guardRoute('/account/seller/catalog');
    if (!guard.ok) throw guard.denied;
    const raw = text(form, 'weightGrams');
    await setSkuWeight(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      skuId: text(form, 'skuId'),
      weightGrams: raw === '' ? null : count(form, 'weightGrams'),
    });
    revalidatePath('/account/seller/catalog');
    return { ok: true, message: 'وزن این قلم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
