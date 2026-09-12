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

const CONTROL =
  'w-full rounded-md border border-border-subtle bg-bg-surface px-md py-sm text-body-sm text-text-primary ' +
  'min-h-[var(--size-control-md)] focus:border-border-brand';

function Filter({
  id,
  label,
  value,
  all,
  options,
}: {
  id: Key;
  label: string;
  value: string | null;
  all: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-xs">
      <label htmlFor={'centre-' + id} className="block text-label-md">
        {label}
      </label>
      <select id={'centre-' + id} name={id} defaultValue={value ?? ''} className={CONTROL} data-testid={'centre-filter-' + id}>
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Centre directory — Requirements-Phase-2 §9 (PROMPT-008). */
export default async function CentersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, reference] = await Promise.all([publishedCentres(db(), query), centreReferenceData(db())]);
  const { origin } = site();
  const provinceName = new Map(reference.provinces.map((row) => [row.code, row.nameFa]));
  const filtered =
    query.term !== '' || query.open24h || query.verified || [query.type, query.service, query.species, query.province, query.cityId].some(Boolean);

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

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          مرکز را با نوع، خدمت، گونه و شهر پیدا کنید. این فهرست معرفی است؛ نوبت‌دهی و درخواست خدمت از اینجا انجام نمی‌شود.
        </p>
        <p className="text-body-sm text-text-secondary">
          مرکزی را اینجا پیدا نکردید؟{' '}
          <Link href="/account/suggestions" className="text-text-brand underline underline-offset-4" data-testid="suggest-centre-link">
            آن را به همزیست معرفی کنید
          </Link>
          .
        </p>
      </header>

      <form
        method="get"
        action="/centers"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        data-testid="centre-search"
      >
        <div className="space-y-xs">
          <label htmlFor="centre-q" className="block text-label-md">
            نام مرکز یا شعبه
          </label>
          <input id="centre-q" name="q" type="search" defaultValue={query.term} className={CONTROL} data-testid="centre-filter-q" />
        </div>
        <Filter id="type" label="نوع مرکز" all="همه انواع" value={query.type} options={reference.types.map((row) => ({ value: row.code, label: row.nameFa }))} />
        <Filter
          id="service"
          label="خدمت"
          all="همه خدمات"
          value={query.service}
          options={reference.services.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="species"
          label="گونه"
          all="همه گونه‌ها"
          value={query.species}
          options={reference.species.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="province"
          label="استان"
          all="همه استان‌ها"
          value={query.province}
          options={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="city"
          label="شهر"
          all="همه شهرها"
          value={query.cityId}
          options={reference.cities
            .filter((city) => !query.province || city.provinceCode === query.province)
            .map((city) => ({ value: city.id, label: city.nameFa + ' — ' + (provinceName.get(city.provinceCode) ?? '') }))}
        />
        <div className="space-y-xs">
          <span className="block text-label-md">فیلترهای دیگر</span>
          <label className="flex min-h-[var(--size-control-sm)] items-center gap-sm text-body-sm">
            <input type="checkbox" name="open24h" value="1" defaultChecked={query.open24h} className="size-[18px]" data-testid="centre-filter-open24h" />
            شبانه‌روزی
          </label>
          <label className="flex min-h-[var(--size-control-sm)] items-center gap-sm text-body-sm">
            <input type="checkbox" name="verified" value="1" defaultChecked={query.verified} className="size-[18px]" data-testid="centre-filter-verified" />
            مجوز معتبر ثبت‌شده
          </label>
        </div>
        <Button type="submit" data-testid="centre-search-submit">
          جست‌وجو
        </Button>
      </form>

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
        <section aria-labelledby="centre-results-title">
          <h2 id="centre-results-title" className="text-body-sm text-text-secondary" data-testid="centre-count">
            {fa(result.total) + ' مرکز' + (filtered ? ' با این فیلترها' : '')}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="centre-results">
            {result.items.map((centre) => (
              <li key={centre.slug}>
                <Link
                  href={'/centers/' + centre.slug}
                  className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'centre-card-' + centre.slug}
                >
                  {centre.imageFileId !== null ? (
                    <RecordImage variant="thumb" fileId={centre.imageFileId} altFa={centre.imageAltFa} />
                  ) : (
                    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                      <Icon name="mapPin" size="md" />
                    </span>
                  )}
                  <span className="min-w-0 space-y-xs">
                    <span className="block text-label-lg text-text-primary">{centre.nameFa}</span>
                    <span className="block text-caption text-text-secondary">{centre.typeFa}</span>
                    {centre.servicesFa.length > 0 ? (
                      <span className="block text-caption text-text-secondary">{centre.servicesFa.slice(0, 4).join('، ')}</span>
                    ) : null}
                    {centre.placesFa.length > 0 ? (
                      <span className="flex items-center gap-2xs text-caption text-text-secondary">
                        <Icon name="mapPin" size="xs" />
                        {centre.placesFa.join('، ')}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-xs pt-2xs">
                      {centre.promoted ? (
                        <span data-testid={'promoted-' + centre.slug}>
                          <StatusBadge tone="info">تبلیغ</StatusBadge>
                        </span>
                      ) : null}
                      {centre.owned ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                      {centre.verified ? <StatusBadge tone="info">مجوز معتبر</StatusBadge> : null}
                      {centre.open24h ? <StatusBadge tone="neutral">شبانه‌روزی</StatusBadge> : null}
                      {centre.serves ? <StatusBadge tone="success">همکار خدمات همزیست</StatusBadge> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی مراکز" className="mt-lg flex items-center justify-between gap-md">
              {result.page > 1 ? (
                <ButtonLink tone="secondary" href={hrefFor(result.page - 1)}>
                  صفحه قبل
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
              {result.page < result.totalPages ? (
                <ButtonLink tone="secondary" href={hrefFor(result.page + 1)}>
                  صفحه بعد
                </ButtonLink>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
