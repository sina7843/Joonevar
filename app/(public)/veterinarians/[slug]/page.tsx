import type { Metadata } from 'next';
import { RelatedColumn } from '../../../../src/public/related-column.tsx';
import { similarCentres, similarVets } from '../../../../src/public/related.ts';
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
import { SectionHeader } from '../../../../src/ui/section-header.tsx';
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
    <div className="hz-prose">
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
  const [vets, centres] = await Promise.all([
    similarVets(db(), { excludeSlug: page.slug, limit: 4 }),
    similarCentres(db(), { limit: 3 }),
  ]);
  // No map is drawn until the operator records an embed template (DEC-0175).
  const map = await mapConfig(db());
  const path = '/veterinarians/' + page.slug;
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'دامپزشکان', path: '/veterinarians' },
    { name: page.nameFa, path },
  ];

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={crumbs} origin={origin} />
      <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <article className="min-w-0 space-y-xl" data-testid="vet-page">
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

          <header className="hz-vet items-center">
            <RecordImage priority variant="avatar" fileId={page.imageFileId} altFa={page.imageAltFa} className="size-[88px]" />
            <div className="hz-vet__body gap-xs">
              <h1 className="hz-h2">{page.nameFa}</h1>
              {page.headlineFa ? <p className="hz-body text-text-secondary">{page.headlineFa}</p> : null}
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
            </div>
          </header>

          {page.owned ? null : (
            <div data-testid="vet-unowned">
              <Alert tone="info" title="این پروفایل بدون مالک است">
                اطلاعات این صفحه از منبع عمومی ثبت و بررسی شده است و هنوز هیچ دامپزشکی مدیریت آن را به عهده نگرفته است. کد نظام آن
                تأیید نشده است.{' '}
                <Link href={'/account/vet-profile/claim/' + page.slug} className="hz-link" data-testid="vet-claim-link">
                  این پروفایل شماست؟ درخواست Claim
                </Link>
              </Alert>
            </div>
          )}

          {page.primary ? (
            <div data-testid="vet-merged">
              <Alert tone="warning" title="این رکورد تکراری بوده است">
                {DUPLICATE_NOTICE_FA}{' '}
                <Link href={'/veterinarians/' + page.primary.slug} className="hz-link">
                  {page.primary.nameFa}
                </Link>
              </Alert>
            </div>
          ) : null}

          <section aria-labelledby="vet-facts-title" className="hz-card">
            <SectionHeader size="sm" id="vet-facts-title" title="مشخصات" />
            <dl className="hz-kv" data-testid="vet-facts">
              {page.councilCode ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">کد نظام دامپزشکی</dt>
                  <dd className="hz-kv__value">
                    <bdi className="hz-id" dir="ltr" data-testid="vet-council-code">
                      {page.councilCode}
                    </bdi>
                  </dd>
                </div>
              ) : null}
              <div className="hz-kv__row">
                <dt className="hz-kv__key">تخصص‌ها</dt>
                {page.specialtiesFa.length > 0 ? (
                  <dd className="hz-kv__value" data-testid="vet-specialties">
                    {page.specialtiesFa.join('، ')}
                  </dd>
                ) : (
                  <dd className="hz-kv__value hz-kv__value--empty">تعیین‌نشده</dd>
                )}
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">گونه‌هایی که پذیرفته می‌شوند</dt>
                {page.speciesFa.length > 0 ? (
                  <dd className="hz-kv__value" data-testid="vet-species">
                    {page.speciesFa.join('، ')}
                  </dd>
                ) : (
                  <dd className="hz-kv__value hz-kv__value--empty">تعیین‌نشده</dd>
                )}
              </div>
            </dl>
          </section>

          {page.bioFa ? (
            <section aria-labelledby="vet-bio-title" className="hz-card">
              <SectionHeader size="sm" id="vet-bio-title" title="معرفی" />
              <Prose text={page.bioFa} />
            </section>
          ) : null}

          {page.experienceFa ? (
            <section aria-labelledby="vet-experience-title" className="hz-card">
              <SectionHeader size="sm" id="vet-experience-title" title="سوابق" />
              <Prose text={page.experienceFa} />
            </section>
          ) : null}

          {page.locations.length === 0 && !page.listed ? null : (
            <section aria-labelledby="vet-locations-title" className="space-y-md">
              <SectionHeader id="vet-locations-title" title="محل‌های کار" />
              {page.listed ? (
                <p className="hz-meta__item hz-body-sm" data-testid="vet-listed-place">
                  <Icon name="mapPin" size="xs" />
                  {page.listed.provinceNameFa + '، ' + page.listed.cityNameFa + (page.listed.contactFa ? '، ' + page.listed.contactFa : '')}
                </p>
              ) : null}
              <ul className="space-y-md" data-testid="vet-locations">
                {page.locations.map((location) => (
                  <li key={location.id} className="hz-card space-y-sm" data-testid="vet-location">
                    <h3 className="hz-card__title">{location.nameFa}</h3>
                    <p className="hz-entity__line hz-body-sm text-text-secondary">
                      <Icon name="mapPin" size="xs" />
                      {[LOCATION_KIND_FA[location.kind], location.provinceNameFa, location.cityNameFa, location.neighborhoodFa]
                        .filter(Boolean)
                        .join('، ')}
                    </p>
                    {location.addressFa ? <p className="hz-body-sm">{location.addressFa}</p> : null}
                    {location.phone ? (
                      <p className="hz-body-sm">
                        {'تلفن: '}
                        <a href={'tel:' + location.phone} className="hz-link" dir="ltr">
                          {location.phone}
                        </a>
                      </p>
                    ) : null}
                    {location.hoursNoteFa ? (
                      <p className="hz-entity__line hz-body-sm" data-testid="vet-location-hours">
                        <Icon name="clock" size="xs" />
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
              <p className="hz-caption">
                ساعات فقط برای اطلاع است. همزیست نوبت نمی‌دهد و درخواست خدمت از این صفحه ثبت نمی‌شود؛ پیش از مراجعه با محل کار
                تماس بگیرید.
              </p>
            </section>
          )}
        </article>

        <div className="hz-reading__aside min-w-0 space-y-xl">
          <aside className="hz-card space-y-md" aria-labelledby="vet-contact-title">
            <SectionHeader size="sm" id="vet-contact-title" title="تماس" />
            {page.phone ? (
              <p className="hz-entity__line hz-body">
                <Icon name="phone" size="sm" />
                <span>
                  {'تلفن عمومی: '}
                  <a href={'tel:' + page.phone} className="hz-link" dir="ltr" data-testid="vet-phone">
                    {page.phone}
                  </a>
                </span>
              </p>
            ) : (
              <p className="hz-body-sm text-text-secondary">دامپزشک شماره تماس عمومی ثبت نکرده است؛ از محل کار تماس بگیرید.</p>
            )}
          </aside>
          <RelatedColumn
            groups={[
              { titleFa: 'دامپزشکان مشابه', items: vets, link: { href: '/veterinarians', label: 'همه دامپزشکان' } },
              { titleFa: 'مراکز دامپزشکی', items: centres, link: { href: '/centers', label: 'همه مراکز' } },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
