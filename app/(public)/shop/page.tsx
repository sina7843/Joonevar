import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { RecordImage } from '../../../src/ui/record-image.tsx';
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

  return (
    <div className="space-y-lg">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'فروشگاه', path: '/shop' },
        ]}
        origin={site().origin}
      />

      <header className="space-y-sm">
        <h1 className="text-h2">فروشگاه کالای حیوانات</h1>
        <p className="text-body-sm text-text-secondary" data-testid="shop-intro">
          کالاها از فروشندگان تأییدشده عرضه می‌شوند و روی هر کالا می‌توانید قیمت و موجودی فروشندگان مختلف را
          مقایسه کنید.
        </p>
      </header>

      {blocked.length > 0 ? (
        <Alert tone="info" title="فروش عمومی دارو در این مرحله فعال نیست">
          <span data-testid="shop-blocked-note">{blocked[0]!.policyNoteFa}</span>
        </Alert>
      ) : null}

      <nav aria-label="دسته‌ها" className="hz-rail flex gap-sm" data-testid="shop-categories">
        <Link
          href={linkFor({ categoryId: null })}
          className="rounded-full border border-border-subtle px-md py-2xs text-caption"
        >
          همه دسته‌ها
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={linkFor({ categoryId: category.id })}
            className="whitespace-nowrap rounded-full border border-border-subtle px-md py-2xs text-caption"
          >
            {category.nameFa}
          </Link>
        ))}
        <Link
          href={linkFor({ inStockOnly: !filter.inStockOnly })}
          className="whitespace-nowrap rounded-full border border-border-subtle px-md py-2xs text-caption"
          data-testid="shop-stock-filter"
        >
          {filter.inStockOnly ? 'همه کالاها' : 'فقط کالاهای موجود'}
        </Link>
      </nav>

      {items.length === 0 ? (
        <p className="text-body-sm text-text-secondary" data-testid="shop-empty">
          کالایی با این شرایط پیدا نشد.
        </p>
      ) : (
        <ul className="grid gap-md md:grid-cols-3" data-testid="shop-results">
          {items.map((item) => (
            <li key={item.id} className="space-y-sm rounded-lg border border-border-subtle p-lg">
              {item.imageFileId ? (
                <RecordImage fileId={item.imageFileId} altFa={item.imageAltFa ?? item.nameFa} variant="thumb" />
              ) : null}
              <h2 className="text-label-lg">
                <Link href={'/shop/' + item.slug} className="text-text-brand" data-testid={'shop-item-' + item.id}>
                  {item.nameFa}
                </Link>
              </h2>
              <p className="text-caption text-text-secondary">
                {[item.brandFa, item.categoryNameFa].filter(Boolean).join(' · ')}
              </p>
              <p className="text-body-sm" data-testid={'shop-price-' + item.id}>
                {item.fromPriceToman === null ? 'قیمت اعلام نشده' : 'از ' + fa(item.fromPriceToman) + ' تومان'}
              </p>
              <StatusBadge tone={item.available > 0 ? 'success' : 'neutral'}>
                {item.available > 0 ? 'موجود' : 'ناموجود'}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="صفحه‌بندی" className="flex flex-wrap gap-sm" data-testid="shop-pagination">
          {Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
            <Link
              key={page}
              href={'/shop' + shopQueryString({ ...filter, page })}
              className="rounded-md border border-border-subtle px-md py-2xs text-caption"
            >
              {fa(page)}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
