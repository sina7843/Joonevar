import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { centreReferenceData, publishedCentres } from '../../../../src/centres/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';
import { FilterChips } from '../../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { FilterPanel, FilterSelect } from '../../public-ui.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';

const TITLE = 'مراکز دامپزشکی';
const DESCRIPTION =
  'بیمارستان، کلینیک، درمانگاه، آزمایشگاه، تصویربرداری و داروخانه دامپزشکی با خدمات، گونه‌ها، شعبه‌ها، ساعات اعلام‌شده و وضعیت مجوز.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/centers' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Key = 'q' | 'type' | 'service' | 'species' | 'province' | 'city' | 'open24h' | 'verified' | 'page';
type Search = Partial<Record<Key, string | string[]>>;

const one = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const fa = (value: number): string => value.toLocaleString('fa-IR');
const matching = (value: string, pattern: RegExp): string | null => (pattern.test(value) ? value : null);

function parseQuery(search: Search) {
  const page = Number(one(search.page));
  return {
    term: one(search.q).slice(0, 80),
    type: matching(one(search.type), /^[A-Z_]{2,40}$/),
    service: matching(one(search.service), /^[A-Z_]{2,40}$/),
    species: matching(one(search.species), /^[A-Z_]{2,20}$/),
    province: matching(one(search.province), /^[a-z-]{2,40}$/),
    cityId: matching(one(search.city), UUID),
    open24h: one(search.open24h) === '1',
    verified: one(search.verified) === '1',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  } as const;
}

export function generateMetadata(): Metadata {
  // Filters and later pages are views of one list and share its canonical (§19).
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/centers' }, site());
}

/** Centre directory — Requirements-Phase-2 §9 (PROMPT-008), drawn as DS P02 with CenterCards. */
export default async function CentersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, reference] = await Promise.all([publishedCentres(db(), query), centreReferenceData(db())]);
  const { origin } = site();
  const provinceName = new Map(reference.provinces.map((row) => [row.code, row.nameFa]));
  const filtered =
    query.term !== '' || query.open24h || query.verified || [query.type, query.service, query.species, query.province, query.cityId].some(Boolean);
  const FORM = 'centre-search-form';

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['type', query.type],
      ['service', query.service],
      ['species', query.species],
      ['province', query.province],
      ['city', query.cityId],
      ['open24h', query.open24h ? '1' : null],
      ['verified', query.verified ? '1' : null],
    ];
    for (const [key, value] of pairs) if (value) params.set(key, value);
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/centers' + (encoded === '' ? '' : '?' + encoded);
  };
  const toggleHref = (key: 'open24h' | 'verified'): string => {
    const target = new URL('http://x' + hrefFor(1));
    if (query[key]) target.searchParams.delete(key);
    else target.searchParams.set(key, '1');
    return target.pathname + target.search;
  };

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={['مرکز را با نوع، خدمت، گونه و شهر پیدا کنید. این فهرست معرفی است؛ نوبت‌دهی و درخواست خدمت از اینجا انجام نمی‌شود.']}
        />
        <p className="hz-body-sm text-text-secondary">
          مرکزی را اینجا پیدا نکردید؟{' '}
          <Link href="/account/suggestions" className="hz-link" data-testid="suggest-centre-link">
            آن را به همزیست معرفی کنید
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="فیلترهای مراکز" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <FilterPanel
            clearHref="/centers"
            active={filtered}
            footer={
              <Button type="submit" tone="secondary" size="sm" form={FORM}>
                اعمال فیلترها
              </Button>
            }
          >
            <FilterSelect id="centre-type" form={FORM} name="type" label="نوع مرکز" all="همه انواع" value={query.type} testId="centre-filter-type"
              options={reference.types.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="centre-service" form={FORM} name="service" label="خدمت" all="همه خدمات" value={query.service} testId="centre-filter-service"
              options={reference.services.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="centre-species" form={FORM} name="species" label="گونه" all="همه گونه‌ها" value={query.species} testId="centre-filter-species"
              options={reference.species.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="centre-province" form={FORM} name="province" label="استان" all="همه استان‌ها" value={query.province} testId="centre-filter-province"
              options={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="centre-city" form={FORM} name="city" label="شهر" all="همه شهرها" value={query.cityId} testId="centre-filter-city"
              options={reference.cities
                .filter((city) => !query.province || city.provinceCode === query.province)
                .map((city) => ({ value: city.id, label: city.nameFa + ' — ' + (provinceName.get(city.provinceCode) ?? '') }))} />
            <fieldset className="hz-filter-group">
              <legend className="hz-filter-group__title">فیلترهای دیگر</legend>
              <label className="hz-check">
                <input type="checkbox" form={FORM} name="open24h" value="1" defaultChecked={query.open24h} data-testid="centre-filter-open24h" />
                <span className="hz-check__text">
                  <span className="hz-check__label">شبانه‌روزی</span>
                </span>
              </label>
              <label className="hz-check">
                <input type="checkbox" form={FORM} name="verified" value="1" defaultChecked={query.verified} data-testid="centre-filter-verified" />
                <span className="hz-check__text">
                  <span className="hz-check__label">مجوز معتبر ثبت‌شده</span>
                </span>
              </label>
            </fieldset>
          </FilterPanel>
        </aside>

        <div className="min-w-0 space-y-lg lg:col-start-2 lg:row-start-1">
          <form id={FORM} method="get" action="/centers" role="search" className="flex gap-sm" data-testid="centre-search">
            <SearchField id="centre-q" name="q" label="نام مرکز یا شعبه" defaultValue={query.term} className="min-w-0 flex-1" data-testid="centre-filter-q" />
            <Button type="submit" tone="secondary" data-testid="centre-search-submit">
              جست‌وجو
            </Button>
          </form>

          <FilterChips
            label="فیلترهای سریع"
            chips={[
              { key: 'open24h', href: toggleHref('open24h'), label: 'شبانه‌روزی', current: query.open24h },
              { key: 'verified', href: toggleHref('verified'), label: 'مجوز معتبر', current: query.verified },
            ]}
          />

          {result.publishedTotal === 0 ? (
            <EmptyState title="هنوز مرکزی منتشر نشده است" description="هر مرکز پس از ثبت شعبه و بررسی اطلاعاتش در این فهرست می‌آید." />
          ) : result.items.length === 0 ? (
            <EmptyState
              title="مرکزی با این جست‌وجو پیدا نشد"
              description="فیلتری را بردارید یا شهر و خدمت دیگری امتحان کنید."
              action={
                <ButtonLink tone="secondary" href="/centers">
                  نمایش همه مراکز
                </ButtonLink>
              }
            />
          ) : (
            <section aria-labelledby="centre-results-title" className="space-y-lg">
              <h2 id="centre-results-title" className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="centre-count">
                {fa(result.total) + ' مرکز' + (filtered ? ' با این فیلترها' : '')}
              </h2>
              <ul className="grid gap-s20 md:grid-cols-2 xl:grid-cols-3" data-testid="centre-results">
                {result.items.map((centre) => (
                  <li key={centre.slug}>
                    <Link href={'/centers/' + centre.slug} className="hz-card hz-card--flush hz-card--interactive hz-centre h-full" data-testid={'centre-card-' + centre.slug}>
                      <RecordImage variant="3x2" fileId={centre.imageFileId} altFa={centre.imageAltFa} />
                      <div className="hz-card__section hz-centre__body">
                        <span className="hz-centre__type">{centre.typeFa}</span>
                        <h3 className="hz-centre__name">{centre.nameFa}</h3>
                        {centre.placesFa.length > 0 ? (
                          <span className="hz-entity__line">
                            <Icon name="mapPin" size="xs" />
                            {centre.placesFa.join('، ')}
                          </span>
                        ) : null}
                        {centre.servicesFa.length > 0 ? (
                          <ul className="hz-tag-list" aria-label="خدمات">
                            {centre.servicesFa.slice(0, 4).map((service) => (
                              <li key={service} className="hz-tag hz-tag--neutral">
                                {service}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {centre.promoted || !centre.owned || centre.open24h || centre.serves ? (
                          <span className="flex flex-wrap gap-xs">
                            {centre.promoted ? (
                              <span data-testid={'promoted-' + centre.slug}>
                                <StatusBadge tone="info" size="sm">
                                  تبلیغ
                                </StatusBadge>
                              </span>
                            ) : null}
                            {centre.owned ? null : (
                              <StatusBadge tone="warning" size="sm">
                                بدون مالک
                              </StatusBadge>
                            )}
                            {centre.open24h ? (
                              <StatusBadge tone="neutral" size="sm">
                                شبانه‌روزی
                              </StatusBadge>
                            ) : null}
                            {centre.serves ? (
                              <StatusBadge tone="success" size="sm">
                                همکار خدمات همزیست
                              </StatusBadge>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      <div className="hz-card__section hz-centre__foot">
                        پروانه فعالیت
                        {centre.verified ? (
                          <StatusBadge tone="success" size="sm">
                            مجوز معتبر
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral" size="sm">
                            ثبت نشده
                          </StatusBadge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                totalPages={result.totalPages}
                hrefFor={hrefFor}
                label="صفحه‌بندی مراکز"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
