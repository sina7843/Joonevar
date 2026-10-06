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
import { BasketDiscountForm } from '../../../../src/commerce/trust-forms.tsx';
import { applyBasketDiscountAction } from './actions.ts';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

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
  const code = typeof params.code === 'string' ? params.code : '';
  const redeemPoints = typeof params.points === 'string' ? Number(params.points) || 0 : 0;
  const [cart, checkoutOpen] = await Promise.all([
    viewCart(db(), guard.actor, { chosenMethods, provinceFa, code, redeemPoints }),
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

  const itemCount = cart.groups.reduce((sum, group) => sum + group.lines.reduce((n, line) => n + line.quantity, 0), 0);

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={crumbs} origin={site().origin} />
        <PageHeader
          title="سبد خرید"
          meta={cart.empty ? [] : [fa(itemCount) + ' کالا', fa(cart.groups.length) + ' فروشگاه']}
        />
      </div>

      {cart.empty ? (
        <div data-testid="cart-empty">
        <EmptyState
          icon="shoppingCart"
          title="سبد خرید شما خالی است."
          description="کالاهای فروشگاه‌ها را از صفحه هر محصول به سبد اضافه کنید."
          action={
            <ButtonLink tone="secondary" href="/shop" data-testid="cart-back-to-shop">
              رفتن به فروشگاه
            </ButtonLink>
          }
        />
        </div>
      ) : (
        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0 space-y-lg">
            {cart.changes.length > 0 ? (
              <Alert tone="warning" title="از آخرین باری که این سبد را دیده‌اید، چیزهایی تغییر کرده است">
                <ul className="space-y-2xs" data-testid="cart-changes">
                  {cart.changes.map((change, index) => (
                    <li key={index} className="hz-body-sm" data-testid={'cart-change-' + change.kind}>
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
                  className="hz-card space-y-md"
                  aria-labelledby={'cart-group-title-' + group.sellerId}
                  data-testid={'cart-group-' + group.sellerId}
                >
                  <header className="flex flex-wrap items-center justify-between gap-sm">
                    <SectionHeader id={'cart-group-title-' + group.sellerId} title={group.sellerNameFa} size="sm" />
                    {group.sellerTrading ? null : <StatusBadge tone="neutral">فروش غیرفعال</StatusBadge>}
                  </header>

                  <ul className="hz-cart-list">
                    {group.lines.map((line) => (
                      <li
                        key={line.skuId}
                        className={line.reasonFa ? 'hz-cart-row hz-cart-row--stacked hz-cart-row--unavailable' : 'hz-cart-row hz-cart-row--stacked'}
                        data-testid={'cart-line-' + line.skuId}
                      >
                        <RecordImage fileId={line.imageFileId} altFa={line.productNameFa} variant="thumb-lg" />
                        <div className="hz-cart-row__body">
                          <Link href={'/shop/' + line.productSlug} className="hz-cart-row__name" data-testid={'cart-product-' + line.skuId}>
                            {line.productNameFa}
                          </Link>
                          {line.brandFa || line.variantLabelFa ? (
                            <span className="hz-cart-row__variant">{[line.brandFa, line.variantLabelFa].filter(Boolean).join(' · ')}</span>
                          ) : null}
                          <span className="hz-cart-row__unit">{'قیمت واحد ' + fa(line.unitPriceToman) + ' تومان'}</span>
                          {line.reasonFa ? (
                            <p className="hz-inline-msg hz-inline-msg--error" data-testid={'cart-line-problem-' + line.skuId}>
                              <Icon name="warningCircle" size="xs" />
                              <span className="hz-inline-msg__text">{line.reasonFa}</span>
                            </p>
                          ) : null}
                        </div>
                        <div className="hz-cart-row__fix flex flex-wrap items-end gap-sm">
                          <CartLineForm action={setCartLineAction} skuId={line.skuId} quantity={line.quantity} max={line.available} />
                          <RemoveLineForm action={setCartLineAction} skuId={line.skuId} />
                        </div>
                        <div className="hz-cart-row__total" data-testid={'cart-price-' + line.skuId}>
                          <span className="hz-cart-row__amount">
                            {fa(line.lineTotalToman)} <small>تومان</small>
                          </span>
                          <span className="hz-cart-row__math">
                            {fa(line.quantity)} × {fa(line.unitPriceToman)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <fieldset className="space-y-sm border-t border-border-subtle pt-md" data-testid={'cart-methods-' + group.sellerId}>
                    <legend className="hz-field__label mb-sm">روش ارسال</legend>
                    {group.methodOffers.length === 0 ? (
                      <p className="hz-inline-msg hz-inline-msg--error" data-testid={'cart-no-method-' + group.sellerId}>
                        <Icon name="warningCircle" size="xs" />
                        <span className="hz-inline-msg__text">این فروشگاه هنوز هیچ روش ارسالی اعلام نکرده است.</span>
                      </p>
                    ) : (
                      <ul className="grid gap-sm md:grid-cols-2">
                        {group.methodOffers.map((offer) => {
                          const chosen = offer.methodId === group.chosenMethodId;
                          return (
                            <li key={offer.methodId} className="min-w-0">
                              {offer.problem === null ? (
                                <Link
                                  href={withMethod(group.sellerId, offer.methodId)}
                                  aria-current={chosen ? 'true' : undefined}
                                  className={
                                    'hz-option h-full w-full min-w-0 text-text-primary no-underline' + (chosen ? ' border-border-brand bg-bg-brand-subtle' : '')
                                  }
                                  data-testid={'cart-method-' + offer.methodId}
                                >
                                  <Icon name={chosen ? 'checkCircle' : 'truck'} size="sm" className={chosen ? 'text-text-brand' : 'text-text-secondary'} />
                                  <span className="min-w-0">
                                    <span className="block text-label-md">{offer.labelFa}</span>
                                    <span className="hz-caption block">
                                      {(offer.waived ? 'رایگان' : fa(offer.toman!) + ' تومان') + ' · آماده‌سازی ' + fa(offer.preparationDays) + ' روز'}
                                    </span>
                                  </span>
                                </Link>
                              ) : (
                                <span className="hz-option h-full cursor-default bg-bg-subtle" data-testid={'cart-method-blocked-' + offer.methodId}>
                                  <Icon name="prohibit" size="sm" className="text-text-secondary" />
                                  <span className="min-w-0">
                                    <span className="block text-label-md text-text-secondary">{offer.labelFa}</span>
                                    <span className="hz-caption block">{offer.problemFa}</span>
                                  </span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </fieldset>

                  <dl className="hz-summary__list border-t border-border-subtle pt-md" data-testid={'cart-money-' + group.sellerId}>
                    <div className="hz-summary__row">
                      <dt>جمع کالاها</dt>
                      <dd>{fa(group.itemsTotalToman)} تومان</dd>
                    </div>
                    <div className="hz-summary__row">
                      <dt>هزینه ارسال</dt>
                      <dd data-testid={'cart-shipping-' + group.sellerId}>
                        {group.shippingToman === null ? (
                          <span className="hz-unset">اعلام نشده</span>
                        ) : group.shippingToman === 0n ? (
                          <span className="hz-summary__free">رایگان</span>
                        ) : (
                          fa(group.shippingToman) + ' تومان'
                        )}
                      </dd>
                    </div>
                    <div className="hz-summary__row">
                      <dt className="font-bold text-text-primary">جمع این فروشگاه</dt>
                      <dd>{fa(group.buyerTotalToman)} تومان</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          </div>

          <aside aria-labelledby="cart-summary-title" className="min-w-0 lg:sticky lg:top-[calc(var(--header-site)+24px)]">
            <section className="hz-card hz-summary">
              <h2 className="hz-summary__title" id="cart-summary-title">
                تحویل و پرداخت
              </h2>
              <dl className="hz-summary__list">
                <div className="hz-summary__row">
                  <dt>{'جمع کالاها (' + fa(itemCount) + ' عدد)'}</dt>
                  <dd>{fa(cart.itemsTotalToman)} تومان</dd>
                </div>
                <div className="hz-summary__row">
                  <dt>جمع هزینه ارسال</dt>
                  <dd>{fa(cart.shippingTotalToman)} تومان</dd>
                </div>
                {cart.discountTotalToman > 0n ? (
                  <div className="hz-summary__row" data-testid="cart-discount">
                    <dt>تخفیف</dt>
                    <dd>{'−' + fa(cart.discountTotalToman) + ' تومان'}</dd>
                  </div>
                ) : null}
                {cart.loyaltyToman > 0n ? (
                  <div className="hz-summary__row" data-testid="cart-loyalty">
                    <dt>امتیاز خرج‌شده</dt>
                    <dd>{fa(cart.loyaltyPoints) + ' امتیاز — ' + fa(cart.loyaltyToman) + ' تومان'}</dd>
                  </div>
                ) : null}
              </dl>
              <BasketDiscountForm
                action={applyBasketDiscountAction}
                code={code}
                points={cart.loyaltyPoints}
                availablePoints={cart.loyaltyAvailable}
                pointValueFa={null}
              />
              {cart.refusedDiscounts.length > 0 ? (
                <ul className="space-y-2xs" data-testid="cart-refused-discounts">
                  {cart.refusedDiscounts.map((refusal, index) => (
                    <li key={index} className="hz-inline-msg hz-inline-msg--error">
                      <Icon name="warningCircle" size="xs" />
                      <span className="hz-inline-msg__text">
                        {refusal.labelFa} — {refusal.reasonFa}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="hz-summary__note" data-testid="cart-split-note">
                این سبد از {fa(cart.groups.length)} فروشگاه است. پرداخت یک‌بار انجام می‌شود و هر فروشگاه سفارش خودش را
                جداگانه آماده و ارسال می‌کند.
              </p>
              {cart.blocked ? (
                <Alert tone="error" title="تا رفع موارد بالا، ثبت سفارش ممکن نیست">
                  <span data-testid="cart-blocked">قلم‌هایی که قابل خرید نیستند را از سبد بردارید یا تعدادشان را کم کنید.</span>
                </Alert>
              ) : null}
              <CheckoutForm
                action={checkoutAction}
                totalToman={cart.grandTotalToman}
                defaults={{ ...defaults, provinceFa: provinceFa ?? defaults.provinceFa }}
                blocked={cart.blocked || !checkoutOpen}
                code={code}
                redeemPoints={cart.loyaltyPoints}
                chosenMethods={Object.fromEntries(
                  cart.groups
                    .filter((group) => group.chosenMethodId !== null)
                    .map((group) => [group.sellerId, group.chosenMethodId!]),
                )}
              />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
