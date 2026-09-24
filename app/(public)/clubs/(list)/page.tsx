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
      <label htmlFor={'club-' + id} className="block text-label-md">
        {label}
      </label>
      <select id={'club-' + id} name={id} defaultValue={value ?? ''} className={CONTROL} data-testid={'club-filter-' + id}>
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
 * The club directory — Phase 2.5 §8 (PROMPT-012). Only clubs the association
 * verified and whose owner published them appear here; a draft, a club waiting
 * for verification and a suspended one are simply absent.
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

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    const pairs: [Key, string | null][] = [
      ['q', query.term || null],
      ['scope', query.scope],
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
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          کلاب‌هایی که انجمن تأیید کرده است. عضویت در هر کلاب با خود آن است و از همزیست انجام نمی‌شود.
        </p>
      </header>

      <form
        method="get"
        action="/clubs"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        data-testid="club-search"
      >
        <div className="space-y-xs">
          <label htmlFor="club-q" className="block text-label-md">
            نام کلاب
          </label>
          <input id="club-q" name="q" type="search" defaultValue={query.term} className={CONTROL} data-testid="club-filter-q" />
        </div>
        <Filter
          id="scope"
          label="حوزه"
          all="همه حوزه‌ها"
          value={query.scope}
          options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))}
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
        <Button type="submit" data-testid="club-search-submit">
          جست‌وجو
        </Button>
      </form>

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
        <section aria-labelledby="club-results-title">
          <h2 id="club-results-title" className="text-body-sm text-text-secondary" data-testid="club-count">
            {fa(result.total) + ' کلاب' + (filtered ? ' با این فیلترها' : '')}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="club-results">
            {result.items.map((club) => (
              <li key={club.slug}>
                <Link
                  href={'/clubs/' + club.slug}
                  className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'club-card-' + club.slug}
                >
                  {club.imageFileId !== null ? (
                    <RecordImage variant="thumb" fileId={club.imageFileId} altFa={club.imageAltFa} />
                  ) : (
                    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                      <Icon name="user" size="md" />
                    </span>
                  )}
                  <span className="min-w-0 space-y-xs">
                    <span className="block text-label-lg text-text-primary">{club.nameFa}</span>
                    <span className="block text-caption text-text-secondary">
                      {'حوزه ' + (COMMUNITY_SCOPE_FA[club.scopeFa as never] ?? club.scopeFa)}
                    </span>
                    {club.breedNamesFa.length > 0 ? (
                      <span className="block text-caption text-text-secondary">{club.breedNamesFa.slice(0, 4).join('، ')}</span>
                    ) : null}
                    {club.placeFa ? (
                      <span className="flex items-center gap-2xs text-caption text-text-secondary">
                        <Icon name="mapPin" size="xs" />
                        {club.placeFa}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-xs pt-2xs">
                      <StatusBadge tone="success">تأییدشده</StatusBadge>
                      {club.upcomingEvents > 0 ? <StatusBadge tone="info">{fa(club.upcomingEvents) + ' رویداد پیش‌رو'}</StatusBadge> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی کلاب‌ها" className="mt-lg flex items-center justify-between gap-md">
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
