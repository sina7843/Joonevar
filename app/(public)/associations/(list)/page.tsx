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
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';
import { FilterChips } from '../../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { FilterPanel, FilterSelect } from '../../public-ui.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';

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

/** Association and club directory — Requirements-Phase-2 §11, §19 (PROMPT-010), drawn as DS P02 with ClubCards. */
export default async function AssociationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, reference] = await Promise.all([publishedCommunities(db(), query), communityReferenceData(db())]);
  const { origin } = site();
  const filtered = query.term !== '' || [query.kind, query.scope, query.species, query.breedId, query.province].some(Boolean);
  const FORM = 'community-search-form';

  const hrefFor = (page: number, kind: string | null = query.kind): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['kind', kind],
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
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={['انجمن‌ها و کلاب‌ها را با حوزه، نژاد، گونه و استان پیدا کنید. عضویت در هر انجمن یا کلاب با خود آن است و از همزیست انجام نمی‌شود.']}
        />
      </div>

      <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="فیلترهای انجمن‌ها و کلاب‌ها" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <FilterPanel
            clearHref="/associations"
            active={filtered}
            footer={
              <Button type="submit" tone="secondary" size="sm" form={FORM}>
                اعمال فیلترها
              </Button>
            }
          >
            <FilterSelect id="community-kind" form={FORM} name="kind" label="نوع" all="انجمن و کلاب" value={query.kind} testId="community-filter-kind"
              options={COMMUNITY_KINDS.map((kind) => ({ value: kind, label: COMMUNITY_KIND_FA[kind] }))} />
            <FilterSelect id="community-scope" form={FORM} name="scope" label="حوزه" all="همه حوزه‌ها" value={query.scope} testId="community-filter-scope"
              options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))} />
            <FilterSelect id="community-species" form={FORM} name="species" label="گونه" all="همه گونه‌ها" value={query.species} testId="community-filter-species"
              options={reference.species.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="community-breed" form={FORM} name="breed" label="نژاد" all="همه نژادها" value={query.breedId} testId="community-filter-breed"
              options={reference.breeds.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="community-province" form={FORM} name="province" label="استان" all="همه استان‌ها" value={query.province} testId="community-filter-province"
              options={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))} />
          </FilterPanel>
        </aside>

        <div className="min-w-0 space-y-lg lg:col-start-2 lg:row-start-1">
          <form id={FORM} method="get" action="/associations" role="search" className="flex gap-sm" data-testid="community-search">
            <SearchField id="community-q" name="q" label="نام انجمن یا کلاب" defaultValue={query.term} className="min-w-0 flex-1" data-testid="community-filter-q" />
            <Button type="submit" tone="secondary" data-testid="community-search-submit">
              جست‌وجو
            </Button>
          </form>

          <FilterChips
            label="فیلترهای سریع"
            chips={[
              { key: 'all', href: hrefFor(1, null), label: 'همه', current: query.kind === null },
              ...COMMUNITY_KINDS.map((kind) => ({ key: kind, href: hrefFor(1, kind), label: COMMUNITY_KIND_FA[kind], current: query.kind === kind })),
            ]}
          />

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
            <section aria-labelledby="community-results-title" className="space-y-lg">
              <h2 id="community-results-title" className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="community-count">
                {fa(result.total) + ' انجمن و کلاب' + (filtered ? ' با این فیلترها' : '')}
              </h2>
              <ul className="grid gap-s20 md:grid-cols-2 xl:grid-cols-3" data-testid="community-results">
                {result.items.map((community) => (
                  <li key={community.slug}>
                    <Link href={'/associations/' + community.slug} className="hz-card hz-card--interactive hz-community h-full" data-testid={'community-card-' + community.slug}>
                      <div className="hz-entity">
                        <RecordImage variant="avatar" fileId={community.imageFileId} altFa={community.imageAltFa} />
                        <div className="hz-entity__body">
                          <h3 className="hz-entity__name">{community.nameFa}</h3>
                          <span className="hz-entity__meta">
                            {COMMUNITY_KIND_FA[community.kind] + '، حوزه ' + (COMMUNITY_SCOPE_FA[community.scopeFa as never] ?? community.scopeFa)}
                          </span>
                          {community.breedNamesFa.length > 0 ? (
                            <span className="hz-entity__meta">{community.breedNamesFa.slice(0, 4).join('، ')}</span>
                          ) : null}
                          {community.placeFa ? (
                            <span className="hz-entity__line">
                              <Icon name="mapPin" size="xs" />
                              {community.placeFa}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {community.promoted || !community.owned || community.registered ? (
                        <span className="flex flex-wrap gap-xs">
                          {community.promoted ? (
                            <span data-testid={'promoted-' + community.slug}>
                              <StatusBadge tone="info" size="sm">
                                تبلیغ
                              </StatusBadge>
                            </span>
                          ) : null}
                          {community.owned ? null : (
                            <StatusBadge tone="warning" size="sm">
                              بدون مالک
                            </StatusBadge>
                          )}
                          {community.registered ? (
                            <StatusBadge tone="info" size="sm">
                              ثبت معتبر
                            </StatusBadge>
                          ) : null}
                        </span>
                      ) : null}
                      {community.upcomingEvents > 0 ? (
                        <div className="hz-community__event">
                          <Icon name="calendarBlank" size="sm" />
                          <span className="hz-community__event-text">
                            <span className="hz-community__event-title">{fa(community.upcomingEvents) + ' رویداد پیش‌رو'}</span>
                          </span>
                        </div>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                totalPages={result.totalPages}
                hrefFor={(page) => hrefFor(page)}
                label="صفحه‌بندی انجمن‌ها و کلاب‌ها"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
