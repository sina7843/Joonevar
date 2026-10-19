import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { publicClubs } from '../../../../src/clubs/service.ts';
import { communityReferenceData } from '../../../../src/communities/service.ts';
import { COMMUNITY_SCOPES, COMMUNITY_SCOPE_FA } from '../../../../src/communities/model.ts';
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

const TITLE = 'کلاب‌ها';
const DESCRIPTION = 'کلاب‌های تأییدشده حیوانات خانگی با حوزه فعالیت، نژاد، استان، راه عضویت و رویدادهای اعلام‌شده.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/clubs' },
];

type Key = 'q' | 'scope' | 'species' | 'breed' | 'province' | 'page';
type Search = Partial<Record<Key, string | string[]>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const fa = (value: number): string => value.toLocaleString('fa-IR');
const matching = (value: string, pattern: RegExp): string | null => (pattern.test(value) ? value : null);

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/clubs' }, site());
}

/**
 * The club directory — Phase 2.5 §8 (PROMPT-012), drawn as DS P02 with
 * ClubCards. Only clubs the association verified and whose owner published them
 * appear here; a draft, a club waiting for verification and a suspended one are
 * simply absent.
 */
export default async function ClubsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const pageNumber = Number(one(search.page));
  const query = {
    term: one(search.q).slice(0, 80),
    scope: matching(one(search.scope), /^[A-Z_]{2,20}$/),
    species: matching(one(search.species), /^[A-Z_]{2,20}$/),
    breedId: matching(one(search.breed), UUID),
    province: matching(one(search.province), /^[a-z-]{2,40}$/),
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  } as const;
  const [result, reference] = await Promise.all([publicClubs(db(), query), communityReferenceData(db())]);
  const { origin } = site();
  const filtered = query.term !== '' || [query.scope, query.species, query.breedId, query.province].some(Boolean);
  const FORM = 'club-search-form';

  const hrefFor = (page: number, scope: string | null = query.scope): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['scope', scope],
      ['species', query.species],
      ['breed', query.breedId],
      ['province', query.province],
    ];
    for (const [key, value] of pairs) if (value) params.set(key, value);
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/clubs' + (encoded === '' ? '' : '?' + encoded);
  };

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader title={TITLE} meta={['کلاب‌هایی که انجمن تأیید کرده است. عضویت در هر کلاب با خود آن است و از همزیست انجام نمی‌شود.']} />
      </div>

      <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="فیلترهای کلاب‌ها" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <FilterPanel
            clearHref="/clubs"
            active={filtered}
            footer={
              <Button type="submit" tone="secondary" size="sm" form={FORM}>
                اعمال فیلترها
              </Button>
            }
          >
            <FilterSelect id="club-scope" form={FORM} name="scope" label="حوزه" all="همه حوزه‌ها" value={query.scope} testId="club-filter-scope"
              options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))} />
            <FilterSelect id="club-breed" form={FORM} name="breed" label="نژاد" all="همه نژادها" value={query.breedId} testId="club-filter-breed"
              options={reference.breeds.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="club-province" form={FORM} name="province" label="استان" all="همه استان‌ها" value={query.province} testId="club-filter-province"
              options={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))} />
          </FilterPanel>
        </aside>

        <div className="min-w-0 space-y-lg lg:col-start-2 lg:row-start-1">
          <form id={FORM} method="get" action="/clubs" role="search" className="flex gap-sm" data-testid="club-search">
            {query.species ? <input type="hidden" name="species" value={query.species} /> : null}
            <SearchField id="club-q" name="q" label="نام کلاب" defaultValue={query.term} className="min-w-0 flex-1" data-testid="club-filter-q" />
            <Button type="submit" tone="secondary" data-testid="club-search-submit">
              جست‌وجو
            </Button>
          </form>

          <FilterChips
            label="فیلترهای سریع"
            chips={[
              { key: 'all', href: hrefFor(1, null), label: 'همه حوزه‌ها', current: query.scope === null },
              ...COMMUNITY_SCOPES.map((scope) => ({ key: scope, href: hrefFor(1, scope), label: COMMUNITY_SCOPE_FA[scope], current: query.scope === scope })),
            ]}
          />

          {result.publishedTotal === 0 ? (
            <EmptyState
              title="هنوز کلابی منتشر نشده است"
              description="هر کلاب پس از تکمیل معرفی، تأیید انجمن و انتشار توسط مالکش در این فهرست می‌آید."
            />
          ) : result.items.length === 0 ? (
            <EmptyState
              title="کلابی با این جست‌وجو پیدا نشد"
              description="فیلتری را بردارید یا حوزه و نژاد دیگری امتحان کنید."
              action={
                <ButtonLink tone="secondary" href="/clubs">
                  نمایش همه کلاب‌ها
                </ButtonLink>
              }
            />
          ) : (
            <section aria-labelledby="club-results-title" className="space-y-lg">
              <h2 id="club-results-title" className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="club-count">
                {fa(result.total) + ' کلاب' + (filtered ? ' با این فیلترها' : '')}
              </h2>
              <ul className="grid gap-s20 md:grid-cols-2 xl:grid-cols-3" data-testid="club-results">
                {result.items.map((club) => (
                  <li key={club.slug}>
                    <Link href={'/clubs/' + club.slug} className="hz-card hz-card--interactive hz-community h-full" data-testid={'club-card-' + club.slug}>
                      <div className="hz-entity">
                        <RecordImage variant="avatar" fileId={club.imageFileId} altFa={club.imageAltFa} />
                        <div className="hz-entity__body">
                          <h3 className="hz-entity__name">{club.nameFa}</h3>
                          <span className="hz-entity__meta">{'کلاب، حوزه ' + (COMMUNITY_SCOPE_FA[club.scopeFa as never] ?? club.scopeFa)}</span>
                          {club.breedNamesFa.length > 0 ? <span className="hz-entity__meta">{club.breedNamesFa.slice(0, 4).join('، ')}</span> : null}
                          {club.placeFa ? (
                            <span className="hz-entity__line">
                              <Icon name="mapPin" size="xs" />
                              {club.placeFa}
                            </span>
                          ) : null}
                          <span className="mt-xs">
                            <StatusBadge status="APPROVED" size="sm" />
                          </span>
                        </div>
                      </div>
                      {club.upcomingEvents > 0 ? (
                        <div className="hz-community__event">
                          <Icon name="calendarBlank" size="sm" />
                          <span className="hz-community__event-text">
                            <span className="hz-community__event-title">{fa(club.upcomingEvents) + ' رویداد پیش‌رو'}</span>
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
                label="صفحه‌بندی کلاب‌ها"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
