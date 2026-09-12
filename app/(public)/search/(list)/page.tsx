import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { globalSearch } from '../../../../src/search/service.ts';
import { RANKING_VERSION, RANK_TIER_FA, SEARCH_KINDS, SEARCH_KIND_FA, type SearchKind } from '../../../../src/search/model.ts';
import { directoryReferenceData } from '../../../../src/vets/directory.ts';
import { centreReferenceData } from '../../../../src/centres/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

const TITLE = 'جست‌وجو';
const DESCRIPTION = 'جست‌وجوی دامپزشک، مرکز دامپزشکی، انجمن و کلاب، نژاد، آموزش و خبر در همزیست.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/search' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Key = 'q' | 'kind' | 'species' | 'province' | 'city' | 'specialty' | 'service' | 'status' | 'page';
type Search = Partial<Record<Key, string | string[]>>;

const one = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const fa = (value: number): string => value.toLocaleString('fa-IR');
const matching = (value: string, pattern: RegExp): string | null => (pattern.test(value) ? value : null);

function parseQuery(search: Search) {
  const page = Number(one(search.page));
  const status = one(search.status);
  return {
    term: one(search.q).slice(0, 80),
    kind: matching(one(search.kind), /^[A-Z_]{3,20}$/),
    species: matching(one(search.species), /^[A-Z_]{2,20}$/),
    province: matching(one(search.province), /^[a-z-]{2,40}$/),
    cityId: matching(one(search.city), UUID),
    specialty: matching(one(search.specialty), /^[A-Z_]{2,40}$/),
    service: matching(one(search.service), /^[A-Z_]{2,40}$/),
    status: status === 'VERIFIED' || status === 'TRUSTED' ? status : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  } as const;
}

export function generateMetadata(): Metadata {
  // A search page is a view of other pages, never a page to index (§19).
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/search', noindex: true }, site());
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
      <label htmlFor={'search-' + id} className="block text-label-md">
        {label}
      </label>
      <select id={'search-' + id} name={id} defaultValue={value ?? ''} className={CONTROL} data-testid={'search-filter-' + id}>
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

/**
 * Global search — Requirements-Phase-2 §15, §16 (PROMPT-012).
 *
 * One list over every public directory, ordered by the bands of §15: an
 * advertising package first among records that match the search and always with
 * its own label, then trusted, verified, complete and base. The ranking version
 * is on the page, so an order can be traced to the rule that produced it.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [answer, vetReference, centreReference] = await Promise.all([
    globalSearch(db(), query),
    directoryReferenceData(db()),
    centreReferenceData(db()),
  ]);
  const { origin } = site();
  const provinceName = new Map(vetReference.provinces.map((row) => [row.code, row.nameFa]));

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['kind', query.kind],
      ['species', query.species],
      ['province', query.province],
      ['city', query.cityId],
      ['specialty', query.specialty],
      ['service', query.service],
      ['status', query.status],
    ];
    for (const [key, value] of pairs) if (value) params.set(key, value);
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/search' + (encoded === '' ? '' : '?' + encoded);
  };

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          دامپزشک، مرکز، انجمن و کلاب، نژاد، آموزش و خبر را با هم جست‌وجو کنید. نتیجه‌های تبلیغاتی با برچسب «تبلیغ» می‌آیند و
          تبلیغ، تأیید حرفه‌ای یا معتمدبودن نمی‌سازد.
        </p>
      </header>

      <form
        method="get"
        action="/search"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        data-testid="search-form"
      >
        <div className="space-y-xs sm:col-span-2">
          <label htmlFor="search-q" className="block text-label-md">
            عبارت جست‌وجو
          </label>
          <input id="search-q" name="q" type="search" defaultValue={query.term} className={CONTROL} data-testid="search-input" />
        </div>
        <Filter
          id="kind"
          label="نوع نتیجه"
          all="همه نتیجه‌ها"
          value={query.kind}
          options={SEARCH_KINDS.map((kind) => ({ value: kind, label: SEARCH_KIND_FA[kind] }))}
        />
        <Filter
          id="species"
          label="گونه"
          all="همه گونه‌ها"
          value={query.species}
          options={vetReference.species.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="province"
          label="استان"
          all="همه استان‌ها"
          value={query.province}
          options={vetReference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="city"
          label="شهر"
          all="همه شهرها"
          value={query.cityId}
          options={vetReference.cities
            .filter((city) => !query.province || city.provinceCode === query.province)
            .map((city) => ({ value: city.id, label: city.nameFa + ' — ' + (provinceName.get(city.provinceCode) ?? '') }))}
        />
        <Filter
          id="specialty"
          label="تخصص"
          all="همه تخصص‌ها"
          value={query.specialty}
          options={vetReference.specialties.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="service"
          label="خدمت"
          all="همه خدمات"
          value={query.service}
          options={centreReference.services.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="status"
          label="وضعیت تأیید"
          all="بدون فیلتر وضعیت"
          value={query.status}
          options={[
            { value: 'VERIFIED', label: 'تأییدشده' },
            { value: 'TRUSTED', label: 'معتمد' },
          ]}
        />
        <Button type="submit" data-testid="search-submit">
          جست‌وجو
        </Button>
      </form>

      {answer.skippedKindsFa.length > 0 ? (
        <div data-testid="search-skipped">
          <Alert tone="info" title="بعضی نتیجه‌ها با این فیلترها جست‌وجو نشدند">
            <ul className="list-disc space-y-2xs pr-lg">
              {answer.skippedKindsFa.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      {answer.items.length === 0 ? (
        <EmptyState
          title="نتیجه‌ای پیدا نشد"
          description="عبارت دیگری بنویسید یا یکی از فیلترها را بردارید."
          action={
            <ButtonLink tone="secondary" href="/search">
              پاک‌کردن فیلترها
            </ButtonLink>
          }
        />
      ) : (
        <section aria-labelledby="search-results-title" data-ranking-version={RANKING_VERSION}>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <h2 id="search-results-title" className="text-body-sm text-text-secondary" data-testid="search-count">
              {fa(answer.total) + ' نتیجه'}
            </h2>
            <p className="text-caption text-text-secondary" data-testid="ranking-version">
              {'نسخه رتبه‌بندی: '}
              <bdi className="hz-ltr font-mono">{RANKING_VERSION}</bdi>
            </p>
          </div>

          <ul className="mt-sm flex flex-wrap gap-xs" data-testid="search-kind-counts">
            {SEARCH_KINDS.filter((kind) => answer.totalByKind[kind] > 0).map((kind: SearchKind) => (
              <li key={kind}>
                <Link
                  href={hrefFor(1).replace('/search', '/search?kind=' + kind).replace('?kind=' + kind + '?', '?kind=' + kind + '&')}
                  className="inline-flex items-center rounded-md border border-border-subtle px-md py-2xs text-caption text-text-secondary hover:border-border-brand"
                  data-testid={'kind-count-' + kind}
                >
                  {SEARCH_KIND_FA[kind] + ' (' + fa(answer.totalByKind[kind]) + ')'}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-md space-y-sm" data-testid="search-results">
            {answer.items.map((result) => (
              <li key={result.kind + result.slug}>
                <Link
                  href={result.path}
                  className="flex items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'result-' + result.kind + '-' + result.slug}
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                    <Icon name="magnifyingGlass" size="md" />
                  </span>
                  <span className="min-w-0 space-y-xs">
                    <span className="flex flex-wrap items-center gap-xs">
                      <span className="text-label-lg text-text-primary">{result.titleFa}</span>
                      <StatusBadge tone="neutral">{SEARCH_KIND_FA[result.kind]}</StatusBadge>
                      {result.promoted ? (
                        <span data-testid={'promoted-' + result.slug}>
                          <StatusBadge tone="info">{RANK_TIER_FA.PROMOTED}</StatusBadge>
                        </span>
                      ) : null}
                      {result.trusted ? <StatusBadge tone="success">{RANK_TIER_FA.TRUSTED}</StatusBadge> : null}
                      {result.verified ? <StatusBadge tone="info">{RANK_TIER_FA.VERIFIED}</StatusBadge> : null}
                    </span>
                    {result.subtitleFa ? <span className="block text-caption text-text-secondary">{result.subtitleFa}</span> : null}
                    {result.placeFa ? (
                      <span className="flex items-center gap-2xs text-caption text-text-secondary">
                        <Icon name="mapPin" size="xs" />
                        {result.placeFa}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {answer.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی نتیجه‌ها" className="mt-lg flex items-center justify-between gap-md">
              {answer.page > 1 ? (
                <ButtonLink tone="secondary" href={hrefFor(answer.page - 1)}>
                  صفحه قبل
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(answer.page) + ' از ' + fa(answer.totalPages)}</span>
              {answer.page < answer.totalPages ? (
                <ButtonLink tone="secondary" href={hrefFor(answer.page + 1)}>
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
