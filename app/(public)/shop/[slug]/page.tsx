import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { breadcrumbLd } from '../../../../src/seo/structured-data.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { ButtonLink, StickyActionBar } from '../../../../src/ui/button.tsx';
import { SectionHeader } from '../../../../src/ui/section-header.tsx';
import { ProductCard, StockBadge } from '../product-card.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { parseShopFilter, publicProduct, shopPage } from '../../../../src/commerce/shop-discovery.ts';

import { OFFER_CONDITION_FA, type OfferCondition } from '../../../../src/commerce/catalog-model.ts';
import { AddToCartForm } from '../../../../src/commerce/order-forms.tsx';
import { setCartLineAction } from '../cart/actions.ts';
import { currentSession } from '../../../../src/authz/request-actor.ts';
import { productAggregate, reviewsOfProduct } from '../../../../src/commerce/reviews.ts';
import { questionsOfProduct } from '../../../../src/commerce/questions.ts';
import { isSaved, recordView } from '../../../../src/commerce/saved.ts';
import { AskQuestionForm, SaveForm } from '../../../../src/commerce/trust-forms.tsx';
import { askQuestionAction, toggleSavedAction } from '../../../account/orders/trust-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await publicProduct(db(), slug);
  if (product === null) {
    return buildMetadata({ title: 'کالا پیدا نشد', description: '—', path: '/shop', noindex: true }, site());
  }
  return buildMetadata(
    {
      title: product.nameFa + (product.brandFa ? ' — ' + product.brandFa : ''),
      description:
        (product.descriptionFa ?? '').slice(0, 150) ||
        'کالای ثبت‌شده در فروشگاه همزیست با مقایسه قیمت و موجودی فروشندگان.',
      path: product.path,
      image: product.media[0]
        ? { path: '/media/' + product.media[0].fileId, alt: product.media[0].altFa }
        : undefined,
    },
    site(),
  );
}

/**
 * One product, and every seller offering it — PROMPT-009.
 *
 * The comparison is by price and availability, and the page has no way to know
 * which of the sellers is the platform's own: PRODUCT_DECISIONS §8 says Hamzist
 * has no hidden ranking privilege, and the way to keep that true is to give the
 * ordering nothing to favour with.
 *
 * Structured data is deliberately limited to the breadcrumb, the same choice
 * the animal market made: an Offer graph would state a price and an availability
 * on Hamzist's behalf, and those belong to the sellers.
 */
export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await publicProduct(db(), slug);
  if (product === null) notFound();
  // A basket belongs to somebody, so the buttons appear only once there is
  // somebody for it to belong to. Nothing about the product itself is hidden.
  const session = await currentSession(db());
  const actor = session?.actor ?? null;
  const signedIn = actor != null;

  // Recorded only where somebody asked for it to be: signed in, history not
  // turned off, and a retention period configured (PROMPT-012).
  if (actor) await recordView(db(), actor, { productId: product.id });

  const [rating, reviews, questions, saved] = await Promise.all([
    productAggregate(db(), product.id),
    reviewsOfProduct(db(), product.id),
    questionsOfProduct(db(), product.id),
    actor?.accountId ? isSaved(db(), actor.accountId, product.id) : Promise.resolve(false),
  ]);

  const cheapest = product.offers.find((offer) => offer.available > 0) ?? product.offers[0] ?? null;
  const origin = site().origin;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'فروشگاه', path: '/shop' },
    { name: product.nameFa, path: product.path },
  ];
  // «کالاهای مرتبط»: the newest public products, this one left out. Hidden when there are none.
  const related = (await shopPage(db(), { ...parseShopFilter({}), page: 1 })).items.filter((item) => item.id !== product.id).slice(0, 4);

  return (
    <div className="space-y-s48 lg:space-y-s64">
      <div className="space-y-xl">
        <JsonLdScript data={breadcrumbLd(crumbs, origin)} />
        <Breadcrumbs items={crumbs} origin={origin} />

        <div className="grid gap-xl lg:grid-cols-2 lg:items-start">
          {/* Gallery: 1:1, the first photo large, the rest below it. */}
          <div className="min-w-0 lg:sticky lg:top-[calc(var(--header-site)+24px)]">
            {product.media.length > 0 ? (
              <ul className="grid grid-cols-4 gap-sm" data-testid="product-images">
                {product.media.map((image, index) => (
                  <li key={index + image.fileId} className={index === 0 ? 'col-span-4' : undefined}>
                    <RecordImage fileId={image.fileId} altFa={image.altFa} variant="1x1" priority={index === 0} className="rounded-xl border border-border-default" />
                  </li>
                ))}
              </ul>
            ) : (
              <RecordImage fileId={null} altFa={product.nameFa} variant="1x1" className="rounded-xl border border-border-default" />
            )}
          </div>

          <div className="min-w-0 space-y-lg">
            <header className="space-y-sm border-b border-border-subtle pb-lg">
              <ul className="hz-tag-list">
                {product.brandFa ? <li className="hz-tag">{product.brandFa}</li> : null}
                <li className="hz-tag hz-tag--neutral">{product.categoryNameFa}</li>
              </ul>
              <h1 className="hz-h2">{product.nameFa}</h1>
              {rating.count > 0 ? (
                <span className="hz-rating" role="img" aria-label={'امتیاز ' + fa(rating.overall) + ' از ۵، ' + fa(rating.count) + ' نظر'}>
                  <Icon name="star" size="xs" weight="fill" />
                  {fa(rating.overall)}
                  <span className="hz-rating__count">{'(' + fa(rating.count) + ' نظر)'}</span>
                </span>
              ) : (
                <span className="hz-caption">هنوز نظری ثبت نشده است</span>
              )}
            </header>

            <div className="flex flex-wrap items-center gap-md">
              <div className={cheapest === null ? 'hz-price hz-price--lg hz-price--unset' : 'hz-price hz-price--lg'} data-testid="product-price">
                {cheapest === null ? (
                  <span className="hz-price__amount">قیمتی ثبت نشده</span>
                ) : (
                  <>
                    <span className="hz-price__from">از</span> <span className="hz-price__amount">{fa(cheapest.priceToman)}</span>{' '}
                    <span className="hz-price__unit">تومان</span>
                  </>
                )}
              </div>
              {cheapest ? <StockBadge available={product.offers.reduce((sum, offer) => sum + offer.available, 0)} /> : null}
            </div>

            <section aria-labelledby="offers-title" className="space-y-md">
              <SectionHeader size="sm" id="offers-title" title="فروشندگان این کالا" count={fa(product.offers.length)} />
              <ul className="space-y-md" data-testid="product-offers">
                {product.offers.map((offer) => (
                  <li key={offer.offerId} className="hz-card hz-seller space-y-md" data-testid={'offer-' + offer.offerId}>
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="hz-entity">
                        <RecordImage variant="thumb" fileId={null} altFa={null} />
                        <div className="hz-entity__body">
                          <h3 className="hz-entity__name">{offer.sellerNameFa}</h3>
                          <span className="hz-entity__meta">
                            {[OFFER_CONDITION_FA[offer.condition as OfferCondition] ?? offer.condition, product.variantLabels[offer.offerId]]
                              .filter(Boolean)
                              .join('، ')}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-xs">
                        <div className="hz-price">
                          <span className="hz-price__amount">{fa(offer.priceToman)}</span> <span className="hz-price__unit">تومان</span>
                        </div>
                        <StockBadge available={offer.available} size="sm">
                          {offer.available > 0 ? 'موجود: ' + fa(offer.available) : 'ناموجود'}
                        </StockBadge>
                      </div>
                    </div>
                    {signedIn ? (
                      <AddToCartForm action={setCartLineAction} skuId={offer.skuId} available={offer.available} labelFa={offer.sellerNameFa} />
                    ) : null}
                  </li>
                ))}
              </ul>
              {signedIn ? (
                <p className="hz-body-sm">
                  <Link href="/shop/cart" className="hz-link hz-link--standalone" data-testid="product-go-to-cart">
                    <Icon name="shoppingCart" size="xs" />
                    رفتن به سبد خرید
                  </Link>
                </p>
              ) : (
                <div className="hz-card hz-card--subtle flex flex-wrap items-center justify-between gap-sm">
                  <p className="hz-body-sm" data-testid="product-order-note">
                    برای افزودن به سبد خرید وارد حساب خود شوید.
                  </p>
                  <ButtonLink href={'/login?returnTo=' + encodeURIComponent(product.path)} tone="secondary" size="sm" iconStart="signIn">
                    ورود / ثبت‌نام
                  </ButtonLink>
                </div>
              )}
              {signedIn ? <SaveForm action={toggleSavedAction} productId={product.id} saved={saved} /> : null}
            </section>
          </div>
        </div>

        <div className="grid gap-xl lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
          <section aria-labelledby="specs-title" className="space-y-lg">
            <SectionHeader id="specs-title" title="توضیحات و مشخصات" />
            <div className="hz-card space-y-lg">
              {product.descriptionFa ? (
                <div className="space-y-xs">
                  <h3 className="hz-card__title">درباره این کالا</h3>
                  <p className="hz-body" data-testid="product-description">
                    {product.descriptionFa}
                  </p>
                </div>
              ) : null}
              <div className="space-y-xs">
                <h3 className="hz-card__title">مشخصات</h3>
                {Object.keys(product.specifications).length === 0 ? (
                  <p className="hz-caption">مشخصه‌ای ثبت نشده است.</p>
                ) : (
                  <dl className="hz-kv" data-testid="product-specifications">
                    {Object.entries(product.specifications).map(([key, value]) => (
                      <div key={key} className="hz-kv__row">
                        <dt className="hz-kv__key">{key}</dt>
                        <dd className="hz-kv__value">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="hz-caption" data-testid="product-species">
                  مناسب برای: {product.speciesCodes.join('، ') || 'اعلام نشده'}
                </p>
              </div>
            </div>
          </section>

          <div className="space-y-xl">
            <section aria-labelledby="rating-title" className="space-y-lg">
              <SectionHeader id="rating-title" title="نظر خریداران" />
              <div className="hz-card space-y-md">
                <p className="hz-h3" data-testid="product-rating">
                  {rating.count === 0
                    ? 'هنوز نظری ثبت نشده است.'
                    : fa(rating.overall) + ' از ۵ — بر پایه ' + fa(rating.count) + ' نظر'}
                </p>
                <p className="hz-caption" data-testid="product-rating-note">
                  نظر فقط پشت خریدی ثبت می‌شود که انجام شده باشد، و امتیاز تنها از همین نظرها ساخته می‌شود.
                </p>
                {reviews.length > 0 ? (
                  <ul className="divide-y divide-border-subtle" data-testid="product-reviews">
                    {reviews.map((view) => (
                      <li key={view.row.id} className="hz-body-sm py-sm" data-testid={'product-review-' + view.row.id}>
                        {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} — {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} —{' '}
                        {view.dimensionsFa[2]}: {fa(view.row.scoreThree)}
                        {view.row.bodyFa ? ' — ' + view.row.bodyFa : ''}
                        {view.row.replyFa ? ' — پاسخ فروشنده: ' + view.row.replyFa : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="questions-title" className="space-y-lg">
              <SectionHeader id="questions-title" title="پرسش و پاسخ" />
              <div className="hz-card space-y-md">
                {questions.length === 0 ? (
                  <p className="hz-caption" data-testid="product-questions-empty">
                    هنوز پرسشی درباره این کالا منتشر نشده است.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle" data-testid="product-questions">
                    {questions.map((question) => (
                      <li key={question.id} className="hz-body-sm py-sm" data-testid={'product-question-' + question.id}>
                        {question.bodyFa}
                        {question.answerFa ? ' — پاسخ: ' + question.answerFa : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {signedIn ? <AskQuestionForm action={askQuestionAction} productId={product.id} /> : null}
              </div>
            </section>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title">
          <SectionHeader id="related-title" title="کالاهای مرتبط" link={{ href: '/shop' }} />
          <ul className="grid grid-cols-2 gap-md md:gap-s20 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="hz-body-sm">
        <Link href="/shop" className="hz-link hz-link--standalone" data-testid="back-to-shop">
          <Icon name="arrowRight" size="xs" />
          بازگشت به فروشگاه
        </Link>
      </p>

      {/* K7 phones: the buy action stays reachable (DS StickyActionBar); from 768 it is in the buy box. */}
      {cheapest ? (
        <StickyActionBar
          label="افزودن به سبد"
          className="md:hidden"
          context={product.nameFa}
          total={fa(cheapest.priceToman) + ' تومان'}
        >
          <ButtonLink href="#offers-title" size="lg" iconStart="shoppingCart">
            افزودن به سبد
          </ButtonLink>
        </StickyActionBar>
      ) : null}
    </div>
  );
}
