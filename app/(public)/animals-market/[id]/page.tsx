import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { publicListing, publicListings } from '../../../../src/marketplace/public-listings.ts';
import { PROMOTED_LABEL_FA, parseListingFilter } from '../../../../src/marketplace/discovery-model.ts';
import { SELLER_KIND_FA } from '../../../../src/marketplace/listing-eligibility.ts';
import { AskToBuyForm } from '../../../account/purchases/forms.tsx';
import { ListingCard, ListingPrice } from '../listing-card.tsx';

export const dynamic = 'force-dynamic';

const DATE_FA = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' });

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

function Row({ label, children, testId, empty = false }: { label: string; children: React.ReactNode; testId?: string; empty?: boolean }) {
  return (
    <div className="hz-kv__row">
      <dt className="hz-kv__key">{label}</dt>
      <dd className={empty ? 'hz-kv__value hz-kv__value--empty' : 'hz-kv__value'} data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/**
 * One public advert — Phase 3, PROMPT-004, drawn as DS P03 / key screen K6:
 * the gallery and the animal's facts in the main column, the price, the ask-to-
 * buy form and the seller in the side column (sticky from 1024), then similar
 * adverts.
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
  const sexFa = listing.animal.sex === 'MALE' ? 'نر' : listing.animal.sex === 'FEMALE' ? 'ماده' : null;
  // Similar adverts: the newest public ones, this one left out. Hidden when there are none.
  const similar = (await publicListings(db(), { ...parseListingFilter({}), page: 1, pageSize: 5 })).items
    .filter((card) => card.id !== listing.id)
    .slice(0, 4);

  return (
    <div className="space-y-s48 lg:space-y-s64">
      <div className="space-y-xl">
        <div className="space-y-md">
          <Breadcrumbs items={crumbs} origin={origin} />
          <PageHeader
            title={<span data-testid="listing-title">{listing.titleFa}</span>}
            aside={
              listing.promoted || listing.reserved ? (
                <span className="flex flex-wrap gap-xs">
                  {listing.promoted ? (
                    <StatusBadge tone="warning">
                      <span data-testid="listing-ad-label">{PROMOTED_LABEL_FA}</span>
                    </StatusBadge>
                  ) : null}
                  {listing.reserved ? (
                    <StatusBadge tone="neutral">
                      <span data-testid="listing-reserved">رزروشده</span>
                    </StatusBadge>
                  ) : null}
                </span>
              ) : undefined
            }
            meta={[
              ...(listing.animal.breedFa
                ? [
                    <>
                      <Icon name="pawPrint" size="xs" />
                      {listing.animal.breedFa}
                    </>,
                  ]
                : []),
              ...(sexFa ? [sexFa] : []),
              ...(listing.placeFa
                ? [
                    <>
                      <Icon name="mapPin" size="xs" />
                      {listing.placeFa}
                    </>,
                  ]
                : []),
              ...(listing.publishedAt ? ['منتشرشده ' + DATE_FA.format(listing.publishedAt)] : []),
            ]}
          />
        </div>

        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* Gallery: 4:3, the first photo large, the rest beside it. */}
          <div className="min-w-0 space-y-md lg:col-start-1">
            {images.length > 0 ? (
              <ul className="grid grid-cols-4 gap-sm" data-testid="listing-images">
                {images.map((item, index) => (
                  <li key={index + item.fileId} className={index === 0 ? 'col-span-4' : undefined}>
                    <RecordImage fileId={item.fileId} altFa={item.altFa} variant="4x3" priority={index === 0} className="rounded-xl" />
                  </li>
                ))}
              </ul>
            ) : (
              <RecordImage fileId={null} altFa={listing.titleFa} variant="4x3" className="rounded-xl" />
            )}
            {video ? (
              <video controls preload="metadata" className="w-full rounded-xl border border-border-default" data-testid="listing-video">
                <source src={'/media/' + video.fileId} type="video/mp4" />
              </video>
            ) : null}
          </div>

          {/* Side column: price and the one action, the seller, the safety note. */}
          <aside aria-label="خرید و فروشنده" className="min-w-0 space-y-lg lg:sticky lg:top-[calc(var(--header-site)+24px)] lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <section className="hz-card space-y-md" aria-label="قیمت">
              <ListingPrice mode={listing.priceMode} amount={listing.priceToman} size="lg" testId="listing-price" />
              {listing.handoverFromFa ? (
                <p className="hz-meta__item text-body-sm" data-testid="listing-handover">
                  <Icon name="calendarBlank" size="xs" />
                  زودترین تاریخ تحویل: {listing.handoverFromFa}
                </p>
              ) : null}
              <Alert tone="info" title="پیش از هر پرداختی این را بخوانید">
                <span data-testid="listing-safety">
                  بیعانه فقط داخل همزیست پرداخت می‌شود و برابر کارمزد همزیست است. باقی مبلغ بیرون از همزیست تسویه
                  می‌شود و همزیست درباره آن داوری نمی‌کند.
                </span>
              </Alert>
            </section>

            {/*
              Asking to buy is where the public part ends (PROMPT-005). Reading the
              advert needs nothing; the request itself needs a verified identity, and
              the server says so when the form is posted — the page never decides it.
            */}
            {listing.reserved ? (
              <Alert tone="neutral" title="این حیوان رزرو شده است">
                <span data-testid="listing-reserved-notice">
                  بیعانه این آگهی پرداخت شده و فعلاً درخواست تازه‌ای پذیرفته نمی‌شود.
                </span>
              </Alert>
            ) : (
              <AskToBuyForm listingId={listing.id} negotiable={listing.priceMode === 'NEGOTIABLE'} />
            )}

            <article className="hz-card hz-seller" aria-label="فروشنده">
              <p className="hz-caption">فروشنده</p>
              <div className="hz-entity mt-sm">
                <RecordImage variant="thumb-lg" fileId={null} altFa={null} />
                <div className="hz-entity__body">
                  <h2 className="hz-entity__name">{listing.kennelNameFa ?? SELLER_KIND_FA[listing.sellerKind as 'OWNER' | 'KENNEL']}</h2>
                  <span className="hz-entity__meta">
                    {[SELLER_KIND_FA[listing.sellerKind as 'OWNER' | 'KENNEL'], listing.placeFa].filter(Boolean).join('، ')}
                  </span>
                </div>
              </div>
            </article>

            <p className="hz-body-sm">
              <Link href={'/report/listing/' + listing.id} className="hz-link hz-link--standalone" data-testid="report-listing-link">
                <Icon name="flag" size="xs" />
                گزارش این آگهی
              </Link>
            </p>
          </aside>

          <div className="min-w-0 space-y-lg lg:col-start-1">
            <section className="hz-card" aria-labelledby="listing-facts-title">
              <SectionHeader size="sm" id="listing-facts-title" title="مشخصات حیوان" link={{ href: '/verify', label: 'استعلام اصالت' }} />
              <p className="hz-caption">این موارد از پرونده ثبت‌شده حیوان در همزیست خوانده می‌شوند.</p>
              <dl className="hz-kv hz-kv--2col mt-sm" data-testid="listing-facts">
                <Row label="نژاد" empty={!listing.animal.breedFa}>
                  {listing.animal.breedFa ?? 'تعیین‌نشده'}
                </Row>
                <Row label="جنسیت" empty={sexFa === null}>
                  {sexFa ?? 'ثبت نشده'}
                </Row>
                <Row label="تاریخ تولد" empty={!listing.animal.birthDate}>
                  <bdi>{listing.animal.birthDate ?? 'ثبت نشده'}</bdi>
                  {listing.animal.birthDateApproximate ? ' (تقریبی)' : ''}
                </Row>
                <Row label="میکروچیپ" testId="listing-fact-chip">
                  {listing.animal.microchipRegistered ? 'ثبت‌شده' : 'ثبت نشده'}
                </Row>
                <Row label="شجره‌نامه">{listing.animal.pedigreeIssued ? 'صادرشده' : 'صادر نشده'}</Row>
                <Row label="تست اصالت والدین">{listing.animal.parentageFinal ? 'نتیجه نهایی دارد' : 'ندارد'}</Row>
              </dl>
            </section>

            <section className="hz-card" aria-labelledby="listing-declared-title">
              <SectionHeader size="sm" id="listing-declared-title" title="اظهارات فروشنده" />
              <p className="hz-caption" data-testid="listing-disclaimer">
                همزیست سابقه واکسیناسیون، عقیم‌سازی و وضعیت سلامت را نگه نمی‌دارد. موارد زیر اظهار فروشنده‌اند و
                توسط همزیست تأیید نشده‌اند.
              </p>
              <ul className="hz-kv mt-sm" data-testid="listing-declarations">
                <li className="hz-kv__row">
                  <span className="hz-kv__key">واکسیناسیون:</span> <span className="hz-kv__value">{listing.vaccinationFa ?? 'اعلام نشده'}</span>
                </li>
                <li className="hz-kv__row">
                  <span className="hz-kv__key">عقیم‌سازی:</span> <span className="hz-kv__value">{listing.neuterFa ?? 'اعلام نشده'}</span>
                </li>
                {listing.healthNoteFa ? (
                  <li className="hz-kv__row">
                    <span className="hz-kv__key">یادداشت سلامت:</span> <span className="hz-kv__value">{listing.healthNoteFa}</span>
                  </li>
                ) : null}
                <li className="hz-kv__row">
                  <span className="hz-kv__key">دلیل فروش:</span> <span className="hz-kv__value">{listing.reasonForSaleFa ?? 'اعلام نشده'}</span>
                </li>
              </ul>
            </section>

            {listing.descriptionFa ? (
              <section className="hz-card" aria-labelledby="listing-description-title">
                <SectionHeader size="sm" id="listing-description-title" title="توضیح آگهی" />
                <p className="hz-body whitespace-pre-line" data-testid="listing-description">
                  {listing.descriptionFa}
                </p>
              </section>
            ) : null}

            <section className="hz-card" aria-labelledby="listing-delivery-title">
              <SectionHeader size="sm" id="listing-delivery-title" title="تحویل" />
              <p className="hz-body" data-testid="listing-delivery">
                {listing.deliveryFa.length > 0 ? listing.deliveryFa.join('، ') : 'اعلام نشده'}
              </p>
            </section>
          </div>
        </div>
      </div>

      {similar.length > 0 ? (
        <section aria-labelledby="similar-title">
          <SectionHeader id="similar-title" title="آگهی‌های مشابه" link={{ href: '/animals-market' }} />
          <ul className="grid grid-cols-2 gap-md md:gap-s20 lg:grid-cols-4">
            {similar.map((card) => (
              <li key={card.id}>
                <ListingCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
