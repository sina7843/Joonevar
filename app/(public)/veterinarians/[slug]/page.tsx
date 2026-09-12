import type { Metadata } from 'next';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { vetPageBySlug } from '../../../../src/vets/directory.ts';
import { LOCATION_KIND_FA } from '../../../../src/vets/directory-model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { vetPersonLd } from '../../../../src/seo/structured-data.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { site } from '../../../../src/public/request.ts';
import { DUPLICATE_NOTICE_FA } from '../../../../src/admin/merge-model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import Link from 'next/link';
import { Alert } from '../../../../src/ui/alert.tsx';
import { PlaceMap } from '../../../../src/ui/map.tsx';
import { mapConfig } from '../../../../src/geo/service.ts';

type Params = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => vetPageBySlug(db(), slug));

function summary(nameFa: string, headline: string | null, bio: string | null): string {
  const text = (headline ?? bio ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return 'پروفایل دامپزشک ' + nameFa + ' در همزیست.';
  return text.length > 155 ? text.slice(0, 154) + '…' : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (page === null) return {};
  return buildMetadata(
    {
      // A merged duplicate keeps its address but points at the primary (§21).
      state: page.primary ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary ? '/veterinarians/' + page.primary.slug : undefined,
      title: page.nameFa + ' — دامپزشک',
      description: summary(page.nameFa, page.headlineFa, page.bioFa),
      path: '/veterinarians/' + page.slug,
      image: page.imageFileId ? { path: '/media/' + page.imageFileId, alt: page.imageAltFa ?? page.nameFa } : undefined,
    },
    site(),
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="mt-md space-y-md text-body-md">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/** One veterinarian — Requirements-Phase-2 §7, §19 (PROMPT-006). Draft, hidden and unknown addresses are 404. */
export default async function VeterinarianPage({ params }: Params) {
  const page = await load((await params).slug);
  if (page === null) notFound();

  const { origin } = site();
  // No map is drawn until the operator records an embed template (DEC-0175).
  const map = await mapConfig(db());
  const path = '/veterinarians/' + page.slug;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'دامپزشکان', path: '/veterinarians' },
    { name: page.nameFa, path },
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-xl" data-testid="vet-page">
      <Breadcrumbs items={crumbs} origin={origin} />
      <JsonLdScript
        data={vetPersonLd(
          {
            name: page.nameFa,
            path,
            description: page.headlineFa,
            telephone: page.phone,
            specialties: page.specialtiesFa,
            locations: page.locations.map((l) => ({
              name: l.nameFa,
              city: l.cityNameFa,
              province: l.provinceNameFa,
              address: l.addressFa,
              telephone: l.phone,
            })),
          },
          origin,
        )}
      />

      <header className="space-y-sm">
        <RecordImage priority fileId={page.imageFileId} altFa={page.imageAltFa} className="mb-lg" />
        <h1 className="text-h3 md:text-h1">{page.nameFa}</h1>
        {page.headlineFa ? <p className="text-body-md text-text-secondary">{page.headlineFa}</p> : null}
        {/* Each axis is its own badge; none of them implies another (P2-D05). */}
        <div className="flex flex-wrap gap-xs" data-testid="vet-axes">
          {page.verified ? (
            <span data-testid="vet-verified">
              <StatusBadge tone="info">کد نظام دامپزشکی تأییدشده</StatusBadge>
            </span>
          ) : null}
          {page.trusted ? (
            <span data-testid="vet-trusted">
              <StatusBadge tone="success">دامپزشک معتمد همزیست</StatusBadge>
            </span>
          ) : null}
        </div>
      </header>

      {page.owned ? null : (
        <div data-testid="vet-unowned">
          <Alert tone="info" title="این پروفایل بدون مالک است">
            اطلاعات این صفحه از منبع عمومی ثبت و بررسی شده است و هنوز هیچ دامپزشکی مدیریت آن را به عهده نگرفته است. کد نظام آن تأیید
            نشده است.{' '}
            <Link href={'/account/vet-profile/claim/' + page.slug} className="text-text-brand underline underline-offset-4" data-testid="vet-claim-link">
              این پروفایل شماست؟ درخواست Claim
            </Link>
          </Alert>
        </div>
      )}

      {page.primary ? (
        <div data-testid="vet-merged">
          <Alert tone="warning" title="این رکورد تکراری بوده است">
            {DUPLICATE_NOTICE_FA}{' '}
            <Link href={'/veterinarians/' + page.primary.slug} className="text-text-brand underline underline-offset-4">
              {page.primary.nameFa}
            </Link>
          </Alert>
        </div>
      ) : null}

      <dl className="grid gap-sm sm:grid-cols-2" data-testid="vet-facts">
        {page.councilCode ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">کد نظام دامپزشکی</dt>
            <dd className="text-label-md" dir="ltr" data-testid="vet-council-code">
              {page.councilCode}
            </dd>
          </div>
        ) : null}
        {page.phone ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">تلفن عمومی</dt>
            <dd className="text-label-md" dir="ltr" data-testid="vet-phone">
              <a href={'tel:' + page.phone}>{page.phone}</a>
            </dd>
          </div>
        ) : null}
        {page.specialtiesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">تخصص‌ها</dt>
            <dd className="mt-2xs text-label-md" data-testid="vet-specialties">
              {page.specialtiesFa.join('، ')}
            </dd>
          </div>
        ) : null}
        {page.speciesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">گونه‌هایی که پذیرفته می‌شوند</dt>
            <dd className="mt-2xs text-label-md" data-testid="vet-species">
              {page.speciesFa.join('، ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {page.bioFa ? (
        <section aria-labelledby="vet-bio-title">
          <h2 id="vet-bio-title" className="text-h4">
            معرفی
          </h2>
          <Prose text={page.bioFa} />
        </section>
      ) : null}

      {page.experienceFa ? (
        <section aria-labelledby="vet-experience-title">
          <h2 id="vet-experience-title" className="text-h4">
            سوابق
          </h2>
          <Prose text={page.experienceFa} />
        </section>
      ) : null}

      {page.locations.length === 0 && !page.listed ? null : (
      <section aria-labelledby="vet-locations-title">
        <h2 id="vet-locations-title" className="text-h4">
          محل‌های کار
        </h2>
        {page.listed ? (
          <p className="mt-md flex flex-wrap items-center gap-2xs text-body-sm" data-testid="vet-listed-place">
            <Icon name="mapPin" size="xs" />
            {page.listed.provinceNameFa + ' · ' + page.listed.cityNameFa + (page.listed.contactFa ? ' · ' + page.listed.contactFa : '')}
          </p>
        ) : null}
        <ul className="mt-md space-y-sm" data-testid="vet-locations">
          {page.locations.map((location) => (
            <li key={location.id} className="rounded-lg border border-border-subtle bg-bg-surface p-md" data-testid="vet-location">
              <p className="text-label-lg">{location.nameFa}</p>
              <p className="mt-2xs flex items-center gap-2xs text-body-sm text-text-secondary">
                <Icon name="mapPin" size="xs" />
                {[LOCATION_KIND_FA[location.kind], location.provinceNameFa, location.cityNameFa, location.neighborhoodFa]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {location.addressFa ? <p className="mt-xs text-body-sm">{location.addressFa}</p> : null}
              {location.phone ? (
                <p className="mt-xs text-body-sm">
                  {'تلفن: '}
                  <a href={'tel:' + location.phone} dir="ltr">
                    {location.phone}
                  </a>
                </p>
              ) : null}
              {location.hoursNoteFa ? (
                <p className="mt-xs text-body-sm" data-testid="vet-location-hours">
                  {'ساعات اعلام‌شده: ' + location.hoursNoteFa}
                </p>
              ) : null}
              {/* Only places the veterinarian published reach this page (§20). */}
              <PlaceMap
                nameFa={location.nameFa}
                isPublic
                latitude={location.latitude}
                longitude={location.longitude}
                template={map.template}
                apiKey={map.apiKey}
                testId={'vet-location-map-' + location.id}
              />
            </li>
          ))}
        </ul>
        <p className="mt-sm text-caption text-text-secondary">
          ساعات فقط برای اطلاع است. همزیست نوبت نمی‌دهد و درخواست خدمت از این صفحه ثبت نمی‌شود؛ پیش از مراجعه با محل کار
          تماس بگیرید.
        </p>
      </section>
      )}
    </article>
  );
}
