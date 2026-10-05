import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button, ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { PageHeader } from '../../../src/ui/section-header.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';
import { FilterChips } from '../../../src/ui/filter-bar.tsx';
import { Pagination } from '../../../src/ui/pagination.tsx';
import { ProductCard } from './product-card.tsx';
import {
  isCanonicalShopIndex,
  parseShopFilter,
  shopCategories,
  shopPage,
  shopQueryString,
  SHOP_PAGE_SIZE,
} from '../../../src/commerce/shop-discovery.ts';
import { allCategories } from '../../../src/commerce/catalog.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const filter = parseShopFilter(await searchParams);
  // Only the plain index invites indexing: a filtered view is the same shop
  // seen through a lens, and indexing every permutation would make one market
  // into thousands of near-duplicate pages.
  return buildMetadata(
    {
      title: 'فروشگاه کالای حیوانات',
      description: 'کالاهای مرتبط با نگه‌داری حیوانات از فروشندگان تأییدشده همزیست، با مقایسه قیمت و موجودی.',
      path: '/shop',
      noindex: !isCanonicalShopIndex(filter),
    },
    site(),
  );
}

/**
 * The public shop — PROMPT-009.
 *
 * One visibility rule decides what appears: a published product, in a category
 * this phase sells, with at least one active offer from a trading store. A
 * visitor cannot tell which of those was missing, because all of them produce
 * the same empty result.
 */
export default async function ShopIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = parseShopFilter(await searchParams);
  const [{ items, total }, categories, everyCategory] = await Promise.all([
    shopPage(db(), filter),
    shopCategories(db()),
    allCategories(db()),
  ]);
  const blocked = everyCategory.filter((category) => category.salePolicy !== 'ALLOWED');
  const pages = Math.max(Math.ceil(total / SHOP_PAGE_SIZE), 1);

  const linkFor = (over: Partial<typeof filter>) => '/shop' + shopQueryString({ ...filter, ...over, page: 1 });
  const active = shopQueryString({ ...filter, page: 1 }) !== '';

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs
          items={[
            { name: 'خانه', path: '/' },
            { name: 'فروشگاه', path: '/shop' },
          ]}
          origin={site().origin}
        />
        <PageHeader
          title="فروشگاه کالای حیوانات"
          meta={[
            <span key="intro" data-testid="shop-intro">
              کالاها از فروشندگان تأییدشده عرضه می‌شوند و روی هر کالا می‌توانید قیمت و موجودی فروشندگان مختلف را
              مقایسه کنید.
            </span>,
          ]}
        />
      </div>

      {blocked.length > 0 ? (
        <Alert tone="info" title="فروش عمومی دارو در این مرحله فعال نیست">
          <span data-testid="shop-blocked-note">{blocked[0]!.policyNoteFa}</span>
        </Alert>
      ) : null}

      <form method="get" action="/shop" role="search" className="flex gap-sm">
        {filter.categoryId ? <input type="hidden" name="category" value={filter.categoryId} /> : null}
        {filter.inStockOnly ? <input type="hidden" name="stock" value="1" /> : null}
        <SearchField id="shop-q" name="q" label="جست‌وجوی کالا" defaultValue={filter.term ?? ''} className="min-w-0 flex-1 md:max-w-[36rem]" />
        <Button type="submit" tone="secondary">
          جست‌وجو
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-sm">
        <FilterChips
          label="دسته‌ها"
          testId="shop-categories"
          chips={[
            { key: 'all', href: linkFor({ categoryId: null }), label: 'همه دسته‌ها', current: filter.categoryId === null },
            ...categories.map((category) => ({
              key: category.id,
              href: linkFor({ categoryId: category.id }),
              label: category.nameFa,
              current: filter.categoryId === category.id,
            })),
          ]}
        />
        <Link
          href={linkFor({ inStockOnly: !filter.inStockOnly })}
          aria-current={filter.inStockOnly ? 'true' : undefined}
          className="hz-chip no-underline aria-[current=true]:border-border-brand aria-[current=true]:bg-bg-brand-subtle aria-[current=true]:text-text-brand"
          data-testid="shop-stock-filter"
        >
          {filter.inStockOnly ? 'همه کالاها' : 'فقط کالاهای موجود'}
        </Link>
      </div>

      {items.length === 0 ? (
        <div data-testid="shop-empty">
          <EmptyState
            title="کالایی با این شرایط پیدا نشد"
            description={active ? 'فیلترها را بردارید یا واژه دیگری جست‌وجو کنید.' : 'کالاها پس از انتشار فروشندگان اینجا دیده می‌شوند.'}
            action={
              active ? (
                <ButtonLink tone="secondary" href="/shop">
                  پاک کردن همه
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      ) : (
        <section aria-labelledby="shop-results-title" className="space-y-lg">
          <h2 id="shop-results-title" className="hz-body-sm text-text-secondary" aria-live="polite">
            {fa(total) + ' کالا'}
          </h2>
          <ul className="grid grid-cols-2 gap-md md:grid-cols-3 md:gap-s20 lg:grid-cols-4" data-testid="shop-results">
            {items.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div data-testid="shop-pagination">
        <Pagination
          page={filter.page}
          pageSize={SHOP_PAGE_SIZE}
          total={total}
          totalPages={pages}
          hrefFor={(page) => '/shop' + shopQueryString({ ...filter, page })}
          label="صفحه‌بندی کالاها"
        />
      </div>
    </div>
  );
}
