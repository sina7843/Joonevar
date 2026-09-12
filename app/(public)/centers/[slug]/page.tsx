import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { centrePageBySlug } from '../../../../src/centres/service.ts';
import { WEEKDAYS_FA } from '../../../../src/centres/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { veterinaryCareLd } from '../../../../src/seo/structured-data.ts';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { site } from '../../../../src/public/request.ts';
import { DUPLICATE_NOTICE_FA } from '../../../../src/admin/merge-model.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { PlaceMap } from '../../../../src/ui/map.tsx';
import { mapConfig } from '../../../../src/geo/service.ts';

type Params = { params: Promise<{ slug: string }> };

const load = cache((slug: string) => centrePageBySlug(db(), slug));

const KIND_FA: Record<string, string> = { CLINIC: 'کلینیک', HOSPITAL: 'بیمارستان', CENTRE: 'مرکز' };

function summary(nameFa: string, typeFa: string, about: string | null): string {
  const text = (about ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return typeFa + ' ' + nameFa + ' در همزیست: شعبه‌ها، خدمات و ساعات اعلام‌شده.';
  return text.length > 155 ? text.slice(0, 154) + '…' : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (page === null) return {};
  return buildMetadata(
    {
      title: page.nameFa + ' — ' + page.typeFa,
      description: summary(page.nameFa, page.typeFa, page.aboutFa),
      path: '/centers/' + page.slug,
      // A merged duplicate keeps its address but points at the primary (§21).
      state: page.primary ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary ? '/centers/' + page.primary.slug : undefined,
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

/** One centre — Requirements-Phase-2 §9, §19 (PROMPT-008). Draft, hidden and unknown addresses are 404. */
export default async function CentrePage({ params }: Params) {
  const page = await load((await params).slug);
  if (page === null) notFound();

  const { origin } = site();
  // No map is drawn until the operator records an embed template (DEC-0175).
  const map = await mapConfig(db());
  const path = '/centers/' + page.slug;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'مراکز دامپزشکی', path: '/centers' },
    { name: page.nameFa, path },
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-xl" data-testid="centre-page">
      <Breadcrumbs items={crumbs} origin={origin} />
      <JsonLdScript
        data={veterinaryCareLd(
          {
            name: page.nameFa,
            path,
            description: page.aboutFa,
            telephone: page.phone,
            website: page.websiteUrl,
            branches: page.branches.map((branch) => ({
              name: branch.nameFa,
              city: branch.cityNameFa,
              province: branch.provinceNameFa,
              address: branch.addressFa,
              telephone: branch.phone,
              latitude: branch.latitude,
              longitude: branch.longitude,
              isOpen24h: branch.isOpen24h,
              hours: branch.hours,
            })),
          },
          origin,
        )}
      />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{page.nameFa}</h1>
        <p className="text-body-md text-text-secondary">{page.typeFa}</p>
        {/* Each axis is its own badge; none of them implies another (P2-D05). */}
        <div className="flex flex-wrap gap-xs" data-testid="centre-badges">
          {page.verified ? (
            <span data-testid="centre-verified">
              <StatusBadge tone="info">مجوز معتبر ثبت‌شده</StatusBadge>
            </span>
          ) : null}
          {page.serves ? (
            <span data-testid="centre-serves">
              <StatusBadge tone="success">همکار خدمات همزیست</StatusBadge>
            </span>
          ) : null}
          {page.branches.some((branch) => branch.isOpen24h) ? <StatusBadge tone="neutral">شبانه‌روزی</StatusBadge> : null}
        </div>
      </header>

      {page.primary ? (
        <div data-testid="centre-merged">
          <Alert tone="warning" title="این رکورد تکراری بوده است">
            {DUPLICATE_NOTICE_FA}{' '}
            <Link href={'/centers/' + page.primary.slug} className="text-text-brand underline underline-offset-4">
              {page.primary.nameFa}
            </Link>
          </Alert>
        </div>
      ) : null}

      {page.owned ? null : (
        <div data-testid="centre-unowned">
          <Alert tone="info" title="این مرکز بدون مالک است">
            اطلاعات این صفحه از منبع عمومی ثبت و بررسی شده است و هنوز هیچ مدیری آن را به عهده نگرفته است.{' '}
            <Link
              href={'/account/centres/claim/' + page.slug}
              className="text-text-brand underline underline-offset-4"
              data-testid="centre-claim-link"
            >
              این مرکز شماست؟ درخواست مدیریت
            </Link>
          </Alert>
        </div>
      )}

      <dl className="grid gap-sm sm:grid-cols-2" data-testid="centre-facts">
        {page.phone ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">تلفن</dt>
            <dd className="text-label-md" dir="ltr" data-testid="centre-phone">
              <a href={'tel:' + page.phone}>{page.phone}</a>
            </dd>
          </div>
        ) : null}
        {page.websiteUrl ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">وب‌سایت</dt>
            <dd className="truncate text-label-md" dir="ltr">
              <a href={page.websiteUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-text-brand underline underline-offset-4">
                {page.websiteUrl}
              </a>
            </dd>
          </div>
        ) : null}
        {page.licence ? (
          <div className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
            <dt className="text-body-sm text-text-secondary">مجوز</dt>
            <dd className="text-label-md" data-testid="centre-licence">
              {page.licence.statusFa + (page.licence.number ? ' · ' + page.licence.number : '')}
            </dd>
          </div>
        ) : null}
        {page.servicesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">خدمات</dt>
            <dd className="mt-2xs text-label-md" data-testid="centre-services">
              {page.servicesFa.join('، ')}
            </dd>
          </div>
        ) : null}
        {page.speciesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">گونه‌هایی که پذیرفته می‌شوند</dt>
            <dd className="mt-2xs text-label-md" data-testid="centre-species">
              {page.speciesFa.join('، ')}
            </dd>
          </div>
        ) : null}
        {page.facilitiesFa.length > 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm sm:col-span-2">
            <dt className="text-body-sm text-text-secondary">امکانات</dt>
            <dd className="mt-2xs text-label-md" data-testid="centre-facilities">
              {page.facilitiesFa.join('، ')}
            </dd>
          </div>
        ) : null}
      </dl>

      {page.aboutFa ? (
        <section aria-labelledby="centre-about-title">
          <h2 id="centre-about-title" className="text-h4">
            معرفی
          </h2>
          <Prose text={page.aboutFa} />
        </section>
      ) : null}

      {page.branches.length === 0 && !page.listed ? null : (
        <section aria-labelledby="centre-branches-title">
          <h2 id="centre-branches-title" className="text-h4">
            شعبه‌ها
          </h2>
          {page.listed ? (
            <p className="mt-md flex flex-wrap items-center gap-2xs text-body-sm" data-testid="centre-listed-place">
              <Icon name="mapPin" size="xs" />
              {page.listed.provinceNameFa + ' · ' + page.listed.cityNameFa + (page.listed.contactFa ? ' · ' + page.listed.contactFa : '')}
            </p>
          ) : null}
          <ul className="mt-md space-y-sm" data-testid="centre-branches">
            {page.branches.map((branch) => (
              <li key={branch.id} className="rounded-lg border border-border-subtle bg-bg-surface p-md" data-testid="centre-branch">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <p className="text-label-lg">{branch.nameFa}</p>
                  {branch.isOpen24h ? <StatusBadge tone="info">شبانه‌روزی</StatusBadge> : null}
                </div>
                <p className="mt-2xs flex items-center gap-2xs text-body-sm text-text-secondary">
                  <Icon name="mapPin" size="xs" />
                  {[KIND_FA[branch.kind] ?? branch.kind, branch.provinceNameFa, branch.cityNameFa, branch.neighborhoodFa].filter(Boolean).join(' · ')}
                </p>
                {branch.addressFa ? <p className="mt-xs text-body-sm">{branch.addressFa}</p> : null}
                {branch.phone ? (
                  <p className="mt-xs text-body-sm">
                    {'تلفن: '}
                    <a href={'tel:' + branch.phone} dir="ltr">
                      {branch.phone}
                    </a>
                  </p>
                ) : null}
                {branch.latitude !== null && branch.longitude !== null ? (
                  <p className="mt-xs text-caption text-text-secondary" dir="ltr" data-testid="centre-branch-coordinates">
                    {branch.latitude.toFixed(5) + ', ' + branch.longitude.toFixed(5)}
                  </p>
                ) : null}
                {/* Only public branches reach this page, so the map may be drawn. */}
                <PlaceMap
                  nameFa={branch.nameFa}
                  isPublic
                  latitude={branch.latitude}
                  longitude={branch.longitude}
                  template={map.template}
                  apiKey={map.apiKey}
                  testId={'centre-branch-map-' + branch.id}
                />
                {branch.isOpen24h ? (
                  <p className="mt-xs text-body-sm" data-testid="centre-branch-hours">
                    ساعات اعلام‌شده: شبانه‌روزی
                  </p>
                ) : branch.hours.length > 0 ? (
                  <ul className="mt-xs space-y-2xs text-body-sm" data-testid="centre-branch-hours">
                    {branch.hours.map((hour) => (
                      <li key={hour.weekday} className="flex gap-md">
                        <span className="w-[5rem] text-text-secondary">{WEEKDAYS_FA[hour.weekday]}</span>
                        <span dir="ltr">{hour.opensAt + '–' + hour.closesAt}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {branch.hoursNoteFa ? <p className="mt-xs text-caption text-text-secondary">{branch.hoursNoteFa}</p> : null}
              </li>
            ))}
          </ul>
          <p className="mt-sm text-caption text-text-secondary">
            ساعات فقط برای اطلاع است. همزیست نوبت نمی‌دهد و درخواست خدمت از این صفحه ثبت نمی‌شود؛ پیش از مراجعه با مرکز تماس بگیرید.
            نقشه فقط محل اعلام‌شده شعبه‌های عمومی را نشان می‌دهد.
          </p>
        </section>
      )}

      {page.team.length > 0 ? (
        <section aria-labelledby="centre-team-title">
          <h2 id="centre-team-title" className="text-h4">
            تیم حرفه‌ای
          </h2>
          <ul className="mt-md space-y-sm" data-testid="centre-team">
            {page.team.map((member) => (
              <li key={member.nameFa + (member.slug ?? '')} className="rounded-md border border-border-subtle bg-bg-surface px-md py-sm">
                {member.slug ? (
                  <Link href={'/veterinarians/' + member.slug} className="text-label-md text-text-brand underline underline-offset-4">
                    {member.nameFa}
                  </Link>
                ) : (
                  <span className="text-label-md">{member.nameFa}</span>
                )}
                {member.roleFa ? <span className="text-caption text-text-secondary">{' · ' + member.roleFa}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
