import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { directoryReferenceData, publishedVets } from '../../../../src/vets/directory.ts';
import { LOCATION_KIND_FA } from '../../../../src/vets/directory-model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge, TrustedMark } from '../../../../src/ui/status.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';
import { FilterChips } from '../../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { FilterPanel, FilterSelect } from '../../public-ui.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';

const TITLE = 'دامپزشکان';
const DESCRIPTION =
  'فهرست دامپزشکان همزیست با تخصص، گونه‌هایی که می‌پذیرند، استان و شهر محل کار و وضعیت تأیید کد نظام دامپزشکی.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/veterinarians' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['CLINIC', 'HOSPITAL', 'CENTRE'] as const;

type Key = 'q' | 'specialty' | 'species' | 'province' | 'city' | 'kind' | 'status' | 'page';
type Search = Partial<Record<Key, string | string[]>>;

const one = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const fa = (value: number): string => value.toLocaleString('fa-IR');
const matching = (value: string, pattern: RegExp): string | null => (pattern.test(value) ? value : null);

function parseQuery(search: Search) {
  const page = Number(one(search.page));
  const kind = one(search.kind);
  const status = one(search.status);
  return {
    term: one(search.q).slice(0, 80),
    specialty: matching(one(search.specialty), /^[A-Z_]{2,40}$/),
    species: matching(one(search.species), /^[A-Z_]{2,20}$/),
    province: matching(one(search.province), /^[a-z-]{2,40}$/),
    cityId: matching(one(search.city), UUID),
    kind: (KINDS as readonly string[]).includes(kind) ? kind : null,
    status: status === 'VERIFIED' || status === 'TRUSTED' ? status : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  } as const;
}

export function generateMetadata(): Metadata {
  // Filters and later pages are views of one list and share its canonical (§19).
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/veterinarians' }, site());
}

/** Veterinary directory — Requirements-Phase-2 §7 (PROMPT-006). */
export default async function VeterinariansPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, reference] = await Promise.all([publishedVets(db(), query), directoryReferenceData(db())]);
  const { origin } = site();
  const provinceName = new Map(reference.provinces.map((p) => [p.code, p.nameFa]));
  const filtered = query.term !== '' || [query.specialty, query.species, query.province, query.cityId, query.kind, query.status].some(Boolean);

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['specialty', query.specialty],
      ['species', query.species],
      ['province', query.province],
      ['city', query.cityId],
      ['kind', query.kind],
      ['status', query.status],
    ];
    for (const [key, value] of pairs) if (value) params.set(key, value);
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/veterinarians' + (encoded === '' ? '' : '?' + encoded);
  };

  const FORM = 'vet-search-form';
  const statusHref = (status: string | null): string => {
    const target = new URL('http://x' + hrefFor(1));
    if (status) target.searchParams.set('status', status);
    else target.searchParams.delete('status');
    return target.pathname + target.search;
  };

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={['دامپزشک را با تخصص، گونه و شهر محل کار پیدا کنید. این فهرست معرفی است؛ نوبت‌دهی و درخواست خدمت از اینجا انجام نمی‌شود.']}
        />
        <p className="hz-body-sm text-text-secondary">
          دامپزشکی را اینجا پیدا نکردید؟{' '}
          <Link href="/account/suggestions" className="hz-link" data-testid="suggest-vet-link">
            او را به همزیست معرفی کنید
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-lg lg:col-start-2 lg:row-start-1">
          <form id={FORM} method="get" action="/veterinarians" role="search" className="flex gap-sm" data-testid="vet-search">
            <SearchField
              id="vet-q"
              name="q"
              label="نام دامپزشک یا محل کار"
              defaultValue={query.term}
              className="min-w-0 flex-1"
              data-testid="vet-filter-q"
            />
            <Button type="submit" tone="secondary" data-testid="vet-search-submit">
              جست‌وجو
            </Button>
          </form>

          <FilterChips
            label="فیلترهای سریع"
            chips={[
              { key: 'all', href: statusHref(null), label: 'همه', current: query.status === null },
              { key: 'TRUSTED', href: statusHref('TRUSTED'), label: 'معتمد همزیست', current: query.status === 'TRUSTED' },
              { key: 'VERIFIED', href: statusHref('VERIFIED'), label: 'کد نظام تأییدشده', current: query.status === 'VERIFIED' },
            ]}
          />

          {result.publishedTotal === 0 ? (
            <EmptyState
              title="هنوز پروفایل دامپزشکی منتشر نشده است"
              description="پروفایل هر دامپزشک پس از بررسی اطلاعات و محل کارش در این فهرست منتشر می‌شود."
            />
          ) : result.items.length === 0 ? (
            <EmptyState
              title="دامپزشکی با این جست‌وجو پیدا نشد"
              description="فیلتری را بردارید یا شهر و تخصص دیگری امتحان کنید."
              action={
                <ButtonLink tone="secondary" href="/veterinarians">
                  نمایش همه دامپزشکان
                </ButtonLink>
              }
            />
          ) : (
            <section aria-labelledby="vet-results-title" className="space-y-lg">
              <h2 id="vet-results-title" className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="vet-count">
                {fa(result.total) + ' دامپزشک' + (filtered ? ' با این فیلترها' : '')}
              </h2>
              <ul className="grid gap-s20 md:grid-cols-2" data-testid="vet-results">
                {result.items.map((vet) => (
                  <li key={vet.slug}>
                    <Link href={'/veterinarians/' + vet.slug} className="hz-card hz-card--interactive block h-full" data-testid={'vet-card-' + vet.slug}>
                      <div className="hz-vet">
                        <RecordImage variant="avatar" fileId={vet.imageFileId} altFa={vet.imageAltFa} />
                        <div className="hz-vet__body">
                          <h3 className="hz-vet__name">
                            {vet.nameFa}
                            {vet.trusted ? <TrustedMark /> : null}
                          </h3>
                          {vet.headlineFa ? <span className="hz-vet__meta">{vet.headlineFa}</span> : null}
                          {vet.specialtiesFa.length > 0 ? <span className="hz-vet__meta">{'تخصص: ' + vet.specialtiesFa.join('، ')}</span> : null}
                          {vet.placesFa.length > 0 ? (
                            <span className="hz-vet__meta hz-meta__item">
                              <Icon name="mapPin" size="xs" />
                              {vet.placesFa.join('، ')}
                            </span>
                          ) : null}
                          {vet.verified ? <span className="hz-vet__meta">کد نظام تأییدشده</span> : null}
                          {vet.promoted ? (
                            <span className="mt-xs flex flex-wrap gap-xs">
                              <span data-testid={'promoted-' + vet.slug}>
                                <StatusBadge tone="info" size="sm">
                                  تبلیغ
                                </StatusBadge>
                              </span>
                            </span>
                          ) : null}
                        </div>
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
                label="صفحه‌بندی دامپزشکان"
              />
            </section>
          )}
        </div>

        <aside aria-label="فیلترهای دامپزشکان" className="order-first min-w-0 lg:order-none lg:col-start-1 lg:row-start-1">
          <FilterPanel
            clearHref="/veterinarians"
            active={filtered}
            formId={FORM}
          >
            <FilterSelect
              id="vet-specialty"
              form={FORM}
              name="specialty"
              label="تخصص"
              all="همه تخصص‌ها"
              value={query.specialty}
              testId="vet-filter-specialty"
              options={reference.specialties.map((s) => ({ value: s.code, label: s.nameFa }))}
            />
            <FilterSelect
              id="vet-species"
              form={FORM}
              name="species"
              label="گونه"
              all="همه گونه‌ها"
              value={query.species}
              testId="vet-filter-species"
              options={reference.species.map((s) => ({ value: s.code, label: s.nameFa }))}
            />
            <FilterSelect
              id="vet-province"
              form={FORM}
              name="province"
              label="استان"
              all="همه استان‌ها"
              value={query.province}
              testId="vet-filter-province"
              options={reference.provinces.map((p) => ({ value: p.code, label: p.nameFa }))}
            />
            <FilterSelect
              id="vet-city"
              form={FORM}
              name="city"
              label="شهر"
              all="همه شهرها"
              value={query.cityId}
              testId="vet-filter-city"
              options={reference.cities
                .filter((c) => !query.province || c.provinceCode === query.province)
                .map((c) => ({ value: c.id, label: c.nameFa + ' — ' + (provinceName.get(c.provinceCode) ?? '') }))}
            />
            <FilterSelect
              id="vet-kind"
              form={FORM}
              name="kind"
              label="نوع محل کار"
              all="همه انواع"
              value={query.kind}
              testId="vet-filter-kind"
              options={KINDS.map((kind) => ({ value: kind, label: LOCATION_KIND_FA[kind] }))}
            />
            <FilterSelect
              id="vet-status"
              form={FORM}
              name="status"
              label="وضعیت تأیید"
              all="همه"
              value={query.status}
              testId="vet-filter-status"
              options={[
                { value: 'VERIFIED', label: 'کد نظام تأییدشده' },
                { value: 'TRUSTED', label: 'دامپزشک معتمد همزیست' },
              ]}
            />
          </FilterPanel>
        </aside>
      </div>
    </div>
  );
}
