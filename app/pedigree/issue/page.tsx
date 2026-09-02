import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { LockedServiceCard } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { eligibilityFor } from '../../../src/domain/eligibility/service.ts';
import { readMoney } from '../../../src/settings/service.ts';
import { formatTomanFa } from '../../../src/domain/money.ts';
import { PEDIGREE_FEE_KEY, selectableForIssuance } from '../../../src/documents/pedigree.ts';
import { SelectIssuanceAnimals } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The issuance half of the join — §14.1 step 8, §14.2.
 *
 * Only an animal whose Parentage Result is already final can be paid for here.
 * A result that is still waiting is shown with its reason rather than hidden,
 * and it stays visible on the animal's own page either way.
 */
export default async function IssuePedigreePage() {
  const guard = await guardRoute('/pedigree/issue');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'PEDIGREE');
  if (!eligibility.allowed) {
    return (
      <PublicShell actor={actor} title="صدور شجره‌نامه" pathname="/pedigree/issue">
        <LockedServiceCard serviceLabel="صدور شجره‌نامه" lock={eligibility.lock} />
      </PublicShell>
    );
  }

  const [animals, fee] = await Promise.all([
    selectableForIssuance(db(), actor),
    readMoney(db(), PEDIGREE_FEE_KEY),
  ]);
  const feeLabel = formatTomanFa(fee);

  return (
    <PublicShell actor={actor} title="صدور شجره‌نامه" pathname="/pedigree/issue">
      <div className="space-y-lg">
        {feeLabel === null ? (
          <Alert tone="warning" title="تعرفه صدور شجره‌نامه هنوز ثبت نشده است">
            <span data-testid="pedigree-fee-not-configured">
              تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
            </span>
          </Alert>
        ) : null}

        {animals.length === 0 ? (
          <EmptyState
            title="حیوانی برای صدور شجره‌نامه در دسترس نیست"
            description="حیوان‌هایی که نتیجه Parentage نهایی دارند و هنوز شجره‌نامه نگرفته‌اند در این فهرست می‌آیند."
          />
        ) : (
          <SelectIssuanceAnimals
            animals={animals.map((a) => ({
              animalId: a.animalId,
              name: a.name,
              ready: a.ready,
              reasonFa: a.reasonFa,
            }))}
            feeLabel={feeLabel}
          />
        )}
      </div>
    </PublicShell>
  );
}
