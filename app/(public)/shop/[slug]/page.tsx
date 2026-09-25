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
            </li>
          ))}
        </ul>
        <p className="text-caption text-text-secondary" data-testid="product-order-note">
          سبد خرید و ثبت سفارش در مرحله بعدی محصول اضافه می‌شود؛ در این مرحله قیمت و موجودی فروشندگان فقط
          نمایش داده می‌شود.
        </p>
      </section>

      <p className="text-caption">
        <Link href="/shop" className="text-text-brand" data-testid="back-to-shop">
          بازگشت به فروشگاه
        </Link>
      </p>
    </div>
  );
}
