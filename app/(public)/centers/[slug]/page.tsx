import type { Metadata } from 'next';
import { RelatedColumn } from '../../../../src/public/related-column.tsx';
import { relatedContent, similarCentres } from '../../../../src/public/related.ts';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
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
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
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
      image: page.imageFileId ? { path: '/media/' + page.imageFileId, alt: page.imageAltFa ?? page.nameFa } : undefined,
      // A merged duplicate keeps its address but points at the primary (§21).
      state: page.primary ? 'DUPLICATE' : 'PUBLISHED',
      primaryPath: page.primary ? '/centers/' + page.primary.slug : undefined,
    },
    site(),
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="hz-prose">
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
  const [similar, reading] = await Promise.all([
    similarCentres(db(), { excludeSlug: page.slug, limit: 4 }),
    relatedContent(db(), { limit: 3 }),
  ]);
  // No map is drawn until the operator records an embed template (DEC-0175).
  const map = await mapConfig(db());
  const path = '/centers/' + page.slug;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'مراکز دامپزشکی', path: '/centers' },
    { name: page.nameFa, path },
  ];

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={crumbs} origin={origin} />
        <PageHeader title={page.nameFa} meta={[page.typeFa]} />
      </div>
      <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <article className="min-w-0 space-y-xl" data-testid="centre-page">
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

          <RecordImage priority variant="banner" fileId={page.imageFileId} altFa={page.imageAltFa} className="rounded-xl" />

          {/* Each axis is shown on its own; none of them implies another (P2-D05). None is a lifecycle status: facts as tags/meta. */}
          <div className="flex flex-wrap items-center gap-xs" data-testid="centre-badges">
            {page.verified ? (
              <span className="hz-body-sm text-text-secondary" data-testid="centre-verified">
                مجوز معتبر ثبت‌شده
              </span>
            ) : null}
            {page.serves ? (
              <span className="hz-tag hz-tag--neutral" data-testid="centre-serves">
                همکار خدمات همزیست
              </span>
            ) : null}
            {page.branches.some((branch) => branch.isOpen24h) ? <span className="hz-tag hz-tag--neutral">شبانه‌روزی</span> : null}
          </div>

          {page.primary ? (
            <div data-testid="centre-merged">
              <Alert tone="warning" title="این رکورد تکراری بوده است">
                {DUPLICATE_NOTICE_FA}{' '}
                <Link href={'/centers/' + page.primary.slug} className="hz-link">
                  {page.primary.nameFa}
                </Link>
              </Alert>
            </div>
          ) : null}

          {page.owned ? null : (
            <div data-testid="centre-unowned">
              <Alert tone="info" title="این مرکز بدون مالک است">
                اطلاعات این صفحه از منبع عمومی ثبت و بررسی شده است و هنوز هیچ مدیری آن را به عهده نگرفته است.{' '}
                <Link href={'/account/centres/claim/' + page.slug} className="hz-link" data-testid="centre-claim-link">
                  این مرکز شماست؟ درخواست مدیریت
                </Link>
              </Alert>
            </div>
          )}

          <section aria-labelledby="centre-facts-title" className="hz-card">
            <SectionHeader size="sm" id="centre-facts-title" title="مشخصات" />
            <dl className="hz-kv" data-testid="centre-facts">
              {page.websiteUrl ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">وب‌سایت</dt>
                  <dd className="hz-kv__value truncate" dir="ltr">
                    <a href={page.websiteUrl} target="_blank" rel="nofollow noopener noreferrer" className="hz-link">
                      {page.websiteUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="hz-kv__row">
                <dt className="hz-kv__key">وضعیت پروانه</dt>
                {page.licence ? (
                  <dd className="hz-kv__value" data-testid="centre-licence">
                    {page.licence.statusFa}
                    {page.licence.number ? (
                      <>
                        {'، '}
                        <bdi className="hz-id" dir="ltr">
                          {page.licence.number}
                        </bdi>
                      </>
                    ) : null}
                  </dd>
                ) : (
                  <dd className="hz-kv__value hz-kv__value--empty">ثبت نشده</dd>
                )}
              </div>
              {page.servicesFa.length > 0 ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">خدمات</dt>
                  <dd className="hz-kv__value" data-testid="centre-services">
                    {page.servicesFa.join('، ')}
                  </dd>
                </div>
              ) : null}
              {page.speciesFa.length > 0 ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">گونه‌هایی که پذیرفته می‌شوند</dt>
                  <dd className="hz-kv__value" data-testid="centre-species">
                    {page.speciesFa.join('، ')}
                  </dd>
                </div>
              ) : null}
              {page.facilitiesFa.length > 0 ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">امکانات</dt>
                  <dd className="hz-kv__value" data-testid="centre-facilities">
                    {page.facilitiesFa.join('، ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {page.aboutFa ? (
            <section aria-labelledby="centre-about-title" className="hz-card">
              <SectionHeader size="sm" id="centre-about-title" title="معرفی" />
              <Prose text={page.aboutFa} />
            </section>
          ) : null}

          {page.branches.length === 0 && !page.listed ? null : (
            <section aria-labelledby="centre-branches-title" className="space-y-md">
              <SectionHeader id="centre-branches-title" title="شعبه‌ها" />
              {page.listed ? (
                <p className="hz-meta__item hz-body-sm" data-testid="centre-listed-place">
                  <Icon name="mapPin" size="xs" />
                  {page.listed.provinceNameFa + '، ' + page.listed.cityNameFa + (page.listed.contactFa ? '، ' + page.listed.contactFa : '')}
                </p>
              ) : null}
              <ul className="space-y-md" data-testid="centre-branches">
                {page.branches.map((branch) => (
                  <li key={branch.id} className="hz-card space-y-sm" data-testid="centre-branch">
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <h3 className="hz-card__title">{branch.nameFa}</h3>
                      {branch.isOpen24h ? <span className="hz-tag hz-tag--neutral">شبانه‌روزی</span> : null}
                    </div>
                    <p className="hz-entity__line hz-body-sm text-text-secondary">
                      <Icon name="mapPin" size="xs" />
                      {[KIND_FA[branch.kind] ?? branch.kind, branch.provinceNameFa, branch.cityNameFa, branch.neighborhoodFa].filter(Boolean).join('، ')}
                    </p>
                    {branch.addressFa ? <p className="hz-body-sm">{branch.addressFa}</p> : null}
                    {branch.phone ? (
                      <p className="hz-body-sm">
                        {'تلفن: '}
                        <a href={'tel:' + branch.phone} className="hz-link" dir="ltr">
                          {branch.phone}
                        </a>
                      </p>
                    ) : null}
                    {branch.latitude !== null && branch.longitude !== null ? (
                      <p className="hz-caption" dir="ltr" data-testid="centre-branch-coordinates">
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
                      <p className="hz-entity__line hz-body-sm" data-testid="centre-branch-hours">
                        <Icon name="clock" size="xs" />
                        ساعات اعلام‌شده: شبانه‌روزی
                      </p>
                    ) : branch.hours.length > 0 ? (
                      <dl className="hz-kv" data-testid="centre-branch-hours">
                        {branch.hours.map((hour) => (
                          <div key={hour.weekday} className="hz-kv__row">
                            <dt className="hz-kv__key">{WEEKDAYS_FA[hour.weekday]}</dt>
                            <dd className="hz-kv__value" dir="ltr">
                              {hour.opensAt + '–' + hour.closesAt}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {branch.hoursNoteFa ? <p className="hz-caption">{branch.hoursNoteFa}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="hz-caption">
                ساعات فقط برای اطلاع است. همزیست نوبت نمی‌دهد و درخواست خدمت از این صفحه ثبت نمی‌شود؛ پیش از مراجعه با مرکز تماس
                بگیرید. نقشه فقط محل اعلام‌شده شعبه‌های عمومی را نشان می‌دهد.
              </p>
            </section>
          )}

          {page.team.length > 0 ? (
            <section aria-labelledby="centre-team-title" className="hz-card">
              <SectionHeader size="sm" id="centre-team-title" title="تیم حرفه‌ای" />
              <ul className="divide-y divide-border-subtle" data-testid="centre-team">
                {page.team.map((member) => (
                  <li key={member.nameFa + (member.slug ?? '')} className="py-sm hz-body-sm">
                    {member.slug ? (
                      <Link href={'/veterinarians/' + member.slug} className="hz-link font-bold">
                        {member.nameFa}
                      </Link>
                    ) : (
                      <span className="font-bold">{member.nameFa}</span>
                    )}
                    {member.roleFa ? <span className="text-text-secondary">{'، ' + member.roleFa}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        <div className="hz-reading__aside min-w-0 space-y-xl">
          <aside className="hz-card space-y-md" aria-labelledby="centre-contact-title">
            <SectionHeader size="sm" id="centre-contact-title" title="تماس" />
            {page.phone ? (
              <p className="hz-entity__line hz-body">
                <Icon name="phone" size="sm" />
                <span>
                  {'تلفن: '}
                  <a href={'tel:' + page.phone} className="hz-link" dir="ltr" data-testid="centre-phone">
                    {page.phone}
                  </a>
                </span>
              </p>
            ) : (
              <p className="hz-body-sm text-text-secondary">مرکز شماره تماس عمومی ثبت نکرده است؛ تلفن شعبه‌ها را ببینید.</p>
            )}
          </aside>
          <RelatedColumn
            groups={[
              { titleFa: 'مراکز مشابه', items: similar, link: { href: '/centers', label: 'همه مراکز' } },
              { titleFa: 'خواندنی‌ها', items: reading, noteAsTag: true, link: { href: '/articles', label: 'همه آموزش‌ها' } },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
