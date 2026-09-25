import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { compare } from '../../../../src/commerce/saved.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

export function generateMetadata(): Metadata {
  // A comparison is a view of a particular basket of ids; there is nothing
  // here for an index.
  return buildMetadata(
    { title: 'مقایسه کالا', description: 'مقایسه کالاهای یک دسته', path: '/shop/compare', noindex: true },
    site(),
  );
}

/**
 * Products side by side, within one category — PROMPT-012.
 *
 * Only within one, because the specifications are what a comparison shows and
 * two categories share none: a table of food against collars would be rows of
 * blanks pretending to be a comparison.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.ids;
  const ids = (Array.isArray(raw) ? raw : (raw ?? '').split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  const outcome = await compare(db(), ids);

  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'فروشگاه', path: '/shop' },
    { name: 'مقایسه', path: '/shop/compare' },
  ];

  return (
    <div className="space-y-lg">
      <Breadcrumbs items={crumbs} origin={site().origin} />
      <h1 className="text-h2">مقایسه کالا</h1>

      {'refusalFa' in outcome ? (
        <Alert tone="info" title="مقایسه انجام نشد">
          <span data-testid="compare-refusal">{outcome.refusalFa}</span>
        </Alert>
      ) : (
        <>
          <p className="text-caption text-text-secondary" data-testid="compare-category">
            دسته: {outcome.categoryNameFa}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body-sm" data-testid="compare-table">
              <thead>
                <tr>
                  <th className="border-b border-border-subtle p-sm text-right">ویژگی</th>
                  {outcome.products.map((product) => (
                    <th
                      key={product.productId}
                      className="border-b border-border-subtle p-sm text-right"
                      data-testid={'compare-product-' + product.productId}
                    >
                      {product.nameFa}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="border-b border-border-subtle p-sm text-right">برند</th>
                  {outcome.products.map((product) => (
                    <td key={product.productId} className="border-b border-border-subtle p-sm">
                      {product.brandFa ?? '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="border-b border-border-subtle p-sm text-right">کمترین قیمت</th>
                  {outcome.products.map((product) => (
                    <td
                      key={product.productId}
                      className="border-b border-border-subtle p-sm"
                      data-testid={'compare-price-' + product.productId}
                    >
                      {product.lowestPriceToman === null ? '—' : fa(product.lowestPriceToman) + ' تومان'}
                    </td>
                  ))}
                </tr>
                {outcome.attributes.map((attribute) => (
                  <tr key={attribute}>
                    <th className="border-b border-border-subtle p-sm text-right">{attribute}</th>
                    {outcome.products.map((product) => (
                      <td key={product.productId} className="border-b border-border-subtle p-sm">
                        {String(product.specifications[attribute] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-caption">
        <Link href="/shop" className="text-text-brand" data-testid="compare-back">
          بازگشت به فروشگاه
        </Link>
      </p>
    </div>
  );
}
