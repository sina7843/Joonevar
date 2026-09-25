import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { deliveryDefaults, viewCart } from '../../../../src/commerce/cart.ts';
import { CHANGE_TITLE_FA } from '../../../../src/commerce/order-model.ts';
import { CartLineForm, CheckoutForm, RemoveLineForm } from '../../../../src/commerce/order-forms.tsx';
import { flagEnabled } from '../../../../src/marketplace/flags.ts';
import { checkoutAction, setCartLineAction } from './actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

export function generateMetadata(): Metadata {
  // A basket belongs to one person; there is nothing here for an index.
  return buildMetadata({ title: 'سبد خرید', description: 'سبد خرید شما', path: '/shop/cart', noindex: true }, site());
}

/**
 * The basket — PROMPT-010.
 *
 * Everything is priced now rather than remembered, and grouped by shop,
 * because that is how it will be paid for and delivered: one payment, and
 * then one parcel per shop with its own delivery charge.
 *
 * Whatever has moved since the buyer last looked is stated at the top in
 * plain words, and anything that cannot be bought at all keeps the checkout
 * closed until it is taken out.
 */
/** The method chosen per shop, as the address carries it. */
function chosenFrom(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('method-')) continue;
    const picked = Array.isArray(value) ? value[0] : value;
    if (picked) chosen[key.slice('method-'.length)] = picked;
  }
  return chosen;
}

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/shop/cart');
  if (!guard.ok) throw guard.denied;

  const params = await searchParams;
  const chosenMethods = chosenFrom(params);
  const defaults = await deliveryDefaults(db(), guard.actor.accountId!);
  // Priced for where it is actually going: a province decides which methods
  // can carry it and what they charge (PROMPT-011).
  const provinceFa = typeof params.province === 'string' ? params.province : defaults.provinceFa;
  const [cart, checkoutOpen] = await Promise.all([
    viewCart(db(), guard.actor, { chosenMethods, provinceFa }),
    flagEnabled(db(), 'market.flag.commerce_checkout_enabled'),
  ]);

  const withMethod = (sellerId: string, methodId: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...chosenMethods, [sellerId]: methodId })) {
      next.set('method-' + key, value);
    }
    if (provinceFa) next.set('province', provinceFa);
    return '/shop/cart?' + next.toString();
  };

  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'فروشگاه', path: '/shop' },
    { name: 'سبد خرید', path: '/shop/cart' },
  ];

  return (
    <div className="space-y-lg">
      <Breadcrumbs items={crumbs} origin={site().origin} />
      <h1 className="text-h2">سبد خرید</h1>

      {cart.empty ? (
        <div className="space-y-sm">
          <p className="text-body-sm text-text-secondary" data-testid="cart-empty">
            سبد خرید شما خالی است.
          </p>
          <Link href="/shop" className="text-text-brand text-caption" data-testid="cart-back-to-shop">
            رفتن به فروشگاه
          </Link>
        </div>
      ) : (
        <>
          {cart.changes.length > 0 ? (
            <Alert tone="warning" title="از آخرین باری که این سبد را دیده‌اید، چیزهایی تغییر کرده است">
              <ul className="space-y-2xs" data-testid="cart-changes">
                {cart.changes.map((change, index) => (
                  <li key={index} className="text-body-sm" data-testid={'cart-change-' + change.kind}>
                    <strong>{CHANGE_TITLE_FA[change.kind]}</strong> — {change.labelFa}: {change.detailFa}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {!checkoutOpen ? (
            <Alert tone="info" title="پرداخت سبد فروشگاه در حال حاضر باز نیست">
              <span data-testid="cart-checkout-closed">
                سبد شما نگه داشته می‌شود؛ تا باز شدن این مسیر، ثبت سفارش تازه ممکن نیست.
              </span>
            </Alert>
          ) : null}

          <div className="space-y-lg" data-testid="cart-groups">
            {cart.groups.map((group) => (
              <section
                key={group.sellerId}
                className="space-y-md rounded-lg border border-border-subtle p-lg"
                data-testid={'cart-group-' + group.sellerId}
              >
                <header className="flex flex-wrap items-center justify-between gap-sm">
                  <h2 className="text-label-lg">{group.sellerNameFa}</h2>
                  {group.sellerTrading ? null : (
                    <StatusBadge tone="neutral">فروش غیرفعال</StatusBadge>
                  )}
                </header>

                <ul className="space-y-md">
                  {group.lines.map((line) => (
                    <li
                      key={line.skuId}
                      className="flex flex-wrap items-start gap-md border-t border-border-subtle pt-md first:border-t-0 first:pt-0"
                      data-testid={'cart-line-' + line.skuId}
                    >
                      {line.imageFileId ? (
                        <div className="w-24">
                          <RecordImage fileId={line.imageFileId} altFa={line.productNameFa} variant="thumb" />
                        </div>
                      ) : null}
                      <div className="flex-1 space-y-2xs">
                        <Link
                          href={'/shop/' + line.productSlug}
                          className="text-body-sm text-text-brand"
                          data-testid={'cart-product-' + line.skuId}
                        >
                          {line.productNameFa}
                        </Link>
                        <p className="text-caption text-text-secondary">
                          {[line.brandFa, line.variantLabelFa].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-body-sm" data-testid={'cart-price-' + line.skuId}>
                          {fa(line.unitPriceToman)} تومان × {fa(line.quantity)} ={' '}
                          <strong>{fa(line.lineTotalToman)} تومان</strong>
                        </p>
                        {line.reasonFa ? (
                          <p className="text-caption text-text-danger" data-testid={'cart-line-problem-' + line.skuId}>
                            {line.reasonFa}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-sm">
                        <CartLineForm
                          action={setCartLineAction}
                          skuId={line.skuId}
                          quantity={line.quantity}
                          max={line.available}
                        />
                        <RemoveLineForm action={setCartLineAction} skuId={line.skuId} />
                      </div>
                    </li>
                  ))}
                </ul>

                <fieldset className="space-y-2xs" data-testid={'cart-methods-' + group.sellerId}>
                  <legend className="text-label-sm">روش ارسال</legend>
                  {group.methodOffers.length === 0 ? (
                    <p className="text-caption text-text-danger" data-testid={'cart-no-method-' + group.sellerId}>
                      این فروشگاه هنوز هیچ روش ارسالی اعلام نکرده است.
                    </p>
                  ) : (
                    <ul className="space-y-2xs">
                      {group.methodOffers.map((offer) => (
                        <li key={offer.methodId} className="text-body-sm">
                          {offer.problem === null ? (
                            <Link
                              href={withMethod(group.sellerId, offer.methodId)}
                              className={
                                offer.methodId === group.chosenMethodId ? 'text-text-brand' : 'text-text-secondary'
                              }
                              data-testid={'cart-method-' + offer.methodId}
                            >
                              {offer.methodId === group.chosenMethodId ? '● ' : '○ '}
                              {offer.labelFa} —{' '}
                              {offer.waived ? 'رایگان' : fa(offer.toman!) + ' تومان'} — آماده‌سازی{' '}
                              {fa(offer.preparationDays)} روز
                            </Link>
                          ) : (
                            <span className="text-caption text-text-secondary" data-testid={'cart-method-blocked-' + offer.methodId}>
                              {offer.labelFa} — {offer.problemFa}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </fieldset>

                <dl className="grid gap-2xs text-body-sm" data-testid={'cart-money-' + group.sellerId}>
                  <div className="flex justify-between">
                    <dt>جمع کالاها</dt>
                    <dd>{fa(group.itemsTotalToman)} تومان</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>هزینه ارسال</dt>
                    <dd data-testid={'cart-shipping-' + group.sellerId}>
                      {group.shippingToman === null
                        ? 'اعلام نشده'
                        : group.shippingToman === 0n
                          ? 'رایگان'
                          : fa(group.shippingToman) + ' تومان'}
                    </dd>
                  </div>
                  <div className="flex justify-between text-label-sm">
                    <dt>جمع این فروشگاه</dt>
                    <dd>{fa(group.buyerTotalToman)} تومان</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>

          <section className="space-y-md rounded-lg border border-border-subtle p-lg">
            <h2 className="text-label-lg">تحویل و پرداخت</h2>
            <dl className="grid gap-2xs text-body-sm">
              <div className="flex justify-between">
                <dt>جمع کالاها</dt>
                <dd>{fa(cart.itemsTotalToman)} تومان</dd>
              </div>
              <div className="flex justify-between">
                <dt>جمع هزینه ارسال</dt>
                <dd>{fa(cart.shippingTotalToman)} تومان</dd>
              </div>
            </dl>
            <p className="text-caption text-text-secondary" data-testid="cart-split-note">
              این سبد از {fa(cart.groups.length)} فروشگاه است. پرداخت یک‌بار انجام می‌شود و هر فروشگاه سفارش خودش
              را جداگانه آماده و ارسال می‌کند.
            </p>
            {cart.blocked ? (
              <Alert tone="error" title="تا رفع موارد بالا، ثبت سفارش ممکن نیست">
                <span data-testid="cart-blocked">
                  قلم‌هایی که قابل خرید نیستند را از سبد بردارید یا تعدادشان را کم کنید.
                </span>
              </Alert>
            ) : null}
            <CheckoutForm
              action={checkoutAction}
              totalToman={cart.grandTotalToman}
              defaults={{ ...defaults, provinceFa: provinceFa ?? defaults.provinceFa }}
              blocked={cart.blocked || !checkoutOpen}
              chosenMethods={Object.fromEntries(
                cart.groups
                  .filter((group) => group.chosenMethodId !== null)
                  .map((group) => [group.sellerId, group.chosenMethodId!]),
              )}
            />
          </section>
        </>
      )}
    </div>
  );
}
