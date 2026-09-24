import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { sellerListings } from '../../../src/marketplace/listings.ts';
import { sellableAnimals } from '../../../src/marketplace/listing-eligibility.ts';
import { flagEnabled } from '../../../src/marketplace/flags.ts';
import {
  LISTING_STATUS_FA,
  LIVE_LISTING_STATUSES,
  PRICE_MODE_FA,
  type ListingStatus,
} from '../../../src/marketplace/listing-model.ts';
import { BlockedAnimalCard, StartListingForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<ListingStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  RESERVED: 'info',
  SOLD: 'info',
  EXPIRED: 'neutral',
  SUSPENDED: 'warning',
  REMOVED: 'neutral',
};

/**
 * The seller's adverts — PROMPT-003.
 *
 * Two lists, deliberately. The adverts that exist, and the animals that cannot
 * be advertised with the reason for each one: a short list with no explanation
 * is the thing that makes a person think the product is broken.
 */
export default async function MyListingsPage() {
  const guard = await guardRoute('/account/listings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const [listings, animals, marketOpen, creationOpen] = await Promise.all([
    sellerListings(db(), actor),
    sellableAnimals(db(), actor.accountId),
    flagEnabled(db(), 'market.flag.animal_market_enabled'),
    flagEnabled(db(), 'market.flag.animal_listing_creation_enabled'),
  ]);

  const ready = animals.filter((row) => row.eligibility.allowed);
  const blocked = animals.filter((row) => !row.eligibility.allowed);
  // Animals that already carry a live advert: the button is hidden for them,
  // and the partial unique index refuses a second one anyway.
  const listed = new Set(
    listings
      .filter((row) => LIVE_LISTING_STATUSES.includes(row.status))
      .map((row) => row.animalId),
  );

  return (
    <PublicShell actor={actor} title="آگهی‌های فروش من" pathname="/account/listings">
      <div className="space-y-lg p-lg">
        {!marketOpen ? (
          <Alert tone="warning" title="بازار فروش حیوان در حال حاضر بسته است">
            <span data-testid="market-closed">
              آگهی‌های ثبت‌شده حذف نمی‌شوند. تا باز شدن بازار، ثبت و انتشار آگهی تازه ممکن نیست.
            </span>
          </Alert>
        ) : !creationOpen ? (
          <Alert tone="warning" title="ثبت آگهی تازه موقتاً بسته است">
            <span data-testid="creation-closed">آگهی‌های موجود شما دست‌نخورده‌اند.</span>
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">آگهی‌های من</h2>
          {listings.length === 0 ? (
            <div className="mt-lg">
              <EmptyState
                title="هنوز آگهی‌ای ندارید"
                description="از فهرست پایین، حیوانی را که می‌خواهید بفروشید انتخاب کنید."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="my-listings">
              {listings.map((row) => (
                <li key={row.id} data-testid={'listing-row-' + row.id}>
                  <Link
                    href={'/account/listings/' + row.id}
                    className="block rounded-lg border border-border-subtle p-lg hover:border-border-brand"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-md">{row.animalNameFa ?? 'بدون نام'}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {row.priceMode
                            ? PRICE_MODE_FA[row.priceMode as 'EXACT' | 'NEGOTIABLE']
                            : 'قیمت ثبت نشده'}
                          {row.priceToman !== null ? ' — ' + row.priceToman.toLocaleString('fa-IR') + ' تومان' : ''}
                          <span className="mx-sm text-text-disabled">|</span>
                          {row.imageCount.toLocaleString('fa-IR')} تصویر
                        </p>
                      </div>
                      <StatusBadge tone={TONE[row.status]}>{LISTING_STATUS_FA[row.status]}</StatusBadge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {ready.length > 0 && marketOpen && creationOpen ? (
          <Card>
            <h2 className="text-label-lg">آماده برای آگهی</h2>
            <ul className="mt-lg space-y-sm" data-testid="sellable-animals">
              {ready.map((row) => (
                <li
                  key={row.animalId}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                >
                  <div className="min-w-0">
                    <p className="text-label-md">{row.name ?? 'بدون نام'}</p>
                    <p className="text-caption text-text-secondary">
                      به‌عنوان {row.eligibility.sellerKind === 'KENNEL' ? 'کنل تأییدشده' : 'مالک حیوان'}
                    </p>
                  </div>
                  {listed.has(row.animalId) ? (
                    <p className="text-caption text-text-secondary">آگهی فعال دارد</p>
                  ) : (
                    <StartListingForm animalId={row.animalId} label="ساخت آگهی" />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {blocked.length > 0 ? (
          <div className="space-y-sm">
            <h2 className="text-label-lg">حیوان‌هایی که هنوز قابل آگهی نیستند</h2>
            {blocked.map((row) => (
              <BlockedAnimalCard
                key={row.animalId}
                title={row.name ?? 'بدون نام'}
                blockers={row.eligibility.blockers}
              />
            ))}
          </div>
        ) : null}
      </div>
    </PublicShell>
  );
}
