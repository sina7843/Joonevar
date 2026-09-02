import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { ownAnimals, NO_OFFICIAL_EFFECT_NOTE_FA } from '../../../src/mating/declaration.ts';
import { StartDeclarationForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Starting a personal declaration — §20.
 *
 * The prerequisites are approved identity, an active membership and animal
 * records that already exist. A registration sheet and a pedigree are never
 * asked for here, and there is no payment step anywhere on this route.
 */
export default async function NewDeclarationPage() {
  const guard = await guardRoute('/declaration/new');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const eligibility = await eligibilityFor(db(), guard.actor.accountId, 'PERSONAL_DECLARATION');
  const animals = eligibility.allowed ? await ownAnimals(db(), guard.actor) : [];

  return (
    <PublicShell actor={guard.actor} title="ثبت اعلام توافق شخصی" pathname="/declaration/new">
      <div className="space-y-lg">
        {eligibility.allowed ? null : (
          <LockedServiceCard serviceLabel="اعلام توافق شخصی" lock={eligibility.lock} />
        )}

        {eligibility.allowed ? (
          animals.length === 0 ? (
            <Card>
              <Alert tone="warning" title="حیوان ثبت‌شده‌ای برای این مسیر ندارید">
                <span data-testid="no-animal">
                  این سرویس به دو پرونده حیوان موجود در هم‌زیست نیاز دارد؛ برگه ثبتی و شجره‌نامه شرط آن
                  نیستند.
                </span>
              </Alert>
            </Card>
          ) : (
            <>
              <StartDeclarationForm
                animals={animals.map((animal) => ({
                  id: animal.id,
                  label:
                    (animal.name ?? 'بدون نام') +
                    ' — ' +
                    (animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : 'نامشخص'),
                }))}
              />
              <Card>
                <p className="text-caption text-text-secondary" data-testid="declaration-no-payment">
                  {NO_OFFICIAL_EFFECT_NOTE_FA}
                </p>
              </Card>
            </>
          )
        ) : null}
      </div>
    </PublicShell>
  );
}
