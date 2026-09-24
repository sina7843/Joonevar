import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
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
  PRICE_MODES,
  PRICE_MODE_FA,
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

const CONTROL =
  'w-full rounded-md border border-border-subtle bg-bg-surface px-md py-sm text-body-sm text-text-primary ' +
  'min-h-[var(--size-control-md)] focus:border-border-brand';

function Select({
  name,
  label,
  value,
  all,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  all: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-xs">
      <label htmlFor={'market-' + name} className="block text-label-md">
        {label}
      </label>
      <select
        id={'market-' + name}
        name={name}
        defaultValue={value ?? ''}
        className={CONTROL}
        data-testid={'market-filter-' + name}
      >
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

function Number_({ name, label, value }: { name: string; label: string; value: number | bigint | null }) {
  return (
    <div className="space-y-xs">
      <label htmlFor={'market-' + name} className="block text-label-md">
        {label}
      </label>
      <input
        id={'market-' + name}
        name={name}
        inputMode="numeric"
        dir="ltr"
        defaultValue={value === null ? '' : String(value)}
        className={CONTROL}
        data-testid={'market-filter-' + name}
      />
    </div>
  );
}

/**
 * The public animal marketplace — Phase 3, PROMPT-004.
 *
 * Every advert here is published, of a species the market is open for, and by a
 * seller under no restriction. Nothing else is served, and a visitor cannot
 * tell which of those reasons hid an advert they cannot see.
 */
export default async function AnimalMarketPage({ searchParams }: { searchParams: Promise<RawSearch> }) {
  const raw = await searchParams;
  const filter = parseListingFilter(raw);
  const [page, options] = await Promise.all([publicListings(db(), filter), listingFilterOptions(db())]);

  const cities = filter.provinceCode
    ? options.cities.filter((city) => city.provinceCode === filter.provinceCode)
    : options.cities;

  return (
    <div className="mx-auto max-w-6xl space-y-lg px-lg py-lg">
      <Breadcrumbs items={CRUMBS} origin={site().origin} />
      <header className="space-y-xs">
        <h1 className="text-h3">{TITLE}</h1>
        <p className="text-body-sm text-text-secondary">{DESCRIPTION}</p>
      </header>

      {!page.marketOpen ? (
        <Alert tone="warning" title="بازار فروش حیوان در حال حاضر بسته است">
          <span data-testid="market-closed-public">
            آگهی‌ها حذف نشده‌اند و پس از باز شدن دوباره دیده می‌شوند.
          </span>
        </Alert>
      ) : null}

      <form method="get" className="space-y-lg rounded-lg border border-border-subtle p-lg" data-testid="market-filters">
        <div className="grid gap-lg md:grid-cols-3">
          <div className="space-y-xs">
            <label htmlFor="market-q" className="block text-label-md">
              جست‌وجو
            </label>
            <input
              id="market-q"
              name="q"
              defaultValue={filter.term ?? ''}
              className={CONTROL}
              data-testid="market-filter-q"
            />
          </div>
          <Select
            name="breed"
            label="نژاد"
            value={filter.breedId}
            all="همه نژادها"
            options={options.breeds.map((row) => ({ value: row.id, label: row.nameFa }))}
          />
          <Select
            name="province"
            label="استان"
            value={filter.provinceCode}
            all="همه استان‌ها"
            options={options.provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
          />
          <Select
            name="city"
            label="شهر"
            value={filter.cityId}
            all="همه شهرها"
            options={cities.map((row) => ({ value: row.id, label: row.nameFa }))}
          />
          <Select
            name="priceMode"
            label="نوع قیمت"
            value={filter.priceMode}
            all="هر نوع قیمت"
            options={PRICE_MODES.map((mode) => ({ value: mode, label: PRICE_MODE_FA[mode] }))}
          />
          <Select
            name="sex"
            label="جنسیت"
            value={filter.sex}
            all="هر دو"
            options={[
              { value: 'MALE', label: 'نر' },
              { value: 'FEMALE', label: 'ماده' },
            ]}
          />
          <Number_ name="minPrice" label="کمترین قیمت (تومان)" value={filter.minPriceToman} />
          <Number_ name="maxPrice" label="بیشترین قیمت (تومان)" value={filter.maxPriceToman} />
          <Number_ name="minAge" label="کمترین سن (ماه)" value={filter.minAgeMonths} />
          <Number_ name="maxAge" label="بیشترین سن (ماه)" value={filter.maxAgeMonths} />
          <Select
            name="seller"
            label="نوع فروشنده"
            value={filter.sellerKind}
            all="همه فروشندگان"
            options={SELLER_KIND_FILTERS.map((kind) => ({ value: kind, label: SELLER_KIND_FA[kind] }))}
          />
          <Select
            name="pedigree"
            label="شجره‌نامه"
            value={filter.pedigree === null ? null : filter.pedigree ? 'YES' : 'NO'}
            all="مهم نیست"
            options={[
              { value: 'YES', label: 'دارد' },
              { value: 'NO', label: 'ندارد' },
            ]}
          />
          <Select
            name="parentage"
            label="تست اصالت والدین"
            value={filter.parentage === null ? null : filter.parentage ? 'YES' : 'NO'}
            all="مهم نیست"
            options={[
              { value: 'YES', label: 'دارد' },
              { value: 'NO', label: 'ندارد' },
            ]}
          />
          <Select
            name="vaccination"
            label="واکسیناسیون (اظهار فروشنده)"
            value={filter.vaccination}
            all="مهم نیست"
            options={DISCLOSURES.map((value) => ({ value, label: VACCINATION_FA[value] }))}
          />
          <Select
            name="neuter"
            label="عقیم‌سازی (اظهار فروشنده)"
            value={filter.neuter}
            all="مهم نیست"
            options={DISCLOSURES.map((value) => ({ value, label: NEUTER_FA[value] }))}
          />
          <Select
            name="delivery"
            label="روش تحویل"
            value={filter.delivery}
            all="همه روش‌ها"
            options={DELIVERY_METHODS.map((value) => ({ value, label: DELIVERY_METHOD_FA[value] }))}
          />
          <Select
            name="sort"
            label="ترتیب"
            value={filter.sort}
            all={LISTING_SORT_FA.NEWEST}
            options={LISTING_SORTS.map((value) => ({ value, label: LISTING_SORT_FA[value] }))}
          />
        </div>
        <div className="flex flex-wrap gap-sm">
          <button
            type="submit"
            className="rounded-md bg-action-primary-default px-lg py-sm text-label-md text-action-primary-on"
            data-testid="market-apply-filters"
          >
            اعمال فیلترها
          </button>
          <Link
            href="/animals-market"
            className="rounded-md border border-border-subtle px-lg py-sm text-label-md"
            data-testid="market-clear-filters"
          >
            پاک کردن
          </Link>
        </div>
      </form>

      <p className="text-caption text-text-secondary" data-testid="market-total">
        {fa(page.total)} آگهی
      </p>

      {page.items.length === 0 ? (
        <EmptyState
          title="آگهی‌ای با این فیلترها پیدا نشد"
          description="فیلترها را ساده‌تر کنید یا جست‌وجو را خالی بگذارید."
        />
      ) : (
        <ul className="grid gap-lg md:grid-cols-2 lg:grid-cols-3" data-testid="market-results">
          {page.items.map((card) => (
            <li key={card.id} data-testid={'market-card-' + card.id}>
              <Link
                href={card.path}
                className="flex h-full flex-col gap-sm rounded-lg border border-border-subtle p-lg hover:border-border-brand"
              >
                <RecordImage fileId={card.coverFileId} altFa={card.coverAltFa} variant="thumb" />
                <div className="flex flex-wrap items-start justify-between gap-xs">
                  <h2 className="text-label-lg">{card.titleFa}</h2>
                  <div className="flex flex-wrap gap-xs">
                    {card.promoted ? (
                      <StatusBadge tone="warning">
                        <span data-testid={'market-ad-label-' + card.id}>{PROMOTED_LABEL_FA}</span>
                      </StatusBadge>
                    ) : null}
                    {card.reserved ? <StatusBadge tone="info">رزروشده</StatusBadge> : null}
                  </div>
                </div>
                <p className="text-caption text-text-secondary">
                  {[card.breedFa, card.sex === 'MALE' ? 'نر' : card.sex === 'FEMALE' ? 'ماده' : null, card.placeFa]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-auto text-label-md">
                  {card.priceMode === 'NEGOTIABLE'
                    ? 'توافقی'
                    : card.priceToman !== null
                      ? fa(card.priceToman) + ' تومان'
                      : 'قیمت اعلام نشده'}
                </p>
                <p className="text-caption text-text-secondary">
                  {SELLER_KIND_FA[card.sellerKind as 'OWNER' | 'KENNEL']}
                  {card.pedigreeIssued ? ' · شجره‌نامه دارد' : ''}
                  {card.parentageFinal ? ' · تست اصالت دارد' : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.totalPages > 1 ? (
        <nav aria-label="صفحه‌بندی" className="flex flex-wrap gap-sm" data-testid="market-pagination">
          {Array.from({ length: page.totalPages }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={'/animals-market' + listingQueryString({ ...filter, page: number })}
              aria-current={number === page.page ? 'page' : undefined}
              className={[
                'rounded-md border px-md py-2xs text-caption',
                number === page.page ? 'border-border-brand text-text-brand' : 'border-border-subtle',
              ].join(' ')}
              data-testid={'market-page-' + number}
            >
              {fa(number)}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="text-caption text-text-disabled" data-testid="market-ad-note">
        آگهی‌های دارای برچسب «{PROMOTED_LABEL_FA}» بسته نمایش ویژه خریده‌اند. این برچسب فقط جایگاه نمایش را
        تغییر می‌دهد و هیچ ارتباطی با اعتبار، تأیید یا امتیاز فروشنده ندارد.
      </p>
    </div>
  );
}
