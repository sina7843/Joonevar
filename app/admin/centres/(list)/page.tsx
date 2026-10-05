import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { centreReferenceData, manageableCentres } from '../../../../src/centres/service.ts';
import { CENTRE_STATUS_FA, LICENCE_STATUS_FA, type CentreStatus, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CentreCreateForm } from '../../../../src/centres/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Centres in the superadmin environment — Requirements-Phase-2 §9, §21 (PROMPT-008).
 * DS P11: the create form, then the register as a DataTable (cards below 768).
 */
export default async function AdminCentresPage() {
  const guard = await guardRoute('/admin/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [centres, reference] = await Promise.all([manageableCentres(db(), guard.actor), centreReferenceData(db())]);

  const published = centres.filter((row) => row.centre.publicStatus === 'PUBLISHED').length;
  return (
    <OpsShell actor={guard.actor} title="مراکز دامپزشکی" pathname="/admin/centres" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{centres.length.toLocaleString('fa-IR') + ' مرکز ثبت‌شده'}</span>
        <span className="hz-page-header__meta-item">{published.toLocaleString('fa-IR') + ' منتشرشده'}</span>
      </p>
      <CentreCreateForm surface="admin" types={reference.types} provinces={reference.provinces} cities={reference.cities} />

      <Panel title="مراکز ثبت‌شده" count={centres.length.toLocaleString('fa-IR')}>
        {centres.length === 0 ? (
          <EmptyState title="هنوز مرکزی ثبت نشده است" description="با فرم بالا اولین مرکز را ثبت کنید." />
        ) : (
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack">
              <caption className="hz-visually-hidden">مراکز ثبت‌شده</caption>
              <thead>
                <tr>
                  <th scope="col">مرکز</th>
                  <th scope="col">وضعیت صفحه</th>
                  <th scope="col">مجوز</th>
                  <th scope="col">مالک</th>
                </tr>
              </thead>
              <tbody data-testid="centre-list">
                {centres.map((row) => (
                  <tr key={row.centre.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link href={'/admin/centres/' + row.centre.id} className="hz-case__name" data-testid={'centre-row-' + row.centre.id}>
                          {row.centre.displayNameFa}
                        </Link>
                        <span className="hz-case__sub">
                          {[row.typeNameFa, row.cityNameFa, row.branchCount > 0 ? row.branchCount.toLocaleString('fa-IR') + ' شعبه' : 'بدون شعبه']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    </td>
                    <td data-label="وضعیت صفحه">
                      <StatusBadge
                        size="sm"
                        tone={row.centre.publicStatus === 'PUBLISHED' ? 'success' : row.centre.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}
                      >
                        {CENTRE_STATUS_FA[row.centre.publicStatus as CentreStatus]}
                      </StatusBadge>
                    </td>
                    <td data-label="مجوز">
                      <StatusBadge size="sm" tone={row.centre.licenceStatus === 'VALID' ? 'info' : 'neutral'}>
                        {'مجوز: ' + LICENCE_STATUS_FA[row.centre.licenceStatus as LicenceStatusName]}
                      </StatusBadge>
                    </td>
                    <td data-label="مالک">
                      {row.centre.ownerAccountId ? (
                        <span className="text-body-sm text-text-secondary">دارای مالک</span>
                      ) : (
                        <StatusBadge size="sm" tone="warning">
                          بدون مالک
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </OpsShell>
  );
}
