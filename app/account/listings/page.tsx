import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
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

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * The seller's adverts — PROMPT-003. P05 list.
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
  const drafts = listings.filter((row) => row.status === 'DRAFT').length;

  return (
    <PublicShell
      actor={actor}
      title="آگهی‌های فروش من"
      pathname="/account/listings"
      header={
        <PageHeader
          title="آگهی‌های فروش من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(listings.length > 0 ? [fa(listings.length) + ' آگهی'] : []),
            ...(drafts > 0 ? [fa(drafts) + ' پیش‌نویس'] : []),
          ]}
        />
      }
    >
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

      <section className="space-y-md" aria-labelledby="my-listings-title">
        <SectionHeader id="my-listings-title" title="آگهی‌های من" />
        {listings.length === 0 ? (
          <EmptyState
            icon="megaphoneSimple"
            title="هنوز آگهی‌ای ندارید"
            description="از فهرست پایین، حیوانی را که می‌خواهید بفروشید انتخاب کنید."
          />
        ) : (
          <ul className="hz-cardlist" data-testid="my-listings">
            {listings.map((row) => (
              <li key={row.id} data-testid={'listing-row-' + row.id}>
                {/* The whole card opens the advert: it carries no other action. */}
                <Link href={'/account/listings/' + row.id} className="hz-cardlist__item hz-card--interactive text-text-primary no-underline">
                  <span className="hz-cardlist__row">
                    <span className="hz-cardlist__title min-w-0">{row.animalNameFa ?? 'بدون نام'}</span>
                    <StatusBadge tone={TONE[row.status]}>{LISTING_STATUS_FA[row.status]}</StatusBadge>
                  </span>
                  <span className="hz-cardlist__row">
                    <span className="hz-cardlist__meta">
                      {row.priceMode ? PRICE_MODE_FA[row.priceMode as 'EXACT' | 'NEGOTIABLE'] : 'قیمت ثبت نشده'}
                      {row.priceToman !== null ? ' — ' + row.priceToman.toLocaleString('fa-IR') + ' تومان' : ''}
                      {' · '}
                      {fa(row.imageCount)} تصویر
                    </span>
                    <span className="inline-flex items-center gap-xs text-label-md text-text-brand">
                      {row.status === 'DRAFT' ? 'ادامه ویرایش' : 'مشاهده آگهی'}
                      <Icon name="caretRight" size="sm" mirror />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ready.length > 0 && marketOpen && creationOpen ? (
        <section className="space-y-md" aria-labelledby="sellable-title">
          <SectionHeader id="sellable-title" title="آماده برای آگهی" count={fa(ready.length)} />
          <ul className="hz-cardlist" data-testid="sellable-animals">
            {ready.map((row) => (
              <li key={row.animalId} className="hz-cardlist__item">
                <div className="hz-cardlist__row">
                  <div className="min-w-0">
                    <p className="hz-cardlist__title">{row.name ?? 'بدون نام'}</p>
                    <p className="hz-cardlist__meta">
                      به‌عنوان {row.eligibility.sellerKind === 'KENNEL' ? 'کنل تأییدشده' : 'مالک حیوان'}
                    </p>
                  </div>
                  {listed.has(row.animalId) ? (
                    <span className="text-caption text-text-secondary">آگهی فعال دارد</span>
                  ) : (
                    <StartListingForm animalId={row.animalId} label="ساخت آگهی" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {blocked.length > 0 ? (
        <section className="space-y-md" aria-labelledby="blocked-title">
          <SectionHeader id="blocked-title" title="حیوان‌هایی که هنوز قابل آگهی نیستند" count={fa(blocked.length)} />
          <div className="grid gap-md md:grid-cols-2">
            {blocked.map((row) => (
              <BlockedAnimalCard key={row.animalId} title={row.name ?? 'بدون نام'} blockers={row.eligibility.blockers} />
            ))}
          </div>
        </section>
      ) : null}
    </PublicShell>
  );
}
