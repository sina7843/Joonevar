import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetProfiles } from '../../../../src/db/schema/vets.ts';
import { capabilitiesOf, eligibilityOf, findLocation } from '../../../../src/vets/registry.ts';
import { CONTACT_FOR_PRICE_FA, CONTEXT_FA, type VisitContextName } from '../../../../src/domain/referral.ts';

export const dynamic = 'force-dynamic';

const CONTEXTS: readonly VisitContextName[] = ['MICROCHIP', 'DNA', 'PREGNANCY'];

const CAPABILITY_FA = {
  IMPLANT: 'کاشت میکروچیپ',
  BLOOD_SAMPLE: 'نمونه‌گیری خون',
  PREGNANCY_CHECK: 'بررسی بارداری',
} as const;

/**
 * Location detail — §11.1, prototype LOC-001.
 *
 * It shows what the place is and how to reach it. There is no capacity
 * calendar and no slot to reserve: arranging the time is a phone call, which
 * is why the contact CTA and the cost sentence are the whole call to action.
 */
export default async function LocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ context?: string; sel?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/vets/location/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const location = await findLocation(db(), id);
  if (!location) return <RecordNotFound error={notFoundError('این مرکز پیدا نشد.')} />;

  const query = await searchParams;
  const context = (CONTEXTS as readonly string[]).includes(query.context ?? '')
    ? (query.context as VisitContextName)
    : 'MICROCHIP';
  const selection = query.sel ?? '';

  const [vet] = await db().select().from(vetProfiles).where(eq(vetProfiles.accountId, location.vetAccountId ?? ''));
  const eligibility = eligibilityOf(location, context);
  const capabilities = capabilitiesOf(location);

  return (
    <PublicShell actor={guard.actor} title={location.nameFa} pathname={'/vets/location/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{location.nameFa}</h2>
              {vet ? (
                <p className="mt-2xs text-caption text-text-secondary">
                  {vet.displayNameFa} · کد نظام دامپزشکی {vet.councilCode}
                </p>
              ) : null}
              <p className="mt-2xs text-caption text-text-secondary">
                {[location.provinceFa, location.cityFa, location.neighborhoodFa].filter(Boolean).join(' · ')}
              </p>
            </div>
            <StatusBadge tone={eligibility.eligible ? 'success' : 'neutral'}>
              <span data-testid="location-eligibility">
                {eligibility.eligible ? 'پذیرای ' + CONTEXT_FA[context] : 'در دسترس نیست'}
              </span>
            </StatusBadge>
          </div>

          <p className="mt-lg text-body-sm">{location.addressFa}</p>
          {location.phone ? (
            <p className="mt-md text-body-sm">
              <Link
                href={'tel:' + location.phone}
                className="text-text-brand underline underline-offset-4"
                data-testid="location-contact"
              >
                تماس با مرکز
              </Link>
            </p>
          ) : null}
          <p className="mt-md text-caption text-text-secondary" data-testid="location-price-note">
            {CONTACT_FOR_PRICE_FA}
          </p>
        </Card>

        <Card>
          <h3 className="text-label-lg">امکانات ثبت‌شده</h3>
          {capabilities.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">هنوز امکاناتی برای این مرکز ثبت نشده است.</p>
          ) : (
            <ul className="mt-md space-y-sm text-body-sm" data-testid="location-capabilities">
              {capabilities.map((capability) => (
                <li key={capability}>{CAPABILITY_FA[capability]}</li>
              ))}
            </ul>
          )}
          {eligibility.eligible ? null : (
            <p className="mt-md text-caption text-text-secondary" data-testid="location-reason">
              {eligibility.reasonFa}
            </p>
          )}
        </Card>

        <Alert tone="info" title="نقشه هنوز در دسترس نیست">
          سرویس نقشه پیکربندی نشده است؛ نشانی و تماس به‌صورت متنی نمایش داده می‌شود و هیچ موقعیت حدسی ساخته
          نمی‌شود.
        </Alert>

        {eligibility.eligible && selection !== '' ? (
          <ButtonLink
            href={
              '/requests/new/review?context=' +
              context +
              '&sel=' +
              encodeURIComponent(selection) +
              '&vet=' +
              location.vetAccountId +
              '&loc=' +
              location.id
            }
            block
            data-testid="choose-this-location"
          >
            انتخاب این مرکز
          </ButtonLink>
        ) : null}
      </div>
    </PublicShell>
  );
}
