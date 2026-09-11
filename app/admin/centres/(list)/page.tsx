import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreReferenceData, manageableCentres } from '../../../../src/centres/service.ts';
import { CENTRE_STATUS_FA, LICENCE_STATUS_FA, type CentreStatus, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CentreCreateForm } from '../../../../src/centres/forms.tsx';

export const dynamic = 'force-dynamic';

/** Centres in the superadmin environment — Requirements-Phase-2 §9, §21 (PROMPT-008). */
export default async function AdminCentresPage() {
  const guard = await guardRoute('/admin/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [centres, reference] = await Promise.all([manageableCentres(db(), guard.actor), centreReferenceData(db())]);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/centres" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <CentreCreateForm surface="admin" types={reference.types} provinces={reference.provinces} cities={reference.cities} />

        <Card>
          <h2 className="text-label-lg">مراکز ثبت‌شده</h2>
          {centres.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز مرکزی ثبت نشده است" description="با فرم بالا اولین مرکز را ثبت کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="centre-list">
              {centres.map((row) => (
                <li key={row.centre.id}>
                  <Link
                    href={'/admin/centres/' + row.centre.id}
                    className="block rounded-lg border border-border-subtle p-lg hover:border-border-brand"
                    data-testid={'centre-row-' + row.centre.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-label-lg">{row.centre.displayNameFa}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {[row.typeNameFa, row.cityNameFa, row.branchCount > 0 ? row.branchCount.toLocaleString('fa-IR') + ' شعبه' : 'بدون شعبه']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone={row.centre.publicStatus === 'PUBLISHED' ? 'success' : row.centre.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                          {CENTRE_STATUS_FA[row.centre.publicStatus as CentreStatus]}
                        </StatusBadge>
                        <StatusBadge tone={row.centre.licenceStatus === 'VALID' ? 'info' : 'neutral'}>
                          {'مجوز: ' + LICENCE_STATUS_FA[row.centre.licenceStatus as LicenceStatusName]}
                        </StatusBadge>
                        {row.centre.ownerAccountId ? null : <StatusBadge tone="warning">بدون مالک</StatusBadge>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
