import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { communityReferenceData, publishedCommunities } from '../../../../src/communities/service.ts';
import { COMMUNITY_KINDS, COMMUNITY_KIND_FA, COMMUNITY_SCOPES, COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

const TITLE = 'انجمن‌ها و کلاب‌ها';
const DESCRIPTION =
  'انجمن‌ها و کلاب‌های حیوانات خانگی با حوزه فعالیت، نژاد و گونه، راه عضویت، رویدادها و وضعیت ثبت اعلام‌شده.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/associations' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Key = 'q' | 'kind' | 'scope' | 'species' | 'breed' | 'province' | 'page';
type Search = Partial<Record<Key, string | string[]>>;

const one = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const fa = (value: number): string => value.toLocaleString('fa-IR');
const matching = (value: string, pattern: RegExp): string | null => (pattern.test(value) ? value : null);

function parseQuery(search: Search) {
  const page = Number(one(search.page));
  return {
    term: one(search.q).slice(0, 80),
    kind: matching(one(search.kind), /^[A-Z_]{2,20}$/),
    scope: matching(one(search.scope), /^[A-Z_]{2,20}$/),
    species: matching(one(search.species), /^[A-Z_]{2,20}$/),
    breedId: matching(one(search.breed), UUID),
    province: matching(one(search.province), /^[a-z-]{2,40}$/),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  } as const;
}

export function generateMetadata(): Metadata {
  // Filters and later pages are views of one list and share its canonical (§19).
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/associations' }, site());
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
      <label htmlFor={'community-' + id} className="block text-label-md">
        {label}
      </label>
      <select id={'community-' + id} name={id} defaultValue={value ?? ''} className={CONTROL} data-testid={'community-filter-' + id}>
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

/** Association and club directory — Requirements-Phase-2 §11, §19 (PROMPT-010). */
export default async function AssociationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, reference] = await Promise.all([publishedCommunities(db(), query), communityReferenceData(db())]);
  const { origin } = site();
  const filtered = query.term !== '' || [query.kind, query.scope, query.species, query.breedId, query.province].some(Boolean);

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['kind', query.kind],
      ['scope', query.scope],
      ['species', query.species],
      ['breed', query.breedId],
      ['province', query.province],
    ];
    for (const [key, value] of pairs) if (value) params.set(key, value);
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/associations' + (encoded === '' ? '' : '?' + encoded);
  };

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          انجمن‌ها و کلاب‌ها را با حوزه، نژاد، گونه و استان پیدا کنید. عضویت در هر انجمن یا کلاب با خود آن است و از همزیست انجام نمی‌شود.
        </p>
      </header>

      <form
        method="get"
        action="/associations"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        data-testid="community-search"
      >
        <div className="space-y-xs">
          <label htmlFor="community-q" className="block text-label-md">
            نام انجمن یا کلاب
          </label>
          <input id="community-q" name="q" type="search" defaultValue={query.term} className={CONTROL} data-testid="community-filter-q" />
        </div>
        <Filter
          id="kind"
          label="نوع"
          all="انجمن و کلاب"
          value={query.kind}
          options={COMMUNITY_KINDS.map((kind) => ({ value: kind, label: COMMUNITY_KIND_FA[kind] }))}
        />
        <Filter
          id="scope"
          label="حوزه"
          all="همه حوزه‌ها"
          value={query.scope}
          options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))}
        />
        <Filter
          id="species"
          label="گونه"
          all="همه گونه‌ها"
          value={query.species}
          options={reference.species.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="breed"
          label="نژاد"
          all="همه نژادها"
          value={query.breedId}
          options={reference.breeds.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Filter
          id="province"
          label="استان"
          all="همه استان‌ها"
          value={query.province}
          options={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
        />
        <Button type="submit" data-testid="community-search-submit">
          جست‌وجو
        </Button>
      </form>

      {result.publishedTotal === 0 ? (
        <EmptyState title="هنوز انجمن یا کلابی منتشر نشده است" description="هر پرونده پس از تکمیل معرفی و بررسی در این فهرست می‌آید." />
      ) : result.items.length === 0 ? (
        <EmptyState
          title="انجمن یا کلابی با این جست‌وجو پیدا نشد"
          description="فیلتری را بردارید یا حوزه و نژاد دیگری امتحان کنید."
          action={
            <ButtonLink tone="secondary" href="/associations">
              نمایش همه انجمن‌ها و کلاب‌ها
            </ButtonLink>
          }
        />
      ) : (
        <section aria-labelledby="community-results-title">
          <h2 id="community-results-title" className="text-body-sm text-text-secondary" data-testid="community-count">
            {fa(result.total) + ' انجمن و کلاب' + (filtered ? ' با این فیلترها' : '')}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="community-results">
            {result.items.map((community) => (
              <li key={community.slug}>
                <Link
                  href={'/associations/' + community.slug}
                  className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'community-card-' + community.slug}
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                    <Icon name="user" size="md" />
                  </span>
                  <span className="min-w-0 space-y-xs">
                    <span className="block text-label-lg text-text-primary">{community.nameFa}</span>
                    <span className="block text-caption text-text-secondary">
                      {COMMUNITY_KIND_FA[community.kind] + ' · حوزه ' + (COMMUNITY_SCOPE_FA[community.scopeFa as never] ?? community.scopeFa)}
                    </span>
                    {community.breedNamesFa.length > 0 ? (
                      <span className="block text-caption text-text-secondary">{community.breedNamesFa.slice(0, 4).join('، ')}</span>
                    ) : null}
                    {community.placeFa ? (
                      <span className="flex items-center gap-2xs text-caption text-text-secondary">
                        <Icon name="mapPin" size="xs" />
                        {community.placeFa}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-xs pt-2xs">
                      {community.promoted ? (
                        <span data-testid={'promoted-' + community.slug}>
                          <StatusBadge tone="info">تبلیغ</StatusBadge>
                        </span>
                      ) : null}
                      {community.owned ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                      {community.registered ? <StatusBadge tone="info">ثبت معتبر</StatusBadge> : null}
                      {community.upcomingEvents > 0 ? <StatusBadge tone="success">{fa(community.upcomingEvents) + ' رویداد پیش‌رو'}</StatusBadge> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی انجمن‌ها و کلاب‌ها" className="mt-lg flex items-center justify-between gap-md">
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
