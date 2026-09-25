import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { species as speciesTable } from '../../../../src/db/schema/core.ts';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { readMoney } from '../../../../src/settings/service.ts';
import { ShippingMethodForm, SkuWeightForm } from '../../../../src/commerce/order-forms.tsx';
import { shippingMethodsOf, MAX_SHIPPING_FEE_KEY } from '../../../../src/commerce/shipping.ts';
import {
  SHIPPING_METHOD_KIND_FA,
  type ShippingMethodKind,
} from '../../../../src/commerce/fulfilment-model.ts';
import { provinces as provinceTable } from '../../../../src/db/schema/geography.ts';
import { currentSubscription } from '../../../../src/commerce/plans.ts';
import {
  allCategories,
  loadCategory,
  productDetail,
  sellableCategories,
  sellerProducts,
  variantsOf,
} from '../../../../src/commerce/catalog.ts';
import { offersOfSeller, sellerCatalogue } from '../../../../src/commerce/inventory.ts';
import {
  variantAxes,
  OFFER_STATUS_FA,
  PRODUCT_STATUS_FA,
  type AttributeDefinition,
  type CommerceOfferStatus,
  type ProductStatus,
} from '../../../../src/commerce/catalog-model.ts';
import {
  NewOfferForm,
  NewProductForm,
  OfferStatusForm,
  ProductImageForm,
  SkuForm,
  StockMoveForm,
  SubmitProductForm,
  VariantForm,
} from './forms.tsx';
import { addShippingMethodAction, setSkuWeightAction } from './actions.ts';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint) => value.toLocaleString('fa-IR');

/**
 * A shop's own catalogue — PROMPT-009.
 *
 * Products it proposed, the offers it has put on them, and the stock behind
 * each line. Everything here is scoped to this one store: the page reads the
 * account's membership and shows that store's rows and no others.
 */
export default async function SellerCatalogPage() {
  const guard = await guardRoute('/account/seller/catalog');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const stores = await myStores(db(), actor);
  if (stores.length === 0) {
    return (
      <PublicShell actor={actor} title="کاتالوگ فروشگاه" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <Alert tone="info" title="هنوز فروشگاهی ندارید">
            <span data-testid="catalog-no-store">
              برای ثبت کالا ابتدا پرونده فروشندگی را از صفحه «فروشگاه من» کامل کنید.
            </span>
          </Alert>
        </div>
      </PublicShell>
    );
  }

  const store = stores[0]!;
  const maxShippingFee = await readMoney(db(), MAX_SHIPPING_FEE_KEY);
  const methods = await shippingMethodsOf(db(), store.id);
  const provinceOptions = await db()
    .select({ code: provinceTable.code, nameFa: provinceTable.nameFa })
    .from(provinceTable)
    .orderBy(provinceTable.nameFa);
  const [categories, everyCategory, products, offers, lines, subscription, speciesRows] = await Promise.all([
    sellableCategories(db()),
    allCategories(db()),
    sellerProducts(db(), actor, store.id),
    offersOfSeller(db(), actor, store.id),
    sellerCatalogue(db(), actor, store.id),
    currentSubscription(db(), store.id),
    db().select({ code: speciesTable.code, nameFa: speciesTable.nameFa }).from(speciesTable),
  ]);

  const blocked = everyCategory.filter((category) => category.salePolicy !== 'ALLOWED');
  const draftProducts = products.filter((product) => product.status === 'DRAFT' || product.status === 'REJECTED');
  const publishable = products.filter((product) => product.status === 'PUBLISHED');

  // The axes of each draft product's category, so the variant form offers
  // exactly what that category defines and nothing else.
  const axesByProduct = new Map<string, readonly AttributeDefinition[]>();
  const variantsByProduct = new Map<string, readonly { value: string; label: string }[]>();
  for (const product of products) {
    const detail = await productDetail(db(), product.id);
    axesByProduct.set(product.id, variantAxes((detail.category.attributes ?? []) as AttributeDefinition[]));
    variantsByProduct.set(
      product.id,
      (await variantsOf(db(), product.id)).map((variant) => ({ value: variant.id, label: variant.labelFa })),
    );
  }

  return (
    <PublicShell actor={actor} title="کاتالوگ فروشگاه" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href="/account/seller" className="text-text-brand" data-testid="back-to-store">
            بازگشت به فروشگاه من
          </Link>
        </p>

        {store.status !== 'ACTIVE' ? (
          <Alert tone="warning" title="تا فعال‌شدن فروشگاه، ثبت کالا باز نمی‌شود">
            <span data-testid="catalog-store-inactive">
              وضعیت فعلی فروشگاه: {store.status}. دوره پلن فروشندگی باید آغاز شده باشد.
            </span>
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">روش‌های ارسال</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="shipping-methods-note">
            {methods.length === 0
              ? 'تا ثبت حداقل یک روش ارسال، کالاهای شما در سبد خرید قابل پرداخت نیستند.'
              : 'روش‌های فعال: ' + methods.map((method) => method.labelFa).join('، ')}
          </p>
          {methods.length > 0 ? (
            <ul className="mt-md space-y-2xs text-body-sm" data-testid="method-list">
              {methods.map((method) => (
                <li key={method.id} data-testid={'shipping-method-' + method.id}>
                  {method.labelFa} — {SHIPPING_METHOD_KIND_FA[method.kind as ShippingMethodKind]} —{' '}
                  {method.pricingKind === 'FIXED'
                    ? method.baseFeeToman === 0n
                      ? 'رایگان'
                      : method.baseFeeToman.toLocaleString('fa-IR') + ' تومان'
                    : 'وزنی، از ' + method.baseFeeToman.toLocaleString('fa-IR') + ' تومان'}{' '}
                  — آماده‌سازی {method.preparationDays.toLocaleString('fa-IR')} روز
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-lg">
            <ShippingMethodForm
              action={addShippingMethodAction}
              sellerId={store.id}
              provinces={provinceOptions}
              maxFeeFa={maxShippingFee.configured ? maxShippingFee.toman.toLocaleString('fa-IR') : null}
            />
          </div>
        </Card>

        {blocked.length > 0 ? (
          <Alert tone="info" title="دسته‌هایی که در این فاز فروش عمومی ندارند">
            <span data-testid="blocked-categories">
              {blocked.map((category) => category.nameFa).join('، ')} — {blocked[0]!.policyNoteFa}
            </span>
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">کالای تازه</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="plan-limit-note">
            {subscription.productLimit === null
              ? 'پلن فعلی شما سقف تعداد کالا ندارد.'
              : 'سقف کالای پلن فعلی: ' + subscription.productLimit.toLocaleString('fa-IR') + ' قلم.'}
          </p>
          <div className="mt-lg">
            <NewProductForm
              sellerId={store.id}
              categories={categories.map((category) => ({ value: category.id, label: category.nameFa }))}
              speciesOptions={speciesRows}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">کالاهای من</h2>
          {products.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="products-empty">
              هنوز کالایی ثبت نکرده‌اید.
            </p>
          ) : (
            <ul className="mt-lg space-y-lg" data-testid="seller-products">
              {products.map((product) => (
                <li key={product.id} className="space-y-md border-b border-border-subtle pb-lg last:border-0">
                  <div className="flex flex-wrap items-center gap-sm">
                    <StatusBadge tone={product.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      <span data-testid={'product-status-' + product.id}>
                        {PRODUCT_STATUS_FA[product.status as ProductStatus] ?? product.status}
                      </span>
                    </StatusBadge>
                    <span className="text-label-lg">{product.nameFa}</span>
                    <span className="text-caption text-text-secondary">{product.categoryNameFa}</span>
                  </div>
                  {draftProducts.some((row) => row.id === product.id) ? (
                    <div className="space-y-lg">
                      <VariantForm
                        sellerId={store.id}
                        productId={product.id}
                        axes={axesByProduct.get(product.id) ?? []}
                      />
                      <ProductImageForm sellerId={store.id} productId={product.id} />
                      <SubmitProductForm sellerId={store.id} productId={product.id} version={product.version} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">عرضه‌های من</h2>
          <div className="mt-lg">
            <NewOfferForm
              sellerId={store.id}
              products={publishable.map((product) => ({ value: product.id, label: product.nameFa }))}
            />
          </div>
          {offers.length > 0 ? (
            <ul className="mt-lg space-y-lg" data-testid="seller-offers">
              {offers.map((offer) => (
                <li key={offer.id} className="space-y-md border-b border-border-subtle pb-lg last:border-0">
                  <div className="flex flex-wrap items-center gap-sm">
                    <StatusBadge tone={offer.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      <span data-testid={'offer-status-' + offer.id}>
                        {OFFER_STATUS_FA[offer.status as CommerceOfferStatus] ?? offer.status}
                      </span>
                    </StatusBadge>
                    <span className="text-body-sm">{offer.productNameFa}</span>
                  </div>
                  <SkuForm offerId={offer.id} variants={variantsByProduct.get(offer.productId) ?? []} />
                  <div className="flex flex-wrap gap-sm">
                    {offer.status !== 'ACTIVE' ? (
                      <OfferStatusForm offerId={offer.id} version={offer.version} to="ACTIVE" label="شروع فروش" />
                    ) : (
                      <OfferStatusForm offerId={offer.id} version={offer.version} to="PAUSED" label="توقف موقت" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-label-lg">قیمت و موجودی</h2>
          {lines.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="skus-empty">
              هنوز قیمتی ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-lg space-y-lg" data-testid="seller-skus">
              {lines.map((line) => (
                <li key={line.id} className="space-y-md border-b border-border-subtle pb-lg last:border-0">
                  <p className="flex flex-wrap items-center gap-sm text-body-sm">
                    <bdi className="hz-ltr font-mono">{line.sku}</bdi>
                    <span>{line.productNameFa}</span>
                    {line.variantLabelFa ? (
                      <span className="text-caption text-text-secondary">{line.variantLabelFa}</span>
                    ) : null}
                    <span data-testid={'sku-price-value-' + line.id}>{moneyFa(line.priceToman)} تومان</span>
                    <span className="text-caption text-text-secondary" data-testid={'sku-stock-value-' + line.id}>
                      موجود: {line.available.toLocaleString('fa-IR')} از {line.stockOnHand.toLocaleString('fa-IR')}
                      {line.stockReserved > 0 ? ' — رزرو: ' + line.stockReserved.toLocaleString('fa-IR') : ''}
                    </span>
                  </p>
                  <StockMoveForm skuId={line.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
