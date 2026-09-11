import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { animals } from '../../../../src/db/schema/animals.ts';
import { findLocation } from '../../../../src/vets/registry.ts';
import { vetProfiles } from '../../../../src/db/schema/vets.ts';
import { eq } from 'drizzle-orm';
import {
  CONTACT_FOR_PRICE_FA,
  CONTEXT_FA,
  SERVICE_TYPE_FA,
  type VisitContextName,
} from '../../../../src/domain/referral.ts';
import { parseSelection } from '../../selection.ts';
import { ConfirmVisitForm } from './confirm-form.tsx';

export const dynamic = 'force-dynamic';

const CONTEXTS: readonly VisitContextName[] = ['MICROCHIP', 'DNA', 'PREGNANCY'];

/** Review before anything is written — §11.2. */
export default async function ReviewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; sel?: string; vet?: string; loc?: string }>;
}) {
  const guard = await guardRoute('/requests/new/review');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const params = await searchParams;
  const context = (CONTEXTS as readonly string[]).includes(params.context ?? '')
    ? (params.context as VisitContextName)
    : 'MICROCHIP';
  const items = parseSelection(params.sel ?? '', context);
  const location = params.loc ? await findLocation(db(), params.loc) : null;
  const [vet] = params.vet
    ? await db().select().from(vetProfiles).where(eq(vetProfiles.accountId, params.vet)).limit(1)
    : [];

  if (items.length === 0 || !location || !vet || vet.accountId === null || location.vetAccountId !== vet.accountId) {
    return (
      <PublicShell actor={actor} title="مرور درخواست مراجعه" pathname="/requests/new/review">
        <Alert tone="error" title="انتخاب شما کامل نیست">
          دوباره از انتخاب حیوان‌ها شروع کنید تا حیوان، خدمت، دامپزشک و مرکز با هم ثبت شوند.
        </Alert>
      </PublicShell>
    );
  }

  const names = await db()
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(inArray(animals.id, items.map((i) => i.animalId)));

  return (
    <PublicShell actor={actor} title="مرور درخواست مراجعه" pathname="/requests/new/review">
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">{CONTEXT_FA[context]}</h2>
          <p className="mt-md text-body-sm">
            {vet.displayNameFa} · کد نظام دامپزشکی {vet.councilCode}
          </p>
          <p className="mt-2xs text-body-sm">{location.nameFa}</p>
          <p className="mt-2xs text-caption text-text-secondary">
            {[location.cityFa, location.neighborhoodFa].filter(Boolean).join(' · ')} — {location.addressFa}
          </p>
          <p className="mt-md text-caption text-text-secondary">{CONTACT_FOR_PRICE_FA}</p>
        </Card>

        <Card>
          <h3 className="text-label-lg">حیوان‌ها و خدمت هرکدام</h3>
          <ul className="mt-md space-y-sm text-body-sm" data-testid="review-items">
            {items.map((item) => (
              <li key={item.animalId} className="flex items-center justify-between gap-md">
                <span>{names.find((n) => n.id === item.animalId)?.name ?? 'بدون نام'}</span>
                <span className="text-text-secondary">{SERVICE_TYPE_FA[item.serviceType]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-lg text-caption text-text-secondary">
            برای هر حیوان یک درخواست و یک کد مراجعه جداگانه صادر می‌شود. نوبت و ساعت رزرو نمی‌شود.
          </p>
        </Card>

        <ConfirmVisitForm
          context={context}
          selection={params.sel ?? ''}
          vetAccountId={vet.accountId}
          locationId={location.id}
        />
      </div>
    </PublicShell>
  );
}
