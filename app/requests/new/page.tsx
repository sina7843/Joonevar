import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { selectableAnimals } from '../../../src/vets/visits.ts';
import { CONTEXT_FA, SERVICES_BY_CONTEXT, type VisitContextName } from '../../../src/domain/referral.ts';
import { SelectAnimalsForm } from './select-form.tsx';

export const dynamic = 'force-dynamic';

const CONTEXTS: readonly VisitContextName[] = ['MICROCHIP', 'DNA', 'PREGNANCY'];

/**
 * Step one of §11.2: choose the animals and the service for each one.
 *
 * The DNA context is reachable only from the entrances that allow it, such as
 * a re-sampling: the ordinary pedigree route reuses the sample and custodian
 * already on record and never asks for a veterinarian again (§11.1).
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  const guard = await guardRoute('/requests/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const params = await searchParams;
  const context = (CONTEXTS as readonly string[]).includes(params.context ?? '')
    ? (params.context as VisitContextName)
    : 'MICROCHIP';

  const eligibility = await eligibilityFor(db(), actor.accountId, 'VET_VISIT_REQUEST');
  if (!eligibility.allowed) {
    return (
      <PublicShell actor={actor} title="درخواست مراجعه" pathname="/requests/new">
        <LockedServiceCard serviceLabel="درخواست مراجعه به دامپزشک" lock={eligibility.lock} />
      </PublicShell>
    );
  }

  const animals = await selectableAnimals(db(), actor, context);

  return (
    <PublicShell actor={actor} title={'درخواست مراجعه · ' + CONTEXT_FA[context]} pathname="/requests/new">
      <div className="space-y-lg">
        {context === 'DNA' ? (
          <Alert tone="info" title="این مسیر فقط برای نمونه‌گیری مجدد است">
            در مسیر معمول شجره‌نامه، نمونه و دامپزشک نگهدارنده از قبل مشخص‌اند و انتخاب دوباره لازم نیست.
          </Alert>
        ) : null}

        {animals.length === 0 ? (
          <EmptyState
            title="حیوانی برای این درخواست در دسترس نیست"
            description="حیوان‌هایی که درخواست مراجعه فعال دارند تا پایان همان مراجعه دوباره انتخاب نمی‌شوند."
          />
        ) : (
          <SelectAnimalsForm
            context={context}
            services={SERVICES_BY_CONTEXT[context]}
            animals={animals.map((a) => ({ id: a.id, name: a.name }))}
          />
        )}
      </div>
    </PublicShell>
  );
}
