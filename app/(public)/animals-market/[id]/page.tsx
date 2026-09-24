import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { breadcrumbLd } from '../../../../src/seo/structured-data.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { publicListing } from '../../../../src/marketplace/public-listings.ts';
import { PROMOTED_LABEL_FA } from '../../../../src/marketplace/discovery-model.ts';
import { SELLER_KIND_FA } from '../../../../src/marketplace/listing-eligibility.ts';
import { AskToBuyForm } from '../../../account/purchases/forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listing = await publicListing(db(), id);
  if (listing === null) return buildMetadata({ title: 'آگهی پیدا نشد', description: '—', path: '/animals-market', noindex: true }, site());
  return buildMetadata(
    {
      title: listing.titleFa + (listing.animal.breedFa ? ' — ' + listing.animal.breedFa : ''),
      description:
        (listing.descriptionFa ?? '').slice(0, 150) ||
        'آگهی فروش حیوان ثبت‌شده در همزیست با اطلاعات قطعی پرونده و اظهارات فروشنده.',
      path: listing.path,
      // A reserved advert stays readable for whoever holds its link, and is not
      // something to send new people to.
      noindex: listing.reserved,
      image: listing.mediaFileIds[0]
        ? { path: '/media/' + listing.mediaFileIds[0].fileId, alt: listing.mediaFileIds[0].altFa }
        : undefined,
    },
    site(),
  );
}

/**
 * One public advert — Phase 3, PROMPT-004.
 *
 * Two halves, the same way the seller's own page is split. What Hamzist holds
 * about the animal is stated as fact and read from the animal record. What only
 * the seller knows is labelled as the seller's statement, so a buyer can tell
 * the difference between a certified identity and an unverifiable claim.
 *
 * Structured data is deliberately limited to the breadcrumb. A Product or Offer
 * graph would tell a search engine that Hamzist is selling an animal at a
 * price, and neither of those is true: the deposit is a commission and the rest
 * of the price is settled outside.
 */
export default async function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await publicListing(db(), id);
  if (listing === null) notFound();

  const origin = site().origin;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'بازار فروش حیوان', path: '/animals-market' },
    { name: listing.titleFa, path: listing.path },
  ];
  const images = listing.mediaFileIds.filter((item) => item.kind === 'IMAGE');
  const video = listing.mediaFileIds.find((item) => item.kind === 'VIDEO') ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-lg px-lg py-lg">
      <JsonLdScript data={breadcrumbLd(crumbs, origin)} />
      <Breadcrumbs items={crumbs} origin={origin} />

      <header className="space-y-sm">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <h1 className="text-h3" data-testid="listing-title">
            {listing.titleFa}
          </h1>
          <div className="flex flex-wrap gap-xs">
            {listing.promoted ? (
              <StatusBadge tone="warning">
                <span data-testid="listing-ad-label">{PROMOTED_LABEL_FA}</span>
              </StatusBadge>
            ) : null}
            {listing.reserved ? (
              <StatusBadge tone="info">
                <span data-testid="listing-reserved">رزروشده</span>
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <p className="text-label-lg" data-testid="listing-price">
          {listing.priceMode === 'NEGOTIABLE'
            ? 'قیمت توافقی'
            : listing.priceToman !== null
              ? fa(listing.priceToman) + ' تومان'
              : 'قیمت اعلام نشده'}
        </p>
        <p className="text-caption text-text-secondary">
          {[SELLER_KIND_FA[listing.sellerKind as 'OWNER' | 'KENNEL'], listing.kennelNameFa, listing.placeFa]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {images.length > 0 ? (
        <ul className="grid gap-md md:grid-cols-2" data-testid="listing-images">
          {images.map((item, index) => (
            <li key={item.fileId}>
              <RecordImage fileId={item.fileId} altFa={item.altFa} variant="banner" priority={index === 0} />
            </li>
          ))}
        </ul>
      ) : null}

      {video ? (
        <video
          controls
          preload="metadata"
          className="w-full rounded-lg border border-border-subtle"
          data-testid="listing-video"
        >
          <source src={'/media/' + video.fileId} type="video/mp4" />
        </video>
      ) : null}

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">اطلاعات قطعی از پرونده حیوان</h2>
        <p className="text-caption text-text-secondary">
          این موارد از پرونده ثبت‌شده حیوان در همزیست خوانده می‌شوند.
        </p>
        <dl className="grid gap-sm text-body-sm md:grid-cols-2" data-testid="listing-facts">
          <div>
            <dt className="text-caption text-text-secondary">نژاد</dt>
            <dd>{listing.animal.breedFa ?? 'نامشخص'}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">جنسیت</dt>
            <dd>{listing.animal.sex === 'MALE' ? 'نر' : listing.animal.sex === 'FEMALE' ? 'ماده' : 'ثبت نشده'}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">تاریخ تولد</dt>
            <dd>
              <bdi>{listing.animal.birthDate ?? 'ثبت نشده'}</bdi>
              {listing.animal.birthDateApproximate ? ' (تقریبی)' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">میکروچیپ</dt>
            <dd data-testid="listing-fact-chip">{listing.animal.microchipRegistered ? 'ثبت‌شده' : 'ثبت نشده'}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">شجره‌نامه</dt>
            <dd>{listing.animal.pedigreeIssued ? 'صادرشده' : 'صادر نشده'}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">تست اصالت والدین</dt>
            <dd>{listing.animal.parentageFinal ? 'نتیجه نهایی دارد' : 'ندارد'}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">اظهارات فروشنده</h2>
        <p className="text-caption text-text-secondary" data-testid="listing-disclaimer">
          همزیست سابقه واکسیناسیون، عقیم‌سازی و وضعیت سلامت را نگه نمی‌دارد. موارد زیر اظهار فروشنده‌اند و
          توسط همزیست تأیید نشده‌اند.
        </p>
        <ul className="space-y-2xs text-body-sm" data-testid="listing-declarations">
          <li>واکسیناسیون: {listing.vaccinationFa ?? 'اعلام نشده'}</li>
          <li>عقیم‌سازی: {listing.neuterFa ?? 'اعلام نشده'}</li>
          {listing.healthNoteFa ? <li>یادداشت سلامت: {listing.healthNoteFa}</li> : null}
          <li>دلیل فروش: {listing.reasonForSaleFa ?? 'اعلام نشده'}</li>
        </ul>
      </section>

      {listing.descriptionFa ? (
        <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
          <h2 className="text-label-lg">توضیح آگهی</h2>
          <p className="whitespace-pre-line text-body-sm" data-testid="listing-description">
            {listing.descriptionFa}
          </p>
        </section>
      ) : null}

      <section className="space-y-sm rounded-lg border border-border-subtle p-lg">
        <h2 className="text-label-lg">تحویل</h2>
        <p className="text-body-sm" data-testid="listing-delivery">
          {listing.deliveryFa.length > 0 ? listing.deliveryFa.join('، ') : 'اعلام نشده'}
        </p>
        {listing.handoverFromFa ? (
          <p className="text-caption text-text-secondary" data-testid="listing-handover">
            زودترین تاریخ تحویل: {listing.handoverFromFa}
          </p>
        ) : null}
      </section>

      <Alert tone="info" title="پیش از هر پرداختی این را بخوانید">
        <span data-testid="listing-safety">
          بیعانه فقط داخل همزیست پرداخت می‌شود و برابر کارمزد همزیست است. باقی مبلغ بیرون از همزیست تسویه
          می‌شود و همزیست درباره آن داوری نمی‌کند.
        </span>
      </Alert>

      {/*
        Asking to buy is where the public part ends (PROMPT-005). Reading the
        advert needs nothing; the request itself needs a verified identity, and
        the server says so when the form is posted — the page never decides it.
      */}
      {listing.reserved ? (
        <Alert tone="info" title="این حیوان رزرو شده است">
          <span data-testid="listing-reserved-notice">
            بیعانه این آگهی پرداخت شده و فعلاً درخواست تازه‌ای پذیرفته نمی‌شود.
          </span>
        </Alert>
      ) : (
        <AskToBuyForm listingId={listing.id} negotiable={listing.priceMode === 'NEGOTIABLE'} />
      )}

      <p className="text-caption">
        <Link href={'/report/listing/' + listing.id} className="text-text-brand" data-testid="report-listing-link">
          گزارش این آگهی
        </Link>
      </p>
    </div>
  );
}
