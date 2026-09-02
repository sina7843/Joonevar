import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { finderCities, searchFinder } from '../../src/vets/registry.ts';
import { CONTACT_FOR_PRICE_FA, CONTEXT_FA, type VisitContextName } from '../../src/domain/referral.ts';
import { FinderFilters } from './filters.tsx';

export const dynamic = 'force-dynamic';

const CONTEXTS: readonly VisitContextName[] = ['MICROCHIP', 'DNA', 'PREGNANCY'];

/**
 * Finder — §11.1.
 *
 * One search box over veterinarian, centre and neighbourhood, plus the location
 * and distance filters the product actually supports. There is deliberately no
 * calendar, no time slot and no earliest-appointment sort: those are removed
 * concepts, not missing features.
 */
export default async function FinderPage({
  searchParams,
}: {
  searchParams: Promise<{
    context?: string;
    term?: string;
    city?: string;
    distance?: string;
    lat?: string;
    lng?: string;
    sel?: string;
  }>;
}) {
  const guard = await guardRoute('/vets');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const params = await searchParams;
  const context = (CONTEXTS as readonly string[]).includes(params.context ?? '')
    ? (params.context as VisitContextName)
    : 'MICROCHIP';
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const maxDistanceKm = Number(params.distance);

  const [results, cities] = await Promise.all([
    searchFinder(db(), {
      context,
      term: params.term ?? null,
      cityFa: params.city ?? null,
      origin,
      maxDistanceKm: Number.isFinite(maxDistanceKm) && maxDistanceKm > 0 ? maxDistanceKm : null,
    }),
    finderCities(db(), context),
  ]);

  const selection = params.sel ?? '';
  const reviewHref = (vetAccountId: string, locationId: string) =>
    '/requests/new/review?context=' +
    context +
    '&sel=' +
    encodeURIComponent(selection) +
    '&vet=' +
    vetAccountId +
    '&loc=' +
    locationId;

  return (
    <PublicShell actor={guard.actor} title="یافتن دامپزشک معتمد" pathname="/vets">
      <div className="space-y-lg">
        <Alert tone="info" title="نوبت‌دهی وجود ندارد">
          هم‌زیست ساعت و نوبت رزرو نمی‌کند. پس از ساخت درخواست، کد مراجعه و مهلت آن صادر می‌شود و هماهنگی زمان
          با خود مرکز است.
        </Alert>

        <FinderFilters
          context={context}
          contexts={CONTEXTS.map((value) => ({ value, label: CONTEXT_FA[value] }))}
          cities={cities}
          term={params.term ?? ''}
          city={params.city ?? ''}
          distance={params.distance ?? ''}
          selection={selection}
        />

        {results.length === 0 ? (
          <EmptyState
            title="مرکزی با این فیلترها پیدا نشد"
            description="می‌توانید عبارت جست‌وجو را تغییر دهید، شهر را بردارید یا محدوده فاصله را بازتر کنید."
          />
        ) : (
          <ul className="space-y-lg" data-testid="finder-results">
            {results.map((row) => (
              <li key={row.location.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-lg" data-testid="finder-location-name">
                        {row.location.nameFa}
                      </h2>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {row.vetNameFa} · کد نظام دامپزشکی {row.councilCode}
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[row.location.cityFa, row.location.neighborhoodFa].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-2xs text-body-sm">{row.location.addressFa}</p>
                    </div>
                    {row.distanceKm === null ? null : (
                      <StatusBadge tone="neutral">{row.distanceKm.toFixed(1)} کیلومتر</StatusBadge>
                    )}
                  </div>

                  <p className="mt-md text-caption text-text-secondary" data-testid="finder-price-note">
                    {CONTACT_FOR_PRICE_FA}
                  </p>

                  <div className="mt-lg flex flex-wrap gap-lg">
                    <Link
                      href={
                        '/vets/location/' +
                        row.location.id +
                        '?context=' +
                        context +
                        (selection === '' ? '' : '&sel=' + encodeURIComponent(selection))
                      }
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-location"
                    >
                      اطلاعات مرکز
                    </Link>
                    {row.location.phone ? (
                      <Link
                        href={'tel:' + row.location.phone}
                        className="text-text-brand underline underline-offset-4"
                        data-testid="finder-contact"
                      >
                        تماس با مرکز
                      </Link>
                    ) : null}
                  </div>

                  {selection === '' ? (
                    <p className="mt-lg text-caption text-text-secondary">
                      برای ساخت درخواست، ابتدا از{' '}
                      <Link href={'/requests/new?context=' + context} className="text-text-brand underline">
                        انتخاب حیوان‌ها
                      </Link>{' '}
                      شروع کنید.
                    </p>
                  ) : (
                    <div className="mt-lg">
                      <ButtonLink
                        href={reviewHref(row.vetAccountId, row.location.id)}
                        block
                        data-testid="choose-location"
                      >
                        انتخاب این مرکز
                      </ButtonLink>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
