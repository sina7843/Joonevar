'use client';

import { useActionState } from 'react';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../../../../src/ui/field.tsx';
import { OFFER_CONDITIONS, OFFER_CONDITION_FA, type AttributeDefinition } from '../../../../src/commerce/catalog-model.ts';
import {
  addProductImageAction,
  addSkuAction,
  addVariantAction,
  createOfferAction,
  createProductAction,
  moveOfferAction,
  stockMoveAction,
  submitProductAction,
  type CatalogFormState,
} from './actions.ts';

const EMPTY: CatalogFormState = {};

function Result({ state, testId }: { state: CatalogFormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/**
 * Propose a product.
 *
 * Only the categories this market actually sells are listed: a category the
 * product decisions put outside the phase is not an option a seller can pick
 * and be refused later.
 */
export function NewProductForm({
  sellerId,
  categories,
  speciesOptions,
}: {
  sellerId: string;
  categories: readonly { value: string; label: string }[];
  speciesOptions: readonly { code: string; nameFa: string }[];
}) {
  const [state, submit, pending] = useActionState(createProductAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="new-product-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="new-product-result" />
      <SelectField label="دسته" name="categoryId" required options={categories} data-testid="product-category" />
      <TextField label="نام کالا" name="name" required data-testid="product-name" />
      <TextField label="برند" name="brand" data-testid="product-brand" />
      <TextField
        label="بارکد"
        name="barcode"
        ltr
        inputMode="numeric"
        hint="اختیاری. اگر بارکد کالا را دارید وارد کنید تا کالای تکراری در کاتالوگ ساخته نشود."
        data-testid="product-barcode"
      />
      <TextAreaField label="توضیح کالا" name="description" rows={3} data-testid="product-description" />
      <fieldset className="space-y-2xs">
        <legend className="text-label-sm">مناسب برای</legend>
        {speciesOptions.map((option) => (
          <label key={option.code} className="flex items-center gap-sm text-body-sm">
            <input type="checkbox" name="species" value={option.code} data-testid={'product-species-' + option.code} />
            {option.nameFa}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="create-product">
        {pending ? 'در حال ثبت…' : 'ثبت کالای تازه'}
      </Button>
    </form>
  );
}

/** One variant: the axes come from the category, so nothing else is offered. */
export function VariantForm({
  sellerId,
  productId,
  axes,
}: {
  sellerId: string;
  productId: string;
  axes: readonly AttributeDefinition[];
}) {
  const [state, submit, pending] = useActionState(addVariantAction, EMPTY);
  if (axes.length === 0) return null;
  return (
    <form action={submit} className="space-y-sm" data-testid={'variant-form-' + productId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="productId" value={productId} />
      <Result state={state} testId={'variant-result-' + productId} />
      {axes.map((axis) =>
        axis.options ? (
          <SelectField
            key={axis.key}
            label={axis.labelFa}
            name={'attr:' + axis.key}
            options={axis.options.map((option) => ({ value: option, label: option }))}
            data-testid={'variant-' + axis.key}
          />
        ) : (
          <TextField
            key={axis.key}
            label={axis.labelFa}
            name={'attr:' + axis.key}
            data-testid={'variant-' + axis.key}
          />
        ),
      )}
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'add-variant-' + productId}>
        {pending ? 'در حال ثبت…' : 'افزودن تنوع'}
      </Button>
    </form>
  );
}

export function ProductImageForm({ sellerId, productId }: { sellerId: string; productId: string }) {
  const [state, submit, pending] = useActionState(addProductImageAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'product-image-form-' + productId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="productId" value={productId} />
      <Result state={state} testId={'product-image-result-' + productId} />
      <FileField
        label="تصویر کالا"
        name="image"
        accept="image/jpeg,image/png"
        maxBytes={5 * 1024 * 1024}
        testId={'product-image-file-' + productId}
      />
      <TextField label="متن جایگزین تصویر" name="alt" required data-testid={'product-image-alt-' + productId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'add-product-image-' + productId}>
        {pending ? 'در حال بارگذاری…' : 'افزودن تصویر'}
      </Button>
    </form>
  );
}

export function SubmitProductForm({
  sellerId,
  productId,
  version,
}: {
  sellerId: string;
  productId: string;
  version: number;
}) {
  const [state, submit, pending] = useActionState(submitProductAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'submit-product-form-' + productId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} testId={'submit-product-result-' + productId} />
      <Button type="submit" disabled={pending} data-testid={'submit-product-' + productId}>
        {pending ? 'در حال ارسال…' : 'ارسال کالا برای بررسی'}
      </Button>
    </form>
  );
}

export function NewOfferForm({
  sellerId,
  products,
}: {
  sellerId: string;
  products: readonly { value: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState(createOfferAction, EMPTY);
  if (products.length === 0) return null;
  return (
    <form action={submit} className="space-y-md" data-testid="new-offer-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="new-offer-result" />
      <SelectField label="کالا" name="productId" required options={products} data-testid="offer-product" />
      <SelectField
        label="وضعیت کالا"
        name="condition"
        required
        defaultValue="NEW"
        options={OFFER_CONDITIONS.map((value) => ({ value, label: OFFER_CONDITION_FA[value] }))}
        data-testid="offer-condition"
      />
      <SelectField
        label="ارسال به سراسر کشور"
        name="shipsToWholeCountry"
        required
        defaultValue="NO"
        options={[
          { value: 'YES', label: 'بله' },
          { value: 'NO', label: 'خیر' },
        ]}
        data-testid="offer-shipping"
      />
      <TextField label="توضیح ارسال" name="shippingNote" data-testid="offer-shipping-note" />
      <Button type="submit" disabled={pending} data-testid="create-offer">
        {pending ? 'در حال ثبت…' : 'ثبت عرضه'}
      </Button>
    </form>
  );
}

/** A price and a quantity for one variant of one offer. */
export function SkuForm({
  offerId,
  variants,
}: {
  offerId: string;
  variants: readonly { value: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState(addSkuAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'sku-form-' + offerId}>
      <input type="hidden" name="offerId" value={offerId} />
      <Result state={state} testId={'sku-result-' + offerId} />
      {variants.length > 0 ? (
        <SelectField label="تنوع" name="variantId" required options={variants} data-testid={'sku-variant-' + offerId} />
      ) : null}
      <TextField label="کد کالا" name="sku" required ltr data-testid={'sku-code-' + offerId} />
      <TextField label="قیمت (تومان)" name="price" required ltr inputMode="numeric" data-testid={'sku-price-' + offerId} />
      <TextField label="موجودی اولیه" name="stock" required ltr inputMode="numeric" data-testid={'sku-stock-' + offerId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'add-sku-' + offerId}>
        {pending ? 'در حال ثبت…' : 'افزودن قیمت و موجودی'}
      </Button>
    </form>
  );
}

export function OfferStatusForm({
  offerId,
  version,
  to,
  label,
}: {
  offerId: string;
  version: number;
  to: string;
  label: string;
}) {
  const [state, submit, pending] = useActionState(moveOfferAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'offer-status-' + to.toLowerCase() + '-' + offerId}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="to" value={to} />
      <Result state={state} testId={'offer-status-result-' + offerId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'offer-move-' + to.toLowerCase() + '-' + offerId}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}

/** Receive or correct stock; the reason is written into the ledger. */
export function StockMoveForm({ skuId }: { skuId: string }) {
  const [state, submit, pending] = useActionState(stockMoveAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid={'stock-form-' + skuId}>
      <input type="hidden" name="skuId" value={skuId} />
      <Result state={state} testId={'stock-result-' + skuId} />
      <SelectField
        label="نوع تغییر"
        name="kind"
        required
        defaultValue="RECEIVE"
        options={[
          { value: 'RECEIVE', label: 'ورود کالا' },
          { value: 'ADJUST', label: 'اصلاح شمارش' },
          { value: 'RETURN', label: 'بازگشت از مشتری' },
        ]}
        data-testid={'stock-kind-' + skuId}
      />
      <TextField label="تعداد" name="quantity" required ltr inputMode="numeric" data-testid={'stock-quantity-' + skuId} />
      <TextField label="دلیل" name="reason" required data-testid={'stock-reason-' + skuId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'stock-submit-' + skuId}>
        {pending ? 'در حال ثبت…' : 'ثبت در دفتر موجودی'}
      </Button>
    </form>
  );
}
