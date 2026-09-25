import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { breadcrumbLd } from '../../../../src/seo/structured-data.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { publicProduct } from '../../../../src/commerce/shop-discovery.ts';
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

  return (
    <div className="space-y-lg">
      <JsonLdScript data={breadcrumbLd(crumbs, origin)} />
      <Breadcrumbs items={crumbs} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h2">{product.nameFa}</h1>
        <p className="text-caption text-text-secondary">
          {[product.brandFa, product.categoryNameFa].filter(Boolean).join(' · ')}
        </p>
        <p className="text-label-lg" data-testid="product-price">
          {cheapest === null ? 'قیمتی ثبت نشده' : 'از ' + fa(cheapest.priceToman) + ' تومان'}
        </p>
      </header>

      {product.media.length > 0 ? (
        <ul className="grid gap-md md:grid-cols-2" data-testid="product-images">
          {product.media.map((image, index) => (
            <li key={image.fileId}>
              <RecordImage fileId={image.fileId} altFa={image.altFa} variant="banner" priority={index === 0} />
            </li>
          ))}
        </ul>
      ) : null}

      {product.descriptionFa ? (
        <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
          <h2 className="text-label-lg">درباره این کالا</h2>
          <p className="text-body-sm" data-testid="product-description">
            {product.descriptionFa}
          </p>
        </section>
      ) : null}

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">مشخصات</h2>
        {Object.keys(product.specifications).length === 0 ? (
          <p className="text-caption text-text-secondary">مشخصه‌ای ثبت نشده است.</p>
        ) : (
          <dl className="grid gap-sm text-body-sm md:grid-cols-2" data-testid="product-specifications">
            {Object.entries(product.specifications).map(([key, value]) => (
              <div key={key}>
                <dt className="text-caption text-text-secondary">{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-caption text-text-secondary" data-testid="product-species">
          مناسب برای: {product.speciesCodes.join('، ') || 'اعلام نشده'}
        </p>
      </section>

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">امتیاز خریداران</h2>
        <p className="text-body-sm" data-testid="product-rating">
          {rating.count === 0
            ? 'هنوز نظری ثبت نشده است.'
            : fa(rating.overall) + ' از ۵ — بر پایه ' + fa(rating.count) + ' نظر'}
        </p>
        <p className="text-caption text-text-secondary" data-testid="product-rating-note">
          نظر فقط پشت خریدی ثبت می‌شود که انجام شده باشد، و امتیاز تنها از همین نظرها ساخته می‌شود.
        </p>
        {reviews.length > 0 ? (
          <ul className="space-y-2xs text-body-sm" data-testid="product-reviews">
            {reviews.map((view) => (
              <li key={view.row.id} data-testid={'product-review-' + view.row.id}>
                {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} — {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} —{' '}
                {view.dimensionsFa[2]}: {fa(view.row.scoreThree)}
                {view.row.bodyFa ? ' — ' + view.row.bodyFa : ''}
                {view.row.replyFa ? ' — پاسخ فروشنده: ' + view.row.replyFa : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {signedIn ? (
          <SaveForm action={toggleSavedAction} productId={product.id} saved={saved} />
        ) : null}
      </section>

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">پرسش و پاسخ</h2>
        {questions.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="product-questions-empty">
            هنوز پرسشی درباره این کالا منتشر نشده است.
          </p>
        ) : (
          <ul className="space-y-sm text-body-sm" data-testid="product-questions">
            {questions.map((question) => (
              <li key={question.id} data-testid={'product-question-' + question.id}>
                {question.bodyFa}
                {question.answerFa ? ' — پاسخ: ' + question.answerFa : ''}
              </li>
            ))}
          </ul>
        )}
        {signedIn ? <AskQuestionForm action={askQuestionAction} productId={product.id} /> : null}
      </section>

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">فروشندگان این کالا</h2>
        <ul className="mt-md space-y-sm" data-testid="product-offers">
          {product.offers.map((offer) => (
            <li
              key={offer.offerId}
              className="flex flex-wrap items-center gap-sm text-body-sm"
              data-testid={'offer-' + offer.offerId}
            >
              <span>{offer.sellerNameFa}</span>
              <span className="text-caption text-text-secondary">
                {OFFER_CONDITION_FA[offer.condition as OfferCondition] ?? offer.condition}
              </span>
              {product.variantLabels[offer.offerId] ? (
                <span className="text-caption text-text-secondary">{product.variantLabels[offer.offerId]}</span>
              ) : null}
              <span>{fa(offer.priceToman)} تومان</span>
              <StatusBadge tone={offer.available > 0 ? 'success' : 'neutral'}>
                {offer.available > 0 ? 'موجود: ' + fa(offer.available) : 'ناموجود'}
              </StatusBadge>
              {signedIn ? (
                <AddToCartForm
                  action={setCartLineAction}
                  skuId={offer.skuId}
                  available={offer.available}
                  labelFa={offer.sellerNameFa}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {signedIn ? (
          <p className="text-caption">
            <Link href="/shop/cart" className="text-text-brand" data-testid="product-go-to-cart">
              رفتن به سبد خرید
            </Link>
          </p>
        ) : (
          <p className="text-caption text-text-secondary" data-testid="product-order-note">
            برای افزودن به سبد خرید وارد حساب خود شوید.
          </p>
        )}
      </section>

      <p className="text-caption">
        <Link href="/shop" className="text-text-brand" data-testid="back-to-shop">
          بازگشت به فروشگاه
        </Link>
      </p>
    </div>
  );
}
