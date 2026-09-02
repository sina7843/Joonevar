import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { breedRegistry } from '../../../src/operations/service.ts';
import { AddBreedForm, BreedStateForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The breed register — §21.4 (reference lists).
 *
 * Adding a breed is managed data rather than a deployment. Retiring one keeps
 * every animal already recorded with it exactly as it is; it only stops being
 * offered for new records.
 */
export default async function AdminBreedsPage() {
  const guard = await guardRoute('/admin/breeds');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await breedRegistry(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin/breeds" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="کنارگذاشتن یک نژاد، پرونده‌های ثبت‌شده را تغییر نمی‌دهد">
          <span data-testid="breeds-note">
            نژاد کنارگذاشته‌شده فقط در انتخاب‌های جدید دیده نمی‌شود؛ حیوان‌هایی که با آن ثبت شده‌اند دست‌نخورده
            می‌مانند و هر تغییر با Actor، زمان و مقدار قبلی ثبت می‌شود.
          </span>
        </Alert>

        <AddBreedForm />

        <Card>
          <h2 className="text-label-lg">فهرست مرجع نژادها</h2>
          <ul className="mt-lg space-y-md" data-testid="breed-list">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border-subtle p-lg"
                data-testid={'breed-' + row.nameEn}
              >
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-label-md">{row.nameFa}</p>
                    <p className="mt-2xs text-caption text-text-secondary" dir="ltr">
                      {row.nameEn}
                    </p>
                  </div>
                  <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
                    <span data-testid={'breed-state-' + row.nameEn}>
                      {row.isActive ? 'فعال' : 'کنارگذاشته‌شده'}
                    </span>
                  </StatusBadge>
                </div>
                <BreedStateForm breedId={row.id} active={row.isActive} suffix={row.nameEn} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </OpsShell>
  );
}
