import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { eligibilityFor } from '../../../../src/domain/eligibility/service.ts';
import { eligibleAnimals } from '../../../../src/mating/permits.ts';
import { StartPermitForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Opening an official permit — §16 steps 1 to 4.
 *
 * The prerequisites the source names are checked before the form is shown:
 * an active membership and a pedigreed animal of one's own. The personal
 * declaration is a different route and is never offered as a substitute here.
 */
export default async function NewPermitPage() {
  const guard = await guardRoute('/mating/permits/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const eligibility = await eligibilityFor(db(), guard.actor.accountId, 'MATING_PERMIT');
  const animals = eligibility.allowed ? await eligibleAnimals(db(), guard.actor) : [];

  return (
    <PublicShell actor={guard.actor} title="شروع مجوز جفت‌گیری" pathname="/mating/permits/new">
      <div className="space-y-lg">
        {eligibility.allowed ? null : (
          <LockedServiceCard serviceLabel="مجوز جفت‌گیری" lock={eligibility.lock} />
        )}

        {eligibility.allowed ? (
          animals.length === 0 ? (
            <Card>
              <Alert tone="warning" title="حیوان شجره‌داری برای این مسیر ندارید">
                <span data-testid="no-pedigree-animal">
                  مجوز رسمی برای دو حیوان شجره‌دار ثبت می‌شود؛ ابتدا شجره‌نامه حیوان خود را دریافت کنید.
                </span>
              </Alert>
            </Card>
          ) : (
            <StartPermitForm
              animals={animals.map((animal) => ({
                id: animal.animalId,
                label:
                  (animal.name ?? 'بدون نام') +
                  ' — ' +
                  (animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : 'نامشخص') +
                  ' — ' +
                  animal.pedigreeCode,
              }))}
            />
          )
        ) : null}
      </div>
    </PublicShell>
  );
}
