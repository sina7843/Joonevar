import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { directoryReferenceData, publishedVets } from '../../../../src/vets/directory.ts';
import { LOCATION_KIND_FA } from '../../../../src/vets/directory-model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

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
      <label htmlFor={'vet-' + id} className="block text-label-md">
        {label}
      </label>
      <select id={'vet-' + id} name={id} defaultValue={value ?? ''} className={CONTROL} data-testid={'vet-filter-' + id}>
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

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          دامپزشک را با تخصص، گونه و شهر محل کار پیدا کنید. این فهرست معرفی است؛ نوبت‌دهی و درخواست خدمت از اینجا انجام
          نمی‌شود.
        </p>
      </header>

      <form
        method="get"
        action="/veterinarians"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        data-testid="vet-search"
      >
        <div className="space-y-xs">
          <label htmlFor="vet-q" className="block text-label-md">
            نام دامپزشک یا محل کار
          </label>
          <input
            id="vet-q"
            name="q"
            type="search"
            defaultValue={query.term}
            className={CONTROL}
            data-testid="vet-filter-q"
          />
        </div>
        <Filter
          id="specialty"
          label="تخصص"
          all="همه تخصص‌ها"
          value={query.specialty}
          options={reference.specialties.map((s) => ({ value: s.code, label: s.nameFa }))}
        />
        <Filter
          id="species"
          label="گونه"
          all="همه گونه‌ها"
          value={query.species}
          options={reference.species.map((s) => ({ value: s.code, label: s.nameFa }))}
        />
        <Filter
          id="province"
          label="استان"
          all="همه استان‌ها"
          value={query.province}
          options={reference.provinces.map((p) => ({ value: p.code, label: p.nameFa }))}
        />
        <Filter
          id="city"
          label="شهر"
          all="همه شهرها"
          value={query.cityId}
          options={reference.cities
            .filter((c) => !query.province || c.provinceCode === query.province)
            .map((c) => ({ value: c.id, label: c.nameFa + ' — ' + (provinceName.get(c.provinceCode) ?? '') }))}
        />
        <Filter
          id="kind"
          label="نوع محل کار"
          all="همه انواع"
          value={query.kind}
          options={KINDS.map((kind) => ({ value: kind, label: LOCATION_KIND_FA[kind] }))}
        />
        <Filter
          id="status"
          label="وضعیت تأیید"
          all="همه"
          value={query.status}
          options={[
            { value: 'VERIFIED', label: 'کد نظام تأییدشده' },
            { value: 'TRUSTED', label: 'دامپزشک معتمد همزیست' },
          ]}
        />
        <Button type="submit" data-testid="vet-search-submit">
          جست‌وجو
        </Button>
      </form>

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
        <section aria-labelledby="vet-results-title">
          <h2 id="vet-results-title" className="text-body-sm text-text-secondary" data-testid="vet-count">
            {fa(result.total) + ' دامپزشک' + (filtered ? ' با این فیلترها' : '')}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="vet-results">
            {result.items.map((vet) => (
              <li key={vet.slug}>
                <Link
                  href={'/veterinarians/' + vet.slug}
                  className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'vet-card-' + vet.slug}
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                    <Icon name="firstAidKit" size="md" />
                  </span>
                  <span className="min-w-0 space-y-xs">
                    <span className="block text-label-lg text-text-primary">{vet.nameFa}</span>
                    {vet.headlineFa ? <span className="block text-body-sm text-text-secondary">{vet.headlineFa}</span> : null}
                    {vet.specialtiesFa.length > 0 ? (
                      <span className="block text-caption text-text-secondary">{vet.specialtiesFa.join('، ')}</span>
                    ) : null}
                    {vet.placesFa.length > 0 ? (
                      <span className="flex items-center gap-2xs text-caption text-text-secondary">
                        <Icon name="mapPin" size="xs" />
                        {vet.placesFa.join('، ')}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-xs pt-2xs">
                      {vet.verified ? <StatusBadge tone="info">کد نظام تأییدشده</StatusBadge> : null}
                      {vet.trusted ? <StatusBadge tone="success">معتمد همزیست</StatusBadge> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی دامپزشکان" className="mt-lg flex items-center justify-between gap-md">
              {result.page > 1 ? (
                <ButtonLink tone="secondary" href={hrefFor(result.page - 1)}>
                  صفحه قبل
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-body-sm text-text-secondary">
                {'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}
              </span>
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
