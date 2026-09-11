import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { breedGroupOptions, publishedBreeds } from '../../../../src/breeds/service.ts';
import { SIZE_FA } from '../../../../src/breeds/model.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

const TITLE = 'نژادهای سگ';
const DESCRIPTION =
  'بانک نژادهای سگ همزیست: گروه FCI، اندازه و ویژگی‌ها، تاریخچه و استاندارد، و نکته‌های سلامت هر نژاد با منبع و تاریخ بازبینی.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/breeds' },
];

type Search = { q?: string | string[]; group?: string | string[]; page?: string | string[] };

const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

function parseQuery(search: Search) {
  const term = one(search.q).trim().slice(0, 80);
  const group = Number(one(search.group));
  const page = Number(one(search.page));
  return {
    term,
    fciGroup: Number.isInteger(group) && group >= 1 && group <= 10 ? group : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function generateMetadata(): Metadata {
  // Searches, filters and later pages share this canonical: they are views of
  // one list, not separate pages worth indexing (§19).
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/breeds' }, site());
}

const CONTROL =
  'w-full rounded-md border border-border-subtle bg-bg-surface px-md text-body-sm text-text-primary ' +
  'min-h-[var(--size-control-md)] focus:border-border-brand';

/** Breed bank list — Requirements-Phase-2 §6 (PROMPT-003). */
export default async function BreedsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, groups] = await Promise.all([publishedBreeds(db(), query), breedGroupOptions(db())]);
  const { origin } = site();

  const hrefFor = (page: number): string => {
    const params = new URLSearchParams();
    if (query.term !== '') params.set('q', query.term);
    if (query.fciGroup !== null) params.set('group', String(query.fciGroup));
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/breeds' + (encoded === '' ? '' : '?' + encoded);
  };

  return (
    <div className="space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">
          مشخصات، گروه FCI، تاریخچه و استاندارد هر نژاد. هر مطلب سلامت منبع و تاریخ بازبینی خودش را دارد.
        </p>
      </header>

      <form
        method="get"
        action="/breeds"
        role="search"
        className="grid gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg md:grid-cols-[1fr_1fr_auto] md:items-end"
        data-testid="breed-search"
      >
        <div className="space-y-xs">
          <label htmlFor="breed-q" className="block text-label-md">
            نام نژاد
          </label>
          <input
            id="breed-q"
            name="q"
            type="search"
            defaultValue={query.term}
            placeholder="مثلاً ژرمن شپرد یا retriever"
            className={CONTROL}
            data-testid="breed-q"
          />
        </div>
        <div className="space-y-xs">
          <label htmlFor="breed-group" className="block text-label-md">
            گروه FCI
          </label>
          <select
            id="breed-group"
            name="group"
            defaultValue={query.fciGroup === null ? '' : String(query.fciGroup)}
            className={CONTROL + ' py-sm'}
            data-testid="breed-group"
          >
            <option value="">همه گروه‌ها</option>
            {groups.map((group) => (
              <option key={group.id} value={group.fciGroup}>
                {'گروه ' + fa(group.fciGroup) + ' — ' + group.nameFa}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" data-testid="breed-search-submit">
          جست‌وجو
        </Button>
      </form>

      {result.publishedTotal === 0 ? (
        <EmptyState
          title="هنوز نژادی منتشر نشده است"
          description="صفحه هر نژاد پس از نوشتن مشخصات و منابع آن منتشر می‌شود."
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          title="نژادی با این جست‌وجو پیدا نشد"
          description="نام دیگری امتحان کنید یا فیلتر گروه را بردارید."
          action={
            <ButtonLink tone="secondary" href="/breeds">
              نمایش همه نژادها
            </ButtonLink>
          }
        />
      ) : (
        <section aria-labelledby="breed-results-title">
          <h2 id="breed-results-title" className="text-body-sm text-text-secondary" data-testid="breed-count">
            {fa(result.total) + ' نژاد'}
          </h2>
          <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="breed-results">
            {result.items.map((breed) => (
              <li key={breed.slug}>
                <Link
                  href={'/breeds/' + breed.slug}
                  className="flex h-full items-start gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  data-testid={'breed-card-' + breed.slug}
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                    <Icon name="dog" size="md" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label-lg text-text-primary">{breed.nameFa}</span>
                    <span className="block text-caption text-text-secondary">
                      <bdi>{breed.nameEn}</bdi>
                    </span>
                    {breed.fciGroup !== null || breed.size !== null ? (
                      <span className="mt-xs block text-caption text-text-secondary">
                        {[
                          breed.fciGroup !== null ? 'گروه FCI ' + fa(breed.fciGroup) : null,
                          breed.size !== null ? 'اندازه ' + SIZE_FA[breed.size] : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {result.totalPages > 1 ? (
            <nav aria-label="صفحه‌بندی نژادها" className="mt-lg flex items-center justify-between gap-md">
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
