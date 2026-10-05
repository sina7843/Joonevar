import Link from 'next/link';
import { Icon } from '../../../src/ui/icon.tsx';
import { RecordImage } from '../../../src/ui/record-image.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import type { PublicListingCard } from '../../../src/marketplace/public-listings.ts';
import { PROMOTED_LABEL_FA } from '../../../src/marketplace/discovery-model.ts';
import { SELLER_KIND_FA } from '../../../src/marketplace/listing-eligibility.ts';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');
const SEX_FA: Record<string, string> = { MALE: 'نر', FEMALE: 'ماده' };

/**
 * DS *PriceDisplay* for an advert: the amount in Persian digits and «تومان».
 * A negotiable advert shows «قیمت توافقی» and no amount (as before); a missing
 * amount is «تعیین‌نشده», never ۰.
 */
export function ListingPrice({ mode, amount, size = 'md', testId }: { mode: string | null; amount: bigint | null; size?: 'md' | 'lg'; testId?: string }) {
  const cls = 'hz-price' + (size === 'lg' ? ' hz-price--lg' : '');
  if (mode === 'NEGOTIABLE') {
    return (
      <div className={cls} data-testid={testId}>
        <span className="hz-price__amount">قیمت توافقی</span>
      </div>
    );
  }
  if (amount === null) {
    return (
      <div className={cls + ' hz-price--unset'} data-testid={testId}>
        <span className="hz-price__amount">تعیین‌نشده</span>
      </div>
    );
  }
  return (
    <div className={cls} data-testid={testId}>
      <span className="hz-price__amount">{fa(amount)}</span> <span className="hz-price__unit">تومان</span>
    </div>
  );
}

/** DS *ListingCard* (`.hz-listing`): 4:3 photo, title, breed/sex, price, city, seller kind. */
export function ListingCard({ card, testId }: { card: PublicListingCard; testId?: string }) {
  return (
    <Link href={card.path} className="hz-listing hz-card--interactive h-full" title={card.titleFa} data-testid={testId}>
      <RecordImage fileId={card.coverFileId} altFa={card.coverAltFa} variant="4x3" />
      <div className="hz-listing__body">
        {card.promoted || card.reserved ? (
          <span className="flex flex-wrap gap-xs">
            {card.promoted ? (
              <StatusBadge tone="warning" size="sm">
                <span data-testid={'market-ad-label-' + card.id}>{PROMOTED_LABEL_FA}</span>
              </StatusBadge>
            ) : null}
            {card.reserved ? (
              <StatusBadge tone="neutral" size="sm">
                رزروشده
              </StatusBadge>
            ) : null}
          </span>
        ) : null}
        <h3 className="hz-listing__title line-clamp-2">{card.titleFa}</h3>
        <span className="hz-listing__meta">
          {[card.breedFa, card.sex ? SEX_FA[card.sex] : null].filter(Boolean).join('، ') || 'تعیین‌نشده'}
        </span>
        <ListingPrice mode={card.priceMode} amount={card.priceToman} />
        {card.placeFa ? (
          <span className="hz-listing__meta hz-meta__item">
            <Icon name="mapPin" size="xs" />
            {card.placeFa}
          </span>
        ) : null}
        <span className="hz-listing__meta hz-meta__item">
          <Icon name="storefront" size="xs" />
          {[SELLER_KIND_FA[card.sellerKind as 'OWNER' | 'KENNEL'], card.pedigreeIssued ? 'شجره‌نامه دارد' : null, card.parentageFinal ? 'تست اصالت دارد' : null]
            .filter(Boolean)
            .join('، ')}
        </span>
      </div>
    </Link>
  );
}
