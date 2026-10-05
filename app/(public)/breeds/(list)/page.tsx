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
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';
import { FilterChips } from '../../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';

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

/** Breed bank list — Requirements-Phase-2 §6 (PROMPT-003), drawn as DS P02 with BreedCard tiles. */
export default async function BreedsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = parseQuery(await searchParams);
  const [result, groups] = await Promise.all([publishedBreeds(db(), query), breedGroupOptions(db())]);
  const { origin } = site();

  const hrefFor = (page: number, group: number | null = query.fciGroup): string => {
    const params = new URLSearchParams();
    if (query.term !== '') params.set('q', query.term);
    if (group !== null) params.set('group', String(group));
    if (page > 1) params.set('page', String(page));
    const encoded = params.toString();
    return '/breeds' + (encoded === '' ? '' : '?' + encoded);
  };

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader
          title={TITLE}
          meta={['مشخصات، گروه FCI، تاریخچه و استاندارد هر نژاد. هر مطلب سلامت منبع و تاریخ بازبینی خودش را دارد.']}
        />
      </div>

      <form method="get" action="/breeds" role="search" className="grid gap-sm md:grid-cols-[minmax(0,1fr)_280px_auto]" data-testid="breed-search">
        <SearchField id="breed-q" name="q" label="نام نژاد، مثلاً ژرمن شپرد یا retriever" defaultValue={query.term} data-testid="breed-q" />
        <label className="hz-select-wrap">
          <span className="hz-visually-hidden">گروه FCI</span>
          <select name="group" defaultValue={query.fciGroup === null ? '' : String(query.fciGroup)} className="hz-select" data-testid="breed-group">
            <option value="">همه گروه‌های FCI</option>
            {groups.map((group) => (
              <option key={group.id} value={group.fciGroup}>
                {'گروه ' + fa(group.fciGroup) + ' — ' + group.nameFa}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" tone="secondary" data-testid="breed-search-submit">
          جست‌وجو
        </Button>
      </form>

      {groups.length > 0 ? (
        <FilterChips
          label="گروه‌های FCI"
          chips={[
            { key: 'all', href: hrefFor(1, null), label: 'همه', current: query.fciGroup === null },
            ...groups.map((group) => ({
              key: group.id,
              href: hrefFor(1, group.fciGroup),
              label: 'گروه ' + fa(group.fciGroup),
              current: query.fciGroup === group.fciGroup,
            })),
          ]}
        />
      ) : null}

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
        <section aria-labelledby="breed-results-title" className="space-y-lg">
          <h2 id="breed-results-title" className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="breed-count">
            {fa(result.total) + ' نژاد'}
          </h2>
          <ul className="grid grid-cols-2 gap-md md:grid-cols-3 md:gap-s20 lg:grid-cols-4" data-testid="breed-results">
            {result.items.map((breed) => (
              <li key={breed.slug}>
                <Link href={'/breeds/' + breed.slug} className="hz-animal-tile hz-card--interactive h-full" data-testid={'breed-card-' + breed.slug}>
                  <RecordImage variant="3x2" fileId={breed.imageFileId} altFa={breed.imageAltFa} />
                  <div className="hz-animal-tile__body">
                    <h3 className="hz-breed__name">{breed.nameFa}</h3>
                    <bdi className="hz-breed__en" dir="ltr">
                      {breed.nameEn}
                    </bdi>
                    {breed.fciGroup !== null || breed.size !== null ? (
                      <span className="hz-breed__meta">
                        {[breed.fciGroup !== null ? 'گروه FCI ' + fa(breed.fciGroup) : null, breed.size !== null ? SIZE_FA[breed.size] : null]
                          .filter(Boolean)
                          .join('، ')}
                      </span>
                    ) : null}
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
            hrefFor={(page) => hrefFor(page)}
            label="صفحه‌بندی نژادها"
          />
        </section>
      )}
    </div>
  );
}
