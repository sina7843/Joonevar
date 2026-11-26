import Link from 'next/link';
import { Icon } from '../../../src/ui/icon.tsx';
import { RecordImage } from '../../../src/ui/record-image.tsx';
import type { ShopCard } from '../../../src/commerce/shop-discovery.ts';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/** DS *StockBadge*: «موجود» / «ناموجود», never colour alone. */
export function StockBadge({ available, size = 'md', children }: { available: number; size?: 'md' | 'sm'; children?: React.ReactNode }) {
  return (
    <span className={['hz-stock', available > 0 ? 'hz-stock--in' : 'hz-stock--out', size === 'sm' ? 'hz-stock--sm' : ''].join(' ').trim()}>
      <Icon name="package" size="xs" />
      {children ?? (available > 0 ? 'موجود' : 'ناموجود')}
    </span>
  );
}

/** DS *ProductCard* (`.hz-listing.hz-product`): 1:1 photo, brand, two-line name, «از …» price, stock. */
export function ProductCard({ item }: { item: ShopCard }) {
  return (
    <Link href={'/shop/' + item.slug} className="hz-listing hz-product hz-card--interactive h-full" title={item.nameFa} data-testid={'shop-item-' + item.id}>
      <RecordImage fileId={item.imageFileId} altFa={item.imageAltFa ?? item.nameFa} variant="1x1" />
      <div className="hz-listing__body">
        <span className="hz-product__brand">{[item.brandFa, item.categoryNameFa].filter(Boolean).join('، ')}</span>
        <h3 className="hz-product__name">{item.nameFa}</h3>
        <div className={item.fromPriceToman === null ? 'hz-price hz-price--unset' : 'hz-price'} data-testid={'shop-price-' + item.id}>
          {item.fromPriceToman === null ? (
            <span className="hz-price__amount">تعیین‌نشده</span>
          ) : (
            <>
              <span className="hz-price__from">از</span> <span className="hz-price__amount">{fa(item.fromPriceToman)}</span>{' '}
              <span className="hz-price__unit">تومان</span>
            </>
          )}
        </div>
        {/* DS ProductCard: in stock is the norm and says nothing; only low or out of stock is shown. */}
        {item.available <= 0 ? (
          <StockBadge available={0} size="sm" />
        ) : item.available <= 3 ? (
          <span className="hz-stock hz-stock--low hz-stock--sm">{'فقط ' + fa(item.available) + ' عدد'}</span>
        ) : null}
      </div>
    </Link>
  );
}
