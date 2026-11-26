import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { SearchField } from '../../../../src/ui/search-field.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { FilterInput, FilterPanel, FilterSelect } from '../../public-ui.tsx';
import { ListingCard } from '../listing-card.tsx';
import { listingFilterOptions, publicListings } from '../../../../src/marketplace/public-listings.ts';
import {
  isCanonicalListingIndex,
  LISTING_SORTS,
  LISTING_SORT_FA,
  listingQueryString,
  parseListingFilter,
  PROMOTED_LABEL_FA,
  SELLER_KIND_FILTERS,
  type RawSearch,
} from '../../../../src/marketplace/discovery-model.ts';
import {
  DELIVERY_METHODS,
  DELIVERY_METHOD_FA,
  DISCLOSURES,
  NEUTER_FA,
  VACCINATION_FA,
} from '../../../../src/marketplace/listing-model.ts';
import { SELLER_KIND_FA } from '../../../../src/marketplace/listing-eligibility.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'بازار فروش حیوان';
const DESCRIPTION =
  'آگهی‌های فروش سگ ثبت‌شده در همزیست، با فیلتر نژاد، استان، قیمت، سن، نوع فروشنده، شجره‌نامه، واکسیناسیون و روش تحویل.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/animals-market' },
];

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * Metadata for one view of the marketplace.
 *
 * Only the plain index is indexed. Every filtered or paged permutation points
 * its canonical at that page, so one marketplace does not become thousands of
 * near-duplicate results competing with each other.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<RawSearch> }): Promise<Metadata> {
  const filter = parseListingFilter(await searchParams);
  const canonical = isCanonicalListingIndex(filter);
  return buildMetadata(
    {
      title: TITLE,
      description: DESCRIPTION,
      path: '/animals-market',
      // A filtered or paged view is a view of the index, not a page of its own.
      noindex: !canonical,
    },
    site(),
  );
}

/**
 * The public animal marketplace — Phase 3, PROMPT-004, drawn as DS P02: the
 * filter column at the start (from 1024), search, sort and the ListingCard grid.
 *
 * Every advert here is published, of a species the market is open for, and by a
 * seller under no restriction. Nothing else is served, and a visitor cannot
 * tell which of those reasons hid an advert they cannot see.
 */
export default async function AnimalMarketPage({ searchParams }: { searchParams: Promise<RawSearch> }) {
  const raw = await searchParams;
  const filter = parseListingFilter(raw);
  const [page, options] = await Promise.all([publicListings(db(), filter), listingFilterOptions(db())]);
  const FORM = 'market-filter-form';
  const active = listingQueryString({ ...filter, page: 1, sort: 'NEWEST' }) !== '';

  const cities = filter.provinceCode
    ? options.cities.filter((city) => city.provinceCode === filter.provinceCode)
    : options.cities;

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={site().origin} />
        <PageHeader title={TITLE} meta={[DESCRIPTION]} />
      </div>

      {!page.marketOpen ? (
        <Alert tone="warning" title="بازار فروش حیوان در حال حاضر بسته است">
          <span data-testid="market-closed-public">
            آگهی‌ها حذف نشده‌اند و پس از باز شدن دوباره دیده می‌شوند.
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside aria-label="فیلترهای آگهی‌ها" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <FilterPanel
            clearHref="/animals-market"
            active={active}
            clearTestId="market-clear-filters"
            formId={FORM}
            applyTestId="market-apply-filters"
          >
            <FilterSelect id="market-breed" form={FORM} name="breed" label="نژاد" value={filter.breedId} all="همه نژادها" testId="market-filter-breed"
              options={options.breeds.map((row) => ({ value: row.id, label: row.nameFa }))} />
            <FilterSelect id="market-province" form={FORM} name="province" label="استان" value={filter.provinceCode} all="همه استان‌ها" testId="market-filter-province"
              options={options.provinces.map((row) => ({ value: row.code, label: row.nameFa }))} />
            <FilterSelect id="market-city" form={FORM} name="city" label="شهر" value={filter.cityId} all="همه شهرها" testId="market-filter-city"
              options={cities.map((row) => ({ value: row.id, label: row.nameFa }))} />
            <FilterSelect id="market-sex" form={FORM} name="sex" label="جنسیت" value={filter.sex} all="هر دو" testId="market-filter-sex"
              options={[
                { value: 'MALE', label: 'نر' },
                { value: 'FEMALE', label: 'ماده' },
              ]} />
            <div className="grid grid-cols-2 gap-sm">
              <FilterInput id="market-minPrice" form={FORM} name="minPrice" label="کمترین قیمت (تومان)" ltr inputMode="numeric" testId="market-filter-minPrice"
                value={filter.minPriceToman === null ? '' : String(filter.minPriceToman)} />
              <FilterInput id="market-maxPrice" form={FORM} name="maxPrice" label="بیشترین قیمت (تومان)" ltr inputMode="numeric" testId="market-filter-maxPrice"
                value={filter.maxPriceToman === null ? '' : String(filter.maxPriceToman)} />
              <FilterInput id="market-minAge" form={FORM} name="minAge" label="کمترین سن (ماه)" ltr inputMode="numeric" testId="market-filter-minAge"
                value={filter.minAgeMonths === null ? '' : String(filter.minAgeMonths)} />
              <FilterInput id="market-maxAge" form={FORM} name="maxAge" label="بیشترین سن (ماه)" ltr inputMode="numeric" testId="market-filter-maxAge"
                value={filter.maxAgeMonths === null ? '' : String(filter.maxAgeMonths)} />
            </div>
            <FilterSelect id="market-seller" form={FORM} name="seller" label="نوع فروشنده" value={filter.sellerKind} all="همه فروشندگان" testId="market-filter-seller"
              options={SELLER_KIND_FILTERS.map((kind) => ({ value: kind, label: SELLER_KIND_FA[kind] }))} />
            <FilterSelect id="market-pedigree" form={FORM} name="pedigree" label="شجره‌نامه" all="مهم نیست" testId="market-filter-pedigree"
              value={filter.pedigree === null ? null : filter.pedigree ? 'YES' : 'NO'}
              options={[
                { value: 'YES', label: 'دارد' },
                { value: 'NO', label: 'ندارد' },
              ]} />
            <FilterSelect id="market-parentage" form={FORM} name="parentage" label="تست اصالت والدین" all="مهم نیست" testId="market-filter-parentage"
              value={filter.parentage === null ? null : filter.parentage ? 'YES' : 'NO'}
              options={[
                { value: 'YES', label: 'دارد' },
                { value: 'NO', label: 'ندارد' },
              ]} />
            <FilterSelect id="market-vaccination" form={FORM} name="vaccination" label="واکسیناسیون (اظهار فروشنده)" value={filter.vaccination} all="مهم نیست" testId="market-filter-vaccination"
              options={DISCLOSURES.map((value) => ({ value, label: VACCINATION_FA[value] }))} />
            <FilterSelect id="market-neuter" form={FORM} name="neuter" label="عقیم‌سازی (اظهار فروشنده)" value={filter.neuter} all="مهم نیست" testId="market-filter-neuter"
              options={DISCLOSURES.map((value) => ({ value, label: NEUTER_FA[value] }))} />
            <FilterSelect id="market-delivery" form={FORM} name="delivery" label="روش تحویل" value={filter.delivery} all="همه روش‌ها" testId="market-filter-delivery"
              options={DELIVERY_METHODS.map((value) => ({ value, label: DELIVERY_METHOD_FA[value] }))} />
          </FilterPanel>
        </aside>

        <div className="min-w-0 space-y-lg lg:col-start-2 lg:row-start-1">
          <form id={FORM} method="get" action="/animals-market" role="search" className="flex flex-wrap gap-sm" data-testid="market-filters">
            <SearchField id="market-q" name="q" label="جست‌وجو در آگهی‌ها" defaultValue={filter.term ?? ''} className="min-w-0 flex-1" data-testid="market-filter-q" />
            <label className="hz-select-wrap hz-filterbar__sort">
              <span className="hz-visually-hidden">ترتیب</span>
              <select name="sort" defaultValue={filter.sort} className="hz-select" data-testid="market-filter-sort">
                {LISTING_SORTS.map((value) => (
                  <option key={value} value={value}>
                    {'مرتب‌سازی: ' + LISTING_SORT_FA[value]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" tone="secondary">
              جست‌وجو
            </Button>
          </form>

          <p className="hz-body-sm text-text-secondary" aria-live="polite" data-testid="market-total">
            {fa(page.total)} آگهی
          </p>

          {page.items.length === 0 ? (
            <EmptyState
              title="آگهی‌ای با این فیلترها پیدا نشد"
              description="فیلترها را ساده‌تر کنید یا جست‌وجو را خالی بگذارید."
              action={
                active ? (
                  <ButtonLink tone="secondary" href="/animals-market">
                    پاک کردن همه
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <section aria-labelledby="market-results-title">
              <h2 id="market-results-title" className="hz-visually-hidden">
                آگهی‌ها
              </h2>
              <ul className="grid grid-cols-2 gap-md md:gap-s20 xl:grid-cols-3" data-testid="market-results">
                {page.items.map((card) => (
                  <li key={card.id} data-testid={'market-card-' + card.id}>
                    <ListingCard card={card} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div data-testid="market-pagination">
            <Pagination
              page={page.page}
              pageSize={page.pageSize}
              total={page.total}
              totalPages={page.totalPages}
              hrefFor={(number) => '/animals-market' + listingQueryString({ ...filter, page: number })}
              label="صفحه‌بندی آگهی‌ها"
            />
          </div>

          <p className="hz-caption" data-testid="market-ad-note">
            آگهی‌های دارای برچسب «{PROMOTED_LABEL_FA}» بسته نمایش ویژه خریده‌اند. این برچسب فقط جایگاه نمایش را
            تغییر می‌دهد و هیچ ارتباطی با اعتبار، تأیید یا امتیاز فروشنده ندارد.
          </p>
        </div>
      </div>
    </div>
  );
}
